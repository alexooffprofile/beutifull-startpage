/**
 * shortcuts.js — Beautiful New Tab · Shortcut cards (Large variant)
 * Context menu is owned by context-menu.js — exposes window.BNT_SC API.
 */
(() => {
  'use strict';

  const COLOR_PFX = 'bnt_sc_color_';
  const META_PFX  = 'bnt_sc_meta_';

  /* Thumbs: IndexedDB через BNT_STORAGE (тот же ключ = bookmarkId что у закладок).
     Один источник правды — moveToBookmarks/moveFromBookmarks не копируют blob. */
  const S         = () => window.BNT_STORAGE;
  const getColor  = id => localStorage.getItem(COLOR_PFX + id) || null;
  const saveColor = (id, c) => localStorage.setItem(COLOR_PFX + id, c);
  const getMeta   = id => { try { return JSON.parse(localStorage.getItem(META_PFX + id)); } catch { return null; } };
  const saveMeta  = (id, o) => localStorage.setItem(META_PFX + id, JSON.stringify(o));

  const faviconUrl = url => {
    try { return `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(new URL(url).origin)}`; }
    catch { return ''; }
  };
  const getDomain = url => {
    try { return new URL(url).hostname.replace(/^www\./, ''); }
    catch { return url; }
  };

  const row = document.getElementById('shortcuts-row');
  let _folderId = null;

  row.addEventListener('wheel', e => {
    if (Math.abs(e.deltaY) >= Math.abs(e.deltaX)) {
      e.preventDefault();
      row.scrollBy({ left: e.deltaY * 1.8, behavior: 'auto' });
    }
  }, { passive: false });

  /* ══ COLOR EXTRACTION ═══════════════════════════════════════════ */
  function extractColor(imgSrc) {
    return new Promise(resolve => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const sz = 32, canvas = document.createElement('canvas');
          canvas.width = canvas.height = sz;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, sz, sz);
          const data = ctx.getImageData(0, 0, sz, sz).data;
          const buckets = {};
          for (let i = 0; i < data.length; i += 4) {
            const [r, g, b, a] = [data[i], data[i+1], data[i+2], data[i+3]];
            if (a < 80) continue;
            const bright = (r + g + b) / 3;
            if (bright > 238 || bright < 18) continue;
            const key = `${Math.round(r/28)*28},${Math.round(g/28)*28},${Math.round(b/28)*28}`;
            buckets[key] = (buckets[key] || 0) + 1;
          }
          const best = Object.entries(buckets).sort((a, b) => b[1] - a[1])[0];
          if (!best) { resolve(null); return; }
          resolve(`rgb(${best[0]})`);
        } catch { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = imgSrc;
    });
  }

  function applyColor(cardEl, color) {
    if (!color) return;
    const m = color.match(/\d+/g);
    const dark = m ? `rgb(${Math.max(0,m[0]-50)},${Math.max(0,m[1]-50)},${Math.max(0,m[2]-50)})` : '#111';
    cardEl.querySelector('.sc-bg').style.background =
      `radial-gradient(ellipse at 28% 50%, ${color}dd 0%, ${dark}99 55%, #0d0e1288 100%)`;
    delete cardEl.dataset.hasThumb;
    cardEl.dataset.hasColor = '1';
    const ghost = cardEl.querySelector('.sc-fav-ghost');
    if (ghost) ghost.style.display = '';
  }

  /* Применяет blob (image/gif/video) к карточке.
     Видео — <video autoplay loop muted>, остальное — backgroundImage. */
  function applyThumbBlob(cardEl, blob) {
    const bg = cardEl.querySelector('.sc-bg');
    const ghost = cardEl.querySelector('.sc-fav-ghost');
    /* Удаляем старый видео-элемент если был */
    cardEl.querySelector('.sc-bg-video')?.remove();

    if (!blob) {
      bg.style.backgroundImage = '';
      bg.style.display = '';
      delete cardEl.dataset.hasThumb;
      if (ghost) ghost.style.display = '';
      return;
    }

    const url = URL.createObjectURL(blob);
    cardEl.dataset.hasThumb = '1';
    delete cardEl.dataset.hasColor;
    if (ghost) ghost.style.display = 'none';

    if (blob.type === 'video/mp4' || blob.type === 'video/webm') {
      const vid = document.createElement('video');
      vid.className = 'sc-bg-video';
      vid.src = url; vid.autoplay = true; vid.loop = true;
      vid.muted = true; vid.playsInline = true;
      vid.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;border-radius:inherit;';
      cardEl.insertBefore(vid, bg);
      bg.style.display = 'none';
    } else {
      /* image or gif */
      bg.style.display = '';
      bg.style.background = '';
      bg.style.backgroundImage = `url("${url}")`;
      bg.style.backgroundSize = 'cover';
      bg.style.backgroundPosition = 'center';
    }
  }

  /* Compress + persist + apply a thumb blob to a card. Shared by the file
     picker (pickThumb) and the clipboard-paste action (setThumbFromBlob). */
  async function setThumb(bmId, cardEl, sourceBlob) {
    const blob = await S().compressImage(sourceBlob);
    await S().saveThumb(bmId, blob);
    applyThumbBlob(cardEl, blob);
    return blob;
  }

  function pickThumb(bmId, cardEl) {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*,video/mp4,video/webm';
    inp.addEventListener('change', async () => {
      const file = inp.files[0]; if (!file) return;
      try {
        await setThumb(bmId, cardEl, file);
      } catch (e) { console.error('[BNT SC] pickThumb failed', e); }
    });
    inp.click();
  }

  /* ══ EDIT / ADD POPUP ═══════════════════════════════════════════ */
  let _popup = null;

  function closePopup() { _popup?.remove(); _popup = null; }

  function openPopup({ isNew, bmId, cardEl, title, url, x, y, onSave, onDelete }) {
    closePopup();
    const popup = document.createElement('div');
    popup.className = 'sc-edit-popup';

    /* Initial thumb shown in preview — loaded async from IDB */
    const existingThumb = null; /* set async below */

    popup.innerHTML = `
      <div class="sc-edit-header">
        <span class="sc-edit-heading">${isNew ? 'Add shortcut' : 'Edit shortcut'}</span>
        <button class="sc-edit-close"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>
      <div class="sc-edit-fields">
        <label class="sc-edit-field"><span>Name</span><input class="sc-edit-input" id="_sc_name" type="text" value="${(title||'').replace(/"/g,'&quot;')}" placeholder="Site name"></label>
        <label class="sc-edit-field"><span>URL</span><input class="sc-edit-input" id="_sc_url" type="text" value="${(url||'').replace(/"/g,'&quot;')}" placeholder="https://…"></label>
      </div>
      <div class="sc-edit-img-wrap">
        <div class="sc-edit-preview ${existingThumb ? 'has-thumb' : ''}">
          <img class="sc-edit-preview-img" ${existingThumb ? `src="${existingThumb}"` : ''} alt="">
          <div class="sc-edit-preview-empty">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            No image
          </div>
        </div>
        <div class="sc-edit-img-btns">
          <button class="sc-edit-btn sc-edit-img-btn">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            Upload
          </button>
          <button class="sc-edit-btn sc-edit-paste-btn">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
            Paste
          </button>
          ${!isNew ? `<button class="sc-edit-btn sc-edit-clear-btn">Remove</button>` : ''}
        </div>
      </div>
      <div class="sc-edit-actions">
        ${!isNew ? `<button class="sc-edit-btn sc-edit-del-btn">Delete</button>` : '<span></span>'}
        <button class="sc-edit-btn sc-edit-save-btn">Save</button>
      </div>
    `;
    document.body.appendChild(popup);
    _popup = popup;

    const previewEl  = popup.querySelector('.sc-edit-preview');
    const previewImg = popup.querySelector('.sc-edit-preview-img');

    function setPreview(dataUrl) {
      if (dataUrl) {
        previewImg.src = dataUrl;
        previewEl.classList.add('has-thumb');
      } else {
        previewImg.src = '';
        previewEl.classList.remove('has-thumb');
      }
    }

    requestAnimationFrame(() => {
      const pw = popup.offsetWidth || 300, ph = popup.offsetHeight || 300;
      const vw = window.innerWidth, vh = window.innerHeight;
      popup.style.left = Math.max(10, Math.min(x, vw - pw - 10)) + 'px';
      popup.style.top  = Math.max(10, Math.min(y, vh - ph - 10)) + 'px';
    });

    /* Load existing thumb from IDB for edit mode */
    if (!isNew && bmId) {
      S().getThumb(bmId).then(blob => {
        if (!blob || !_popup) return;
        if (blob.type.startsWith('video/')) {
          popup.querySelector('.sc-edit-preview-empty').textContent = '▶ Video';
        } else {
          const url = URL.createObjectURL(blob);
          setPreview(url);
        }
      });
    }

    popup.querySelector('.sc-edit-close').onclick = closePopup;

    let _pendingThumb = null;

    /* Shared file picker — works for both edit and add */
    function pickAndPreview(onPicked) {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/*,video/mp4,video/webm';
      inp.addEventListener('change', async () => {
        const file = inp.files[0]; if (!file) return;
        const blob = await S().compressImage(file);
        /* Preview in popup: always show static frame for video */
        if (blob.type.startsWith('video/')) {
          setPreview(null);
          popup.querySelector('.sc-edit-preview-empty').textContent = '▶ Video selected';
        } else {
          const url = URL.createObjectURL(blob);
          setPreview(url);
        }
        onPicked(blob);
      });
      inp.click();
    }

    popup.querySelector('.sc-edit-img-btn').onclick = () => {
      if (!isNew) {
        pickAndPreview(async blob => {
          await S().saveThumb(bmId, blob);
          applyThumbBlob(cardEl, blob);
        });
      } else {
        pickAndPreview(blob => { _pendingThumb = blob; });
      }
    };

    /* Paste image from clipboard — mirrors pickAndPreview but sources
       the blob from the OS clipboard instead of a file picker. */
    popup.querySelector('.sc-edit-paste-btn').onclick = async () => {
      let raw;
      try {
        raw = await S().readClipboardImage();
      } catch (e) {
        console.error('[BNT SC] clipboard read failed', e);
        window.BNT_TOAST?.show({ title: 'Could not read clipboard', type: 'error', duration: 2200 });
        return;
      }
      if (!raw) {
        window.BNT_TOAST?.show({ title: 'No image in clipboard', type: 'error', duration: 2200 });
        return;
      }
      const blob = await S().compressImage(raw);
      const url = URL.createObjectURL(blob);
      setPreview(url);
      if (!isNew) {
        await S().saveThumb(bmId, blob);
        applyThumbBlob(cardEl, blob);
      } else {
        _pendingThumb = blob;
      }
      window.BNT_TOAST?.show({ title: 'Image pasted', type: 'success', duration: 1800 });
    };

    if (!isNew) {
      popup.querySelector('.sc-edit-clear-btn').onclick = async () => {
        await S().deleteThumb(bmId); setPreview(null);
        if (cardEl) { applyThumbBlob(cardEl, null); const c = getColor(bmId); if (c) applyColor(cardEl, c); }
      };
      popup.querySelector('.sc-edit-del-btn').onclick = () => { closePopup(); onDelete?.(); };
    }

    popup.querySelector('.sc-edit-save-btn').onclick = () => {
      const name = popup.querySelector('#_sc_name').value.trim();
      const u    = popup.querySelector('#_sc_url').value.trim();
      closePopup(); onSave?.(name, u, _pendingThumb);
    };
    popup.querySelector('#_sc_url').addEventListener('keydown', e => {
      if (e.key === 'Enter') popup.querySelector('.sc-edit-save-btn').click();
    });

    setTimeout(() => {
      document.addEventListener('mousedown', function out(e) {
        if (!popup.contains(e.target)) { closePopup(); document.removeEventListener('mousedown', out); }
      });
    }, 0);
  }

  /* ══ CARD ═══════════════════════════════════════════════════════ */
  const _cards = new Map(); /* bmId → { cardEl, titleEl, domainEl, favCenter, favGhost } */

  function buildCard(bm) {
    const meta   = getMeta(bm.id);
    const title  = meta?.title || bm.title;
    const url    = meta?.url   || bm.url;

    const card = document.createElement('div');
    card.className = 'sc-card';
    card.dataset.id = bm.id;

    const bg = document.createElement('div'); bg.className = 'sc-bg'; card.appendChild(bg);
    const overlay = document.createElement('div'); overlay.className = 'sc-overlay'; card.appendChild(overlay);

    const favCenter = document.createElement('img');
    favCenter.className = 'sc-fav-center';
    favCenter.draggable = false;
    favCenter.onerror = () => { favCenter.style.opacity = '0'; };
    card.appendChild(favCenter);

    const favGhost = document.createElement('img');
    favGhost.className = 'sc-fav-ghost';
    favGhost.draggable = false;
    favGhost.onerror = () => { favGhost.style.opacity = '0'; };
    card.appendChild(favGhost);

    const info = document.createElement('div'); info.className = 'sc-info';
    const titleEl = document.createElement('div'); titleEl.className = 'sc-title'; titleEl.textContent = title || getDomain(url);
    const domainEl = document.createElement('div'); domainEl.className = 'sc-domain'; domainEl.textContent = getDomain(url);
    info.append(titleEl, domainEl); card.appendChild(info);

    const favSrc = faviconUrl(url);
    favCenter.src = favSrc; favGhost.src = favSrc;

    /* Load thumb from IndexedDB (shared with bookmarks) */
    S().getThumb(bm.id).then(blob => {
      if (blob) {
        applyThumbBlob(card, blob);
      } else {
        const cached = getColor(bm.id);
        if (cached) {
          applyColor(card, cached);
        } else {
          extractColor(favSrc).then(color => {
            if (color) { saveColor(bm.id, color); if (!card.dataset.hasThumb) applyColor(card, color); }
          });
        }
      }
    });

    card.addEventListener('click', () => window.open(url, '_blank'));

    _cards.set(bm.id, { cardEl: card, titleEl, domainEl, favCenter, favGhost, bm, url });
    return card;
  }

  /* ══ PUBLIC API for context-menu.js ═════════════════════════════ */
  window.BNT_SC = {
    getUrl(bmId)   { return _cards.get(bmId)?.url ?? ''; },
    getThumb(bmId) {
      const bg = _cards.get(bmId)?.cardEl.querySelector('.sc-bg');
      return bg?.style.backgroundImage.match(/url\(["']?(.+?)["']?\)/)?.[1] || null;
    },

    openEdit(bmId, cardEl, x, y) {
      const entry = _cards.get(bmId);
      if (!entry) return;
      const { titleEl, domainEl, favCenter, favGhost, url } = entry;
      openPopup({
        isNew: false, bmId, cardEl,
        title: titleEl.textContent, url, x, y,
        onSave: (newTitle, newUrl) => {
          saveMeta(bmId, { title: newTitle, url: newUrl });
          titleEl.textContent  = newTitle || getDomain(newUrl);
          domainEl.textContent = getDomain(newUrl);
          if (newUrl !== url) {
            const src = faviconUrl(newUrl);
            favCenter.src = src; favGhost.src = src;
            extractColor(src).then(c => { if (c) { saveColor(bmId, c); if (!cardEl.dataset.hasThumb) applyColor(cardEl, c); } });
          }
          entry.url = newUrl;
        },
        onDelete: () => chrome.bookmarks.remove(bmId),
      });
    },

    openAdd(x, y) {
      openPopup({
        isNew: true, x, y,
        onSave: (title, url, pendingThumb) => {
          if (!url || !_folderId) return;
          chrome.bookmarks.create({ parentId: _folderId, title: title || getDomain(url), url }, async bm => {
            if (pendingThumb && bm?.id) await S().saveThumb(bm.id, pendingThumb);
          });
        },
      });
    },

    pickThumb(bmId, cardEl) { pickThumb(bmId, cardEl); },

    /* Applies a clipboard-sourced image blob as the card's thumb.
       Used by context-menu.js "Paste image" action. Returns the
       compressed blob on success (so the caller can toast/confirm). */
    setThumbFromBlob(bmId, cardEl, blob) { return setThumb(bmId, cardEl, blob); },

    deleteCard(bmId) { chrome.bookmarks.remove(bmId); },

    /* ── Reorder (4) ── */
    moveBack(bmId) {
      chrome.bookmarks.get(bmId, ([bm]) => {
        if (!bm || bm.index === 0) return;
        chrome.bookmarks.move(bmId, { index: bm.index - 1 });
      });
    },
    moveFwd(bmId) {
      chrome.bookmarks.get(bmId, ([bm]) => {
        if (!bm) return;
        chrome.bookmarks.move(bmId, { index: bm.index + 2 });
      });
    },

    /* ── Move to Bookmarks (5) ── */
    moveToBookmarks(bmId) {
      window.BNT_FOLDERS_READY?.then(folders => {
        if (!folders?.bmId) return;
        chrome.bookmarks.move(bmId, { parentId: folders.bmId });
      });
    },

    /* ── Move from Bookmarks to Shortcuts (5) ── */
    moveFromBookmarks(bmId) {
      if (!_folderId) return;
      chrome.bookmarks.move(bmId, { parentId: _folderId });
    },
  };

  /* ══ APPLY CARD SETTINGS (CSS vars) ════════════════════════════ */
  function applyCardSettings() {
    const radius    = localStorage.getItem('sc_radius')     ?? '14';
    const showIcon  = localStorage.getItem('sc_show_icon')  ?? 'true';
    const showTitle = localStorage.getItem('sc_show_title') ?? 'true';
    const r = document.documentElement;
    /* Apply as CSS vars on :root so all .sc-card inherit them */
    r.style.setProperty('--sc-radius',     radius + 'px');
    r.style.setProperty('--sc-show-icon',  showIcon  === 'false' ? '0' : '1');
    r.style.setProperty('--sc-show-title', showTitle === 'false' ? '0' : '1');
  }

  /* ── Zone width (Settings → Shortcuts → Zone width) ──────────────
     BNT_STORAGE-backed setting (scZoneWidthPct), same pattern as
     bookmarks.js applyPanelWidth(): applied once from storage on init,
     then live via the 'bnt:settings-changed' CustomEvent (colon —
     dispatched by settings.js buildSlider for BNT_STORAGE-backed values,
     not to be confused with the hyphenated 'bnt-settings-changed' used
     below for the plain-localStorage sc_* card settings). */
  function applyZoneWidth(pct) {
    document.documentElement.style.setProperty('--sc-zone-width', pct + 'vw');
  }

  /* ── Row alignment (Settings → Shortcuts → Row alignment) ────────
     'left' | 'center' | 'right' — toggled as a class on #shortcuts-row,
     actual CSS effect differs slightly between scroll and wrap mode,
     see style.css. */
  function applyRowAlign(align) {
    row.classList.remove('sc-align-left', 'sc-align-center', 'sc-align-right');
    row.classList.add('sc-align-' + (align || 'center'));
  }

  /* ── Wrap to multiple rows (Settings → Shortcuts → Wrap to multiple rows) */
  function applyWrapRows(on) {
    row.classList.toggle('sc-wrap', !!on);
  }

  /* ── Enable shortcuts (Settings → Shortcuts → Enable shortcuts) ──
     Hides the whole row via a class on <html> so it also works before
     the folder/render pipeline below has finished. */
  function applyEnabled(on) {
    document.documentElement.classList.toggle('sc-disabled', on === false);
  }

  window.addEventListener('bnt:settings-changed', e => {
    if (e.detail?.scZoneWidthPct !== undefined) applyZoneWidth(e.detail.scZoneWidthPct);
    if (e.detail?.scRowAlign    !== undefined) applyRowAlign(e.detail.scRowAlign);
    if (e.detail?.scWrapRows    !== undefined) applyWrapRows(e.detail.scWrapRows);
    if (e.detail?.scEnabled     !== undefined) {
      applyEnabled(e.detail.scEnabled);
      /* Turning it back on mid-session: load bookmarks if we skipped that
         at startup because it was disabled then. */
      if (e.detail.scEnabled === true) startLoading();
    }
  });

  /* Listen for settings changes from other parts of the page */
  window.addEventListener('bnt-settings-changed', e => {
    if (['sc_radius','sc_show_icon','sc_show_title'].includes(e.detail?.key)) applyCardSettings();
  });

  /* ══ RENDER ══════════════════════════════════════════════════════ */
  function render(shortcuts) {
    row.innerHTML = '';
    _cards.clear();
    if (!shortcuts.length) {
      const hint = document.createElement('p');
      hint.className = 'sc-hint';
      hint.textContent = 'Right-click here to add a shortcut';
      row.appendChild(hint);
    } else {
      shortcuts.forEach(bm => row.appendChild(buildCard(bm)));
    }
    row.classList.add('sc-ready');

    /* Прокрутить к середине после того как браузер посчитает размеры */
    requestAnimationFrame(() => {
      row.scrollLeft = (row.scrollWidth - row.clientWidth) / 2;
    });
  }

  /* ══ LOAD BOOKMARKS + RENDER (skipped at startup while disabled) ═══ */
  let _loadStarted = false;
  async function startLoading() {
    if (_loadStarted) return;
    _loadStarted = true;

    const folders = await window.BNT_FOLDERS_READY;
    if (!folders) { row.style.display = 'none'; return; }
    _folderId = folders.scId;

    async function loadAndRender() {
      const children = await new Promise(r => chrome.bookmarks.getChildren(_folderId, r));
      render(children.filter(b => b.url));
    }

    await loadAndRender();
    ['onCreated','onRemoved','onChanged','onMoved'].forEach(ev => {
      chrome.bookmarks[ev].addListener(loadAndRender);
    });
  }

  /* ══ INIT ════════════════════════════════════════════════════════ */
  async function init() {
    applyCardSettings();

    /* Zone width / alignment / wrap / enabled must run after storage init
       — values come from IndexedDB via BNT_STORAGE. */
    await window.BNT_STORAGE_READY;
    const s = S()?.getSettings() ?? {};
    applyZoneWidth(s.scZoneWidthPct ?? 94);
    applyRowAlign(s.scRowAlign ?? 'center');
    applyWrapRows(s.scWrapRows ?? false);
    applyEnabled(s.scEnabled ?? true);
    if (s.scEnabled === false) return; /* row hidden via CSS — skip loading/rendering until re-enabled */

    await startLoading();
  }

  init();
})();
