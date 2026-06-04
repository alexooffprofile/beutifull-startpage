/**
 * storage.js — Beautiful New Tab · Unified storage layer
 *
 * Single source of truth for all extension data.
 * All other scripts access data ONLY through window.BNT_STORAGE.
 *
 * Data layout in chrome.storage.local:
 *   bnt_meta      → { [bookmarkId]: BookmarkMeta }
 *   bnt_tags      → { [tagId]: TagEntry }
 *   bnt_colors    → { [hostname]: hexColor }
 *   bnt_rates     → { base, rates, ts }   (currency cache)
 *   bnt_settings  → { groupMode, ... }
 *   bnt_migrated  → true  (set after one-time localStorage migration)
 *
 * Thumbnails → IndexedDB "bnt-db", object store "thumbs"
 *   key: bookmarkId (string)
 *   value: Blob
 *
 * Works in both Firefox and Chrome:
 *   Firefox exposes chrome.* as an alias for browser.* in extensions.
 *   All chrome.storage calls here use callbacks (not Promises) for
 *   maximum compatibility — no polyfill needed.
 *
 * Exposes: window.BNT_STORAGE  (instance, ready after await BNT_STORAGE.init())
 */

(() => {
  'use strict';

  /* ══════════════════════════════════════════════════════════════
     CONSTANTS
  ══════════════════════════════════════════════════════════════ */
  const IDB_NAME    = 'bnt-db';
  const IDB_VERSION = 1;
  const IDB_STORE   = 'thumbs';

  const CS_META     = 'bnt_meta';      // BookmarkMeta map
  const CS_TAGS     = 'bnt_tags';      // TagEntry map
  const CS_COLORS   = 'bnt_colors';    // hostname → hex color
  const CS_RATES    = 'bnt_rates';     // currency widget cache
  const CS_SETTINGS = 'bnt_settings';  // global settings
  const CS_MIGRATED = 'bnt_migrated';  // migration flag

  /* ══════════════════════════════════════════════════════════════
     TYPE DEFINITIONS  (JSDoc — no build step needed)

     @typedef {{
       visible:     boolean,
       order:       number,
       title:       string|null,   // override; null = use browser title
       thumbnailId: string|null,   // bookmarkId used as IndexedDB key
       addedAt:     number,        // Date.now() timestamp
       lastVisited: number,        // Date.now() timestamp, 0 if never
       // --- bookmarks panel only ---
       tags:        string[],      // TagEntry IDs
       groupId:     string|null,
       pinned:      boolean,
       // --- shortcuts only ---
       // (no extra fields — type is inferred from which folder it lives in)
     }} BookmarkMeta

     @typedef {{
       id:       string,
       name:     string,
       color:    string,           // hex
       hidden:   boolean,          // hide from tag bar
       siteTag:  boolean,          // auto-created from hostname
       hostname: string|null,      // set when siteTag === true
     }} TagEntry

     @typedef {{
       groupMode: 'none'|'hostname'|'tags'|'date',
       panelWidthPct: number,
     }} Settings
  ══════════════════════════════════════════════════════════════ */

  /* ══════════════════════════════════════════════════════════════
     HELPERS
  ══════════════════════════════════════════════════════════════ */

  /** Promisify chrome.storage.local.get */
  function csGet(keys) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(keys, result => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve(result);
      });
    });
  }

  /** Promisify chrome.storage.local.set */
  function csSet(obj) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set(obj, () => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve();
      });
    });
  }

  /** Promisify chrome.storage.local.remove */
  function csRemove(keys) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.remove(keys, () => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve();
      });
    });
  }

  /** Open (or reuse) the IndexedDB connection */
  let _idb = null;
  function openIDB() {
    if (_idb) return Promise.resolve(_idb);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = e => {
        e.target.result.createObjectStore(IDB_STORE);
      };
      req.onsuccess = e => { _idb = e.target.result; resolve(_idb); };
      req.onerror   = e => reject(e.target.error);
    });
  }

  /** Default BookmarkMeta for a new entry */
  function defaultMeta(overrides = {}) {
    return {
      visible:     true,
      order:       0,
      title:       null,
      thumbnailId: null,
      addedAt:     Date.now(),
      lastVisited: 0,
      tags:        [],
      groupId:     null,
      pinned:      false,
      ...overrides,
    };
  }

  /** Default Settings */
  function defaultSettings() {
    return {
      groupMode:     'none',
      panelWidthPct: 32,
    };
  }

  /* ══════════════════════════════════════════════════════════════
     CLASS
  ══════════════════════════════════════════════════════════════ */
  class BNTStorage {

    constructor() {
      /* In-memory cache — always in sync with chrome.storage.local */
      this._meta     = {};   // { [bookmarkId]: BookmarkMeta }
      this._tags     = {};   // { [tagId]: TagEntry }
      this._colors   = {};   // { [hostname]: hex }
      this._rates    = null; // currency cache object | null
      this._settings = defaultSettings();
      this._ready    = false;
    }

    /* ────────────────────────────────────────────────────────────
       INIT — call once on page load, await before anything else
    ──────────────────────────────────────────────────────────── */
    async init() {
      if (this._ready) return this;

      /* Load everything from chrome.storage.local in one round-trip */
      const data = await csGet([
        CS_META, CS_TAGS, CS_COLORS, CS_RATES, CS_SETTINGS,
      ]);

      this._meta     = data[CS_META]     || {};
      this._tags     = data[CS_TAGS]     || {};
      this._colors   = data[CS_COLORS]   || {};
      this._rates    = data[CS_RATES]    || null;
      this._settings = { ...defaultSettings(), ...(data[CS_SETTINGS] || {}) };

      /* Warm up IndexedDB connection (don't block init on it) */
      openIDB().catch(err => console.warn('[BNT] IndexedDB open failed:', err));

      this._ready = true;
      return this;
    }

    /* ────────────────────────────────────────────────────────────
       BOOKMARK META
    ──────────────────────────────────────────────────────────── */

    /**
     * Get metadata for a single bookmark.
     * Returns defaultMeta if not found — never returns undefined.
     * @param {string} bookmarkId
     * @returns {BookmarkMeta}
     */
    getMeta(bookmarkId) {
      return this._meta[bookmarkId]
        ? { ...this._meta[bookmarkId] }
        : defaultMeta();
    }

    /**
     * Get metadata for multiple bookmarks at once.
     * @param {string[]} ids
     * @returns {{ [id]: BookmarkMeta }}
     */
    getMetaMany(ids) {
      const result = {};
      for (const id of ids) result[id] = this.getMeta(id);
      return result;
    }

    /**
     * Save (merge) metadata for a bookmark.
     * Only provided keys are updated — others are preserved.
     * @param {string} bookmarkId
     * @param {Partial<BookmarkMeta>} patch
     */
    async setMeta(bookmarkId, patch) {
      const current = this._meta[bookmarkId] || defaultMeta();
      this._meta[bookmarkId] = { ...current, ...patch };
      await csSet({ [CS_META]: this._meta });
    }

    /**
     * Remove metadata for a bookmark (e.g. when it's deleted).
     * Also removes its thumbnail from IndexedDB.
     * @param {string} bookmarkId
     */
    async deleteMeta(bookmarkId) {
      delete this._meta[bookmarkId];
      await csSet({ [CS_META]: this._meta });
      await this.deleteThumb(bookmarkId);
    }

    /**
     * Record a visit (updates lastVisited timestamp).
     * @param {string} bookmarkId
     */
    async recordVisit(bookmarkId) {
      await this.setMeta(bookmarkId, { lastVisited: Date.now() });
    }

    /* ────────────────────────────────────────────────────────────
       TAGS
    ──────────────────────────────────────────────────────────── */

    /**
     * All tags as an array, sorted: site tags first (by hostname),
     * then custom tags (by name).
     * @returns {TagEntry[]}
     */
    getTags() {
      return Object.values(this._tags).sort((a, b) => {
        if (a.siteTag !== b.siteTag) return a.siteTag ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    }

    /**
     * Get a single tag by ID.
     * @param {string} tagId
     * @returns {TagEntry|null}
     */
    getTag(tagId) {
      return this._tags[tagId] ? { ...this._tags[tagId] } : null;
    }

    /**
     * Create a new custom tag.
     * @param {{ name: string, color: string }} opts
     * @returns {TagEntry}
     */
    async createTag({ name, color }) {
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      const tag = {
        id,
        name:     name.trim(),
        color,
        hidden:   false,
        siteTag:  false,
        hostname: null,
      };
      this._tags[id] = tag;
      await csSet({ [CS_TAGS]: this._tags });
      return { ...tag };
    }

    /**
     * Ensure a site tag exists for a hostname.
     * Creates one if missing, returns existing if already there.
     * @param {string} hostname
     * @param {string} color  fallback color (used only on creation)
     * @returns {TagEntry}
     */
    async ensureSiteTag(hostname, color) {
      /* Check if a site tag for this hostname already exists */
      const existing = Object.values(this._tags)
        .find(t => t.siteTag && t.hostname === hostname);
      if (existing) return { ...existing };

      const id = 'site_' + hostname.replace(/\W/g, '_');
      const tag = {
        id,
        name:     this._hostnameToLabel(hostname),
        color,
        hidden:   false,
        siteTag:  true,
        hostname,
      };
      this._tags[id] = tag;
      await csSet({ [CS_TAGS]: this._tags });
      return { ...tag };
    }

    /**
     * Update a tag (name, color, hidden).
     * For site tags: name and color can change, siteTag/hostname stay locked.
     * @param {string} tagId
     * @param {Partial<TagEntry>} patch
     */
    async updateTag(tagId, patch) {
      if (!this._tags[tagId]) return;
      /* Prevent overwriting protected fields */
      const { siteTag, hostname, id, ...safePatch } = patch;
      this._tags[tagId] = { ...this._tags[tagId], ...safePatch };
      await csSet({ [CS_TAGS]: this._tags });
    }

    /**
     * Delete a custom tag and remove it from all bookmark metas.
     * Site tags cannot be deleted — use updateTag({ hidden: true }) instead.
     * @param {string} tagId
     */
    async deleteTag(tagId) {
      const tag = this._tags[tagId];
      if (!tag || tag.siteTag) return; /* site tags are not deletable */

      delete this._tags[tagId];

      /* Remove tag from every bookmark meta */
      let changed = false;
      for (const id in this._meta) {
        const tags = this._meta[id].tags || [];
        if (tags.includes(tagId)) {
          this._meta[id].tags = tags.filter(t => t !== tagId);
          changed = true;
        }
      }

      await csSet({
        [CS_TAGS]: this._tags,
        ...(changed ? { [CS_META]: this._meta } : {}),
      });
    }

    /**
     * Check if a site tag is still needed (has bookmarks with that hostname).
     * Call this after deleting a bookmark to clean up orphaned site tags.
     * @param {string} hostname
     * @param {string[]} remainingHostnames  current hostnames in the panel
     */
    async pruneSiteTagIfOrphaned(hostname, remainingHostnames) {
      if (remainingHostnames.includes(hostname)) return;
      const tag = Object.values(this._tags)
        .find(t => t.siteTag && t.hostname === hostname);
      if (!tag) return;
      /* Don't delete — just hide, so user doesn't lose name/color customization */
      await this.updateTag(tag.id, { hidden: true });
    }

    /* ────────────────────────────────────────────────────────────
       SITE COLORS  (favicon dominant color cache)
    ──────────────────────────────────────────────────────────── */

    /**
     * @param {string} hostname
     * @returns {string|null}
     */
    getColor(hostname) {
      return this._colors[hostname] || null;
    }

    /**
     * @param {string} hostname
     * @param {string} hex
     */
    async setColor(hostname, hex) {
      this._colors[hostname] = hex;
      await csSet({ [CS_COLORS]: this._colors });
    }

    /* ────────────────────────────────────────────────────────────
       THUMBNAILS  (IndexedDB — Blob storage)
    ──────────────────────────────────────────────────────────── */

    /**
     * Save a thumbnail Blob for a bookmark.
     * @param {string} bookmarkId
     * @param {Blob}   blob
     */
    async saveThumb(bookmarkId, blob) {
      const db = await openIDB();
      return new Promise((resolve, reject) => {
        const tx  = db.transaction(IDB_STORE, 'readwrite');
        const req = tx.objectStore(IDB_STORE).put(blob, bookmarkId);
        req.onsuccess = resolve;
        req.onerror   = e => reject(e.target.error);
      });
    }

    /**
     * Get a thumbnail Blob (or null if not set).
     * @param {string} bookmarkId
     * @returns {Promise<Blob|null>}
     */
    async getThumb(bookmarkId) {
      const db = await openIDB();
      return new Promise((resolve, reject) => {
        const tx  = db.transaction(IDB_STORE, 'readonly');
        const req = tx.objectStore(IDB_STORE).get(bookmarkId);
        req.onsuccess = e => resolve(e.target.result || null);
        req.onerror   = e => reject(e.target.error);
      });
    }

    /**
     * Get an object URL for a thumbnail (caller must revoke it).
     * Returns null if no thumbnail exists.
     * @param {string} bookmarkId
     * @returns {Promise<string|null>}
     */
    async getThumbURL(bookmarkId) {
      const blob = await this.getThumb(bookmarkId);
      return blob ? URL.createObjectURL(blob) : null;
    }

    /**
     * Delete a thumbnail.
     * @param {string} bookmarkId
     */
    async deleteThumb(bookmarkId) {
      const db = await openIDB();
      return new Promise((resolve, reject) => {
        const tx  = db.transaction(IDB_STORE, 'readwrite');
        const req = tx.objectStore(IDB_STORE).delete(bookmarkId);
        req.onsuccess = resolve;
        req.onerror   = e => reject(e.target.error);
      });
    }

    /**
     * Compress an image File/Blob to a JPEG Blob (≤960×600, quality 0.82).
     * Use before saveThumb() when the source comes from a file picker.
     * @param {File|Blob} file
     * @returns {Promise<Blob>}
     */
    compressImage(file) {
      /* GIF and video — return as-is, canvas would break animation */
      if (file.type === 'image/gif' || file.type === 'video/mp4' || file.type === 'video/webm') {
        return Promise.resolve(file instanceof Blob ? file : new Blob([file], { type: file.type }));
      }

      return new Promise((resolve, reject) => {
        const img    = new Image();
        const objUrl = URL.createObjectURL(file);
        img.onload = () => {
          const maxW = 960, maxH = 600;
          const ratio = Math.min(maxW / img.width, maxH / img.height, 1);
          const canvas = document.createElement('canvas');
          canvas.width  = Math.round(img.width  * ratio);
          canvas.height = Math.round(img.height * ratio);
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          URL.revokeObjectURL(objUrl);
          canvas.toBlob(blob => {
            if (blob) resolve(blob);
            else reject(new Error('Canvas toBlob failed'));
          }, 'image/jpeg', 0.82);
        };
        img.onerror = () => { URL.revokeObjectURL(objUrl); reject(new Error('Image load failed')); };
        img.src = objUrl;
      });
    }

    /* ────────────────────────────────────────────────────────────
       CURRENCY RATES CACHE  (main_script.js widget)
    ──────────────────────────────────────────────────────────── */

    /** @returns {{ base, rates, ts }|null} */
    getRates() {
      return this._rates ? { ...this._rates } : null;
    }

    /** @param {{ base, rates, ts }} data */
    async setRates(data) {
      this._rates = data;
      await csSet({ [CS_RATES]: data });
    }

    /* ────────────────────────────────────────────────────────────
       SETTINGS
    ──────────────────────────────────────────────────────────── */

    /** @returns {Settings} */
    getSettings() {
      return { ...this._settings };
    }

    /**
     * @param {Partial<Settings>} patch
     */
    async updateSettings(patch) {
      this._settings = { ...this._settings, ...patch };
      await csSet({ [CS_SETTINGS]: this._settings });
    }

    /* ────────────────────────────────────────────────────────────
       MIGRATION FLAG
    ──────────────────────────────────────────────────────────── */

    /** @returns {Promise<boolean>} */
    async isMigrated() {
      const data = await csGet([CS_MIGRATED]);
      return !!data[CS_MIGRATED];
    }

    async markMigrated() {
      await csSet({ [CS_MIGRATED]: true });
    }

    /* ────────────────────────────────────────────────────────────
       INTERNAL HELPERS
    ──────────────────────────────────────────────────────────── */

    _hostnameToLabel(host) {
      const clean = host.split('.').slice(0, -1).join(' ') || host;
      return clean
        .replace(/[-_]/g, ' ')
        .split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
    }
  }

  /* ══════════════════════════════════════════════════════════════
     EXPORT
     window.BNT_STORAGE is the singleton instance.
     Always call await BNT_STORAGE.init() before using it.
  ══════════════════════════════════════════════════════════════ */
  window.BNT_STORAGE = new BNTStorage();

  /* Auto-init on load. All scripts await window.BNT_STORAGE_READY
     instead of calling init() themselves. */
  window.BNT_STORAGE_READY = window.BNT_STORAGE.init();

})();
