/**
 * shortcuts.js — Beautiful New Tab · Shortcut cards above search
 *
 * Reads bookmarks from Chrome's "NewTab Extension/shortcuts" folder.
 * Thumbnails are stored in localStorage (chrome bookmarks don't support images).
 * Depends on window.BNT_FOLDERS_READY (set by bm-folders.js).
 */

(() => {
  'use strict';

  const THUMB_PFX = 'bnt_sc_thumb_';

  /* ── Thumbnail helpers ──────────────────────────────────────────── */
  const getThumb   = id  => localStorage.getItem(THUMB_PFX + id) || null;
  const saveThumb  = (id, data) => localStorage.setItem(THUMB_PFX + id, data);
  const clearThumb = id  => localStorage.removeItem(THUMB_PFX + id);

  /* ── URL helpers ────────────────────────────────────────────────── */
  const faviconUrl = url => {
    try { return `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(new URL(url).origin)}`; }
    catch { return ''; }
  };
  const getDomain = url => {
    try { return new URL(url).hostname.replace(/^www\./, ''); }
    catch { return url; }
  };

  /* ── DOM ref ────────────────────────────────────────────────────── */
  const row = document.getElementById('shortcuts-row');

  /* ── Horizontal mouse-wheel scroll ─────────────────────────────── */
  row.addEventListener('wheel', e => {
    if (Math.abs(e.deltaY) >= Math.abs(e.deltaX)) {
      e.preventDefault();
      row.scrollBy({ left: e.deltaY * 1.8, behavior: 'auto' });
    }
  }, { passive: false });

  /* ── Apply / clear thumbnail on a card ─────────────────────────── */
  function applyThumb(cardEl, dataUrl) {
    const bg = cardEl.querySelector('.sc-bg');
    if (dataUrl) {
      bg.style.backgroundImage = `url("${dataUrl.replace(/"/g, '\\"')}")`;
      cardEl.dataset.hasThumb = '1';
    } else {
      bg.style.backgroundImage = '';
      delete cardEl.dataset.hasThumb;
    }
  }

  /* ── File picker → compress → save ─────────────────────────────── */
  function pickThumb(bmId, cardEl) {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    inp.addEventListener('change', () => {
      const file = inp.files[0];
      if (!file) return;
      const img = new Image();
      const objUrl = URL.createObjectURL(file);
      img.onload = () => {
        /* Downscale to ≤960×600 to keep localStorage usage sane */
        const maxW = 960, maxH = 600;
        const ratio = Math.min(maxW / img.width, maxH / img.height, 1);
        const canvas = document.createElement('canvas');
        canvas.width  = Math.round(img.width  * ratio);
        canvas.height = Math.round(img.height * ratio);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(objUrl);
        const data = canvas.toDataURL('image/jpeg', 0.82);
        saveThumb(bmId, data);
        applyThumb(cardEl, data);
      };
      img.src = objUrl;
    });
    inp.click();
  }

  /* ══════════════════════════════════════════════════════════════════
     CARD BUILDER
  ══════════════════════════════════════════════════════════════════ */
  function buildCard(bm) {
    const card = document.createElement('div');
    card.className = 'sc-card';
    card.dataset.id = bm.id;

    /* ── Background ── */
    const bg = document.createElement('div');
    bg.className = 'sc-bg';
    card.appendChild(bg);

    const thumb = getThumb(bm.id);
    if (thumb) applyThumb(card, thumb);

    /* ── Gradient overlay ── */
    const overlay = document.createElement('div');
    overlay.className = 'sc-overlay';
    card.appendChild(overlay);

    /* ── Favicon ── */
    const fav = document.createElement('img');
    fav.className = 'sc-favicon';
    fav.src = faviconUrl(bm.url);
    fav.draggable = false;
    fav.onerror = () => { fav.style.opacity = '0'; };
    card.appendChild(fav);

    /* ── Info block (title + domain) ── */
    const info = document.createElement('div');
    info.className = 'sc-info';

    const title = document.createElement('div');
    title.className = 'sc-title';
    title.textContent = bm.title || getDomain(bm.url);

    const domain = document.createElement('div');
    domain.className = 'sc-domain';
    domain.textContent = getDomain(bm.url);

    info.append(title, domain);
    card.appendChild(info);

    /* ── Events ── */
    card.addEventListener('click', () => window.open(bm.url, '_blank'));

    return card;
  }

  /* ══════════════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════════════════ */
  function render(shortcuts) {
    row.innerHTML = '';

    if (!shortcuts.length) {
      const hint = document.createElement('p');
      hint.className = 'sc-hint';
      hint.innerHTML =
        'Add bookmarks to <b>NewTab Extension › shortcuts</b> ' +
        'in Chrome Bookmarks to display cards here';
      row.appendChild(hint);
      row.classList.add('sc-ready');
      return;
    }

    shortcuts.forEach(bm => row.appendChild(buildCard(bm)));
    row.classList.add('sc-ready');
  }

  /* ══════════════════════════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════════════════════════ */
  async function init() {
    const folders = await window.BNT_FOLDERS_READY;
    if (!folders) {
      /* Not in extension context — show nothing, keep row hidden */
      row.style.display = 'none';
      return;
    }

    const { scId } = folders;

    async function loadAndRender() {
      const children = await new Promise(r => chrome.bookmarks.getChildren(scId, r));
      render(children.filter(b => b.url));
    }

    await loadAndRender();

    /* Stay in sync when user edits bookmarks in Chrome */
    ['onCreated', 'onRemoved', 'onChanged', 'onMoved'].forEach(ev => {
      chrome.bookmarks[ev].addListener(loadAndRender);
    });
  }

  init();
})();
