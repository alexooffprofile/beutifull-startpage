/**
 * context-menu.js — Beautiful New Tab · Global Custom Context Menu
 *
 * Replaces the browser's native context menu on the new tab page.
 * Elements that already have their own right-click logic are excluded:
 *   - .bm-card        (bookmark card — opens edit popup)
 *   - .bm-tag[data-tag] (tag buttons — opens tag edit popup)
 *
 * shortcuts.js right-click is removed separately (see shortcuts.js).
 *
 * Usage from other modules:
 *   window.BNT_CTX.show(e, items)
 *   window.BNT_CTX.hide()
 *
 *   items: [{ icon: '<svg>…</svg>', label: 'Text', action: fn, danger?: true }, …]
 *   Pass a null item for a divider: items.push(null)
 */

(() => {
  'use strict';

  /* ── Elements that already own their contextmenu event ── */
  const OWNED_SELECTORS = [
    '.bm-card',
    '.bm-tag[data-tag]',
  ];

  /* ── Build menu DOM ─────────────────────────────────────────────── */
  const menu = document.createElement('div');
  menu.id = 'bnt-ctx-menu';
  menu.setAttribute('role', 'menu');
  document.body.appendChild(menu);

  let _hideTimer = null;

  function hide() {
    menu.classList.remove('bnt-ctx-visible');
    clearTimeout(_hideTimer);
    _hideTimer = setTimeout(() => { menu.innerHTML = ''; }, 200);
  }

  function show(e, items) {
    clearTimeout(_hideTimer);
    menu.innerHTML = '';

    items.forEach(item => {
      if (!item) {
        /* null → divider */
        const div = document.createElement('div');
        div.className = 'bnt-ctx-divider';
        menu.appendChild(div);
        return;
      }

      const btn = document.createElement('button');
      btn.className = 'bnt-ctx-item' + (item.danger ? ' bnt-ctx-danger' : '');
      btn.setAttribute('role', 'menuitem');
      btn.innerHTML = `
        <span class="bnt-ctx-ico">${item.icon}</span>
        <span class="bnt-ctx-label">${item.label}</span>
      `;
      btn.addEventListener('mousedown', ev => ev.stopPropagation());
      btn.addEventListener('click', () => {
        hide();
        item.action?.();
      });
      menu.appendChild(btn);
    });

    /* Position — keep inside viewport */
    menu.classList.remove('bnt-ctx-visible');
    menu.style.left = '0';
    menu.style.top  = '0';
    menu.classList.add('bnt-ctx-visible');

    const mw = menu.offsetWidth  || 220;
    const mh = menu.offsetHeight || 100;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let x = e.clientX;
    let y = e.clientY;
    if (x + mw > vw - 8) x = vw - mw - 8;
    if (y + mh > vh - 8) y = vh - mh - 8;
    if (x < 8) x = 8;
    if (y < 8) y = 8;

    menu.style.left = x + 'px';
    menu.style.top  = y + 'px';
  }

  /* ── Global contextmenu intercept ──────────────────────────────── */
  document.addEventListener('contextmenu', e => {
    /* Let elements with own logic handle it */
    for (const sel of OWNED_SELECTORS) {
      if (e.target.closest(sel)) return;
    }

    e.preventDefault();

    /* Default page items (3 test buttons) */
    show(e, [
      {
        icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>`,
        label: 'Test action 1',
        action: () => {},
      },
      {
        icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
        </svg>`,
        label: 'Test action 2',
        action: () => {},
      },
      null,
      {
        icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
          <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
        </svg>`,
        label: 'Test danger action',
        action: () => {},
        danger: true,
      },
    ]);
  });

  /* ── Close on outside click or Escape ──────────────────────────── */
  document.addEventListener('mousedown', e => {
    if (!menu.contains(e.target)) hide();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') hide();
  });

  /* ── Expose API ─────────────────────────────────────────────────── */
  window.BNT_CTX = { show, hide };
})();
