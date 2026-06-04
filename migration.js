/**
 * migration.js — Beautiful New Tab · One-time data migration
 *
 * Runs ONCE on first load after storage.js upgrade.
 * Reads all legacy localStorage keys and writes them into
 * chrome.storage.local via BNT_STORAGE.
 *
 * Legacy keys handled:
 *   bnt_bookmarks_v3      → BNT_STORAGE._meta  (BookmarkMeta per bookmark)
 *   bnt_custom_tags_v1    → BNT_STORAGE._tags  (custom TagEntry objects)
 *   bnt_site_colors_v1    → BNT_STORAGE._colors
 *   bnt_sc_thumb_{id}     → IndexedDB via BNT_STORAGE.saveThumb()
 *   hp_rates              → dropped (cache refreshes itself daily, no point migrating)
 *
 * After successful migration:
 *   - BNT_STORAGE.markMigrated() is called → sets bnt_migrated = true
 *   - All legacy localStorage keys are removed
 *
 * ── REMOVAL CHECKLIST (next major version) ──────────────────────
 *   [ ] Delete this file (migration.js)
 *   [ ] Remove <script src="migration.js"> from newtab.html
 *   [ ] Remove isMigrated() and markMigrated() from storage.js
 *   [ ] Remove CS_MIGRATED constant from storage.js
 * ────────────────────────────────────────────────────────────────
 *
 * Depends on: storage.js (window.BNT_STORAGE must be initialised first)
 * Load order: storage.js → migration.js → everything else
 */

window.BNT_MIGRATION_READY = (async () => {
  'use strict';

  const S = window.BNT_STORAGE;

  /* ── Already migrated — nothing to do ── */
  if (await S.isMigrated()) return;

  console.info('[BNT] Starting one-time migration from localStorage…');

  const errors = [];

  /* ══════════════════════════════════════════════════════════════
     HELPERS
  ══════════════════════════════════════════════════════════════ */

  function lsGet(key) {
    try { return JSON.parse(localStorage.getItem(key)); }
    catch { return null; }
  }

  /** Convert a base64 data-url string to a Blob */
  function dataUrlToBlob(dataUrl) {
    try {
      const [header, b64] = dataUrl.split(',');
      const mime = header.match(/:(.*?);/)[1];
      const bytes = atob(b64);
      const arr = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
      return new Blob([arr], { type: mime });
    } catch {
      return null;
    }
  }

  function hostname(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); }
    catch { return url; }
  }

  /* ══════════════════════════════════════════════════════════════
     1. CUSTOM TAGS  (bnt_custom_tags_v1)
        Must migrate BEFORE bookmarks so tag IDs are available.
  ══════════════════════════════════════════════════════════════ */
  const legacyTags = lsGet('bnt_custom_tags_v1') || [];
  const tagIdMap   = {};

  for (const lt of legacyTags) {
    try {
      S._tags[lt.id] = {
        id:       lt.id,
        name:     lt.name,
        color:    lt.color,
        hidden:   false,
        siteTag:  false,
        hostname: null,
      };
      tagIdMap[lt.id] = lt.id;
    } catch (err) {
      errors.push(`tag ${lt.id}: ${err.message}`);
    }
  }

  /* ══════════════════════════════════════════════════════════════
     2. SITE COLORS  (bnt_site_colors_v1)
        Shape: { [hostname]: hexColor }
  ══════════════════════════════════════════════════════════════ */
  const legacyColors = lsGet('bnt_site_colors_v1') || {};
  for (const [host, hex] of Object.entries(legacyColors)) {
    S._colors[host] = hex;
  }

  /* ══════════════════════════════════════════════════════════════
     3. BOOKMARKS  (bnt_bookmarks_v3)
        Legacy shape: { id, url, title, host, customTags: string[], image: string }
        Creates BookmarkMeta for each + ensures site tag exists.
  ══════════════════════════════════════════════════════════════ */
  const legacyBookmarks = lsGet('bnt_bookmarks_v3') || [];

  for (const lb of legacyBookmarks) {
    try {
      const host     = lb.host || hostname(lb.url);
      const color    = S._colors[host] || _randomColor();
      const siteTagId = 'site_' + host.replace(/\W/g, '_');

      if (!S._tags[siteTagId]) {
        S._tags[siteTagId] = {
          id: siteTagId, name: _hostnameToLabel(host), color,
          hidden: false, siteTag: true, hostname: host,
        };
      }

      S._meta[lb.id] = {
        visible:     true,
        order:       0,
        title:       lb.title || null,
        thumbnailId: lb.image ? lb.id : null,
        addedAt:     Date.now(),
        lastVisited: 0,
        tags:        (lb.customTags || []).map(t => tagIdMap[t] || t).filter(t => S._tags[t]),
        groupId:     null,
        pinned:      false,
      };
    } catch (err) {
      errors.push(`bookmark ${lb.id}: ${err.message}`);
    }
  }

  /* ══════════════════════════════════════════════════════════════
     4. BOOKMARK INLINE IMAGES  (legacy lb.image — base64 strings)
        Move to IndexedDB as Blobs.
  ══════════════════════════════════════════════════════════════ */
  for (const lb of legacyBookmarks) {
    if (!lb.image) continue;
    try {
      const blob = dataUrlToBlob(lb.image);
      if (blob) await S.saveThumb(lb.id, blob);
    } catch (err) {
      errors.push(`thumb(bookmark) ${lb.id}: ${err.message}`);
    }
  }

  /* ══════════════════════════════════════════════════════════════
     5. SHORTCUT THUMBNAILS  (bnt_sc_thumb_{id})
        Scan localStorage by prefix → IndexedDB Blobs.
  ══════════════════════════════════════════════════════════════ */
  const THUMB_PFX = 'bnt_sc_thumb_';
  const thumbKeys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(THUMB_PFX)) thumbKeys.push(k);
  }

  for (const key of thumbKeys) {
    const bmId   = key.slice(THUMB_PFX.length);
    const dataUrl = localStorage.getItem(key);
    if (!dataUrl) continue;
    try {
      const blob = dataUrlToBlob(dataUrl);
      if (blob) {
        await S.saveThumb(bmId, blob);
        if (!S._meta[bmId]) {
          S._meta[bmId] = {
            visible: true, order: 0, title: null, thumbnailId: bmId,
            addedAt: Date.now(), lastVisited: 0,
            tags: [], groupId: null, pinned: false,
          };
        } else {
          S._meta[bmId].thumbnailId = bmId;
        }
      }
    } catch (err) {
      errors.push(`thumb(shortcut) ${bmId}: ${err.message}`);
    }
  }

  /* ══════════════════════════════════════════════════════════════
     6. FLUSH to chrome.storage.local
  ══════════════════════════════════════════════════════════════ */
  try {
    await new Promise((resolve, reject) => {
      chrome.storage.local.set({
        bnt_meta:   S._meta,
        bnt_tags:   S._tags,
        bnt_colors: S._colors,
      }, () => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve();
      });
    });
  } catch (err) {
    /* Flush failed — don't mark migrated, will retry on next load */
    console.error('[BNT] Migration flush failed, will retry:', err);
    return;
  }

  /* ══════════════════════════════════════════════════════════════
     7. MARK DONE + CLEAN UP localStorage
        Only runs after successful flush.
  ══════════════════════════════════════════════════════════════ */
  await S.markMigrated();

  [
    'bnt_bookmarks_v3', 'bnt_custom_tags_v1',
    'bnt_site_colors_v1', 'hp_rates',
    ...thumbKeys,
  ].forEach(k => localStorage.removeItem(k));

  /* ══════════════════════════════════════════════════════════════
     8. REPORT
  ══════════════════════════════════════════════════════════════ */
  errors.length
    ? console.warn(`[BNT] Migration done with ${errors.length} error(s):`, errors)
    : console.info(`[BNT] Migration complete — bookmarks: ${legacyBookmarks.length}, tags: ${legacyTags.length}, thumbs: ${thumbKeys.length}`);

  /* ══════════════════════════════════════════════════════════════
     INTERNAL HELPERS
  ══════════════════════════════════════════════════════════════ */
  function _randomColor() {
    const p = ['#7b93ff','#ff7eb3','#53d8a0','#ffb347','#a78bfa','#38bdf8','#fb7185','#34d399','#fbbf24','#e879f9'];
    return p[Math.floor(Math.random() * p.length)];
  }

  function _hostnameToLabel(host) {
    return (host.split('.').slice(0,-1).join(' ') || host)
      .replace(/[-_]/g,' ').split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

})();
