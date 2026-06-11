/**
 * settings.js — Beautiful New Tab · Settings Overlay
 *
 * Features:
 *  - Full-page overlay with sidebar navigation
 *  - Settings search (sidebar)
 *  - Row icons per setting item
 *  - Preset panel in sidebar bottom: dropdown list + Import / Save buttons
 *  - Popups for creating/renaming presets (no native prompt())
 *  - Default preset resets all settings to SETTINGS_CONFIG defaults
 *  - Auto-creates "My settings" preset when user changes any value
 *  - Presets stored in chrome.storage.local: bnt_presets / bnt_active_preset
 *  - Save exports active preset as .json; Import reads it back
 *
 * API:
 *   window.BNT_SETTINGS.open(categoryId?)
 *   window.BNT_SETTINGS.close()
 */

(() => {
  'use strict';

  /* ══════════════════════════════════════════════════════════════
     SETTINGS CONFIG
     ──────────────────────────────────────────────────────────────
     Все числовые параметры настроек собраны здесь.
     Чтобы изменить диапазон или дефолт — правь только этот блок.
  ══════════════════════════════════════════════════════════════ */
  const SETTINGS_CONFIG = {

    /**
     * Ширина панели закладок (vw — проценты от ширины viewport).
     * Слайдер "Panel width" в категории Bookmarks.
     *   MIN_VW  — минимально возможная ширина (не даём сжать до нечитаемого)
     *   MAX_VW  — максимально возможная ширина
     *   DEFAULT — значение при первом запуске / сбросе
     */
    PANEL_WIDTH_MIN_VW  : 20,
    PANEL_WIDTH_MAX_VW  : 50,
    PANEL_WIDTH_DEFAULT : 32,

    /**
     * Pin панели закладок по умолчанию при каждом открытии новой вкладки.
     *   DEFAULT — false (панель сворачивается)
     */
    PIN_DEFAULT : false,

    /**
     * Основной акцентный цвет (hex). Применяется к --accent-main в :root.
     * Используется для тегов, кнопок, слайдеров, рамок фокуса.
     */
    ACCENT_MAIN_DEFAULT : '#7eff84',

    /**
     * Радиус скругления карточек закладок (px).
     *   MIN / MAX / DEFAULT — диапазон и дефолт.
     */
    CARD_RADIUS_MIN     : 0,
    CARD_RADIUS_MAX     : 24,
    CARD_RADIUS_DEFAULT : 14,

    /**
     * Задержка автозакрытия панели (мс).
     * Как долго панель остаётся открытой после того как курсор ушёл.
     *   MIN / MAX / DEFAULT
     */
    CLOSE_DELAY_MIN     : 50,
    CLOSE_DELAY_MAX     : 800,
    CLOSE_DELAY_DEFAULT : 110,

  };

  /**
   * Возвращает объект «чистых» дефолтных настроек.
   * Используется при сбросе на Default и при авто-создании My settings.
   * Добавляй сюда новые настройки по мере появления.
   */
  function defaultSettings() {
    return {
      panelWidthPct  : SETTINGS_CONFIG.PANEL_WIDTH_DEFAULT,
      pinByDefault   : SETTINGS_CONFIG.PIN_DEFAULT,
      accentMain     : SETTINGS_CONFIG.ACCENT_MAIN_DEFAULT,
      cardRadius     : SETTINGS_CONFIG.CARD_RADIUS_DEFAULT,
      closeDelay     : SETTINGS_CONFIG.CLOSE_DELAY_DEFAULT,
    };
  }

  /* ══════════════════════════════════════════════════════════════
     ICONS  (shared small SVG snippets)
  ══════════════════════════════════════════════════════════════ */
  const ICO = {
    clock:   `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    calendar:`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
    search:  `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
    grid:    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>`,
    palette: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r="1"/><circle cx="17.5" cy="10.5" r="1"/><circle cx="8.5" cy="7.5" r="1"/><circle cx="6.5" cy="12.5" r="1"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>`,
    brush:   `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.06 11.9l8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08"/><path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1 1 2.48 1.02 3.5 1.02 2.2 0 3-1.8 3-3.04 0-1.67-1.33-3.02-1.5-3.02z"/></svg>`,
    image:   `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`,
    type:    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>`,
    pin:     `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
    sliders: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>`,
    eye:     `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
    corner:  `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3h7v7H3zM3 14h7v7H3zM14 3h7v7h-7z"/><path d="M14 17.5A2.5 2.5 0 0 1 16.5 15H21v5.5A1.5 1.5 0 0 1 19.5 22H16a2 2 0 0 1-2-2v-2.5z"/></svg>`,
    tag:     `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>`,
  };

  /* ══════════════════════════════════════════════════════════════
     CATEGORY DEFINITIONS
     Each row may have an `icon` key (one of ICO keys) shown left
     of the label.
  ══════════════════════════════════════════════════════════════ */
  const CATEGORIES = [
    {
      id:    'general',
      label: 'General',
      icon:  `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2"/></svg>`,
      sections: [
        {
          title: 'Clock & Date',
          rows: [
            { icon: 'clock',    label: 'Clock format',   desc: '12-hour or 24-hour display' },
            { icon: 'calendar', label: 'Show date',       desc: 'Display day and month below the clock' },
          ],
        },
        {
          title: 'Search',
          rows: [
            { icon: 'search',  label: 'Default search engine', desc: 'Used when pressing Enter in the search bar' },
          ],
        },
        {
          title: 'Shortcuts Row',
          rows: [
            { icon: 'grid',    label: 'Card size',        desc: 'Width and height of shortcut cards' },
          ],
        },
      ],
    },
    {
      id:    'themes',
      label: 'Themes & Colors',
      icon:  `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 0 20"/><path d="M8 12a4 4 0 0 1 8 0"/></svg>`,
      sections: [
        {
          title: 'Accent Colors',
          rows: [
            { icon: 'palette', label: 'Main accent',    desc: 'Primary highlight color — tags, buttons, focus rings, sliders' },
            { icon: 'palette', label: 'Search accent',  desc: 'Color when the search bar is focused' },
            { icon: 'palette', label: 'Command accent', desc: 'Color when the command palette is active' },
          ],
        },
        {
          title: 'Background',
          rows: [
            { icon: 'brush',   label: 'Background color', desc: 'Base page background color' },
            { icon: 'image',   label: 'Background image', desc: 'Custom wallpaper — URL or local file' },
          ],
        },
        {
          title: 'Typography',
          rows: [
            { icon: 'type',    label: 'Clock font size', desc: 'Size of the main clock display' },
            { icon: 'type',    label: 'UI font size',    desc: 'Base font size for the whole interface' },
          ],
        },
      ],
    },
    {
      id:    'bookmarks-panel',
      label: 'Bookmarks Panel',
      icon:  `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`,
      sections: [
        {
          title: 'Panel Behavior',
          rows: [
            { icon: 'pin',     label: 'Pin panel by default', desc: 'Keep the panel open on every new tab' },
            { icon: 'sliders', label: 'Panel width',          desc: 'How wide the panel expands when open' },
          ],
        },
        {
          title: 'Cards',
          rows: [
            { icon: 'eye',    label: 'Card thumbnail',    desc: 'Show or hide bookmark thumbnails' },
            { icon: 'corner', label: 'Card corner radius', desc: 'Roundness of bookmark cards (px)' },
          ],
        },
        {
          title: 'Animation',
          rows: [
            { icon: 'clock', label: 'Close delay', desc: 'How long the panel stays open after the cursor leaves (ms)' },
          ],
        },
        {
          title: 'Tags',
          rows: [
            { icon: 'tag',    label: 'Auto-create site tags', desc: 'Automatically tag bookmarks by their domain' },
          ],
        },
      ],
    },
  ];

  /* ══════════════════════════════════════════════════════════════
     STORAGE HELPERS  (chrome.storage.local, promise-based)
  ══════════════════════════════════════════════════════════════ */
  const CS_PRESETS       = 'bnt_presets';        // { [id]: { name, settings } }
  const CS_ACTIVE_PRESET = 'bnt_active_preset';  // preset id string

  function csGet(keys) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(keys, r => {
        chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve(r);
      });
    });
  }
  function csSet(obj) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set(obj, () => {
        chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve();
      });
    });
  }

  /* ══════════════════════════════════════════════════════════════
     PRESET STATE
  ══════════════════════════════════════════════════════════════ */
  let _presets      = {};   // { [id]: { name: string, settings: object } }
  let _activePreset = 'default';

  async function loadPresets() {
    const data = await csGet([CS_PRESETS, CS_ACTIVE_PRESET]);
    _presets      = data[CS_PRESETS]       || {};
    _activePreset = data[CS_ACTIVE_PRESET] || 'default';
  }

  async function savePresets() {
    await csSet({ [CS_PRESETS]: _presets, [CS_ACTIVE_PRESET]: _activePreset });
  }

  /* ══════════════════════════════════════════════════════════════
     BUILD OVERLAY HTML
  ══════════════════════════════════════════════════════════════ */
  const overlay = document.createElement('div');
  overlay.id = 'bnt-settings-overlay';
  overlay.setAttribute('aria-hidden', 'true');

  overlay.innerHTML = `
    <div id="bnt-settings-panel">

      <!-- ── Sidebar ── -->
      <div id="bnt-settings-sidebar">
        <div id="bnt-settings-logo">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
          </svg>
          <span>Settings</span>
        </div>

        <!-- Search -->
        <div id="bnt-s-search-wrap">
          <span id="bnt-s-search-ico">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </span>
          <input id="bnt-s-search" type="text" placeholder="Search settings…" autocomplete="off" spellcheck="false"/>
          <button id="bnt-s-search-clear" title="Clear">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <nav id="bnt-settings-nav">
          ${CATEGORIES.map(c => `
            <button class="bnt-s-nav-btn" data-cat="${c.id}">
              <span class="bnt-s-nav-ico">${c.icon}</span>
              <span class="bnt-s-nav-label">${c.label}</span>
            </button>
          `).join('')}
        </nav>

        <!-- ── Preset panel (sidebar bottom) ── -->
        <div id="bnt-s-preset-panel">
          <div id="bnt-s-preset-label">Presets</div>

          <div id="bnt-s-preset-dropdown-wrap">
            <button id="bnt-s-preset-btn" title="Switch preset">
              <span id="bnt-s-preset-btn-name">Default</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div id="bnt-s-preset-list" hidden></div>
          </div>

          <div id="bnt-s-preset-actions">
            <button id="bnt-s-import-btn" class="bnt-s-action-btn" title="Import settings from file">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Import
            </button>
            <input id="bnt-s-import-file" type="file" accept=".json" style="display:none">
            <button id="bnt-s-save-btn" class="bnt-s-action-btn bnt-s-save-btn" title="Export active preset to file">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              <span id="bnt-s-save-label">Save</span>
            </button>
          </div>
        </div>
      </div>

      <!-- ── Content area ── -->
      <div id="bnt-settings-content">
        <div id="bnt-settings-header">
          <h2 id="bnt-settings-title"></h2>
          <button id="bnt-settings-close" title="Close settings">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <!-- Body: either category view or search results -->
        <div id="bnt-settings-body">
          <div id="bnt-s-category-view"></div>
          <div id="bnt-s-search-results" hidden></div>
          <div id="bnt-s-no-results" hidden>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <span>No results found</span>
          </div>
        </div>

      </div>
    </div>
  `;

  /* ── Popup: создать/переименовать пресет ─────────────────────
     Единый модальный попап, mode = 'create' | 'rename'
  ── */
  const presetPopup = document.createElement('div');
  presetPopup.id = 'bnt-s-popup-overlay';
  presetPopup.setAttribute('aria-hidden', 'true');
  presetPopup.innerHTML = `
    <div id="bnt-s-popup">
      <div id="bnt-s-popup-title">Save preset</div>
      <input id="bnt-s-popup-input" type="text" placeholder="Preset name…" autocomplete="off" spellcheck="false" maxlength="40">
      <div id="bnt-s-popup-btns">
        <button id="bnt-s-popup-cancel" class="bnt-s-action-btn">Cancel</button>
        <button id="bnt-s-popup-ok"     class="bnt-s-action-btn bnt-s-save-btn">Save</button>
      </div>
    </div>
  `;
  document.body.appendChild(presetPopup);

  document.body.appendChild(overlay);

  /* ── Shortcut refs ─────────────────────────────────────────── */
  const $ = id => overlay.querySelector('#' + id);

  const elTitle        = $('bnt-settings-title');
  const elCategoryView = $('bnt-s-category-view');
  const elSearchRes    = $('bnt-s-search-results');
  const elNoResults    = $('bnt-s-no-results');
  const elSearch       = $('bnt-s-search');
  const elSearchClear  = $('bnt-s-search-clear');

  /* Preset panel refs */
  const elPresetBtn    = $('bnt-s-preset-btn');
  const elPresetBtnName= $('bnt-s-preset-btn-name');
  const elPresetList   = $('bnt-s-preset-list');
  const elSaveBtn      = $('bnt-s-save-btn');
  const elSaveLabel    = $('bnt-s-save-label');
  const elImportBtn    = $('bnt-s-import-btn');
  const elImportFile   = $('bnt-s-import-file');

  /* Popup refs (appended to body, use document.getElementById) */
  const ppOverlay  = document.getElementById('bnt-s-popup-overlay');
  const ppTitle    = document.getElementById('bnt-s-popup-title');
  const ppInput    = document.getElementById('bnt-s-popup-input');
  const ppOk       = document.getElementById('bnt-s-popup-ok');
  const ppCancel   = document.getElementById('bnt-s-popup-cancel');

  /* ══════════════════════════════════════════════════════════════
     RENDER HELPERS
  ══════════════════════════════════════════════════════════════ */

  /** Build a single settings row element */
  /* ══════════════════════════════════════════════════════════════
     CONTROL BUILDERS
     Каждый row.label матчится на свой билдер контрола.
     Добавляя новую строку — добавь case здесь же.
  ══════════════════════════════════════════════════════════════ */

  /** Универсальный toggle-switch */
  function buildToggle(storageKey, defaultVal, onChange) {
    const S = window.BNT_STORAGE;
    const current = S ? (S.getSettings()[storageKey] ?? defaultVal) : defaultVal;

    const label = document.createElement('label');
    label.className = 'bnt-s-toggle bnt-s-control';
    label.innerHTML = `
      <input type="checkbox" ${current ? 'checked' : ''}>
      <span class="bnt-s-toggle-track"></span>
      <span class="bnt-s-toggle-thumb"></span>
    `;
    const input = label.querySelector('input');
    input.addEventListener('change', async () => {
      const v = input.checked;
      if (S) await S.updateSettings({ [storageKey]: v });
      window.dispatchEvent(new CustomEvent('bnt:settings-changed', { detail: { [storageKey]: v } }));
      if (onChange) onChange(v);
    });
    return label;
  }

  /** Универсальный color-picker с кнопкой-кружком */
  function buildColorPicker(storageKey, defaultVal, cssVar) {
    const S = window.BNT_STORAGE;
    const current = S ? (S.getSettings()[storageKey] ?? defaultVal) : defaultVal;

    const btn = document.createElement('div');
    btn.className = 'bnt-s-color-btn bnt-s-control';
    btn.style.background = current;
    btn.innerHTML = `
      <span class="bnt-s-color-btn-ico">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
        </svg>
      </span>
      <input type="color" value="${current}">
    `;
    const input = btn.querySelector('input[type="color"]');

    /* Live preview */
    input.addEventListener('input', () => {
      btn.style.background = input.value;
      if (cssVar) document.documentElement.style.setProperty(cssVar, input.value);
    });

    /* Persist on close */
    input.addEventListener('change', async () => {
      const v = input.value;
      btn.style.background = v;
      if (cssVar) document.documentElement.style.setProperty(cssVar, v);
      if (S) await S.updateSettings({ [storageKey]: v });
      window.dispatchEvent(new CustomEvent('bnt:settings-changed', { detail: { [storageKey]: v } }));
    });

    return btn;
  }

  /** Универсальный слайдер */
  function buildSlider(storageKey, min, max, defaultVal, unit = '', onChange) {
    const S = window.BNT_STORAGE;
    const current = S ? (S.getSettings()[storageKey] ?? defaultVal) : defaultVal;

    const wrap = document.createElement('div');
    wrap.className = 'bnt-s-control bnt-s-slider-wrap';
    wrap.innerHTML = `
      <input type="range" min="${min}" max="${max}" step="1" value="${current}">
      <span class="bnt-s-slider-val">${current}${unit}</span>
    `;
    const slider = wrap.querySelector('input');
    const valEl  = wrap.querySelector('.bnt-s-slider-val');

    slider.addEventListener('input', () => {
      const v = Number(slider.value);
      valEl.textContent = v + unit;
      window.dispatchEvent(new CustomEvent('bnt:settings-changed', { detail: { [storageKey]: v } }));
      if (onChange) onChange(v);
    });
    slider.addEventListener('change', async () => {
      const v = Number(slider.value);
      if (S) await S.updateSettings({ [storageKey]: v });
    });
    return wrap;
  }

  /* ── Build the control element for a settings row ── */
  function buildControl(row) {
    /* ── Bookmarks Panel ── */
    if (row.label === 'Panel width') {
      const { PANEL_WIDTH_MIN_VW, PANEL_WIDTH_MAX_VW, PANEL_WIDTH_DEFAULT } = SETTINGS_CONFIG;
      return buildSlider('panelWidthPct', PANEL_WIDTH_MIN_VW, PANEL_WIDTH_MAX_VW, PANEL_WIDTH_DEFAULT, '%');
    }

    if (row.label === 'Pin panel by default') {
      return buildToggle('pinByDefault', SETTINGS_CONFIG.PIN_DEFAULT);
    }

    if (row.label === 'Card corner radius') {
      const { CARD_RADIUS_MIN, CARD_RADIUS_MAX, CARD_RADIUS_DEFAULT } = SETTINGS_CONFIG;
      return buildSlider('cardRadius', CARD_RADIUS_MIN, CARD_RADIUS_MAX, CARD_RADIUS_DEFAULT, 'px', v => {
        document.documentElement.style.setProperty('--bm-card-radius', v + 'px');
      });
    }

    if (row.label === 'Close delay') {
      const { CLOSE_DELAY_MIN, CLOSE_DELAY_MAX, CLOSE_DELAY_DEFAULT } = SETTINGS_CONFIG;
      return buildSlider('closeDelay', CLOSE_DELAY_MIN, CLOSE_DELAY_MAX, CLOSE_DELAY_DEFAULT, 'ms');
    }

    /* ── Themes & Colors ── */
    if (row.label === 'Main accent') {
      return buildColorPicker('accentMain', SETTINGS_CONFIG.ACCENT_MAIN_DEFAULT, '--accent-main');
    }

    /* Default — placeholder for rows not yet implemented */
    const el = document.createElement('div');
    el.className = 'bnt-s-control bnt-s-placeholder';
    el.textContent = 'Coming soon';
    return el;
  }

  function buildRow(row, highlight = '') {
    const el = document.createElement('div');
    el.className = 'bnt-s-row';

    const labelHtml  = highlight ? hilite(row.label, highlight) : row.label;
    const iconHtml   = row.icon && ICO[row.icon]
      ? `<span class="bnt-s-row-ico">${ICO[row.icon]}</span>`
      : '';

    const labelWrap = document.createElement('div');
    labelWrap.className = 'bnt-s-row-label';
    labelWrap.innerHTML = `
      <span>${labelHtml}</span>
      <span class="bnt-s-row-desc">${row.desc || ''}</span>
    `;

    if (iconHtml) el.insertAdjacentHTML('beforeend', iconHtml);
    el.appendChild(labelWrap);
    el.appendChild(buildControl(row));

    return el;
  }

  /** Wrap matching substring in <mark> */
  function hilite(text, query) {
    if (!query) return text;
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return text;
    return (
      text.slice(0, idx) +
      `<mark>${text.slice(idx, idx + query.length)}</mark>` +
      text.slice(idx + query.length)
    );
  }

  /* ── Render a full category (no search) ─────────────────────── */
  function renderCategory(id) {
    _activeCategory = id;
    const cat = CATEGORIES.find(c => c.id === id) || CATEGORIES[0];

    overlay.querySelectorAll('.bnt-s-nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.cat === id);
    });

    elTitle.textContent = cat.label;
    elCategoryView.innerHTML = '';

    cat.sections.forEach(sec => {
      const secEl = document.createElement('div');
      secEl.className = 'bnt-s-section';

      const titleEl = document.createElement('div');
      titleEl.className = 'bnt-s-section-title';
      titleEl.textContent = sec.title;
      secEl.appendChild(titleEl);

      sec.rows.forEach(row => secEl.appendChild(buildRow(row)));
      elCategoryView.appendChild(secEl);
    });
  }

  /* ── Render search results across all categories ─────────────── */
  function renderSearch(query) {
    const q = query.trim().toLowerCase();

    if (!q) {
      elSearchRes.hidden    = true;
      elNoResults.hidden    = true;
      elCategoryView.hidden = false;
      elTitle.textContent   = (CATEGORIES.find(c => c.id === _activeCategory) || CATEGORIES[0]).label;
      return;
    }

    elCategoryView.hidden = true;
    elTitle.textContent   = 'Search results';
    elSearchRes.innerHTML = '';

    let totalMatches = 0;

    CATEGORIES.forEach(cat => {
      const matchRows = [];
      cat.sections.forEach(sec => {
        sec.rows.forEach(row => {
          if (
            row.label.toLowerCase().includes(q) ||
            (row.desc || '').toLowerCase().includes(q) ||
            sec.title.toLowerCase().includes(q)
          ) {
            matchRows.push(row);
          }
        });
      });

      if (!matchRows.length) return;
      totalMatches += matchRows.length;

      const catLabel = document.createElement('div');
      catLabel.className = 'bnt-s-result-cat';
      catLabel.textContent = cat.label;
      elSearchRes.appendChild(catLabel);

      matchRows.forEach(row => elSearchRes.appendChild(buildRow(row, q)));
    });

    elSearchRes.hidden  = false;
    elNoResults.hidden  = totalMatches > 0;
    if (!totalMatches) elSearchRes.innerHTML = '';
  }

  /* ══════════════════════════════════════════════════════════════
     PRESET UI
     ──────────────────────────────────────────────────────────────
     Логика:
     · _activePreset = 'default' | 'my_settings' | 'preset_<ts>'
     · 'default'     — всегда доступен, хранит defaultSettings(),
                       выбор сбрасывает storage к дефолтам
     · 'my_settings' — автоматически создаётся при первом изменении
                       любого параметра; обновляется при каждом change
     · пользовательские — создаются через попап "Save preset"
     · крестик в списке удаляет пресет (кроме Default)
  ══════════════════════════════════════════════════════════════ */

  /* ── Popup helpers ─────────────────────────────────────────── */
  let _popupResolve = null;

  /** Открывает попап, возвращает Promise<string|null> */
  function openPopup(title, defaultValue = '') {
    ppTitle.textContent   = title;
    ppInput.value         = defaultValue;
    ppOverlay.setAttribute('aria-hidden', 'false');
    ppOverlay.classList.add('visible');
    setTimeout(() => { ppInput.focus(); ppInput.select(); }, 50);

    return new Promise(resolve => {
      _popupResolve = resolve;
    });
  }

  function closePopup(value) {
    ppOverlay.classList.remove('visible');
    ppOverlay.setAttribute('aria-hidden', 'true');
    if (_popupResolve) { _popupResolve(value ?? null); _popupResolve = null; }
  }

  ppOk.addEventListener('click', () => {
    const v = ppInput.value.trim();
    if (v) closePopup(v);
    else ppInput.focus();
  });
  ppCancel.addEventListener('click', () => closePopup(null));
  ppOverlay.addEventListener('mousedown', e => { if (e.target === ppOverlay) closePopup(null); });
  ppInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { ppOk.click(); }
    if (e.key === 'Escape') { closePopup(null); }
  });

  /* ── Refresh dropdown list ─────────────────────────────────── */
  function refreshPresetUI() {
    /* Имя активного пресета на кнопке */
    const activeName = _activePreset === 'default'
      ? 'Default'
      : (_presets[_activePreset]?.name ?? 'Unknown');
    elPresetBtnName.textContent = activeName;

    /* Save кнопка: только если не Default */
    const isDefault = _activePreset === 'default';
    elSaveBtn.classList.toggle('bnt-s-btn-disabled', isDefault);
    elSaveBtn.title = isDefault ? 'Select a preset to export' : 'Export active preset to file';

    /* Список */
    elPresetList.innerHTML = '';

    /* Default */
    const defItem = makePresetItem('default', 'Default', _activePreset === 'default');
    elPresetList.appendChild(defItem);

    /* User presets */
    Object.entries(_presets).forEach(([id, p]) => {
      elPresetList.appendChild(makePresetItem(id, p.name, _activePreset === id, p.imported));
    });

    /* + New preset */
    const addItem = document.createElement('div');
    addItem.className = 'bnt-s-preset-item bnt-s-preset-add';
    addItem.innerHTML = `
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Save current as…
    `;
    addItem.addEventListener('click', async () => {
      closePresetList();
      const name = await openPopup('Save preset', '');
      if (!name) return;
      const id = 'preset_' + Date.now();
      const currentSettings = window.BNT_STORAGE ? window.BNT_STORAGE.getSettings() : {};
      _presets[id]  = { name, settings: { ...currentSettings } };
      _activePreset = id;
      await savePresets();
      refreshPresetUI();
    });
    elPresetList.appendChild(addItem);
  }

  function makePresetItem(id, name, isActive, imported = false) {
    const item = document.createElement('div');
    item.className = 'bnt-s-preset-item' + (isActive ? ' active' : '');
    item.dataset.id = id;

    const nameEl = document.createElement('span');
    nameEl.className = 'bnt-s-preset-item-name';
    nameEl.textContent = name;
    /* Иконка импорта рядом с именем */
    if (imported) {
      nameEl.insertAdjacentHTML('beforeend',
        `<span class="bnt-preset-imported-ico" title="Imported preset">
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        </span>`
      );
    }
    item.appendChild(nameEl);

    /* Крестик (только не у Default) */
    if (id !== 'default') {
      const del = document.createElement('button');
      del.className = 'bnt-s-preset-del';
      del.title = 'Delete preset';
      del.innerHTML = `<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
      del.addEventListener('click', async e => {
        e.stopPropagation();
        delete _presets[id];
        if (_activePreset === id) {
          _activePreset = 'default';
          await applyPreset('default');
        }
        await savePresets();
        refreshPresetUI();
      });
      item.appendChild(del);
    }

    /* Клик по строке = активировать */
    nameEl.addEventListener('click', async () => {
      closePresetList();
      if (_activePreset === id) return;
      _activePreset = id;
      await savePresets();
      await applyPreset(id);
      refreshPresetUI();
    });

    return item;
  }

  /* ── Dropdown open/close ───────────────────────────────────── */
  function openPresetList() {
    refreshPresetUI();
    elPresetList.hidden = false;
    elPresetBtn.classList.add('open');
  }
  function closePresetList() {
    elPresetList.hidden = true;
    elPresetBtn.classList.remove('open');
  }

  elPresetBtn.addEventListener('click', e => {
    e.stopPropagation();
    elPresetList.hidden ? openPresetList() : closePresetList();
  });
  document.addEventListener('click', e => {
    if (!elPresetList.hidden && !elPresetList.contains(e.target) && e.target !== elPresetBtn) {
      closePresetList();
    }
  });

  /* ── Apply preset → записать в BNT_STORAGE и диспатчить события ── */

  /* Флаг: пока applyPreset работает — игнорируем bnt:settings-changed,
     чтобы переключение пресета не порождало автоматический "My settings" */
  let _applyingPreset = false;

  async function applyPreset(id) {
    _applyingPreset = true;
    try {
      const settings = id === 'default'
        ? defaultSettings()
        : (_presets[id]?.settings ?? defaultSettings());

      if (window.BNT_STORAGE) {
        await window.BNT_STORAGE.updateSettings(settings);
      }

      /* Уведомляем подписчиков (bookmarks.js и др.) */
      window.dispatchEvent(new CustomEvent('bnt:settings-changed', { detail: settings }));

      /* FIX 3: перерендериваем текущую категорию — контролы покажут новые значения */
      renderCategory(_activeCategory);

    } finally {
      _applyingPreset = false;
    }
  }

  /* ── Auto-create "My settings" on any settings change ─────────
     Срабатывает только при изменении через контрол (слайдер и т.п.),
     но НЕ при переключении пресета (_applyingPreset = true).

     Логика:
     · Если активен Default → создаём новый "My settings" пресет
     · Если активен "My settings" → обновляем его настройки на месте
     · Если активен любой другой именованный пресет → не трогаем его
  ── */
  const MY_SETTINGS_ID = 'my_settings';

  async function onSettingsChanged(patch) {
    if (_applyingPreset) return;   /* идёт переключение пресета — пропускаем */

    const currentSettings = window.BNT_STORAGE ? window.BNT_STORAGE.getSettings() : {};
    const merged = { ...currentSettings, ...patch };

    if (_activePreset === 'default') {
      /* Default → создаём новый "My settings #N" */
      const existingCount = Object.values(_presets)
        .filter(p => p.name.startsWith('My settings')).length;
      const name = existingCount === 0 ? 'My settings' : `My settings #${existingCount + 1}`;
      const id   = 'my_settings_' + Date.now();
      _presets[id] = { name, settings: merged };
      _activePreset = id;
    } else if (_presets[_activePreset]) {
      /* Любой существующий пресет (включая My settings и импортированные)
         → обновляем его настройки на месте */
      _presets[_activePreset].settings = merged;
    }

    await savePresets();
    refreshPresetUI();
  }

  /* Слушаем событие change со слайдеров/контролов */
  window.addEventListener('bnt:settings-changed', async e => {
    if (e.detail) await onSettingsChanged(e.detail);
  });

  /* ══════════════════════════════════════════════════════════════
     SAVE (export to JSON file)
  ══════════════════════════════════════════════════════════════ */

  elSaveBtn.addEventListener('click', async () => {
    if (elSaveBtn.classList.contains('bnt-s-btn-disabled')) return;

    /* Visual feedback */
    elSaveLabel.textContent = 'Saving…';
    elSaveBtn.disabled = true;

    try {
      const currentSettings = window.BNT_STORAGE
        ? window.BNT_STORAGE.getSettings()
        : {};

      const payload = {
        _version:  1,
        _exported: new Date().toISOString(),
        presetName: _presets[_activePreset]?.name || 'Unnamed',
        settings:  currentSettings,
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `bnt-settings-${payload.presetName.replace(/\s+/g, '-').toLowerCase()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      elSaveLabel.textContent = '✓ Saved';
      setTimeout(() => { elSaveLabel.textContent = 'Save'; elSaveBtn.disabled = false; }, 1800);
    } catch (err) {
      console.error('[BNT] Settings save failed:', err);
      elSaveLabel.textContent = 'Error';
      setTimeout(() => { elSaveLabel.textContent = 'Save'; elSaveBtn.disabled = false; }, 2000);
    }
  });

  /* ══════════════════════════════════════════════════════════════
     IMPORT (read JSON file)
  ══════════════════════════════════════════════════════════════ */

  elImportBtn.addEventListener('click', () => elImportFile.click());

  elImportFile.addEventListener('change', async () => {
    const file = elImportFile.files[0];
    if (!file) return;
    elImportFile.value = ''; /* reset so same file can be re-imported */

    try {
      const text    = await file.text();
      const payload = JSON.parse(text);

      if (!payload.settings || typeof payload.settings !== 'object') {
        if (window.BNT_TOAST) {
          window.BNT_TOAST.show({ title: 'Invalid settings file', type: 'error', duration: 4000 });
        }
        return;
      }

      /* Apply settings via BNT_STORAGE if available */
      if (window.BNT_STORAGE) {
        await window.BNT_STORAGE.updateSettings(payload.settings);
      }

      /* Optionally store as a new preset */
      const name = payload.presetName
        ? payload.presetName
        : 'Imported ' + new Date().toLocaleString();

      const id = 'preset_' + Date.now();
      _presets[id]  = { name, settings: { ...payload.settings }, imported: true };
      _activePreset = id;
      await savePresets();
      refreshPresetUI();
      /* Применяем импортированные настройки на страницу */
      window.dispatchEvent(new CustomEvent('bnt:settings-changed', { detail: payload.settings }));

      if (window.BNT_TOAST) {
        window.BNT_TOAST.show({
          title:   `Preset "${name}" imported`,
          message: 'Settings applied and saved as a new preset',
          type:    'success',
          duration: 4000,
        });
      }
    } catch (err) {
      console.error('[BNT] Settings import failed:', err);
      if (window.BNT_TOAST) {
        window.BNT_TOAST.show({
          title:   'Import failed',
          message: 'Make sure it is a valid JSON export',
          type:    'error',
          duration: 5000,
        });
      }
    }
  });

  /* ══════════════════════════════════════════════════════════════
     SEARCH EVENTS
  ══════════════════════════════════════════════════════════════ */

  elSearch.addEventListener('input', () => {
    const q = elSearch.value;
    elSearchClear.classList.toggle('visible', q.length > 0);
    renderSearch(q);
  });

  elSearchClear.addEventListener('click', () => {
    elSearch.value = '';
    elSearchClear.classList.remove('visible');
    renderSearch('');
  });

  /* ══════════════════════════════════════════════════════════════
     OPEN / CLOSE
  ══════════════════════════════════════════════════════════════ */
  let _activeCategory = CATEGORIES[0].id;

  async function open(categoryId) {
    /* Load presets fresh each time overlay opens */
    await loadPresets();
    refreshPresetUI();

    /* Clear search */
    elSearch.value = '';
    elSearchClear.classList.remove('visible');
    elSearchRes.hidden    = true;
    elNoResults.hidden    = true;
    elCategoryView.hidden = false;

    renderCategory(categoryId || _activeCategory);
    overlay.setAttribute('aria-hidden', 'false');
    overlay.classList.add('bnt-settings-visible');
    document.body.classList.add('bnt-settings-open');
  }

  function close() {
    overlay.classList.remove('bnt-settings-visible');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('bnt-settings-open');
  }

  /* ══════════════════════════════════════════════════════════════
     EVENT LISTENERS
  ══════════════════════════════════════════════════════════════ */

  $('bnt-settings-close').addEventListener('click', close);

  /* Click backdrop closes */
  overlay.addEventListener('mousedown', e => {
    if (e.target === overlay) close();
  });

  /* Nav buttons */
  overlay.querySelectorAll('.bnt-s-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      /* Clear search when switching categories manually */
      elSearch.value = '';
      elSearchClear.classList.remove('visible');
      elSearchRes.hidden    = true;
      elNoResults.hidden    = true;
      elCategoryView.hidden = false;
      renderCategory(btn.dataset.cat);
    });
  });

  /* Escape key */
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('bnt-settings-visible')) {
      close();
    }
  });

  /* ══════════════════════════════════════════════════════════════
     EXPOSE API
  ══════════════════════════════════════════════════════════════ */
  window.BNT_SETTINGS = { open, close, CATEGORIES };
})();
