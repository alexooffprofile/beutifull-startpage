/**
 * bookmarks.js — Beautiful New Tab · Bookmark panel
 *
 * v5 changes:
 *  1. Panel does NOT close when cursor leaves the browser tab/window
 *     (only closes when mouse leaves the bookmarks area while the tab is visible & focused)
 *  2. Pin: double-click panel OR click the pin button (top-right) to lock it open
 *  3. Panel is a geometric clip — content stays full-width internally,
 *     panel clips it; opening pushes #page right (no overlay)
 *  4. Custom tags can now be assigned to individual bookmarks via a 🏷 button on each row
 *  5. Site tags get their color from the dominant favicon pixel (canvas sampling);
 *     falls back to a random color if CORS blocks canvas read
 */

(() => {
  'use strict';

  /* ══════════════════════════════════════════════════════════════
     CONFIGURATION
  ══════════════════════════════════════════════════════════════ */
  const CONFIG = {
    /** px from left edge that triggers panel open */
    HOVER_ZONE_PX: 28,
    /** ms delay before closing after mouse leaves */
    CLOSE_DELAY_MS: 300,
    /**
     * Panel open width as % of viewport.
     * This is written to --bm-open-w on #bm-panel.
     * You can also change --bm-open-w directly in style.css :root.
     */
    PANEL_WIDTH_PCT: 32,
    /** Random color pool for custom tags (and site-tag fallback) */
    TAG_COLORS: [
      '#7b93ff','#ff7eb3','#53d8a0','#ffb347','#a78bfa',
      '#38bdf8','#fb7185','#34d399','#fbbf24','#e879f9',
    ],
  };

  /* ─── Storage ─────────────────────────────────────────────── */
  const BM_KEY       = 'bnt_bookmarks_v3';
  const TAG_KEY      = 'bnt_custom_tags_v1';
  const SITE_CLR_KEY = 'bnt_site_colors_v1';   // {hostname: '#rrggbb'}

  const loadBookmarks   = () => { try { return JSON.parse(localStorage.getItem(BM_KEY))       || []; } catch { return []; } };
  const saveBookmarks   = l  => localStorage.setItem(BM_KEY,       JSON.stringify(l));
  const loadCustomTags  = () => { try { return JSON.parse(localStorage.getItem(TAG_KEY))      || []; } catch { return []; } };
  const saveCustomTags  = l  => localStorage.setItem(TAG_KEY,      JSON.stringify(l));
  const loadSiteColors  = () => { try { return JSON.parse(localStorage.getItem(SITE_CLR_KEY)) || {}; } catch { return {}; } };
  const saveSiteColors  = o  => localStorage.setItem(SITE_CLR_KEY, JSON.stringify(o));

  /* ─── Helpers ─────────────────────────────────────────────── */
  function hostname(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); }
    catch { return url; }
  }
  function faviconUrl(url) {
    try {
      return `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(new URL(url).origin)}`;
    } catch { return ''; }
  }
  function previewUrl(url) {
    try { return `https://unavatar.io/${new URL(url).hostname}?fallback=false`; }
    catch { return ''; }
  }
  function siteLabel(host) {
    const core = host.split('.').slice(0, -1).join(' ') || host;
    return core.replace(/[-_]/g,' ').split(' ')
               .map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
  function randomColor() { return CONFIG.TAG_COLORS[Math.floor(Math.random() * CONFIG.TAG_COLORS.length)]; }
  function hexToRgba(hex, a) {
    const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
    return `rgba(${r},${g},${b},${a})`;
  }
  function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function truncateUrl(url) {
    try { const u=new URL(url); return u.hostname.replace(/^www\./,'')+( u.pathname.length>1 ? u.pathname.replace(/\/$/,'') : ''); }
    catch { return url; }
  }

  /* ─── [5] Dominant colour from favicon via canvas ─────────── */
  const siteColorCache = loadSiteColors();

  function getSiteColor(host, urlForFavicon) {
    // Return cached immediately if available
    if (siteColorCache[host]) return Promise.resolve(siteColorCache[host]);

    return new Promise(resolve => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = 16;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, 16, 16);
          const data = ctx.getImageData(0, 0, 16, 16).data;
          let bestSat = -1, bestR = 123, bestG = 147, bestB = 255;
          for (let i = 0; i < data.length; i += 4) {
            const alpha = data[i+3];
            if (alpha < 128) continue;
            const r = data[i]/255, g = data[i+1]/255, b = data[i+2]/255;
            const max = Math.max(r,g,b), min = Math.min(r,g,b);
            const sat = max - min; // HSV saturation proxy
            if (sat > bestSat) { bestSat=sat; bestR=data[i]; bestG=data[i+1]; bestB=data[i+2]; }
          }
          const hex = '#' + [bestR,bestG,bestB].map(v=>v.toString(16).padStart(2,'0')).join('');
          siteColorCache[host] = hex;
          saveSiteColors(siteColorCache);
          resolve(hex);
        } catch {
          // CORS blocked canvas read → fallback
          const c = randomColor();
          siteColorCache[host] = c;
          saveSiteColors(siteColorCache);
          resolve(c);
        }
      };
      img.onerror = () => {
        const c = randomColor();
        siteColorCache[host] = c;
        saveSiteColors(siteColorCache);
        resolve(c);
      };
      img.src = faviconUrl(urlForFavicon || ('https://' + host));
    });
  }

  /* ─── State ───────────────────────────────────────────────── */
  let bookmarks  = loadBookmarks().map(b => ({ customTags:[], ...b }));
  let customTags = loadCustomTags();
  let activeTag  = 'all';
  let closeTimer = null;
  let pinned     = false;       // [2] pin state

  /* ─── DOM refs ────────────────────────────────────────────── */
  const panel      = document.getElementById('bm-panel');
  const tagBar     = document.getElementById('bm-tags');
  const list       = document.getElementById('bm-list');
  const addUrlIn   = document.getElementById('bm-add-url');
  const addTitleIn = document.getElementById('bm-add-title');
  const addBtn     = document.getElementById('bm-add-btn');

  // Remove legacy toggle button if still in HTML
  document.getElementById('bm-toggle')?.remove();

  // Apply open width from CONFIG
  panel.style.setProperty('--bm-open-w', CONFIG.PANEL_WIDTH_PCT + 'vw');

  /* ─── [2] Pin button (top-right of panel) ─────────────────── */
  const pinBtn = document.createElement('button');
  pinBtn.id = 'bm-pin-btn';
  pinBtn.title = 'Pin panel open (or double-click panel)';
  pinBtn.innerHTML = svgPin(false);
  panel.prepend(pinBtn);   // first child → absolute positioned top-right via CSS

  function svgPin(active) {
    // Pin icon: solid when pinned, outline when not
    return active
      ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none">
           <path d="M16 2v2l-1 1-2 6H8l-2 3h5v8l1 1 1-1v-8h5l-2-3h-3L12 5l-1-1V2h5z"/>
         </svg>`
      : `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
           <line x1="12" y1="17" x2="12" y2="22"/>
           <path d="M5 17h14v-2a6 6 0 0 0-4-5.66V4h1V2H8v2h1v5.34A6 6 0 0 0 5 15v2z"/>
         </svg>`;
  }

  function setPin(val) {
    pinned = val;
    panel.classList.toggle('bm-pinned', pinned);
    pinBtn.innerHTML = svgPin(pinned);
    pinBtn.title = pinned ? 'Unpin panel' : 'Pin panel open (or double-click panel)';
  }

  pinBtn.addEventListener('click', e => { e.stopPropagation(); setPin(!pinned); });

  // [2] Double-click anywhere on panel to toggle pin
  panel.addEventListener('dblclick', e => {
    if (e.target.closest('#bm-pin-btn')) return; // already handled
    setPin(!pinned);
  });

  /* ─── [1][3] Panel open / close ───────────────────────────── */
  function openPanel() {
    clearTimeout(closeTimer);
    panel.classList.remove('bm-collapsed');
  }

  /**
   * [1] Only schedule close if:
   *  - panel is NOT pinned
   *  - the document still has focus (i.e. cursor is still inside the browser tab)
   *  - the tab is visible
   */
  function scheduleClose() {
    if (pinned) return;
    if (!document.hasFocus()) return;
    if (document.visibilityState !== 'visible') return;
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => {
      if (!pinned) panel.classList.add('bm-collapsed');
    }, CONFIG.CLOSE_DELAY_MS);
  }

  // [1] When tab is hidden or user switches apps — cancel any pending close
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      clearTimeout(closeTimer); // don't close while user is away
    }
  });

  // Hover zone injected into DOM (flush to left edge)
  const hoverZone = document.createElement('div');
  hoverZone.id = 'bm-hover-zone';
  document.body.appendChild(hoverZone);

  hoverZone.addEventListener('mouseenter', openPanel);
  panel.addEventListener('mouseenter', openPanel);
  panel.addEventListener('mouseleave', scheduleClose);
  hoverZone.addEventListener('mouseleave', scheduleClose);

  /* ─── Add bookmark ────────────────────────────────────────── */
  function addBookmark() {
    let url = addUrlIn.value.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    const host  = hostname(url);
    const title = addTitleIn.value.trim() || siteLabel(host);
    bookmarks.push({ id:uid(), url, title, host, customTags:[], image:'' });
    saveBookmarks(bookmarks);
    addUrlIn.value = addTitleIn.value = '';
    addUrlIn.focus();
    render();
  }
  addBtn.addEventListener('click', addBookmark);
  addUrlIn.addEventListener('keydown',   e => { if(e.key==='Enter') addTitleIn.value==='' ? addBookmark() : addTitleIn.focus(); });
  addTitleIn.addEventListener('keydown', e => { if(e.key==='Enter') addBookmark(); });

  /* ─── Delete bookmark ─────────────────────────────────────── */
  function deleteBookmark(id) {
    bookmarks = bookmarks.filter(b => b.id !== id);
    saveBookmarks(bookmarks);
    render();
  }

  /* ─── Custom tag CRUD ─────────────────────────────────────── */
  function addCustomTag(name, color) {
    if (!name.trim()) return null;
    const tag = { id:uid(), name:name.trim(), color: color||randomColor() };
    customTags.push(tag);
    saveCustomTags(customTags);
    return tag;
  }
  function deleteCustomTag(id) {
    customTags = customTags.filter(t => t.id !== id);
    bookmarks  = bookmarks.map(b => ({ ...b, customTags: b.customTags.filter(tid => tid!==id) }));
    saveBookmarks(bookmarks);
    saveCustomTags(customTags);
    if (activeTag === id) activeTag = 'all';
    render();
  }
  function updateTagColor(id, color) {
    customTags = customTags.map(t => t.id===id ? {...t, color} : t);
    saveCustomTags(customTags);
    render();
  }

  /* ─── [4] Assign custom tag to a bookmark ─────────────────── */
  function assignTagToBookmark(bmId, tagId) {
    bookmarks = bookmarks.map(b => {
      if (b.id !== bmId) return b;
      const tags = b.customTags.includes(tagId)
        ? b.customTags.filter(t => t!==tagId)
        : [...b.customTags, tagId];
      return { ...b, customTags: tags };
    });
    saveBookmarks(bookmarks);
    render();
  }

  /**
   * [4] Open a small inline popup listing all custom tags as toggles.
   * Attached to the 🏷 button on each bookmark row.
   */
  function openTagAssignPopup(bmId, anchorEl) {
    // Close any existing popup
    document.getElementById('bm-tag-assign-popup')?.remove();

    const bm = bookmarks.find(b => b.id === bmId);
    if (!bm) return;

    const pop = document.createElement('div');
    pop.id = 'bm-tag-assign-popup';

    if (!customTags.length) {
      pop.innerHTML = `<div class="bm-tap-empty">No custom tags yet.<br>Create one with <strong>+</strong> in the tag bar.</div>`;
    } else {
      pop.innerHTML = customTags.map(ct => {
        const active = bm.customTags.includes(ct.id);
        return `<button class="bm-tap-row${active?' active':''}" data-tag-id="${ct.id}"
                  style="--tag-color:${ct.color};--tag-color-bg:${hexToRgba(ct.color,0.18)}">
                  <span class="bm-tap-dot"></span>
                  <span class="bm-tap-name">${esc(ct.name)}</span>
                  ${active ? `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>` : ''}
                </button>`;
      }).join('');
    }

    // Position near the anchor button
    panel.appendChild(pop);
    const ar = anchorEl.getBoundingClientRect();
    const pr = panel.getBoundingClientRect();
    pop.style.top  = (ar.bottom - pr.top + 4) + 'px';
    pop.style.left = Math.max(4, ar.left - pr.left - 10) + 'px';

    pop.querySelectorAll('.bm-tap-row').forEach(btn => {
      btn.addEventListener('click', e => {
        e.preventDefault(); e.stopPropagation();
        assignTagToBookmark(bmId, btn.dataset.tagId);
        pop.remove();
      });
    });

    // Close on outside click
    setTimeout(() => {
      document.addEventListener('mousedown', function closer(e) {
        if (!pop.contains(e.target) && e.target !== anchorEl) {
          pop.remove();
          document.removeEventListener('mousedown', closer);
        }
      });
    }, 0);
  }

  /* ─── Tags render ─────────────────────────────────────────── */
  function uniqueSiteHosts() {
    const seen=new Set(), hosts=[];
    for (const b of bookmarks) { if(!seen.has(b.host)){seen.add(b.host);hosts.push(b.host);} }
    return hosts;
  }

  function renderTags() {
    tagBar.innerHTML = '';

    // All
    const allBtn = document.createElement('button');
    allBtn.className = 'bm-tag' + (activeTag==='all' ? ' active' : '');
    allBtn.dataset.tag = 'all';
    allBtn.textContent = 'All';
    allBtn.onclick = () => setTag('all');
    tagBar.appendChild(allBtn);

    // [5] Site tags — colored from dominant favicon pixel
    uniqueSiteHosts().forEach(host => {
      // Find a URL for this host to load the favicon
      const sample = bookmarks.find(b => b.host === host);
      const btn = mkTagBtn(host, siteLabel(host), 'site', siteColorCache[host] || null);
      tagBar.appendChild(btn);

      if (!siteColorCache[host] && sample) {
        getSiteColor(host, sample.url).then(color => {
          btn.style.setProperty('--tag-color', color);
          btn.style.setProperty('--tag-color-bg', hexToRgba(color, 0.15));
          btn.classList.add('bm-tag-colored');
        });
      }
    });

    // Custom tags
    customTags.forEach(ct => {
      const btn = mkTagBtn(ct.id, ct.name, 'custom', ct.color);
      tagBar.appendChild(btn);
    });

    // "+" add custom tag
    const addTagBtn = document.createElement('button');
    addTagBtn.className = 'bm-tag bm-tag-add';
    addTagBtn.title = 'Add custom tag';
    addTagBtn.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="12" y1="4" x2="12" y2="20"/><line x1="4" y1="12" x2="20" y2="12"/></svg>`;
    addTagBtn.onclick = () => openAddTagModal();
    tagBar.appendChild(addTagBtn);
  }

  function mkTagBtn(id, label, type, color) {
    const btn = document.createElement('button');
    btn.className = 'bm-tag' + (activeTag===id ? ' active' : '');
    btn.dataset.tag  = id;
    btn.dataset.type = type;
    btn.textContent  = label;
    if (color) {
      btn.style.setProperty('--tag-color', color);
      btn.style.setProperty('--tag-color-bg', hexToRgba(color, 0.15));
      btn.classList.add('bm-tag-colored');
    }
    btn.onclick = () => setTag(id);
    if (type === 'custom') {
      btn.addEventListener('contextmenu', e => { e.preventDefault(); openTagColorPicker(id, color, btn); });
    }
    return btn;
  }

  function setTag(tag) { activeTag=tag; renderTags(); renderList(); }

  /* ─── Add-tag modal ───────────────────────────────────────── */
  function openAddTagModal() {
    document.getElementById('bm-tag-modal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'bm-tag-modal';
    modal.innerHTML = `
      <div class="bm-modal-inner">
        <div class="bm-modal-title">New Tag</div>
        <input id="bm-tag-name" type="text" placeholder="Tag name…" autocomplete="off">
        <div class="bm-modal-color-row">
          <span>Color</span>
          <input id="bm-tag-color" type="color" value="${randomColor()}">
        </div>
        <div class="bm-modal-btns">
          <button id="bm-tag-cancel">Cancel</button>
          <button id="bm-tag-confirm" class="primary">Add</button>
        </div>
      </div>`;
    panel.appendChild(modal);
    modal.querySelector('#bm-tag-name').focus();
    modal.querySelector('#bm-tag-cancel').onclick  = () => modal.remove();
    modal.querySelector('#bm-tag-confirm').onclick = () => {
      const name  = modal.querySelector('#bm-tag-name').value.trim();
      const color = modal.querySelector('#bm-tag-color').value;
      if (name) { addCustomTag(name, color); render(); }
      modal.remove();
    };
    modal.querySelector('#bm-tag-name').addEventListener('keydown', e => {
      if (e.key==='Enter')  modal.querySelector('#bm-tag-confirm').click();
      if (e.key==='Escape') modal.remove();
    });
  }

  function openTagColorPicker(tagId, currentColor, anchorEl) {
    document.getElementById('bm-color-picker-popup')?.remove();
    const pop = document.createElement('div');
    pop.id = 'bm-color-picker-popup';
    pop.innerHTML = `
      <div class="bm-modal-inner">
        <div class="bm-modal-title">Tag color</div>
        <div class="bm-modal-color-row">
          <input id="bm-cp-color" type="color" value="${currentColor||'#7b93ff'}">
        </div>
        <div class="bm-modal-btns">
          <button id="bm-cp-del" class="danger">Delete tag</button>
          <button id="bm-cp-ok"  class="primary">Save</button>
        </div>
      </div>`;
    panel.appendChild(pop);
    pop.querySelector('#bm-cp-ok').onclick  = () => { updateTagColor(tagId, pop.querySelector('#bm-cp-color').value); pop.remove(); };
    pop.querySelector('#bm-cp-del').onclick = () => { deleteCustomTag(tagId); pop.remove(); };
    document.addEventListener('mousedown', function close(e) {
      if (!pop.contains(e.target) && e.target!==anchorEl) { pop.remove(); document.removeEventListener('mousedown',close); }
    });
  }

  /* ─── List render ─────────────────────────────────────────── */
  function renderList() {
    list.innerHTML = '';
    let visible;
    if (activeTag === 'all') {
      visible = bookmarks;
    } else {
      const isSite = bookmarks.some(b => b.host===activeTag);
      visible = isSite
        ? bookmarks.filter(b => b.host===activeTag)
        : bookmarks.filter(b => b.customTags.includes(activeTag));
    }
    if (!visible.length) {
      const e=document.createElement('div'); e.className='bm-empty';
      e.textContent='No bookmarks here yet.'; list.appendChild(e); return;
    }
    const groups = new Map();
    for (const b of visible) {
      if (!groups.has(b.host)) groups.set(b.host,[]);
      groups.get(b.host).push(b);
    }
    groups.forEach((items,host) => list.appendChild(buildGroupCard(host,items)));
  }

  /* ─── Card builder ────────────────────────────────────────── */
  function buildGroupCard(host, items) {
    const wrap = document.createElement('div');
    wrap.className = 'bm-card';

    const bg = document.createElement('div');
    bg.className = 'bm-card-bg';
    function setBg(item) {
      const src = item.image || previewUrl(item.url);
      bg.style.backgroundImage = src ? `url('${src}')` : '';
    }
    setBg(items[0]);
    wrap.appendChild(bg);

    const overlay = document.createElement('div');
    overlay.className = 'bm-card-overlay';
    wrap.appendChild(overlay);

    const content = document.createElement('div');
    content.className = 'bm-card-content';

    // Site row
    const siteRow = document.createElement('div');
    siteRow.className = 'bm-card-site';
    const fav = document.createElement('img');
    fav.className = 'bm-card-favicon'; fav.src = faviconUrl(items[0].url); fav.alt='';
    const siteText = document.createElement('span');
    siteText.textContent = siteLabel(host);
    siteRow.append(fav, siteText);
    content.appendChild(siteRow);

    // Title
    const bmTitle = document.createElement('div');
    bmTitle.className = 'bm-card-title';
    bmTitle.textContent = items[0].title;
    content.appendChild(bmTitle);

    // URL row
    const urlRow  = document.createElement('div');  urlRow.className='bm-card-url-row';
    const urlSpan = document.createElement('span'); urlSpan.className='bm-card-url';
    urlSpan.textContent = truncateUrl(items[0].url);
    const copyBtn = document.createElement('button'); copyBtn.className='bm-card-copy'; copyBtn.title='Copy URL';
    const copyIcon = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
    const checkIcon= `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>`;
    copyBtn.innerHTML = copyIcon;
    copyBtn.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      navigator.clipboard.writeText(items[currentIdx].url).then(() => {
        copyBtn.innerHTML=checkIcon;
        setTimeout(()=>copyBtn.innerHTML=copyIcon, 1400);
      });
    });
    urlRow.append(urlSpan, copyBtn);
    content.appendChild(urlRow);

    // Tags chip row
    const tagsRow = document.createElement('div');
    tagsRow.className = 'bm-card-tags';
    content.appendChild(tagsRow);

    wrap.appendChild(content);

    // Sub-list of rows
    const bmList = document.createElement('div');
    bmList.className = 'bm-card-list';

    items.forEach((b, idx) => {
      const row = document.createElement('a');
      row.className = 'bm-card-row';
      row.href=b.url; row.target='_blank'; row.rel='noopener';

      const rowFav = document.createElement('img');
      rowFav.className='bm-item-favicon'; rowFav.src=faviconUrl(b.url); rowFav.alt='';

      const rowTitle = document.createElement('span');
      rowTitle.className='bm-item-title'; rowTitle.textContent=b.title;

      // [4] Tag-assign button
      const tagBtn = document.createElement('button');
      tagBtn.className = 'bm-item-tag-btn';
      tagBtn.title = 'Assign custom tags';
      tagBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>`;
      tagBtn.addEventListener('click', e => {
        e.preventDefault(); e.stopPropagation();
        openTagAssignPopup(b.id, tagBtn);
      });

      const delBtn = document.createElement('button');
      delBtn.className='bm-item-del'; delBtn.title='Remove';
      delBtn.innerHTML=`<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
      delBtn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); deleteBookmark(b.id); });

      row.append(rowFav, rowTitle, tagBtn, delBtn);
      row.addEventListener('mouseenter', () => updateCard(idx));
      bmList.appendChild(row);
    });

    wrap.appendChild(bmList);

    // Hover updates card header
    let currentIdx = 0;
    function updateCard(idx) {
      currentIdx = idx;
      const item = items[idx];
      setBg(item);
      bmTitle.textContent  = item.title;
      urlSpan.textContent  = truncateUrl(item.url);
      tagsRow.innerHTML    = '';
      (item.customTags||[]).forEach(tid => {
        const ct = customTags.find(t=>t.id===tid);
        if (!ct) return;
        const chip=document.createElement('span'); chip.className='bm-card-tag-chip';
        chip.textContent=ct.name;
        chip.style.setProperty('--tag-color', ct.color);
        chip.style.setProperty('--tag-color-bg', hexToRgba(ct.color,0.2));
        tagsRow.appendChild(chip);
      });
      bmList.querySelectorAll('.bm-card-row').forEach((r,i)=>r.classList.toggle('hovered',i===idx));
    }

    wrap.addEventListener('mouseenter', () => updateCard(0));
    wrap.addEventListener('click', e => {
      if (e.target.closest('.bm-card-list')||e.target.closest('.bm-card-copy')) return;
      window.open(items[currentIdx].url,'_blank');
    });

    updateCard(0);
    return wrap;
  }

  /* ─── Full render ─────────────────────────────────────────── */
  function render() { renderTags(); renderList(); }

  /* ─── Init ────────────────────────────────────────────────── */
  render();

})();
