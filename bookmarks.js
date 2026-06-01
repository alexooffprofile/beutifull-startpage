/**
 * bookmarks.js — Beautiful New Tab · Bookmark panel
 */

(() => {
  'use strict';

  /* ══════════════════════════════════════════════════════════════
     CONFIG — все основные параметры панели закладок здесь
  ══════════════════════════════════════════════════════════════ */
  const CONFIG = {
    /* ── Панель ────────────────────────────────────────────────
       PANEL_WIDTH_PCT  : ширина открытой панели в % от вьюпорта   */
    PANEL_WIDTH_PCT : 32,

    /* ── Hover-триггер ─────────────────────────────────────────
       HOVER_ZONE_PX   : ширина невидимой зоны у левого края (px),
                         попадание курсора в неё открывает панель   */
    HOVER_ZONE_PX   : 260,

    /* ── Задержка закрытия ──────────────────────────────────────
       CLOSE_DELAY_MS  : мс до схлопывания после ухода курсора      */
    CLOSE_DELAY_MS  : 110,

    /* ── Карточки закладок ──────────────────────────────────────
       CARD_MIN_HEIGHT : минимальная высота карточки группы (px)    */
    CARD_MIN_HEIGHT : 110,

    /* ── Цвета тегов ────────────────────────────────────────────
       TAG_COLORS      : палитра случайных цветов для новых тегов
                         и fallback для site-тегов (если favicon
                         не отдал цвет через canvas)                */
    TAG_COLORS: [
      '#7b93ff','#ff7eb3','#53d8a0','#ffb347','#a78bfa',
      '#38bdf8','#fb7185','#34d399','#fbbf24','#e879f9',
    ],
  };
  /* ══════════════════════════════════════════════════════════════ */

  /* ─── Storage ─────────────────────────────────────────────── */
  const BM_KEY       = 'bnt_bookmarks_v3';
  const TAG_KEY      = 'bnt_custom_tags_v1';
  const SITE_CLR_KEY = 'bnt_site_colors_v1';

  const loadBookmarks  = () => { try { return JSON.parse(localStorage.getItem(BM_KEY))       || []; } catch { return []; } };
  const saveBookmarks  = l  => localStorage.setItem(BM_KEY,       JSON.stringify(l));
  const loadCustomTags = () => { try { return JSON.parse(localStorage.getItem(TAG_KEY))      || []; } catch { return []; } };
  const saveCustomTags = l  => localStorage.setItem(TAG_KEY,      JSON.stringify(l));
  const loadSiteColors = () => { try { return JSON.parse(localStorage.getItem(SITE_CLR_KEY)) || {}; } catch { return {}; } };
  const saveSiteColors = o  => localStorage.setItem(SITE_CLR_KEY, JSON.stringify(o));

  /* ─── Helpers ─────────────────────────────────────────────── */
  const hostname   = url => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };
  const faviconUrl = url => { try { return `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(new URL(url).origin)}`; } catch { return ''; } };
  const previewUrl = url => { try { return `https://unavatar.io/${new URL(url).hostname}?fallback=false`; } catch { return ''; } };
  const siteLabel  = host => { const c = host.split('.').slice(0,-1).join(' ')||host; return c.replace(/[-_]/g,' ').split(' ').map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(' '); };
  const uid        = ()   => Date.now().toString(36) + Math.random().toString(36).slice(2,7);
  const randomColor= ()   => CONFIG.TAG_COLORS[Math.floor(Math.random()*CONFIG.TAG_COLORS.length)];
  const hexToRgba  = (h,a)=> { const r=parseInt(h.slice(1,3),16),g=parseInt(h.slice(3,5),16),b=parseInt(h.slice(5,7),16); return `rgba(${r},${g},${b},${a})`; };
  const esc        = s    => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const truncUrl   = url  => { try { const u=new URL(url); return u.hostname.replace(/^www\./,'')+( u.pathname.length>1?u.pathname.replace(/\/$/,''):''); } catch { return url; } };

  /* ─── [5] Dominant colour from favicon via canvas ─────────── */
  const siteColorCache = loadSiteColors();

  function getSiteColor(host, sampleUrl) {
    if (siteColorCache[host]) return Promise.resolve(siteColorCache[host]);
    return new Promise(resolve => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const c = document.createElement('canvas'); c.width = c.height = 16;
          const ctx = c.getContext('2d'); ctx.drawImage(img,0,0,16,16);
          const d = ctx.getImageData(0,0,16,16).data;
          let bestSat=-1, br=123, bg_=147, bb=255;
          for (let i=0;i<d.length;i+=4) {
            if(d[i+3]<128) continue;
            const r=d[i]/255,g=d[i+1]/255,b=d[i+2]/255;
            const sat=Math.max(r,g,b)-Math.min(r,g,b);
            if(sat>bestSat){bestSat=sat;br=d[i];bg_=d[i+1];bb=d[i+2];}
          }
          const hex='#'+[br,bg_,bb].map(v=>v.toString(16).padStart(2,'0')).join('');
          siteColorCache[host]=hex; saveSiteColors(siteColorCache); resolve(hex);
        } catch { fallback(); }
      };
      img.onerror = fallback;
      function fallback(){ const c=randomColor(); siteColorCache[host]=c; saveSiteColors(siteColorCache); resolve(c); }
      img.src = faviconUrl(sampleUrl||'https://'+host);
    });
  }

  /* ─── State ───────────────────────────────────────────────── */
  let bookmarks  = loadBookmarks().map(b=>({customTags:[],...b}));
  let customTags = loadCustomTags();
  let activeTag  = 'all';
  let closeTimer = null;
  let pinned     = false;
  let autoPinned = false;   /* закреплено автоматически — снимается после действия */

  /* ─── DOM refs ────────────────────────────────────────────── */
  const panel      = document.getElementById('bm-panel');
  const bmContent  = document.getElementById('bm-content');
  const tagBar     = document.getElementById('bm-tags');
  const list       = document.getElementById('bm-list');
  const addUrlIn   = document.getElementById('bm-add-url');
  const addTitleIn = document.getElementById('bm-add-title');
  const addBtn     = document.getElementById('bm-add-btn');

  document.getElementById('bm-toggle')?.remove();

  /* Apply open width */
  panel.style.setProperty('--bm-open-w', CONFIG.PANEL_WIDTH_PCT+'vw');

  /* ─── [3] Pin button — lives inside #bm-content, not on panel ─
     Rendered as first child of bm-content so it scrolls with
     content and is hidden automatically when panel is collapsed
     (bm-content gets pointer-events:none + is clipped).          */
  const bmHeader = document.createElement('div');
  bmHeader.id = 'bm-header';

  /* ── Search field ─────────────────────────────────────────────── */
  let searchQuery = '';

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
  searchIn.id = 'bm-search';
  searchIn.type = 'text';
  searchIn.placeholder = 'Search bookmarks…';
  searchIn.autocomplete = 'off';
  searchIn.spellcheck = false;

  const searchClear = document.createElement('button');
  searchClear.id = 'bm-search-clear';
  searchClear.title = 'Clear search';
  searchClear.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="2.5" stroke-linecap="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>`;

  searchIn.addEventListener('input', () => {
    searchQuery = searchIn.value.trim().toLowerCase();
    searchClear.classList.toggle('visible', searchQuery.length > 0);
    renderList();
  });
  searchIn.addEventListener('keydown', e => { if (e.key === 'Escape') { searchIn.value = ''; searchQuery = ''; searchClear.classList.remove('visible'); renderList(); } });
  searchClear.addEventListener('click', () => { searchIn.value = ''; searchQuery = ''; searchClear.classList.remove('visible'); searchIn.focus(); renderList(); });

  /* Auto-pin: строка поиска */
  searchIn.addEventListener('focus', engagePanel);
  searchIn.addEventListener('blur',  () => { if(!searchQuery) releasePanel(); });

  searchWrap.append(searchIco, searchIn, searchClear);
  bmHeader.appendChild(searchWrap);

  const pinBtn = document.createElement('button');
  pinBtn.id = 'bm-pin-btn';
  pinBtn.title = 'Pin panel (or double-click panel)';
  /* Single icon — only color changes on active, no SVG swap (fix 2) */
  pinBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="12" y1="17" x2="12" y2="22"/>
    <path d="M5 17h14v-2a6 6 0 0 0-4-5.66V4h1V2H8v2h1v5.34A6 6 0 0 0 5 15v2z"/>
  </svg>`;

  bmHeader.appendChild(pinBtn);
  /* Insert header as very first child of bm-content */
  bmContent.insertBefore(bmHeader, bmContent.firstChild);

  function setPin(val) {
    pinned = val;
    panel.classList.toggle('bm-pinned', pinned);
    pinBtn.classList.toggle('active', pinned);
    pinBtn.title = pinned ? 'Unpin panel' : 'Pin panel (or double-click panel)';
  }
  pinBtn.addEventListener('click', e => { e.stopPropagation(); setPin(!pinned); if(pinned) autoPinned=false; });
  panel.addEventListener('dblclick', e => { if(e.target.closest('#bm-pin-btn')) return; setPin(!pinned); if(pinned) autoPinned=false; });

  /* ─── Auto-pin: закрепляет панель на время действия ──────────
     engagePanel() — вызывается при любом "требующем внимания" действии:
       • фокус в полях добавления закладки / поиска
       • открытие попапа назначения тегов / модала создания тега
     releasePanel() — вызывается по завершении (blur, закрытие попапа):
       снимает auto-pin только если пользователь не закрепил вручную.  */
  function engagePanel() {
    openPanel();
    if (!pinned) { autoPinned = true; setPin(true); }
  }
  function releasePanel() {
    if (!autoPinned) return;
    autoPinned = false;
    setPin(false);
    /* Не сворачивать если мышь всё ещё над панелью или hover-зоной */
    if (!panel.matches(':hover') && !document.getElementById('bm-hover-zone')?.matches(':hover')) {
      scheduleClose();
    }
  }

  /* ─── Panel open / close ──────────────────────────────────── */
  function openPanel()  { clearTimeout(closeTimer); panel.classList.remove('bm-collapsed'); }

  function scheduleClose() {
    if (pinned) return;
    /* [1] Don't close when tab lost focus or is hidden */
    if (!document.hasFocus() || document.visibilityState !== 'visible') return;
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => { if(!pinned) panel.classList.add('bm-collapsed'); }, CONFIG.CLOSE_DELAY_MS);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') clearTimeout(closeTimer);
  });

  /* Hover zone: z-index below panel so it never steals clicks from open panel content */
  const hoverZone = document.createElement('div');
  hoverZone.id = 'bm-hover-zone';
  hoverZone.style.width = CONFIG.HOVER_ZONE_PX + 'px';
  document.body.appendChild(hoverZone);

  hoverZone.addEventListener('mouseenter', openPanel);
  panel.addEventListener('mouseenter', openPanel);
  panel.addEventListener('mouseleave', scheduleClose);
  hoverZone.addEventListener('mouseleave', scheduleClose);

  /* ─── Add bookmark ────────────────────────────────────────── */
  function addBookmark() {
    let url = addUrlIn.value.trim(); if (!url) return;
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    const host = hostname(url);
    bookmarks.push({ id:uid(), url, title:addTitleIn.value.trim()||siteLabel(host), host, customTags:[], image:'' });
    saveBookmarks(bookmarks);
    addUrlIn.value = addTitleIn.value = '';
    /* Блюрим оба поля — blur-listener сам вызовет releasePanel.
       НЕ делаем focus() обратно — это бы снова триггерило engagePanel. */
    addUrlIn.blur();
    addTitleIn.blur();
    render();
  }
  addBtn.addEventListener('click', addBookmark);
  addUrlIn.addEventListener('keydown',   e => { if(e.key==='Enter') addTitleIn.value===''?addBookmark():addTitleIn.focus(); });
  addTitleIn.addEventListener('keydown', e => { if(e.key==='Enter') addBookmark(); });

  /* Auto-pin: поля добавления закладки */
  addUrlIn.addEventListener('focus',   engagePanel);
  addTitleIn.addEventListener('focus',  engagePanel);
  addUrlIn.addEventListener('blur',    () => { if(!addTitleIn.matches(':focus')) releasePanel(); });
  addTitleIn.addEventListener('blur',  () => { if(!addUrlIn.matches(':focus'))  releasePanel(); });

  /* ─── Delete / tag CRUD ───────────────────────────────────── */
  const deleteBookmark = id => { bookmarks=bookmarks.filter(b=>b.id!==id); saveBookmarks(bookmarks); render(); };

  function addCustomTag(name, color) {
    if (!name.trim()) return null;
    const tag = { id:uid(), name:name.trim(), color:color||randomColor() };
    customTags.push(tag); saveCustomTags(customTags); return tag;
  }
  function deleteCustomTag(id) {
    customTags=customTags.filter(t=>t.id!==id);
    bookmarks=bookmarks.map(b=>({...b,customTags:b.customTags.filter(tid=>tid!==id)}));
    saveBookmarks(bookmarks); saveCustomTags(customTags);
    if(activeTag===id) activeTag='all'; render();
  }
  function updateTagColor(id, color) { customTags=customTags.map(t=>t.id===id?{...t,color}:t); saveCustomTags(customTags); render(); }
  function assignTagToBookmark(bmId, tagId) {
    bookmarks=bookmarks.map(b=>{
      if(b.id!==bmId) return b;
      const tags=b.customTags.includes(tagId)?b.customTags.filter(t=>t!==tagId):[...b.customTags,tagId];
      return {...b,customTags:tags};
    });
    saveBookmarks(bookmarks); render();
  }

  /* ─── [2] Global tag-assign popup ─────────────────────────────
     Appended to <body> so it's never clipped by the panel.
     Positioned near the trigger button via getBoundingClientRect. */
  function openTagAssignPopup(bmId, anchorEl) {
    document.getElementById('bm-tag-assign-popup')?.remove();
    const bm = bookmarks.find(b=>b.id===bmId); if(!bm) return;

    const pop = document.createElement('div');
    pop.id = 'bm-tag-assign-popup';

    /* Search input */
    const searchWrap = document.createElement('div');
    searchWrap.className = 'bm-tap-search-wrap';
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Search tags…';
    searchInput.className = 'bm-tap-search';
    searchInput.autocomplete = 'off';
    searchWrap.appendChild(searchInput);
    pop.appendChild(searchWrap);

    const itemsWrap = document.createElement('div');
    itemsWrap.className = 'bm-tap-items';
    pop.appendChild(itemsWrap);

    function renderItems(filter) {
      itemsWrap.innerHTML = '';
      const filtered = customTags.filter(ct => !filter || ct.name.toLowerCase().includes(filter.toLowerCase()));
      if (!customTags.length) {
        itemsWrap.innerHTML = `<div class="bm-tap-empty">No custom tags yet.<br>Create one with <strong>+</strong> in the tag bar.</div>`;
        return;
      }
      if (!filtered.length) {
        itemsWrap.innerHTML = `<div class="bm-tap-empty">No tags match «${esc(filter)}»</div>`;
        return;
      }
      filtered.forEach(ct => {
        const active = bm.customTags.includes(ct.id);
        const btn = document.createElement('button');
        btn.className = 'bm-tap-row' + (active?' active':'');
        btn.style.setProperty('--tag-color', ct.color);
        btn.style.setProperty('--tag-color-bg', hexToRgba(ct.color,0.18));
        btn.innerHTML = `<span class="bm-tap-dot"></span><span class="bm-tap-name">${esc(ct.name)}</span>`
          + (active ? `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>` : '');
        btn.addEventListener('click', e => {
          e.preventDefault(); e.stopPropagation();
          assignTagToBookmark(bmId, ct.id); pop.remove();
        });
        itemsWrap.appendChild(btn);
      });
    }

    renderItems('');
    searchInput.addEventListener('input', () => renderItems(searchInput.value));
    document.body.appendChild(pop);

    /* Position: align left edge of popup with anchor, below it.
       If it would overflow right side of viewport, flip left.   */
    const ar = anchorEl.getBoundingClientRect();
    const pw = 200; // approximate popup width, matches CSS min-width
    let left = ar.left;
    if (left + pw > window.innerWidth - 8) left = Math.max(8, window.innerWidth - pw - 8);
    const top = ar.bottom + 6;
    pop.style.left = left + 'px';
    pop.style.top  = top  + 'px';

    /* Focus search for keyboard use */
    searchInput.focus();

    /* Auto-pin while popup is open */
    engagePanel();

    /* Close on outside click */
    setTimeout(() => {
      document.addEventListener('mousedown', function closer(e) {
        if (!pop.contains(e.target) && e.target !== anchorEl) {
          pop.remove(); document.removeEventListener('mousedown', closer);
          releasePanel();
        }
      });
    }, 0);
  }

  /* ─── Tags render ─────────────────────────────────────────── */
  function uniqueSiteHosts() {
    const seen=new Set(), hosts=[];
    for(const b of bookmarks){ if(!seen.has(b.host)){seen.add(b.host);hosts.push(b.host);} }
    return hosts;
  }

  function renderTags() {
    tagBar.innerHTML = '';
    const allBtn = document.createElement('button');
    allBtn.className='bm-tag'+(activeTag==='all'?' active':'');
    allBtn.dataset.tag='all'; allBtn.textContent='All';
    allBtn.onclick=()=>setTag('all'); tagBar.appendChild(allBtn);

    uniqueSiteHosts().forEach(host => {
      const sample = bookmarks.find(b=>b.host===host);
      const btn = mkTagBtn(host, siteLabel(host), 'site', siteColorCache[host]||null);
      tagBar.appendChild(btn);
      if (!siteColorCache[host] && sample) {
        getSiteColor(host, sample.url).then(color => {
          btn.style.setProperty('--tag-color', color);
          btn.style.setProperty('--tag-color-bg', hexToRgba(color,0.15));
          btn.classList.add('bm-tag-colored');
        });
      }
    });

    customTags.forEach(ct => tagBar.appendChild(mkTagBtn(ct.id, ct.name, 'custom', ct.color)));

    const addTagBtn = document.createElement('button');
    addTagBtn.className='bm-tag bm-tag-add'; addTagBtn.title='Add custom tag';
    addTagBtn.innerHTML=`<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="12" y1="4" x2="12" y2="20"/><line x1="4" y1="12" x2="20" y2="12"/></svg>`;
    addTagBtn.onclick=()=>openAddTagModal(); tagBar.appendChild(addTagBtn);
  }

  function mkTagBtn(id, label, type, color) {
    const btn = document.createElement('button');
    btn.className='bm-tag'+(activeTag===id?' active':'');
    btn.dataset.tag=id; btn.dataset.type=type; btn.textContent=label;
    if(color){ btn.style.setProperty('--tag-color',color); btn.style.setProperty('--tag-color-bg',hexToRgba(color,0.15)); btn.classList.add('bm-tag-colored'); }
    btn.onclick=()=>setTag(id);
    if(type==='custom') btn.addEventListener('contextmenu', e=>{ e.preventDefault(); openTagColorPicker(id,color,btn); });
    return btn;
  }

  function setTag(tag){ activeTag=tag; renderTags(); renderList(); }

  /* ─── Modals ──────────────────────────────────────────────── */
  function openAddTagModal() {
    document.getElementById('bm-tag-modal')?.remove();
    const modal = document.createElement('div'); modal.id='bm-tag-modal';
    modal.innerHTML=`<div class="bm-modal-inner">
      <div class="bm-modal-title">New Tag</div>
      <input id="bm-tag-name" type="text" placeholder="Tag name…" autocomplete="off">
      <div class="bm-modal-color-row"><span>Color</span><input id="bm-tag-color" type="color" value="${randomColor()}"></div>
      <div class="bm-modal-btns"><button id="bm-tag-cancel">Cancel</button><button id="bm-tag-confirm" class="primary">Add</button></div>
    </div>`;
    panel.appendChild(modal);
    modal.querySelector('#bm-tag-name').focus();
    engagePanel();
    modal.querySelector('#bm-tag-cancel').onclick=()=>{ modal.remove(); releasePanel(); };
    modal.querySelector('#bm-tag-confirm').onclick=()=>{
      const name=modal.querySelector('#bm-tag-name').value.trim();
      const color=modal.querySelector('#bm-tag-color').value;
      if(name){addCustomTag(name,color);render();} modal.remove(); releasePanel();
    };
    modal.querySelector('#bm-tag-name').addEventListener('keydown',e=>{
      if(e.key==='Enter') modal.querySelector('#bm-tag-confirm').click();
      if(e.key==='Escape') modal.remove();
    });
  }

  function openTagColorPicker(tagId, currentColor, anchorEl) {
    document.getElementById('bm-color-picker-popup')?.remove();
    const pop=document.createElement('div'); pop.id='bm-color-picker-popup';
    pop.innerHTML=`<div class="bm-modal-inner">
      <div class="bm-modal-title">Tag color</div>
      <div class="bm-modal-color-row"><input id="bm-cp-color" type="color" value="${currentColor||'#7b93ff'}"></div>
      <div class="bm-modal-btns"><button id="bm-cp-del" class="danger">Delete tag</button><button id="bm-cp-ok" class="primary">Save</button></div>
    </div>`;
    panel.appendChild(pop);
    engagePanel();
    pop.querySelector('#bm-cp-ok').onclick=()=>{updateTagColor(tagId,pop.querySelector('#bm-cp-color').value);pop.remove();releasePanel();};
    pop.querySelector('#bm-cp-del').onclick=()=>{deleteCustomTag(tagId);pop.remove();releasePanel();};
    document.addEventListener('mousedown',function close(e){if(!pop.contains(e.target)&&e.target!==anchorEl){pop.remove();document.removeEventListener('mousedown',close);releasePanel();}});
  }

  /* ─── List render ─────────────────────────────────────────── */
  function renderList() {
    list.innerHTML='';
    let visible;
    if(activeTag==='all'){ visible=bookmarks; }
    else {
      const isSite=bookmarks.some(b=>b.host===activeTag);
      visible=isSite?bookmarks.filter(b=>b.host===activeTag):bookmarks.filter(b=>b.customTags.includes(activeTag));
    }
    if(searchQuery){
      visible=visible.filter(b=>
        b.title.toLowerCase().includes(searchQuery) ||
        b.url.toLowerCase().includes(searchQuery)   ||
        b.host.toLowerCase().includes(searchQuery)
      );
    }
    if(!visible.length){
      const e=document.createElement('div'); e.className='bm-empty';
      e.textContent=searchQuery?'No bookmarks match your search.':'No bookmarks here yet.';
      list.appendChild(e); return;
    }
    const groups=new Map();
    for(const b of visible){ if(!groups.has(b.host))groups.set(b.host,[]); groups.get(b.host).push(b); }
    groups.forEach((items,host)=>list.appendChild(buildGroupCard(host,items)));
  }

  /* ─── Card builder ────────────────────────────────────────── */
  function buildGroupCard(host, items) {
    const wrap=document.createElement('div'); wrap.className='bm-card';
    wrap.style.minHeight = CONFIG.CARD_MIN_HEIGHT + 'px';

    const bg=document.createElement('div'); bg.className='bm-card-bg';
    const setBg=item=>{ const src=item.image||previewUrl(item.url); bg.style.backgroundImage=src?`url('${src}')`:''; };
    setBg(items[0]); wrap.appendChild(bg);

    const overlay=document.createElement('div'); overlay.className='bm-card-overlay'; wrap.appendChild(overlay);

    const content=document.createElement('div'); content.className='bm-card-content';

    const siteRow=document.createElement('div'); siteRow.className='bm-card-site';
    const fav=document.createElement('img'); fav.className='bm-card-favicon'; fav.src=faviconUrl(items[0].url); fav.alt='';
    const siteText=document.createElement('span'); siteText.textContent=siteLabel(host);
    siteRow.append(fav,siteText); content.appendChild(siteRow);

    const bmTitle=document.createElement('div'); bmTitle.className='bm-card-title'; bmTitle.textContent=items[0].title; content.appendChild(bmTitle);

    const urlRow=document.createElement('div'); urlRow.className='bm-card-url-row';
    const urlSpan=document.createElement('span'); urlSpan.className='bm-card-url'; urlSpan.textContent=truncUrl(items[0].url);
    const copyBtn=document.createElement('button'); copyBtn.className='bm-card-copy'; copyBtn.title='Copy URL';
    const COPY_ICO=`<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
    const CHECK_ICO=`<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>`;
    copyBtn.innerHTML=COPY_ICO;
    copyBtn.addEventListener('click',e=>{ e.preventDefault();e.stopPropagation();
      navigator.clipboard.writeText(items[currentIdx].url).then(()=>{ copyBtn.innerHTML=CHECK_ICO; setTimeout(()=>copyBtn.innerHTML=COPY_ICO,1400); }); });
    urlRow.append(urlSpan,copyBtn); content.appendChild(urlRow);

    const tagsRow=document.createElement('div'); tagsRow.className='bm-card-tags'; content.appendChild(tagsRow);
    wrap.appendChild(content);

    const bmList=document.createElement('div'); bmList.className='bm-card-list';
    items.forEach((b,idx)=>{
      const row=document.createElement('a'); row.className='bm-card-row'; row.href=b.url; row.target='_blank'; row.rel='noopener';
      const rf=document.createElement('img'); rf.className='bm-item-favicon'; rf.src=faviconUrl(b.url); rf.alt='';
      const rt=document.createElement('span'); rt.className='bm-item-title'; rt.textContent=b.title;

      /* Tag-assign button */
      const tagBtn=document.createElement('button'); tagBtn.className='bm-item-tag-btn'; tagBtn.title='Assign tags';
      tagBtn.innerHTML=`<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>`;
      tagBtn.addEventListener('click',e=>{ e.preventDefault();e.stopPropagation(); openTagAssignPopup(b.id,tagBtn); });

      const delBtn=document.createElement('button'); delBtn.className='bm-item-del'; delBtn.title='Remove';
      delBtn.innerHTML=`<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
      delBtn.addEventListener('click',e=>{ e.preventDefault();e.stopPropagation();deleteBookmark(b.id); });

      row.append(rf,rt,tagBtn,delBtn);
      row.addEventListener('mouseenter',()=>updateCard(idx));
      bmList.appendChild(row);
    });
    wrap.appendChild(bmList);

    let currentIdx=0;
    function updateCard(idx){
      currentIdx=idx; const item=items[idx];
      setBg(item); bmTitle.textContent=item.title; urlSpan.textContent=truncUrl(item.url);
      tagsRow.innerHTML='';
      (item.customTags||[]).forEach(tid=>{ const ct=customTags.find(t=>t.id===tid); if(!ct)return;
        const chip=document.createElement('span'); chip.className='bm-card-tag-chip'; chip.textContent=ct.name;
        chip.style.setProperty('--tag-color',ct.color); chip.style.setProperty('--tag-color-bg',hexToRgba(ct.color,0.2));
        tagsRow.appendChild(chip); });
      bmList.querySelectorAll('.bm-card-row').forEach((r,i)=>r.classList.toggle('hovered',i===idx));
    }

    wrap.addEventListener('mouseenter',()=>updateCard(0));
    wrap.addEventListener('click',e=>{ if(e.target.closest('.bm-card-list')||e.target.closest('.bm-card-copy'))return; window.open(items[currentIdx].url,'_blank'); });
    updateCard(0);
    return wrap;
  }

  /* ─── Full render ─────────────────────────────────────────── */
  const render = () => { renderTags(); renderList(); };

  render();
})();
