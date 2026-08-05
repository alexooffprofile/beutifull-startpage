/**
 * bookmarks.js — Beautiful New Tab · Bookmark panel
 *
 * Data source  : Chrome Bookmarks API (folder: bookmarks_panel)
 * Metadata     : BNT_STORAGE (chrome.storage.local)
 * Thumbnails   : BNT_STORAGE IndexedDB
 *
 * Depends on   : storage.js, migration.js, bm-folders.js
 */

(() => {
  'use strict';

  /* ══════════════════════════════════════════════════════════════
     CONFIG
  ══════════════════════════════════════════════════════════════ */
  const CONFIG = {
    /* PANEL_WIDTH_PCT убран — ширина панели теперь хранится в BNT_STORAGE (settings.panelWidthPct) */
    HOVER_ZONE_PX   : 260,
    CLOSE_DELAY_MS  : 110,
    TAG_COLORS: [
      '#7b93ff','#ff7eb3','#53d8a0','#ffb347','#a78bfa',
      '#38bdf8','#fb7185','#34d399','#fbbf24','#e879f9',
    ],
  };

  /* ══════════════════════════════════════════════════════════════
     HELPERS
  ══════════════════════════════════════════════════════════════ */
  const hostname   = url => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };
  const faviconUrl = url => { try { return `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(new URL(url).origin)}`; } catch { return ''; } };
  const siteLabel  = host => { const c = host.split('.').slice(0,-1).join(' ') || host; return c.replace(/[-_]/g,' ').split(' ').map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(' '); };
  const randomColor= () => CONFIG.TAG_COLORS[Math.floor(Math.random()*CONFIG.TAG_COLORS.length)];
  const hexToRgba  = (h,a) => { const r=parseInt(h.slice(1,3),16),g=parseInt(h.slice(3,5),16),b=parseInt(h.slice(5,7),16); return `rgba(${r},${g},${b},${a})`; };
  const esc        = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const truncUrl   = url => { try { const u=new URL(url); return u.hostname.replace(/^www\./,'')+( u.pathname.length>1?u.pathname.replace(/\/$/,''):''); } catch { return url; } };

  /* ══════════════════════════════════════════════════════════════
     STATE
  ══════════════════════════════════════════════════════════════ */
  const S = window.BNT_STORAGE;

  let bmNodes    = [];   /* chrome.bookmarks nodes in our panel folder */
  let bmId       = null; /* our bookmarks_panel folder ID              */
  let extId      = null; /* extension root folder ID                   */
  let scId       = null; /* shortcuts folder ID                        */
  let activeTags = new Set(['all']); /* 'all' means no filter */
  let groupMode  = 'none'; /* 'none' | 'hostname' | 'tags' | 'date'  */
  let searchQuery= '';
  let closeTimer = null;
  let pinned     = false;
  let autoPinned = false;

  /* ── Mouse-outside-page tracking (fix for panel staying open on load) ── */
  let mouseInsidePage = false;

  document.addEventListener('mouseenter', () => { mouseInsidePage = true;  }, true);
  document.addEventListener('mouseleave', () => {
    mouseInsidePage = false;
    /* Mouse left the page entirely — don't close panel, just cancel any pending timer */
    clearTimeout(closeTimer);
  });

  /* When mouse returns to page, if it's not over panel or hover zone — close */
  document.addEventListener('mouseenter', () => {
    if (!pinned && !panel?.matches(':hover') && !hoverZone?.matches(':hover')) {
      scheduleClose();
    }
  }, true);

  /* ══════════════════════════════════════════════════════════════
     DOM REFS
  ══════════════════════════════════════════════════════════════ */
  const panel     = document.getElementById('bm-panel');
  const bmContent = document.getElementById('bm-content');
  const tagBar    = document.getElementById('bm-tags');
  const list      = document.getElementById('bm-list');

  /* Wrap #bm-tags in #bm-tags-wrap so restore button can sit outside scroll area */
  const tagsWrap = document.createElement('div');
  tagsWrap.id = 'bm-tags-wrap';
  tagBar.parentNode.insertBefore(tagsWrap, tagBar);
  tagsWrap.appendChild(tagBar);

  /* Horizontal scroll via mouse wheel on the tag bar */
  tagBar.addEventListener('wheel', e => {
    if (e.deltaY === 0) return;
    e.preventDefault();
    tagBar.scrollLeft += e.deltaY;
  }, { passive: false });

  /* Remove legacy #bm-add-row if it exists in HTML */
  document.getElementById('bm-add-row')?.remove();

  /* ── Panel width ─────────────────────────────────────────────
     applyPanelWidth() вызывается из init() ПОСЛЕ await BNT_STORAGE_READY,
     поэтому значение всегда актуальное из IndexedDB.
     Живые изменения (слайдер в настройках) приходят через CustomEvent.
  ── */
  function applyPanelWidth(pct) {
    panel.style.setProperty('--bm-open-w', pct + 'vw');
  }

  /* React to live changes from the settings panel (no page reload needed) */
  window.addEventListener('bnt:settings-changed', e => {
    const d = e.detail;
    if (!d) return;
    if (d.panelWidthPct !== undefined) applyPanelWidth(d.panelWidthPct);
    /* pinByDefault only affects NEW tabs — do NOT change current tab's pin state */
    if (d.cardRadius    !== undefined)
      document.documentElement.style.setProperty('--bm-card-radius', d.cardRadius + 'px');
    if (d.closeDelay    !== undefined) CONFIG.CLOSE_DELAY_MS = d.closeDelay;
    if (d.accentMain    !== undefined) {
      const hex = d.accentMain;
      const h   = hex.replace('#', '');
      const r   = parseInt(h.substring(0, 2), 16);
      const g   = parseInt(h.substring(2, 4), 16);
      const b   = parseInt(h.substring(4, 6), 16);
      document.documentElement.style.setProperty('--accent-main', hex);
      document.documentElement.style.setProperty('--accent-main-glow', `rgba(${r},${g},${b},0.18)`);
      document.documentElement.style.setProperty('--accent-main-glow-sm', `rgba(${r},${g},${b},0.12)`);
    }
    if (d.accentSearch !== undefined) {
      const hex = d.accentSearch;
      const h = hex.replace('#','');
      const r = parseInt(h.substring(0,2),16), g = parseInt(h.substring(2,4),16), b = parseInt(h.substring(4,6),16);
      document.documentElement.style.setProperty('--accent-search', hex);
      document.documentElement.style.setProperty('--accent-search-glow', `rgba(${r},${g},${b},0.14)`);
    }
    if (d.accentCmd !== undefined) {
      const hex = d.accentCmd;
      const h = hex.replace('#','');
      const r = parseInt(h.substring(0,2),16), g = parseInt(h.substring(2,4),16), b = parseInt(h.substring(4,6),16);
      document.documentElement.style.setProperty('--accent-cmd', hex);
      document.documentElement.style.setProperty('--accent-cmd-glow', `rgba(${r},${g},${b},0.14)`);
    }
    if (d.autoPanelBg !== undefined || d.panelBg !== undefined || d.accentMain !== undefined) {
      /* Re-derive surface palette when any related setting changes */
      const S = window.BNT_STORAGE;
      const settings = S ? S.getSettings() : {};
      const autoPanelBg = d.autoPanelBg ?? settings.autoPanelBg ?? true;
      const root = document.documentElement;
      /* accent → panelBg (mix 2.5%) → full surface hierarchy */
      const _applyBg = (panelHex) => {
        const hx = panelHex.replace('#','');
        const r = parseInt(hx.substring(0,2),16), g = parseInt(hx.substring(2,4),16), bl = parseInt(hx.substring(4,6),16);
        const clamp = v => Math.max(0, Math.min(255, v));
        const rgb = (dr, dg, db) => `rgb(${clamp(r+dr)},${clamp(g+dg)},${clamp(b+db)})`.replace('b',bl);
        root.style.setProperty('--panel-bg', panelHex);
        root.style.setProperty('--bg',       `rgb(${clamp(r-16)},${clamp(g-17)},${clamp(bl-22)})`);
        root.style.setProperty('--surface',  `rgb(${clamp(r-8)},${clamp(g-8)},${clamp(bl-10)})`);
        root.style.setProperty('--surface2', panelHex);
        root.style.setProperty('--surface3', `rgb(${clamp(r+7)},${clamp(g+7)},${clamp(bl+7)})`);
      };
      if (autoPanelBg) {
        const accent = d.accentMain ?? settings.accentMain ?? '#7eff84';
        const hx = accent.replace('#','');
        const r = parseInt(hx.substring(0,2),16), g = parseInt(hx.substring(2,4),16), bl = parseInt(hx.substring(4,6),16);
        const mix = 0.012;
        const t = (base, ch) => Math.round(base + (ch - base) * mix);
        const to2 = n => n.toString(16).padStart(2,'0');
        const panelHex = '#' + to2(t(30,r)) + to2(t(32,g)) + to2(t(41,bl));
        _applyBg(panelHex);
      } else if (d.panelBg) {
        _applyBg(d.panelBg);
      }
    }
  });

  /* ══════════════════════════════════════════════════════════════
     BUILD HEADER  (#bm-header)
     Order: [search] [+] [pin]
  ══════════════════════════════════════════════════════════════ */
  const bmHeader = document.createElement('div');
  bmHeader.id = 'bm-header';

  /* ── Search ── */
  let searchActive = false;
  const searchWrap = document.createElement('div');
  searchWrap.id = 'bm-search-wrap';

  const searchIco = document.createElementNS('http://www.w3.org/2000/svg','svg');
  searchIco.setAttribute('id','bm-search-ico');
  searchIco.setAttribute('viewBox','0 0 24 24');
  searchIco.setAttribute('fill','none');
  searchIco.setAttribute('stroke','currentColor');
  searchIco.setAttribute('stroke-width','2');
  searchIco.setAttribute('stroke-linecap','round');
  searchIco.setAttribute('stroke-linejoin','round');
  searchIco.innerHTML = '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="15.65" y2="15.65"/>';

  const searchIn = document.createElement('input');
  searchIn.id = 'bm-search'; searchIn.type = 'text';
  searchIn.placeholder = 'Search… or .tag / /tag';
  searchIn.autocomplete = 'off'; searchIn.spellcheck = false;

  const searchClear = document.createElement('button');
  searchClear.id = 'bm-search-clear'; searchClear.title = 'Clear search';
  searchClear.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="2.5" stroke-linecap="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>`;

  let tagSearchQuery = ''; /* separate state for tag-filter-via-search */

  searchIn.addEventListener('input', () => {
    const raw = searchIn.value;
    const trimmed = raw.trim();

    /* Tag search mode: starts with '.' or '/' */
    if (/^[./]/.test(trimmed)) {
      tagSearchQuery = trimmed.slice(1).toLowerCase();
      searchQuery    = '';
      /* Start filtering only from 2 chars after the prefix */
      if (tagSearchQuery.length >= 2) {
        const matched = S.getTags().filter(t =>
          !t.hidden && t.name.toLowerCase().includes(tagSearchQuery)
        );
        activeTags = matched.length ? new Set(matched.map(t => t.id)) : new Set(['all']);
      } else {
        activeTags = new Set(['all']);
      }
      renderTags();
    } else {
      tagSearchQuery = '';
      searchQuery    = trimmed.toLowerCase();
    }

    searchClear.classList.toggle('visible', raw.length > 0);
    renderList();
  });
  searchIn.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      searchIn.value=''; searchQuery=''; tagSearchQuery='';
      activeTags = new Set(['all']);
      searchClear.classList.remove('visible');
      renderTags(); renderList();
    }
  });
  searchClear.addEventListener('click', () => {
    searchIn.value=''; searchQuery=''; tagSearchQuery='';
    activeTags = new Set(['all']);
    searchClear.classList.remove('visible');
    searchIn.focus();
    renderTags(); renderList();
  });
  searchIn.addEventListener('focus', engagePanel);
  searchIn.addEventListener('blur',  () => { if (!searchQuery) releasePanel(); });

  searchWrap.append(searchIco, searchIn, searchClear);

  /* ── Add button (+) ── */
  const addBtn = document.createElement('button');
  addBtn.id = 'bm-add-btn'; addBtn.title = 'Add bookmark';
  addBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="2.5" stroke-linecap="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>`;
  addBtn.addEventListener('click', e => { e.stopPropagation(); toggleAddPanel(); });

  /* ── Pin button ── */
  const pinBtn = document.createElement('button');
  pinBtn.id = 'bm-pin-btn'; pinBtn.title = 'Pin panel';
  pinBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="12" y1="17" x2="12" y2="22"/>
    <path d="M5 17h14v-2a6 6 0 0 0-4-5.66V4h1V2H8v2h1v5.34A6 6 0 0 0 5 15v2z"/>
  </svg>`;
  pinBtn.addEventListener('click', e => { e.stopPropagation(); setPin(!pinned); if(pinned) autoPinned=false; });
  panel.addEventListener('dblclick', e => { if(e.target.closest('#bm-pin-btn')) return; setPin(!pinned); if(pinned) autoPinned=false; });

  bmHeader.append(searchWrap, addBtn, pinBtn);
  bmContent.insertBefore(bmHeader, bmContent.firstChild);

  /* ══════════════════════════════════════════════════════════════
     ADD PANEL  (expands below header)
  ══════════════════════════════════════════════════════════════ */
  const addPanel = document.createElement('div');
  addPanel.id = 'bm-add-panel';
  addPanel.hidden = true;

  /* Two tabs: browser bookmarks / new */
  const addTabs = document.createElement('div');
  addTabs.id = 'bm-add-tabs';
  const tabBrowser = document.createElement('button');
  tabBrowser.className = 'bm-add-tab active'; tabBrowser.textContent = 'Browser bookmarks';
  const tabNew = document.createElement('button');
  tabNew.className = 'bm-add-tab'; tabNew.textContent = 'New bookmark';
  addTabs.append(tabBrowser, tabNew);

  /* Browser bookmarks pane */
  const browserPane = document.createElement('div');
  browserPane.id = 'bm-browser-pane';

  const browserSearch = document.createElement('input');
  browserSearch.id = 'bm-browser-search'; browserSearch.type = 'text';
  browserSearch.placeholder = 'Search browser bookmarks…';
  browserSearch.autocomplete = 'off'; browserSearch.spellcheck = false;

  const browserList = document.createElement('div');
  browserList.id = 'bm-browser-list';
  browserPane.append(browserSearch, browserList);

  /* New bookmark pane */
  const newPane = document.createElement('div');
  newPane.id = 'bm-new-pane'; newPane.hidden = true;

  const newUrlIn = document.createElement('input');
  newUrlIn.id = 'bm-new-url'; newUrlIn.type = 'text';
  newUrlIn.placeholder = 'https://…'; newUrlIn.autocomplete = 'off'; newUrlIn.spellcheck = false;

  const newTitleIn = document.createElement('input');
  newTitleIn.id = 'bm-new-title'; newTitleIn.type = 'text';
  newTitleIn.placeholder = 'Title (optional)'; newTitleIn.autocomplete = 'off'; newTitleIn.spellcheck = false;

  const newConfirmBtn = document.createElement('button');
  newConfirmBtn.id = 'bm-new-confirm'; newConfirmBtn.textContent = 'Add bookmark';
  newConfirmBtn.addEventListener('click', handleNewBookmark);

  newUrlIn.addEventListener('keydown', e => { if(e.key==='Enter') newTitleIn.value===''?handleNewBookmark():newTitleIn.focus(); });
  newTitleIn.addEventListener('keydown', e => { if(e.key==='Enter') handleNewBookmark(); });

  /* Thumbnail row for new bookmark */
  let newThumbBlob = null;
  const newThumbRow = document.createElement('div'); newThumbRow.id = 'bm-new-thumb-row';

  const newThumbPreview = document.createElement('div'); newThumbPreview.id = 'bm-new-thumb-preview';
  const newThumbImg = document.createElement('img'); newThumbImg.id = 'bm-new-thumb-img'; newThumbImg.alt = '';
  const newThumbEmpty = document.createElement('span'); newThumbEmpty.id = 'bm-new-thumb-empty'; newThumbEmpty.textContent = 'No thumbnail';
  newThumbPreview.append(newThumbImg, newThumbEmpty);

  const newThumbPickBtn = document.createElement('button'); newThumbPickBtn.id = 'bm-new-thumb-pick';
  newThumbPickBtn.title = 'Choose thumbnail';
  newThumbPickBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg> Image`;
  newThumbPickBtn.addEventListener('click', () => {
    const inp = document.createElement('input'); inp.type='file'; inp.accept='image/*';
    inp.addEventListener('change', async () => {
      const file = inp.files[0]; if (!file) return;
      newThumbBlob = await S.compressImage(file);
      const url = URL.createObjectURL(newThumbBlob);
      newThumbImg.src = url; newThumbImg.style.display = 'block';
      newThumbEmpty.style.display = 'none';
    });
    inp.click();
  });

  const newThumbClearBtn = document.createElement('button'); newThumbClearBtn.id = 'bm-new-thumb-clear';
  newThumbClearBtn.title = 'Remove thumbnail';
  newThumbClearBtn.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
  newThumbClearBtn.addEventListener('click', () => {
    newThumbBlob = null; newThumbImg.src = ''; newThumbImg.style.display = 'none';
    newThumbEmpty.style.display = '';
  });

  newThumbRow.append(newThumbPreview, newThumbPickBtn, newThumbClearBtn);
  newPane.append(newUrlIn, newTitleIn, newThumbRow, newConfirmBtn);

  addPanel.append(addTabs, browserPane, newPane);

  /* Insert add panel right after header */
  bmContent.insertBefore(addPanel, bmHeader.nextSibling);

  /* Tab switching */
  /* tabBrowser click handled below */
  tabNew.addEventListener('click', () => {
    tabNew.classList.add('active'); tabBrowser.classList.remove('active');
    newPane.hidden = false;
    browserPane.style.display = 'none';
    newUrlIn.focus();
  });

  tabBrowser.addEventListener('click', () => {
    tabBrowser.classList.add('active'); tabNew.classList.remove('active');
    newPane.hidden = true;
    browserPane.style.display = '';
    loadBrowserBookmarks(browserSearch.value);
  });

  /* Auto-pin while add panel is open */
  [browserSearch, newUrlIn, newTitleIn].forEach(el => {
    el.addEventListener('focus', engagePanel);
    el.addEventListener('blur',  releasePanel);
  });

  function toggleAddPanel() {
    const opening = addPanel.hidden;
    addPanel.hidden = !opening;
    addBtn.classList.toggle('active', opening);
    if (opening) {
      engagePanel();
      loadBrowserBookmarks();
      browserSearch.focus();
    } else {
      addBtn.classList.remove('active');
      releasePanel();
    }
  }

  /* ── Load browser bookmarks (excluding our folder) ── */
  async function loadBrowserBookmarks(filter = '') {
    if (typeof chrome === 'undefined' || !chrome?.bookmarks) {
      browserList.innerHTML = `<div class="bm-browser-empty">Not available outside extension context.</div>`;
      return;
    }
    browserList.innerHTML = `<div class="bm-browser-loading">Loading…</div>`;

    const allNodes = await new Promise(r => chrome.bookmarks.getTree(r));
    const flat = [];

    /* Collect IDs to skip — our own extension folders */
    const skipIds = new Set([bmId, extId, scId].filter(Boolean));

    function walk(nodes, depth) {
      for (const n of nodes) {
        if (skipIds.has(n.id)) continue;

        /* Firefox separator: type === 'separator', or no url + no children + no title */
        const isSeparator = n.type === 'separator'
          || (!n.url && !n.children && !n.title);

        if (isSeparator) {
          flat.push({ _separator: true, id: n.id });
        } else if (n.url) {
          flat.push(n);
        } else if (Array.isArray(n.children)) {
          /* Folder */
          if (depth > 0) flat.push({ _folderLabel: true, id: n.id, title: n.title });
          walk(n.children, depth + 1);
        }
        /* anything else (unknown type) — skip silently */
      }
    }
    walk(allNodes[0]?.children || [], 0);

    const query = filter.trim().toLowerCase();
    const filtered = query
      ? flat.filter(n => {
          if (n._separator || n._folderLabel) return false; /* hide structural items when searching */
          return (n.title || '').toLowerCase().includes(query) || (n.url || '').toLowerCase().includes(query);
        })
      : flat;

    browserList.innerHTML = '';
    if (!filtered.length) {
      browserList.innerHTML = `<div class="bm-browser-empty">${query ? 'No bookmarks match.' : 'No browser bookmarks found.'}</div>`;
      return;
    }

    /* URLs already in our panel */
    const panelUrls = new Set(bmNodes.map(n => n.url));

    filtered.slice(0, 80).forEach(node => {
      /* Firefox separator */
      if (node._separator) {
        const sep = document.createElement('div');
        sep.className = 'bm-browser-separator';
        browserList.appendChild(sep);
        return;
      }
      /* Folder label */
      if (node._folderLabel) {
        const lbl = document.createElement('div');
        lbl.className = 'bm-browser-folder-label';
        lbl.textContent = node.title;
        browserList.appendChild(lbl);
        return;
      }
      /* Skip anything else without a url */
      if (!node.url) return;

      const alreadyAdded = panelUrls.has(node.url);
      const row = document.createElement('button');
      row.className = 'bm-browser-row' + (alreadyAdded ? ' bm-browser-row-added' : '');
      if (alreadyAdded) row.disabled = true;

      const fav = document.createElement('img');
      fav.className = 'bm-browser-fav'; fav.src = faviconUrl(node.url); fav.alt = '';
      fav.onerror = () => { fav.style.opacity = '0'; };

      const info = document.createElement('div');
      info.className = 'bm-browser-info';
      const t = document.createElement('div'); t.className = 'bm-browser-title'; t.textContent = node.title || hostname(node.url);
      const d = document.createElement('div'); d.className = 'bm-browser-domain'; d.textContent = hostname(node.url);
      info.append(t, d);

      const addIco = document.createElement('div');
      addIco.className = 'bm-browser-add-ico';
      addIco.innerHTML = alreadyAdded
        ? `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>`
        : `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;

      row.append(fav, info, addIco);
      if (!alreadyAdded) row.addEventListener('click', () => addFromBrowser(node, row));
      browserList.appendChild(row);
    });
  }

  browserSearch.addEventListener('input', () => loadBrowserBookmarks(browserSearch.value));

  async function addFromBrowser(node, rowEl) {
    if (!bmId) return;
    /* Visual feedback immediately */
    if (rowEl) {
      rowEl.classList.add('bm-browser-row-added');
      rowEl.disabled = true;
      const ico = rowEl.querySelector('.bm-browser-add-ico');
      if (ico) ico.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>`;
    }
    await new Promise(r => chrome.bookmarks.create({ parentId: bmId, title: node.title, url: node.url }, r));
    /* Ensure site tag exists */
    const host = hostname(node.url);
    const color = S.getColor(host) || randomColor();
    await S.ensureSiteTag(host, color);
    /* Panel stays open — user can keep adding bookmarks */
  }

  async function handleNewBookmark() {
    let url = newUrlIn.value.trim(); if (!url) return;
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    if (!bmId) return;
    const host = hostname(url);
    const title = newTitleIn.value.trim() || siteLabel(host);
    const created = await new Promise(r => chrome.bookmarks.create({ parentId: bmId, title, url }, r));
    const color = S.getColor(host) || randomColor();
    await S.ensureSiteTag(host, color);
    if (newThumbBlob && created?.id) {
      await S.saveThumb(created.id, newThumbBlob);
      await S.setMeta(created.id, { thumbnailId: created.id });
    }
    newUrlIn.value = newTitleIn.value = ''; newThumbBlob = null;
    newThumbImg.src = ''; newThumbImg.style.display = 'none';
    newThumbEmpty.style.display = '';
    addPanel.hidden = true; addBtn.classList.remove('active');
    releasePanel();
  }

  /* ══════════════════════════════════════════════════════════════
     BUILD TOOLBAR  (#bm-toolbar) — group mode switcher
     Replaces old #bm-add-row, left-aligned buttons
  ══════════════════════════════════════════════════════════════ */
  const toolbar = document.createElement('div');
  toolbar.id = 'bm-toolbar';

  const groupBtns = document.createElement('div');
  groupBtns.id = 'bm-group-btns';

  const GROUP_MODES = [
    { id:'none',     title:'No grouping',       html:'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3" cy="6" r="1" fill="currentColor"/><circle cx="3" cy="12" r="1" fill="currentColor"/><circle cx="3" cy="18" r="1" fill="currentColor"/></svg>' },
    { id:'hostname', title:'Group by site',      html:'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>' },
    { id:'tags',     title:'Group by tag',       html:'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>' },
    { id:'date',     title:'Group by date used', html:'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' },
  ];

  GROUP_MODES.forEach(({ id, title, html }) => {
    const btn = document.createElement('button');
    btn.className = 'bm-group-btn' + (id === groupMode ? ' active' : '');
    btn.dataset.mode = id; btn.title = title; btn.innerHTML = html;
    btn.addEventListener('click', async () => {
      groupMode = id;
      await S.updateSettings({ groupMode: id });
      groupBtns.querySelectorAll('.bm-group-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === id));
      renderList();
    });
    groupBtns.appendChild(btn);
  });

  toolbar.appendChild(groupBtns);

  /* Sort direction button */
  let sortAsc = true;
  const sortBtn = document.createElement('button');
  sortBtn.id = 'bm-sort-btn'; sortBtn.title = 'Sort ascending';
  sortBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="5 12 12 5 19 12"/></svg>`;
  sortBtn.addEventListener('click', () => {
    sortAsc = !sortAsc;
    sortBtn.title = sortAsc ? 'Sort ascending' : 'Sort descending';
    sortBtn.innerHTML = sortAsc
      ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="5 12 12 5 19 12"/></svg>`
      : `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 19 19 12"/></svg>`;
    renderList();
  });
  toolbar.appendChild(sortBtn);
  bmContent.insertBefore(toolbar, addPanel.nextSibling);

  /* ══════════════════════════════════════════════════════════════
     PANEL OPEN / CLOSE
  ══════════════════════════════════════════════════════════════ */
  function openPanel()  { clearTimeout(closeTimer); panel.classList.remove('bm-collapsed'); }

  function scheduleClose() {
    if (pinned) return;
    /* Only close if mouse is actually inside the page */
    if (!mouseInsidePage) return;
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => { if (!pinned) panel.classList.add('bm-collapsed'); }, CONFIG.CLOSE_DELAY_MS);
  }

  /* Hover zone */
  const hoverZone = document.createElement('div');
  hoverZone.id = 'bm-hover-zone';
  hoverZone.style.width = CONFIG.HOVER_ZONE_PX + 'px';
  document.body.appendChild(hoverZone);

  hoverZone.addEventListener('mouseenter', openPanel);
  panel.addEventListener('mouseenter', openPanel);
  panel.addEventListener('mouseleave', () => { if (mouseInsidePage) scheduleClose(); });
  hoverZone.addEventListener('mouseleave', () => { if (mouseInsidePage) scheduleClose(); });

  function setPin(val) {
    pinned = val;
    panel.classList.toggle('bm-pinned', pinned);
    pinBtn.classList.toggle('active', pinned);
    pinBtn.title = pinned ? 'Unpin panel' : 'Pin panel (or double-click panel)';
  }

  function engagePanel() {
    openPanel();
    if (!pinned) { autoPinned = true; setPin(true); }
  }
  function releasePanel() {
    if (!autoPinned) return;
    autoPinned = false; setPin(false);
    if (!panel.matches(':hover') && !hoverZone.matches(':hover')) scheduleClose();
  }

  /* ══════════════════════════════════════════════════════════════
     TAG BAR
  ══════════════════════════════════════════════════════════════ */
  function openRestoreTagsPopup(hiddenTags, anchorEl) {
    document.getElementById('bm-restore-tags-pop')?.remove();
    const pop = document.createElement('div');
    pop.id = 'bm-restore-tags-pop';

    const title = document.createElement('div');
    title.className = 'bm-rtp-title'; title.textContent = 'Hidden site tags';
    pop.appendChild(title);

    hiddenTags.forEach(tag => {
      const row = document.createElement('button');
      row.className = 'bm-rtp-row';
      row.style.setProperty('--tag-color', tag.color);

      const dot = document.createElement('span'); dot.className = 'bm-rtp-dot';
      const name = document.createElement('span'); name.textContent = tag.name;
      const ico  = document.createElement('span'); ico.className = 'bm-rtp-ico';
      ico.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="2.5" stroke-linecap="round"><polyline points="1 4 1 10 7 10"/>
        <path d="M3.51 15a9 9 0 1 0 .49-3.5"/></svg>`;
      row.append(dot, name, ico);

      row.addEventListener('click', async () => {
        await S.updateTag(tag.id, { hidden: false });
        row.remove();
        if (!pop.querySelector('.bm-rtp-row')) pop.remove();
        render();
      });
      pop.appendChild(row);
    });

    document.body.appendChild(pop);
    engagePanel();

    const ar = anchorEl.getBoundingClientRect();
    const pw = 180;
    let left = ar.right - pw;
    if (left < 8) left = 8;
    let top = ar.bottom + 6;
    if (top + 200 > window.innerHeight) top = ar.top - 200 - 6;
    pop.style.left = left + 'px';
    pop.style.top  = top  + 'px';

    setTimeout(() => {
      document.addEventListener('mousedown', function closer(e) {
        if (!pop.contains(e.target) && e.target !== anchorEl) {
          pop.remove(); document.removeEventListener('mousedown', closer); releasePanel();
        }
      });
    }, 0);
  }

  function renderTags() {
    tagBar.innerHTML = '';
    const tags = S.getTags().filter(t => !t.hidden);

    /* Tags go directly into tagBar — it IS the scroll container */
    const allBtn = document.createElement('button');
    allBtn.className = 'bm-tag' + (activeTags.has('all') ? ' active' : '');
    allBtn.dataset.tag = 'all'; allBtn.textContent = 'All';
    allBtn.onclick = e => setTag('all', e.altKey);
    tagBar.appendChild(allBtn);

    tags.forEach(tag => {
      const btn = document.createElement('button');
      btn.className = 'bm-tag' + (activeTags.has(tag.id) ? ' active' : '');
      btn.dataset.tag = tag.id;
      btn.textContent = tag.name;
      if (tag.color) {
        btn.style.setProperty('--tag-color', tag.color);
        btn.style.setProperty('--tag-color-bg', hexToRgba(tag.color, 0.15));
        btn.classList.add('bm-tag-colored');
      }
      btn.addEventListener('click', e => setTag(tag.id, e.altKey));
      btn.addEventListener('contextmenu', e => { e.preventDefault(); openTagEditPopup(tag, btn); });
      setupTagDrag(btn, tag.id);
      tagBar.appendChild(btn);
    });

    /* Add custom tag button */
    const addTagBtn = document.createElement('button');
    addTagBtn.className = 'bm-tag bm-tag-add'; addTagBtn.title = 'Add custom tag';
    addTagBtn.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="3" stroke-linecap="round">
      <line x1="12" y1="4" x2="12" y2="20"/><line x1="4" y1="12" x2="20" y2="12"/>
    </svg>`;
    addTagBtn.onclick = openAddTagModal;
    tagBar.appendChild(addTagBtn);

    /* Hidden site tags restore button — lives in tagsWrap OUTSIDE tagBar (no scroll clipping) */
    tagsWrap.querySelector('.bm-tag-restore-btn')?.remove();

    const hiddenSiteTags = S.getTags().filter(t => t.siteTag && t.hidden);
    if (hiddenSiteTags.length) {
      const restoreBtn = document.createElement('button');
      restoreBtn.className = 'bm-tag-restore-btn';
      restoreBtn.title = `Restore hidden site tags (${hiddenSiteTags.length})`;
      restoreBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/>
      </svg>`;
      restoreBtn.addEventListener('click', e => {
        e.stopPropagation();
        openRestoreTagsPopup(hiddenSiteTags, restoreBtn);
      });
      tagsWrap.appendChild(restoreBtn);
    }
  }

  function setTag(tag, multi = false) {
    if (tag === 'all') {
      activeTags = new Set(['all']);
    } else if (multi) {
      activeTags.delete('all');
      if (activeTags.has(tag)) {
        activeTags.delete(tag);
        if (activeTags.size === 0) activeTags.add('all');
      } else {
        activeTags.add(tag);
      }
    } else {
      activeTags = new Set([tag]);
    }
    renderTags(); renderList();
  }

  /* ══════════════════════════════════════════════════════════════
     TAG EDIT POPUP  (right-click on tag)
     Works for both custom and site tags.
  ══════════════════════════════════════════════════════════════ */
  function openTagEditPopup(tag, anchorEl) {
    document.getElementById('bm-tag-edit-popup')?.remove();
    const pop = document.createElement('div');
    pop.id = 'bm-tag-edit-popup';

    const nameIn = document.createElement('input');
    nameIn.type = 'text'; nameIn.value = tag.name;
    nameIn.className = 'bm-tep-name';
    nameIn.placeholder = 'Tag name…'; nameIn.autocomplete = 'off';

    const colorRow = document.createElement('div'); colorRow.className = 'bm-tep-color-row';
    const colorLabel = document.createElement('span'); colorLabel.textContent = 'Color';
    const colorIn = document.createElement('input'); colorIn.type = 'color'; colorIn.value = tag.color || '#7b93ff';
    colorRow.append(colorLabel, colorIn);

    const btnRow = document.createElement('div'); btnRow.className = 'bm-tep-btns';

    if (!tag.siteTag) {
      const delBtn = document.createElement('button');
      delBtn.className = 'bm-tep-del danger'; delBtn.textContent = 'Delete';
      delBtn.addEventListener('click', async () => {
        await S.deleteTag(tag.id);
        if (activeTags.has(tag.id)) { activeTags.delete(tag.id); if (!activeTags.size) activeTags.add('all'); }
        pop.remove(); releasePanel(); render();
      });
      btnRow.appendChild(delBtn);
    } else {
      /* Site tags: toggle visibility instead of delete */
      const hideBtn = document.createElement('button');
      hideBtn.className = 'bm-tep-hide'; hideBtn.textContent = 'Hide tag';
      hideBtn.addEventListener('click', async () => {
        await S.updateTag(tag.id, { hidden: true });
        if (activeTags.has(tag.id)) { activeTags.delete(tag.id); if (!activeTags.size) activeTags.add('all'); }
        pop.remove(); releasePanel(); render();
      });
      btnRow.appendChild(hideBtn);
    }

    const saveBtn = document.createElement('button');
    saveBtn.className = 'bm-tep-save primary'; saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', async () => {
      await S.updateTag(tag.id, { name: nameIn.value.trim() || tag.name, color: colorIn.value });
      pop.remove(); releasePanel(); render();
    });
    btnRow.appendChild(saveBtn);

    pop.append(nameIn, colorRow, btnRow);
    document.body.appendChild(pop);

    const ar = anchorEl.getBoundingClientRect();
    const pw = 190;
    let left = ar.left;
    if (left + pw > window.innerWidth - 8) left = Math.max(8, window.innerWidth - pw - 8);
    pop.style.left = left + 'px'; pop.style.top = (ar.bottom + 6) + 'px';

    nameIn.focus(); nameIn.select();
    engagePanel();

    setTimeout(() => {
      document.addEventListener('mousedown', function closer(e) {
        if (!pop.contains(e.target) && e.target !== anchorEl) {
          pop.remove(); document.removeEventListener('mousedown', closer); releasePanel();
        }
      });
    }, 0);
  }

  /* ══════════════════════════════════════════════════════════════
     ADD TAG MODAL
  ══════════════════════════════════════════════════════════════ */
  function openAddTagModal() {
    const existing = document.getElementById('bm-tag-popup');
    if (existing) { existing.remove(); releasePanel(); return; }

    const pop = document.createElement('div'); pop.id = 'bm-tag-popup';

    const nameIn = document.createElement('input'); nameIn.type='text';
    nameIn.id = 'bm-tag-name'; nameIn.placeholder = 'Tag name…'; nameIn.autocomplete = 'off';
    nameIn.className = 'bm-tp-input';

    const colorRow = document.createElement('div'); colorRow.className = 'bm-tp-color-row';
    const colorLabel = document.createElement('span'); colorLabel.textContent = 'Color';
    const colorIn = document.createElement('input'); colorIn.type = 'color'; colorIn.value = randomColor();
    colorIn.id = 'bm-tag-color';
    colorRow.append(colorLabel, colorIn);

    const btnRow = document.createElement('div'); btnRow.className = 'bm-tp-btns';
    const cancelBtn = document.createElement('button'); cancelBtn.textContent = 'Cancel';
    cancelBtn.className = 'bm-tp-btn';
    const confirmBtn = document.createElement('button'); confirmBtn.textContent = 'Add';
    confirmBtn.className = 'bm-tp-btn primary';
    btnRow.append(cancelBtn, confirmBtn);

    pop.append(nameIn, colorRow, btnRow);

    /* Insert directly after tagsWrap in the DOM — part of normal flow, no animation issues */
    tagsWrap.insertAdjacentElement('afterend', pop);
    nameIn.focus();
    engagePanel();

    const close = () => { pop.remove(); releasePanel(); };
    cancelBtn.onclick = close;
    confirmBtn.onclick = async () => {
      const name = nameIn.value.trim();
      if (name) { await S.createTag({ name, color: colorIn.value }); render(); }
      close();
    };
    nameIn.addEventListener('keydown', e => {
      if (e.key === 'Enter')  confirmBtn.click();
      if (e.key === 'Escape') close();
    });
  }

  /* ══════════════════════════════════════════════════════════════
     TAG ASSIGN POPUP
  ══════════════════════════════════════════════════════════════ */
  function openTagAssignPopup(bmNodeId, anchorEl) {
    document.getElementById('bm-tag-assign-popup')?.remove();
    const meta = S.getMeta(bmNodeId);
    const pop  = document.createElement('div'); pop.id = 'bm-tag-assign-popup';

    const sw = document.createElement('div'); sw.className = 'bm-tap-search-wrap';
    const si = document.createElement('input'); si.type='text'; si.placeholder='Search tags…'; si.className='bm-tap-search'; si.autocomplete='off';
    sw.appendChild(si); pop.appendChild(sw);

    const itemsWrap = document.createElement('div'); itemsWrap.className = 'bm-tap-items';
    pop.appendChild(itemsWrap);

    const allTags = S.getTags().filter(t => !t.siteTag); /* custom tags only in assign */

    function renderItems(filter) {
      itemsWrap.innerHTML = '';
      const filtered = allTags.filter(t => !filter || t.name.toLowerCase().includes(filter.toLowerCase()));
      if (!allTags.length) { itemsWrap.innerHTML = `<div class="bm-tap-empty">No custom tags yet.<br>Create one with <strong>+</strong> in the tag bar.</div>`; return; }
      if (!filtered.length) { itemsWrap.innerHTML = `<div class="bm-tap-empty">No tags match «${esc(filter)}»</div>`; return; }
      filtered.forEach(tag => {
        const active = (meta.tags || []).includes(tag.id);
        const btn = document.createElement('button'); btn.className = 'bm-tap-row' + (active?' active':'');
        btn.style.setProperty('--tag-color', tag.color);
        btn.style.setProperty('--tag-color-bg', hexToRgba(tag.color, 0.18));
        btn.innerHTML = `<span class="bm-tap-dot"></span><span class="bm-tap-name">${esc(tag.name)}</span>`
          + (active ? `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>` : '');
        btn.addEventListener('click', async e => {
          e.preventDefault(); e.stopPropagation();
          const cur = S.getMeta(bmNodeId).tags || [];
          const next = cur.includes(tag.id) ? cur.filter(t=>t!==tag.id) : [...cur, tag.id];
          await S.setMeta(bmNodeId, { tags: next });
          pop.remove(); renderList();
        });
        itemsWrap.appendChild(btn);
      });
    }

    renderItems('');
    si.addEventListener('input', () => renderItems(si.value));

    /* Append hidden first to measure real height */
    pop.style.visibility = 'hidden';
    document.body.appendChild(pop);

    const ar  = anchorEl.getBoundingClientRect(); /* anchorEl = tagBtn */
    const pw  = pop.offsetWidth  || 200;
    const ph  = pop.offsetHeight || 220;
    pop.style.visibility = '';

    let left = ar.left;
    if (left + pw > window.innerWidth - 8) left = Math.max(8, window.innerWidth - pw - 8);

    /* Open above tagBtn if not enough space below */
    const spaceBelow = window.innerHeight - ar.bottom - 8;
    const top = spaceBelow >= ph
      ? ar.bottom + 4      /* below tagBtn */
      : ar.top - ph - 4;   /* above tagBtn */

    pop.style.left = left + 'px';
    pop.style.top  = Math.max(8, top) + 'px';
    si.focus(); engagePanel();

    setTimeout(() => {
      document.addEventListener('mousedown', function closer(e) {
        if (!pop.contains(e.target) && e.target !== anchorEl) {
          pop.remove(); document.removeEventListener('mousedown', closer); releasePanel();
        }
      });
    }, 0);
  }

  /* ══════════════════════════════════════════════════════════════
     GROUPING HELPERS
  ══════════════════════════════════════════════════════════════ */
  function dateGroup(ts) {
    if (!ts) return 'Never visited';
    const now  = Date.now();
    const diff = now - ts;
    const day  = 86400000;
    if (diff < day)         return 'Today';
    if (diff < 2 * day)     return 'Yesterday';
    if (diff < 7 * day)     return 'This week';
    if (diff < 30 * day)    return 'This month';
    return 'Older';
  }

  function groupNodes(nodes) {
    if (groupMode === 'none') return null; /* null = no grouping */

    const groups = new Map();
    for (const node of nodes) {
      const meta = S.getMeta(node.id);
      let keys = [];
      if (groupMode === 'hostname') {
        keys = [hostname(node.url)];
      } else if (groupMode === 'tags') {
        keys = (meta.tags || []).length ? meta.tags.map(tid => { const t=S.getTag(tid); return t?t.name:null; }).filter(Boolean) : ['Untagged'];
      } else if (groupMode === 'date') {
        keys = [dateGroup(meta.lastVisited)];
      }
      for (const key of keys) {
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(node);
      }
    }
    return groups;
  }

  /* ══════════════════════════════════════════════════════════════
     LIST RENDER
  ══════════════════════════════════════════════════════════════ */
  function renderList() {
    list.innerHTML = '';

    /* Filter by active tags — OR logic (match any selected tag) */
    let visible = bmNodes.filter(n => {
      if (activeTags.has('all')) return true;
      for (const tagId of activeTags) {
        const tag = S.getTag(tagId);
        if (!tag) continue;
        if (tag.siteTag && hostname(n.url) === tag.hostname) return true;
        if (!tag.siteTag && (S.getMeta(n.id).tags || []).includes(tagId)) return true;
      }
      return false;
    });

    /* Filter by search query */
    if (searchQuery) {
      visible = visible.filter(n => {
        const meta = S.getMeta(n.id);
        const title = (meta.title || n.title || '').toLowerCase();
        return title.includes(searchQuery) || n.url.toLowerCase().includes(searchQuery);
      });
    }

    /* Sort: primary by meta.order, secondary by addedAt */
    visible.sort((a, b) => {
      const ma = S.getMeta(a.id), mb = S.getMeta(b.id);
      const orderDiff = (ma.order || 0) - (mb.order || 0);
      if (orderDiff !== 0) return sortAsc ? orderDiff : -orderDiff;
      const dateDiff = (ma.addedAt || 0) - (mb.addedAt || 0);
      return sortAsc ? dateDiff : -dateDiff;
    });

    if (!visible.length) {
      const empty = document.createElement('div'); empty.className = 'bm-empty';
      empty.textContent = searchQuery ? 'No bookmarks match your search.' : 'No bookmarks here yet.';
      list.appendChild(empty); return;
    }

    const groups = groupNodes(visible);

    if (!groups) {
      /* No grouping — one card per bookmark */
      visible.forEach(node => list.appendChild(buildCard(node)));
    } else {
      /* Grouped — section header + cards */
      groups.forEach((nodes, groupName) => {
        const section = document.createElement('div'); section.className = 'bm-group-section';
        const header  = document.createElement('div'); header.className = 'bm-group-header';
        header.textContent = groupName; section.appendChild(header);
        nodes.forEach(node => section.appendChild(buildCard(node)));
        list.appendChild(section);
      });
    }
  }

  /* ══════════════════════════════════════════════════════════════
     CARD BUILDER  — single bookmark card (no inner list)
  ══════════════════════════════════════════════════════════════ */
  function buildCard(node) {
    const meta  = S.getMeta(node.id);
    const host  = hostname(node.url);
    const title = meta.title || node.title || siteLabel(host);

    const card = document.createElement('div');
    card.className = 'bm-card';
    card.dataset.id = node.id;

    /* Background */
    const bg = document.createElement('div'); bg.className = 'bm-card-bg';
    card.appendChild(bg);

    /* Load thumbnail async — supports image/gif/mp4 */
    S.getThumb(node.id).then(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      card.dataset.hasThumb = '1';

      if (blob.type === 'video/mp4' || blob.type === 'video/webm') {
        /* Video background */
        const vid = document.createElement('video');
        vid.className = 'bm-card-bg-video';
        vid.src = url; vid.autoplay = true; vid.loop = true;
        vid.muted = true; vid.playsInline = true;
        vid.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;';
        card.insertBefore(vid, bg);
        bg.style.display = 'none'; /* hide the div bg, video takes over */
      } else {
        /* Image / gif background */
        bg.style.backgroundImage = `url("${url}")`;
        bg.style.backgroundSize = 'cover';
        bg.style.backgroundPosition = 'center';
      }
    });

    const overlay = document.createElement('div'); overlay.className = 'bm-card-overlay';
    card.appendChild(overlay);

    /* Content */
    const content = document.createElement('div'); content.className = 'bm-card-content';

    const siteRow = document.createElement('div'); siteRow.className = 'bm-card-site';
    const fav = document.createElement('img'); fav.className = 'bm-card-favicon'; fav.src = faviconUrl(node.url); fav.alt = '';
    fav.onerror = () => { fav.style.opacity = '0'; };
    const siteText = document.createElement('span'); siteText.textContent = siteLabel(host);
    siteRow.append(fav, siteText); content.appendChild(siteRow);

    const titleEl = document.createElement('div'); titleEl.className = 'bm-card-title'; titleEl.textContent = title;
    content.appendChild(titleEl);

    const urlRow = document.createElement('div'); urlRow.className = 'bm-card-url-row';
    const urlSpan = document.createElement('span'); urlSpan.className = 'bm-card-url'; urlSpan.textContent = truncUrl(node.url);

    /* ── Card action buttons ── */
    const COPY_ICO  = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
    const CHECK_ICO = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>`;

    const copyBtn = document.createElement('button'); copyBtn.className = 'bm-card-copy'; copyBtn.title = 'Copy URL';
    copyBtn.innerHTML = COPY_ICO;
    copyBtn.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      navigator.clipboard.writeText(node.url).then(() => { copyBtn.innerHTML = CHECK_ICO; setTimeout(() => copyBtn.innerHTML = COPY_ICO, 1400); });
    });

    const tagBtn = document.createElement('button'); tagBtn.className = 'bm-card-tag-btn'; tagBtn.title = 'Assign tags';
    tagBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>`;
    tagBtn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); openTagAssignPopup(node.id, tagBtn); });

    const delBtn = document.createElement('button'); delBtn.className = 'bm-card-del'; delBtn.title = 'Remove bookmark';
    delBtn.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    delBtn.addEventListener('click', async e => {
      e.preventDefault(); e.stopPropagation();
      if (typeof chrome !== 'undefined' && chrome?.bookmarks) {
        /* Tell background this removal is intentional — suppress notification */
        chrome.runtime.sendMessage({ type: 'BNT_SELF_REMOVE', bookmarkId: node.id }, () => void chrome.runtime.lastError);
        await new Promise(r => chrome.bookmarks.remove(node.id, r));
        /* pruneSiteTag after removal */
        const remaining = bmNodes.filter(n=>n.id!==node.id).map(n=>hostname(n.url));
        await S.pruneSiteTagIfOrphaned(host, remaining);
        await S.deleteMeta(node.id);
      } else {
        bmNodes = bmNodes.filter(n => n.id !== node.id); renderList();
      }
    });

    urlRow.append(urlSpan, copyBtn); content.appendChild(urlRow);

    /* Tags row */
    const tagsRow = document.createElement('div'); tagsRow.className = 'bm-card-tags';
    (meta.tags || []).forEach(tid => {
      const tag = S.getTag(tid); if (!tag) return;
      const chip = document.createElement('span'); chip.className = 'bm-card-tag-chip'; chip.textContent = tag.name;
      chip.style.setProperty('--tag-color', tag.color); chip.style.setProperty('--tag-color-bg', hexToRgba(tag.color, 0.2));
      tagsRow.appendChild(chip);
    });
    content.appendChild(tagsRow);

    /* Action buttons row (tag + delete) */
    const actionsRow = document.createElement('div'); actionsRow.className = 'bm-card-actions';
    actionsRow.append(tagBtn, delBtn);
    content.appendChild(actionsRow);

    card.appendChild(content);

    /* Left click → open in current tab */
    card.addEventListener('click', async e => {
      if (e.target.closest('.bm-card-copy,.bm-card-tag-btn,.bm-card-del,.bm-card-edit-btn')) return;
      await S.recordVisit(node.id);
      location.href = node.url;
    });

    /* Middle click → open in background tab (no focus shift) */
    card.addEventListener('mousedown', e => {
      if (e.button !== 1) return;
      e.preventDefault(); /* prevent autoscroll */
    });
    card.addEventListener('auxclick', async e => {
      if (e.button !== 1) return;
      if (e.target.closest('.bm-card-copy,.bm-card-tag-btn,.bm-card-del,.bm-card-edit-btn')) return;
      e.preventDefault();
      await S.recordVisit(node.id);
      /* Open in background — chrome.tabs if available, else window.open */
      if (typeof chrome !== 'undefined' && chrome?.tabs) {
        chrome.tabs.create({ url: node.url, active: false });
      } else {
        window.open(node.url, '_blank');
      }
    });

    /* Right click → handled globally by context-menu.js, which shows the
       custom context menu and triggers openCardEditPopup via the hidden
       edit button below ("Edit bookmark" item → editBtn.click()). Do NOT
       add a contextmenu listener here — it used to open this popup
       directly, which fired alongside the custom menu and opened both
       at once. */

    /* Edit button */
    const editBtn = document.createElement('button'); editBtn.className = 'bm-card-edit-btn'; editBtn.title = 'Edit bookmark';
    editBtn.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
    editBtn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); openCardEditPopup(node, card, meta); });
    actionsRow.prepend(editBtn);

    /* Drag handle */
    const dragHandle = document.createElement('div');
    dragHandle.className = 'bm-card-drag-handle';
    dragHandle.title = 'Drag to reorder';
    dragHandle.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="9" cy="6" r="1" fill="currentColor"/><circle cx="15" cy="6" r="1" fill="currentColor"/><circle cx="9" cy="12" r="1" fill="currentColor"/><circle cx="15" cy="12" r="1" fill="currentColor"/><circle cx="9" cy="18" r="1" fill="currentColor"/><circle cx="15" cy="18" r="1" fill="currentColor"/></svg>`;
    card.appendChild(dragHandle);

    setupCardDrag(card, node.id, dragHandle);

    return card;
  }

  /* ══════════════════════════════════════════════════════════════
     DRAG-AND-DROP  — reorder bookmark cards
  ══════════════════════════════════════════════════════════════ */
  let _dragSrcId   = null;
  let _dragOverEl  = null;

  function setupCardDrag(card, nodeId, handle) {
    card.draggable = false; /* dragging starts only from the handle */

    handle.addEventListener('mousedown', () => { card.draggable = true; });
    handle.addEventListener('mouseup',   () => { card.draggable = false; });

    card.addEventListener('dragstart', e => {
      _dragSrcId = nodeId;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', nodeId);
      requestAnimationFrame(() => card.classList.add('bm-card-dragging'));
    });

    card.addEventListener('dragend', () => {
      card.draggable = false;
      card.classList.remove('bm-card-dragging');
      _dragOverEl?.classList.remove('bm-card-drag-over-top', 'bm-card-drag-over-bottom');
      _dragSrcId  = null;
      _dragOverEl = null;
    });

    card.addEventListener('dragenter', e => { e.preventDefault(); });

    card.addEventListener('dragover', e => {
      if (!_dragSrcId || _dragSrcId === nodeId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';

      if (_dragOverEl && _dragOverEl !== card) {
        _dragOverEl.classList.remove('bm-card-drag-over-top', 'bm-card-drag-over-bottom');
      }
      _dragOverEl = card;

      const rect   = card.getBoundingClientRect();
      const midY   = rect.top + rect.height / 2;
      const isTop  = e.clientY < midY;
      card.classList.toggle('bm-card-drag-over-top',    isTop);
      card.classList.toggle('bm-card-drag-over-bottom', !isTop);
    });

    card.addEventListener('dragleave', e => {
      if (!card.contains(e.relatedTarget)) {
        card.classList.remove('bm-card-drag-over-top', 'bm-card-drag-over-bottom');
      }
    });

    card.addEventListener('drop', async e => {
      e.preventDefault();
      card.classList.remove('bm-card-drag-over-top', 'bm-card-drag-over-bottom');
      if (!_dragSrcId || _dragSrcId === nodeId) return;

      const rect  = card.getBoundingClientRect();
      const midY  = rect.top + rect.height / 2;
      const after = e.clientY >= midY; /* drop below mid → insert after target */

      /* Get current rendered order of card IDs from the DOM */
      const cards = [...list.querySelectorAll('.bm-card[data-id]')];
      const ids   = cards.map(c => c.dataset.id);

      const srcIdx  = ids.indexOf(_dragSrcId);
      const destIdx = ids.indexOf(nodeId);
      if (srcIdx === -1 || destIdx === -1) return;

      ids.splice(srcIdx, 1);
      const insertAt = after ? destIdx + (srcIdx < destIdx ? 0 : 1) : (srcIdx < destIdx ? destIdx - 1 : destIdx);
      const clampedInsert = Math.max(0, Math.min(insertAt, ids.length));
      ids.splice(clampedInsert, 0, _dragSrcId);

      /* Persist new order in meta.
         We always save ascending indices (0,10,20…) but renderList sorts by
         (order * direction), so we must store values that produce the correct
         visual sequence regardless of sortAsc.
         Solution: if sortAsc is false, invert the indices so that the
         descending sort still renders the list in the dragged visual order. */
      const total = ids.length;
      await Promise.all(ids.map((id, idx) => {
        const order = sortAsc ? idx * 10 : (total - 1 - idx) * 10;
        return S.setMeta(id, { order });
      }));

      /* Re-render list without full reload — keeps panel stable */
      renderList();
    });
  }

  /* ══════════════════════════════════════════════════════════════
     TAG DRAG-AND-DROP  — long-press 1.5s to activate, then reorder
  ══════════════════════════════════════════════════════════════ */
  let _tagDragSrcId  = null;
  let _tagDragOverEl = null;
  let _tagLongTimer  = null;

  function setupTagDrag(btn, tagId) {
    let didDrag    = false;
    let pressX     = 0;
    let pressY     = 0;
    const MOVE_TOL = 20; /* px — cancel long-press only if moved more than this */

    btn.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      didDrag = false;
      pressX  = e.clientX;
      pressY  = e.clientY;
      _tagLongTimer = setTimeout(() => {
        btn.draggable = true;
        btn.classList.add('bm-tag-drag-ready');
        const dragEvt = new MouseEvent('dragstart', { bubbles: true, cancelable: true });
        btn.dispatchEvent(dragEvt);
      }, 400);
    });

    const cancelLong = (e) => {
      /* For mousemove: only cancel if moved beyond tolerance */
      if (e?.type === 'mousemove') {
        const dx = Math.abs(e.clientX - pressX);
        const dy = Math.abs(e.clientY - pressY);
        if (dx <= MOVE_TOL && dy <= MOVE_TOL) return;
      }
      clearTimeout(_tagLongTimer);
      _tagLongTimer = null;
    };
    btn.addEventListener('mouseup',    cancelLong);
    btn.addEventListener('mouseleave', cancelLong);
    btn.addEventListener('mousemove',  cancelLong);

    btn.addEventListener('dragstart', e => {
      if (!btn.draggable) { e.preventDefault(); return; }
      _tagDragSrcId = tagId;
      didDrag = true;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', tagId);
      requestAnimationFrame(() => btn.classList.add('bm-tag-dragging'));
      _startTagAutoScroll();
    });

    btn.addEventListener('dragend', () => {
      btn.draggable = false;
      btn.classList.remove('bm-tag-dragging', 'bm-tag-drag-ready');
      _tagDragOverEl?.classList.remove('bm-tag-drag-over-left', 'bm-tag-drag-over-right');
      _tagDragSrcId  = null;
      _tagDragOverEl = null;
      _stopTagAutoScroll();
    });

    /* Suppress click after a completed drag */
    btn.addEventListener('click', e => {
      if (didDrag) { e.stopImmediatePropagation(); didDrag = false; }
    }, true);

    btn.addEventListener('dragenter', e => { e.preventDefault(); });

    btn.addEventListener('dragover', e => {
      if (!_tagDragSrcId || _tagDragSrcId === tagId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';

      if (_tagDragOverEl && _tagDragOverEl !== btn) {
        _tagDragOverEl.classList.remove('bm-tag-drag-over-left', 'bm-tag-drag-over-right');
      }
      _tagDragOverEl = btn;

      const rect  = btn.getBoundingClientRect();
      const midX  = rect.left + rect.width / 2;
      const left  = e.clientX < midX;
      btn.classList.toggle('bm-tag-drag-over-left',  left);
      btn.classList.toggle('bm-tag-drag-over-right', !left);
    });

    btn.addEventListener('dragleave', e => {
      if (!btn.contains(e.relatedTarget)) {
        btn.classList.remove('bm-tag-drag-over-left', 'bm-tag-drag-over-right');
      }
    });

    btn.addEventListener('drop', async e => {
      e.preventDefault();
      btn.classList.remove('bm-tag-drag-over-left', 'bm-tag-drag-over-right');
      if (!_tagDragSrcId || _tagDragSrcId === tagId) return;

      const rect  = btn.getBoundingClientRect();
      const after = e.clientX >= rect.left + rect.width / 2;

      /* Get current rendered tag order from DOM (skip All and + buttons) */
      const tagBtns = [...tagBar.querySelectorAll('.bm-tag[data-tag]:not([data-tag="all"])')];
      const ids = tagBtns.map(b => b.dataset.tag);

      const srcIdx  = ids.indexOf(_tagDragSrcId);
      const destIdx = ids.indexOf(tagId);
      if (srcIdx === -1 || destIdx === -1) return;

      ids.splice(srcIdx, 1);
      const insertAt = after
        ? destIdx + (srcIdx < destIdx ? 0 : 1)
        : (srcIdx < destIdx ? destIdx - 1 : destIdx);
      ids.splice(Math.max(0, Math.min(insertAt, ids.length)), 0, _tagDragSrcId);

      /* Persist new order */
      await Promise.all(ids.map((id, idx) =>
        S.updateTag(id, { order: idx * 10 })
      ));

      renderTags();
    });
  }

  let _tagAutoScrollRaf = null;
  let _tagAutoScrollDir = 0;
  const TAG_SCROLL_ZONE = 40;
  const TAG_SCROLL_SPD  = 8;

  function _startTagAutoScroll() {
    tagBar._dragOverHandler = e => {
      const rect = tagBar.getBoundingClientRect();
      const x    = e.clientX - rect.left;
      if (x < TAG_SCROLL_ZONE)                  _tagAutoScrollDir = -1;
      else if (x > rect.width - TAG_SCROLL_ZONE) _tagAutoScrollDir =  1;
      else                                        _tagAutoScrollDir =  0;
    };
    tagBar.addEventListener('dragover', tagBar._dragOverHandler);

    const tick = () => {
      if (_tagDragSrcId && _tagAutoScrollDir !== 0) {
        tagBar.scrollLeft += _tagAutoScrollDir * TAG_SCROLL_SPD;
      }
      _tagAutoScrollRaf = requestAnimationFrame(tick);
    };
    _tagAutoScrollRaf = requestAnimationFrame(tick);
  }

  function _stopTagAutoScroll() {
    cancelAnimationFrame(_tagAutoScrollRaf);
    _tagAutoScrollRaf = null;
    _tagAutoScrollDir = 0;
    if (tagBar._dragOverHandler) {
      tagBar.removeEventListener('dragover', tagBar._dragOverHandler);
      delete tagBar._dragOverHandler;
    }
  }

  function openCardEditPopup(node, cardEl, meta) {
    document.getElementById('bm-card-edit-popup')?.remove();
    const pop = document.createElement('div'); pop.id = 'bm-card-edit-popup';

    /* Title */
    const titleIn = document.createElement('input'); titleIn.type = 'text';
    titleIn.className = 'bm-cep-input'; titleIn.value = meta.title || node.title || '';
    titleIn.placeholder = 'Title…'; titleIn.autocomplete = 'off';

    /* URL */
    const urlIn = document.createElement('input'); urlIn.type = 'text';
    urlIn.className = 'bm-cep-input'; urlIn.value = node.url;
    urlIn.placeholder = 'https://…'; urlIn.autocomplete = 'off';

    /* Thumbnail row */
    let editThumbBlob = null;
    let thumbCleared  = false;

    const thumbRow = document.createElement('div'); thumbRow.className = 'bm-cep-thumb-row';
    const thumbPreview = document.createElement('div'); thumbPreview.className = 'bm-cep-thumb-preview';
    const thumbImg = document.createElement('img'); thumbImg.className = 'bm-cep-thumb-img'; thumbImg.alt = '';
    thumbImg.style.display = 'none';
    const thumbEmpty = document.createElement('span'); thumbEmpty.className = 'bm-cep-thumb-empty'; thumbEmpty.textContent = 'No thumbnail';
    thumbPreview.append(thumbImg, thumbEmpty);

    /* Load existing thumb */
    S.getThumbURL(node.id).then(url => {
      if (url) { thumbImg.src = url; thumbImg.style.display = 'block'; thumbEmpty.style.display = 'none'; }
    });

    const thumbPickBtn = document.createElement('button'); thumbPickBtn.className = 'bm-cep-thumb-pick';
    thumbPickBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg> Image`;
    thumbPickBtn.addEventListener('click', () => {
      const inp = document.createElement('input'); inp.type='file'; inp.accept='image/*';
      inp.addEventListener('change', async () => {
        const file = inp.files[0]; if (!file) return;
        editThumbBlob = await S.compressImage(file); thumbCleared = false;
        const url = URL.createObjectURL(editThumbBlob);
        thumbImg.src = url; thumbImg.style.display = 'block'; thumbEmpty.style.display = 'none';
      });
      inp.click();
    });

    const thumbPasteBtn = document.createElement('button'); thumbPasteBtn.className = 'bm-cep-thumb-pick bm-cep-thumb-paste';
    thumbPasteBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg> Paste`;
    thumbPasteBtn.title = 'Paste image from clipboard';
    thumbPasteBtn.addEventListener('click', async () => {
      let raw;
      try {
        raw = await S.readClipboardImage();
      } catch (e) {
        console.error('[BNT BM] clipboard read failed', e);
        window.BNT_TOAST?.show({ title: 'Could not read clipboard', type: 'error', duration: 2200 });
        return;
      }
      if (!raw) {
        window.BNT_TOAST?.show({ title: 'No image in clipboard', type: 'error', duration: 2200 });
        return;
      }
      editThumbBlob = await S.compressImage(raw); thumbCleared = false;
      const url = URL.createObjectURL(editThumbBlob);
      thumbImg.src = url; thumbImg.style.display = 'block'; thumbEmpty.style.display = 'none';
      window.BNT_TOAST?.show({ title: 'Image pasted', type: 'success', duration: 1800 });
    });

    const thumbClearBtn = document.createElement('button'); thumbClearBtn.className = 'bm-cep-thumb-clear';
    thumbClearBtn.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    thumbClearBtn.title = 'Remove thumbnail';
    thumbClearBtn.addEventListener('click', () => {
      editThumbBlob = null; thumbCleared = true;
      thumbImg.src = ''; thumbImg.style.display = 'none'; thumbEmpty.style.display = '';
    });

    thumbRow.append(thumbPreview, thumbPickBtn, thumbPasteBtn, thumbClearBtn);

    /* Buttons */
    const btnRow = document.createElement('div'); btnRow.className = 'bm-cep-btns';
    const cancelBtn = document.createElement('button'); cancelBtn.className = 'bm-cep-cancel'; cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => { pop.remove(); releasePanel(); });

    const saveBtn = document.createElement('button'); saveBtn.className = 'bm-cep-save primary'; saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', async () => {
      const newTitle = titleIn.value.trim() || node.title;
      const newUrl   = urlIn.value.trim()   || node.url;

      /* Update chrome bookmark title/url */
      if (newTitle !== node.title || newUrl !== node.url) {
        await new Promise(r => chrome.bookmarks.update(node.id, { title: newTitle, url: newUrl }, r));
      }
      /* Update meta title override */
      await S.setMeta(node.id, { title: newTitle !== node.title ? newTitle : null });

      /* Thumbnail */
      if (editThumbBlob) {
        await S.saveThumb(node.id, editThumbBlob);
        await S.setMeta(node.id, { thumbnailId: node.id });
        /* Update card bg immediately */
        const bgEl = cardEl.querySelector('.bm-card-bg');
        if (bgEl) { bgEl.style.backgroundImage = `url('${URL.createObjectURL(editThumbBlob)}')`; }
      } else if (thumbCleared) {
        await S.deleteThumb(node.id);
        await S.setMeta(node.id, { thumbnailId: null });
        const bgEl = cardEl.querySelector('.bm-card-bg');
        if (bgEl) bgEl.style.backgroundImage = '';
      }

      pop.remove(); releasePanel();
      renderList(); /* refresh card */
    });

    btnRow.append(cancelBtn, saveBtn);
    pop.append(titleIn, urlIn, thumbRow, btnRow);
    document.body.appendChild(pop);
    engagePanel();

    /* Position near card */
    const cr = cardEl.getBoundingClientRect();
    const pw = 230;
    let left = cr.right + 8;
    if (left + pw > window.innerWidth - 8) left = Math.max(8, cr.left - pw - 8);
    let top = Math.min(cr.top, window.innerHeight - 260);
    pop.style.cssText = `left:${left}px;top:${top}px`;

    titleIn.focus(); titleIn.select();

    setTimeout(() => {
      document.addEventListener('mousedown', function closer(e) {
        if (!pop.contains(e.target) && e.target !== cardEl) {
          pop.remove(); document.removeEventListener('mousedown', closer); releasePanel();
        }
      });
    }, 0);
  }

    /* ══════════════════════════════════════════════════════════════
     CHROME BOOKMARKS LISTENERS  (live sync)
  ══════════════════════════════════════════════════════════════ */
  function setupBookmarkListeners() {
    if (typeof chrome === 'undefined' || !chrome?.bookmarks) return;

    const reload = async (id) => {
      /* Only re-render if the change affects our folder */
      if (!bmId) return;
      /* We don't know which folder the changed node belongs to without
         fetching it — fetch is cheap here, nodes are shallow objects */
      await loadBookmarks();
    };

    chrome.bookmarks.onCreated.addListener(reload);
    chrome.bookmarks.onRemoved.addListener(reload);
    chrome.bookmarks.onChanged.addListener(reload);
    chrome.bookmarks.onMoved.addListener(reload);
  }

  /* ══════════════════════════════════════════════════════════════
     LOAD BOOKMARKS FROM CHROME
  ══════════════════════════════════════════════════════════════ */
  async function loadBookmarks() {
    if (!bmId || typeof chrome === 'undefined' || !chrome?.bookmarks) return;
    bmNodes = await new Promise(r => chrome.bookmarks.getChildren(bmId, nodes => r(nodes || [])));
    bmNodes = bmNodes.filter(n => n.url);

    /* Task 1: auto-hide orphaned site tags after any bookmark change */
    await _pruneOrphanedSiteTags();

    /* Pick up any pending thumbnails left by background.js after prompt confirmation */
    await _applyPendingThumbs();
    render();
  }

  async function _pruneOrphanedSiteTags() {
    const remainingHosts = new Set(bmNodes.map(n => hostname(n.url)));
    const siteTags = S.getTags().filter(t => t.siteTag && t.hostname);
    for (const tag of siteTags) {
      if (!remainingHosts.has(tag.hostname)) {
        /* Force-delete the site tag — bypass the siteTag guard in storage */
        delete S._tags[tag.id];
        /* Remove from active filter if it was selected */
        if (activeTags.has(tag.id)) {
          activeTags.delete(tag.id);
          if (!activeTags.size) activeTags.add('all');
        }
      }
    }
    /* Persist in one write */
    await new Promise(r => chrome.storage.local.set({ bnt_tags: S._tags }, r));
  }

  async function _applyPendingThumbs() {
    const allKeys = await new Promise(r => chrome.storage.local.get(null, r));
    const pendingKeys = Object.keys(allKeys).filter(k => k.startsWith('bnt_pending_thumb_'));
    if (!pendingKeys.length) return;

    const cleanup = {};
    for (const key of pendingKeys) {
      const bmId_  = key.replace('bnt_pending_thumb_', '');
      const dataUrl = allKeys[key];
      if (!dataUrl) continue;
      try {
        /* Convert dataUrl → Blob → save to IndexedDB */
        const res  = await fetch(dataUrl);
        const blob = await res.blob();
        await S.saveThumb(bmId_, blob);
        await S.setMeta(bmId_, { thumbnailId: bmId_ });
        cleanup[key] = null;
      } catch (err) {
        console.warn('[BNT] Failed to apply pending thumb for', bmId_, err);
      }
    }
    /* Remove processed keys */
    if (Object.keys(cleanup).length) {
      await new Promise(r => chrome.storage.local.remove(Object.keys(cleanup), r));
    }
  }

  /* ══════════════════════════════════════════════════════════════
     EXTERNAL EVENTS  (from main_script.js)
  ══════════════════════════════════════════════════════════════ */
  document.addEventListener('bnt:remove-bookmark', async e => {
    const { bookmarkId } = e.detail;
    if (!bookmarkId) return;
    if (typeof chrome !== 'undefined' && chrome?.bookmarks) {
      await new Promise(r => chrome.bookmarks.remove(bookmarkId, r));
    } else {
      bmNodes = bmNodes.filter(n => n.id !== bookmarkId);
    }
    await S.deleteMeta(bookmarkId);
    await loadBookmarks();
  });

  /* ══════════════════════════════════════════════════════════════
     FULL RENDER
  ══════════════════════════════════════════════════════════════ */
  const render = () => { renderTags(); renderList(); };

  /* ══════════════════════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════════════════════ */
  async function init() {
    /* Wait for storage init and migration */
    await window.BNT_STORAGE_READY;
    await window.BNT_MIGRATION_READY;

    /* Tell background page opened — drain queued messages */
    if (typeof chrome !== 'undefined' && chrome?.runtime) {
      chrome.runtime.sendMessage({ type: 'BNT_PAGE_OPENED' }, () => void chrome.runtime.lastError);
    }

    /* Load settings */
    const settings = S.getSettings();

    /* Apply panel width from storage — must run after await BNT_STORAGE_READY */
    applyPanelWidth(settings.panelWidthPct ?? 32);

    /* Pin by default */
    /* Pin by default — also open the panel so it's visible from the start */
    if (settings.pinByDefault) {
      setPin(true);
      panel.classList.remove('bm-collapsed');
    }

    /* Card corner radius */
    if (settings.cardRadius !== undefined) {
      document.documentElement.style.setProperty('--bm-card-radius', settings.cardRadius + 'px');
    }

    /* Close delay */
    CONFIG.CLOSE_DELAY_MS = settings.closeDelay ?? CONFIG.CLOSE_DELAY_MS;

    /* Accent color — apply on every new tab load */
    if (settings.accentMain) {
      const hex = settings.accentMain;
      const h   = hex.replace('#', '');
      const r   = parseInt(h.substring(0, 2), 16);
      const g   = parseInt(h.substring(2, 4), 16);
      const b   = parseInt(h.substring(4, 6), 16);
      document.documentElement.style.setProperty('--accent-main', hex);
      document.documentElement.style.setProperty('--accent-main-glow', `rgba(${r},${g},${b},0.18)`);
      document.documentElement.style.setProperty('--accent-main-glow-sm', `rgba(${r},${g},${b},0.12)`);
    }

    groupMode = settings.groupMode || 'none';
    groupBtns.querySelectorAll('.bm-group-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === groupMode);
    });

    /* Get folder IDs */
    const folders = await window.BNT_FOLDERS_READY;
    if (folders) {
      bmId  = folders.bmId;
      extId = folders.extId;
      scId  = folders.scId;
      setupBookmarkListeners();
      await loadBookmarks();
    } else {
      /* Not in extension context — show empty state */
      render();
    }
  }

  init();
})();
