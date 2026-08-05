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
    '.bm-tag[data-tag]',   /* tag buttons — opens tag edit popup */
    /* .bm-card  — handled below via BNT_CTX.show */
    /* .sc-card  — handled below via BNT_CTX.show */
  ];

  /* ── Helpers ────────────────────────────────────────────────────── */
  function getDomainFromUrl(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'image'; }
  }

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
    if (target.closest('#shortcuts-row')) return 'shortcuts';
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
    if (zone === 'shortcuts') {
      return {
        icon:   ICO.settings,
        label:  'Shortcut Settings',
        action: () => window.BNT_SETTINGS?.open('shortcuts'),
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

  /* ══════════════════════════════════════════════════════════════════
     SHORTCUT CARD — right-click
     Handles: edit, change image, move forward/back,
              copy link, download/copy image,
              move to bookmarks, delete, settings.
  ══════════════════════════════════════════════════════════════════ */
  document.addEventListener('contextmenu', e => {
    const card = e.target.closest('.sc-card');
    if (!card) return;
    e.preventDefault();
    const bmId = card.dataset.id;

    /* ── helpers ── */
    const scUrl  = () => window.BNT_SC?.getUrl(bmId) ?? '';
    const scThumb = () => window.BNT_SC?.getThumb(bmId) ?? null;

    async function copyImageToClipboard(src) {
      try {
        const resp = await fetch(src);
        const blob = await resp.blob();
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
        window.BNT_TOAST?.show({ title: 'Image copied', type: 'success', duration: 1800 });
      } catch {
        window.BNT_TOAST?.show({ title: 'Could not copy image', type: 'error', duration: 2200 });
      }
    }

    function downloadImage(src, name) {
      const a = document.createElement('a');
      a.href = src; a.download = name || 'shortcut';
      a.click();
    }

    const thumbSrc = scThumb();
    const favSrc   = `https://www.google.com/s2/favicons?sz=128&domain_url=${encodeURIComponent((() => { try { return new URL(scUrl()).origin; } catch { return scUrl(); } })())}`;
    const imgSrc   = thumbSrc || favSrc;

    show(e, [
      /* ── Edit ── */
      {
        icon: ICO.edit,
        label: 'Edit shortcut',
        action: () => window.BNT_SC?.openEdit(bmId, card, e.clientX, e.clientY),
      },
      {
        icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`,
        label: 'Change image',
        action: () => window.BNT_SC?.pickThumb(bmId, card),
      },
      {
        icon: ICO.paste,
        label: 'Paste image',
        action: async () => {
          let blob;
          try {
            blob = await window.BNT_STORAGE?.readClipboardImage();
          } catch (err) {
            console.error('[BNT CTX] clipboard read failed', err);
            window.BNT_TOAST?.show({ title: 'Could not read clipboard', type: 'error', duration: 2200 });
            return;
          }
          if (!blob) {
            window.BNT_TOAST?.show({ title: 'No image in clipboard', type: 'error', duration: 2200 });
            return;
          }
          await window.BNT_SC?.setThumbFromBlob(bmId, card, blob);
          window.BNT_TOAST?.show({ title: 'Image pasted', type: 'success', duration: 1800 });
        },
      },
      null,
      /* ── Reorder (4) ── */
      {
        icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`,
        label: 'Move backward',
        action: () => window.BNT_SC?.moveBack(bmId),
      },
      {
        icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`,
        label: 'Move forward',
        action: () => window.BNT_SC?.moveFwd(bmId),
      },
      null,
      /* ── Copy / Download (6) ── */
      {
        icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
        label: 'Copy link',
        action: async () => {
          await navigator.clipboard.writeText(scUrl());
          window.BNT_TOAST?.show({ title: 'Link copied', type: 'success', duration: 1800 });
        },
      },
      {
        icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
        label: 'Download image',
        action: () => downloadImage(imgSrc, getDomainFromUrl(scUrl())),
      },
      {
        icon: ICO.copy,
        label: 'Copy image',
        action: () => copyImageToClipboard(imgSrc),
      },
      null,
      /* ── Move to bookmarks (5) ── */
      {
        icon: ICO.panel,
        label: 'Move to Bookmarks',
        action: () => window.BNT_SC?.moveToBookmarks(bmId),
      },
      null,
      /* ── Delete ── */
      {
        icon: ICO.trash,
        label: 'Delete shortcut',
        danger: true,
        action: () => window.BNT_SC?.deleteCard(bmId),
      },
      null,
      settingsItem('shortcuts'),
    ]);
  });

  /* ══════════════════════════════════════════════════════════════════
     SHORTCUT ROW — empty area right-click
  ══════════════════════════════════════════════════════════════════ */
  document.addEventListener('contextmenu', e => {
    const row = e.target.closest('#shortcuts-row');
    if (!row) return;
    if (e.target.closest('.sc-card')) return;
    e.preventDefault();
    show(e, [
      {
        icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
        label: 'Add shortcut',
        action: () => window.BNT_SC?.openAdd(e.clientX, e.clientY),
      },
      null,
      settingsItem('shortcuts'),
    ]);
  });

  /* ══════════════════════════════════════════════════════════════════
     BOOKMARK CARD — right-click (replaces direct openCardEditPopup call)
     Handles: edit, copy link, download/copy image,
              move to shortcuts (5/6), standard open settings.
  ══════════════════════════════════════════════════════════════════ */
  document.addEventListener('contextmenu', e => {
    if (e.target.closest('.bm-card-copy,.bm-card-tag-btn,.bm-card-del,.bm-card-edit-btn')) return;
    const card = e.target.closest('.bm-card');
    if (!card) return;
    e.preventDefault();

    const bmId  = card.dataset.id;
    const bmUrl = card.dataset.url || card.querySelector('.bm-card-url')?.textContent || '';
    const favSrc = `https://www.google.com/s2/favicons?sz=128&domain_url=${encodeURIComponent((() => { try { return new URL(bmUrl).origin; } catch { return bmUrl; } })())}`;
    const thumbSrc = card.querySelector('.bm-card-bg')?.style.backgroundImage.match(/url\(["']?(.+?)["']?\)/)?.[1] || null;
    const imgSrc = thumbSrc || favSrc;

    async function copyImageToClipboard(src) {
      try {
        const blob = await (await fetch(src)).blob();
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
        window.BNT_TOAST?.show({ title: 'Image copied', type: 'success', duration: 1800 });
      } catch {
        window.BNT_TOAST?.show({ title: 'Could not copy image', type: 'error', duration: 2200 });
      }
    }

    show(e, [
      {
        icon: ICO.edit,
        label: 'Edit bookmark',
        action: () => card.querySelector('.bm-card-edit-btn')?.click(),
      },
      null,
      /* ── Copy / Download (6) ── */
      {
        icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
        label: 'Copy link',
        action: async () => {
          await navigator.clipboard.writeText(bmUrl);
          window.BNT_TOAST?.show({ title: 'Link copied', type: 'success', duration: 1800 });
        },
      },
      {
        icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
        label: 'Download image',
        action: () => { const a = document.createElement('a'); a.href = imgSrc; a.download = getDomainFromUrl(bmUrl); a.click(); },
      },
      {
        icon: ICO.copy,
        label: 'Copy image',
        action: () => copyImageToClipboard(imgSrc),
      },
      null,
      /* ── Move to shortcuts (5) ── */
      {
        icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="13" width="8" height="8" rx="1"/><rect x="14" y="13" width="8" height="8" rx="1"/><rect x="8" y="2" width="8" height="8" rx="1"/></svg>`,
        label: 'Move to Shortcuts',
        action: () => window.BNT_SC?.moveFromBookmarks(bmId),
      },
      null,
      settingsItem('bookmarks-panel'),
    ]);
  });
})();
