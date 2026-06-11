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

  /* Запоминаем элемент с фокусом и выделение ДО того как меню перехватит фокус */
  let _ctxTarget      = null;   /* элемент под курсором при открытии меню */
  let _ctxFocusedEl   = null;   /* input/textarea у которого был фокус */
  let _ctxSelectedText = '';    /* выделенный текст на момент открытия меню */

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

  /* ── SVG icons reused across menus ─────────────────────────────── */
  const ICO = {
    copy: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </svg>`,
    paste: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
    </svg>`,
    settings: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
    </svg>`,
    panel: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
    </svg>`,
    search: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>`,
    edit: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
    </svg>`,
    trash: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
      <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
    </svg>`,
  };

  /* ── Detect context zone from click target ──────────────────────── */
  function detectZone(target) {
    if (target.closest('#bm-panel')) return 'bookmarks-panel';
    return null;
  }

  /* ── Build settings entry based on zone ────────────────────────── */
  function settingsItem(zone) {
    if (zone === 'bookmarks-panel') {
      return {
        icon:   ICO.panel,
        label:  "Customize 'Bookmarks Panel'",
        action: () => window.BNT_SETTINGS?.open('bookmarks-panel'),
      };
    }
    return {
      icon:   ICO.settings,
      label:  'Open Settings',
      action: () => window.BNT_SETTINGS?.open(),
    };
  }

  /* ── Global contextmenu intercept ──────────────────────────────── */
  document.addEventListener('contextmenu', e => {
    /* Let elements with own logic handle it */
    for (const sel of OWNED_SELECTORS) {
      if (e.target.closest(sel)) return;
    }

    e.preventDefault();

    /* ── Снапшот состояния ДО того как меню заберёт фокус ── */
    _ctxSelectedText = window.getSelection()?.toString().trim() ?? '';
    const focusTag   = document.activeElement?.tagName;
    _ctxFocusedEl    = (focusTag === 'INPUT' || focusTag === 'TEXTAREA'
                        || document.activeElement?.isContentEditable)
                       ? document.activeElement
                       : null;
    _ctxTarget = e.target;

    const zone   = detectZone(e.target);
    const hasSel = _ctxSelectedText.length > 0;
    const isInput = _ctxFocusedEl !== null;

    const items = [];

    if (hasSel) {
      items.push({
        icon:   ICO.copy,
        label:  'Copy Text',
        action: async () => {
          try {
            await navigator.clipboard.writeText(_ctxSelectedText);
            window.BNT_TOAST?.show({ title: 'Copied', type: 'success', duration: 1800 });
          } catch {
            document.execCommand('copy');
          }
        },
      });
    }

    if (isInput) {
      items.push({
        icon:   ICO.paste,
        label:  'Paste Text',
        /* Вставка через execCommand('paste') — единственный надёжный способ
           в Firefox без разрешения clipboard-read.
           Алгоритм:
           1. Возвращаем фокус на сохранённый элемент (_ctxFocusedEl)
           2. Вызываем execCommand('paste') синхронно — браузер подставит
              свой буфер обмена напрямую без нашего доступа к содержимому.
           3. Если execCommand не сработал (вернул false) — пробуем
              clipboard API как запасной вариант. */
        action: async () => {
          const el = _ctxFocusedEl;
          if (!el) return;

          /* Возвращаем фокус */
          el.focus();

          /* Попытка 1: execCommand — работает в Firefox без разрешений */
          const ok = document.execCommand('paste');
          if (ok) return;

          /* Попытка 2: Clipboard API (Chrome/Edge, Firefox с разрешением) */
          try {
            const text = await navigator.clipboard.readText();
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
              const s   = el.selectionStart ?? el.value.length;
              const end = el.selectionEnd   ?? el.value.length;
              el.value  = el.value.slice(0, s) + text + el.value.slice(end);
              el.selectionStart = el.selectionEnd = s + text.length;
              el.dispatchEvent(new Event('input', { bubbles: true }));
            } else if (el.isContentEditable) {
              document.execCommand('insertText', false, text);
            }
          } catch {
            /* Ни execCommand ни clipboard API не сработали —
               Firefox требует явного разрешения clipboard-read.
               Тихо игнорируем: браузер уже показал свой UI выше. */
          }
        },
      });
    }

    /* Разделитель только если были clipboard-пункты */
    if (items.length > 0) items.push(null);

    items.push(settingsItem(zone));

    show(e, items);
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
