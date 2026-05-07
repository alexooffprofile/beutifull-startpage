/**
 * bookmarks.js — Bookmark panel logic for Beautiful New Tab
 *
 * Features:
 *  • localStorage persistence
 *  • Auto-grouped by domain (site tag = hostname)
 *  • Tag filter bar (All + one tag per unique domain)
 *  • Add bookmark with URL + optional title
 *  • Favicon via Google S2 service
 *  • Collapse / expand panel
 *  • Delete individual bookmarks
 */

(() => {
  'use strict';

  /* ─── Storage ─────────────────────────────────────────────────── */
  const STORE_KEY = 'bnt_bookmarks_v2';

  function load() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; }
    catch { return []; }
  }

  function save(list) {
    localStorage.setItem(STORE_KEY, JSON.stringify(list));
  }

  /* ─── Helpers ──────────────────────────────────────────────────── */
  function hostname(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); }
    catch { return url; }
  }

  function faviconUrl(url) {
    try {
      const origin = new URL(url).origin;
      return `https://www.google.com/s2/favicons?sz=32&domain_url=${encodeURIComponent(origin)}`;
    } catch {
      return '';
    }
  }

  /**
   * Turn a hostname into a short display label.
   * "mail.google.com" → "Google"
   * "github.com"      → "GitHub"  (capitalise each word)
   */
  function siteLabel(host) {
    // Remove TLD and split on dots/dashes
    const core = host.split('.').slice(0, -1).join(' ') || host;
    return core.replace(/[-_]/g, ' ')
               .split(' ')
               .map(w => w.charAt(0).toUpperCase() + w.slice(1))
               .join(' ');
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /* ─── State ────────────────────────────────────────────────────── */
  let bookmarks   = load();   // [{id, url, title, host}]
  let activeTag   = 'all';

  /* ─── DOM refs ─────────────────────────────────────────────────── */
  const panel      = document.getElementById('bm-panel');
  const toggleBtn  = document.getElementById('bm-toggle');
  const tagBar     = document.getElementById('bm-tags');
  const list       = document.getElementById('bm-list');
  const addUrlIn   = document.getElementById('bm-add-url');
  const addTitleIn = document.getElementById('bm-add-title');
  const addBtn     = document.getElementById('bm-add-btn');

  /* ─── Collapse / Expand ────────────────────────────────────────── */
  toggleBtn.addEventListener('click', () => {
    panel.classList.toggle('bm-collapsed');
  });

  /* ─── Add bookmark ─────────────────────────────────────────────── */
  function addBookmark() {
    let url = addUrlIn.value.trim();
    if (!url) return;

    // Prefix protocol if missing
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

    const host  = hostname(url);
    const title = addTitleIn.value.trim() || siteLabel(host);

    bookmarks.push({ id: uid(), url, title, host });
    save(bookmarks);

    addUrlIn.value   = '';
    addTitleIn.value = '';
    addUrlIn.focus();

    render();
  }

  addBtn.addEventListener('click', addBookmark);

  addUrlIn.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      if (addTitleIn.value === '') addBookmark();
      else addTitleIn.focus();
    }
  });
  addTitleIn.addEventListener('keydown', e => {
    if (e.key === 'Enter') addBookmark();
  });

  /* ─── Delete ───────────────────────────────────────────────────── */
  function deleteBookmark(id) {
    bookmarks = bookmarks.filter(b => b.id !== id);
    save(bookmarks);
    render();
  }

  /* ─── Tags ─────────────────────────────────────────────────────── */
  function uniqueHosts() {
    const seen = new Set();
    const hosts = [];
    for (const b of bookmarks) {
      if (!seen.has(b.host)) { seen.add(b.host); hosts.push(b.host); }
    }
    return hosts;
  }

  function renderTags() {
    // Keep first child (the "All" button built in HTML)
    // Remove dynamic tags
    tagBar.querySelectorAll('.bm-tag[data-tag]:not([data-tag="all"])').forEach(el => el.remove());

    const hosts = uniqueHosts();

    // Re-create tag buttons
    hosts.forEach(host => {
      const btn = document.createElement('button');
      btn.className   = 'bm-tag';
      btn.dataset.tag = host;
      btn.textContent = siteLabel(host);
      if (activeTag === host) btn.classList.add('active');
      btn.addEventListener('click', () => setTag(host));
      tagBar.appendChild(btn);
    });

    // Update "All" button state
    const allBtn = tagBar.querySelector('.bm-tag[data-tag="all"]');
    if (allBtn) {
      allBtn.classList.toggle('active', activeTag === 'all');
      allBtn.onclick = () => setTag('all');
    }
  }

  function setTag(tag) {
    activeTag = tag;
    renderTags();
    renderList();
  }

  /* ─── List ─────────────────────────────────────────────────────── */
  function renderList() {
    list.innerHTML = '';

    // Filter
    const visible = activeTag === 'all'
      ? bookmarks
      : bookmarks.filter(b => b.host === activeTag);

    if (!visible.length) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:18px 14px;font-size:.78rem;color:var(--text-muted);text-align:center;';
      empty.textContent = activeTag === 'all' ? 'No bookmarks yet.' : 'No bookmarks for this site.';
      list.appendChild(empty);
      return;
    }

    // Group by host
    const groups = new Map(); // host → [{id,url,title,host}]
    for (const b of visible) {
      if (!groups.has(b.host)) groups.set(b.host, []);
      groups.get(b.host).push(b);
    }

    groups.forEach((items, host) => {
      /* Group header */
      const header = document.createElement('div');
      header.className = 'bm-group-header';

      const fav = faviconUrl(items[0].url);
      if (fav) {
        const img = document.createElement('img');
        img.className = 'bm-group-favicon';
        img.src = fav;
        img.alt = '';
        header.appendChild(img);
      }

      const label = document.createElement('span');
      label.textContent = siteLabel(host);
      header.appendChild(label);
      list.appendChild(header);

      /* Items */
      items.forEach(b => {
        const a = document.createElement('a');
        a.className = 'bm-item';
        a.href      = b.url;
        a.target    = '_blank';
        a.rel       = 'noopener';

        const itemFav = faviconUrl(b.url);
        if (itemFav) {
          const img = document.createElement('img');
          img.className = 'bm-item-favicon';
          img.src = itemFav;
          img.alt = '';
          a.appendChild(img);
        }

        const titleSpan = document.createElement('span');
        titleSpan.className = 'bm-item-title';
        titleSpan.textContent = b.title;
        a.appendChild(titleSpan);

        const delBtn = document.createElement('button');
        delBtn.className = 'bm-item-del';
        delBtn.title = 'Remove';
        delBtn.innerHTML = `
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2.5" stroke-linecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>`;
        delBtn.addEventListener('click', e => {
          e.preventDefault();
          e.stopPropagation();
          deleteBookmark(b.id);
        });
        a.appendChild(delBtn);

        list.appendChild(a);
      });
    });
  }

  /* ─── Full render ──────────────────────────────────────────────── */
  function render() {
    renderTags();
    renderList();
  }

  /* ─── Init ─────────────────────────────────────────────────────── */
  render();

})();
