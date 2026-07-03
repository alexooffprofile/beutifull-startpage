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
    ACCENT_MAIN_DEFAULT   : '#7eff84',

    /**
     * Акцент строки поиска (hex). Применяется к --accent-search.
     */
    ACCENT_SEARCH_DEFAULT : '#7b93ff',

    /**
     * Акцент командной палитры (hex). Применяется к --accent-cmd.
     */
    ACCENT_CMD_DEFAULT    : '#ff7eb3',

    /**
     * Автоматически адаптировать background панелей под акцентный цвет.
     * true = panel bg следует за accentMain (авто), false = ручной выбор.
     */
    AUTO_PANEL_BG_DEFAULT : false,

    /**
     * Цвет background панелей (hex). Используется только при AUTO_PANEL_BG = false.
     */
    PANEL_BG_DEFAULT      : '#16181f',

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
      accentSearch   : SETTINGS_CONFIG.ACCENT_SEARCH_DEFAULT,
      accentCmd      : SETTINGS_CONFIG.ACCENT_CMD_DEFAULT,
      autoPanelBg    : SETTINGS_CONFIG.AUTO_PANEL_BG_DEFAULT,
      panelBg        : SETTINGS_CONFIG.PANEL_BG_DEFAULT,
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
      id:    'wallpaper',
      label: 'Wallpaper',
      icon:  `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`,
      sections: [
        {
          rows: [
            { icon: 'image', label: 'Wallpaper', desc: 'Main page background' },
          ],
        },
      ],
    },
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
      icon:  `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10c0 1.657-1.343 3-3 3h-1.5a1.5 1.5 0 0 0 0 3H18"/><circle cx="8.5" cy="10.5" r="1.5" fill="currentColor" stroke="none"/><circle cx="13.5" cy="7.5" r="1.5" fill="currentColor" stroke="none"/><circle cx="17.5" cy="12.5" r="1.5" fill="currentColor" stroke="none"/><circle cx="8.5" cy="14.5" r="1.5" fill="currentColor" stroke="none"/></svg>`,
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
            { icon: 'eye',     label: 'Adaptive panel tint', desc: 'Automatically tint panel background to match the main accent' },
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
  let _panelBgPickerBtn   = null;  // ref to color btn in panel bg row
  let _panelBgPickerInput = null;  // ref to <input type=color> in panel bg row

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

  /**
   * Builds TWO rows for "Auto panel bg" toggle + "Panel bg color" picker.
   * Returns a DocumentFragment containing both .bnt-s-row elements.
   */
  function buildAutoPanelBgRows() {
    const S = window.BNT_STORAGE;
    const settings = S ? S.getSettings() : {};
    const autoOn = settings.autoPanelBg ?? SETTINGS_CONFIG.AUTO_PANEL_BG_DEFAULT;
    const panelBgVal = settings.panelBg ?? SETTINGS_CONFIG.PANEL_BG_DEFAULT;

    const frag = document.createDocumentFragment();

    /* ── Row 1: Toggle ── */
    const toggleRow = document.createElement('div');
    toggleRow.className = 'bnt-s-row';
    toggleRow.innerHTML = `
      <span class="bnt-s-row-ico">${ICO['eye']}</span>
      <div class="bnt-s-row-label">
        <span>Adaptive panel tint</span>
        <span class="bnt-s-row-desc">Automatically tint panel background to match the main accent</span>
      </div>
    `;

    /* We need references to colorRow / colorPickerInput before toggle callback — declare vars */
    let colorRow, colorBtn, colorPickerInput;

    const toggleCtrl = buildToggle('autoPanelBg', SETTINGS_CONFIG.AUTO_PANEL_BG_DEFAULT, v => {
      colorRow.classList.toggle('bnt-s-row--disabled', v);
      colorPickerInput.disabled = v;
      if (v) {
        const accent = (S ? S.getSettings().accentMain : null) ?? SETTINGS_CONFIG.ACCENT_MAIN_DEFAULT;
        const derived = derivePanelBg(accent);
        applyPanelBg(derived);
        colorBtn.style.background = derived;
      }
    });
    toggleRow.appendChild(toggleCtrl);
    frag.appendChild(toggleRow);

    /* ── Row 2: Color picker (locked when auto is on) ── */
    colorRow = document.createElement('div');
    colorRow.className = 'bnt-s-row' + (autoOn ? ' bnt-s-row--disabled' : '');
    colorRow.innerHTML = `
      <span class="bnt-s-row-ico">${ICO['brush']}</span>
      <div class="bnt-s-row-label">
        <span>Panel background</span>
        <span class="bnt-s-row-desc">Background color of panels, cards and dropdowns</span>
      </div>
    `;

    colorBtn = document.createElement('div');
    colorBtn.className = 'bnt-s-color-btn bnt-s-control';
    const previewColor = autoOn
      ? derivePanelBg((S ? S.getSettings().accentMain : null) ?? SETTINGS_CONFIG.ACCENT_MAIN_DEFAULT)
      : panelBgVal;
    colorBtn.style.background = previewColor;
    colorBtn.innerHTML = `
      <span class="bnt-s-color-btn-ico">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
        </svg>
      </span>
      <input type="color" value="${panelBgVal}" ${autoOn ? 'disabled' : ''}>
    `;
    colorPickerInput = colorBtn.querySelector('input[type="color"]');

    colorPickerInput.addEventListener('input', () => {
      if (colorPickerInput.disabled) return;
      colorBtn.style.background = colorPickerInput.value;
      applyPanelBg(colorPickerInput.value);
    });
    colorPickerInput.addEventListener('change', async () => {
      if (colorPickerInput.disabled) return;
      const v = colorPickerInput.value;
      colorBtn.style.background = v;
      applyPanelBg(v);
      if (S) await S.updateSettings({ panelBg: v });
      window.dispatchEvent(new CustomEvent('bnt:settings-changed', { detail: { panelBg: v } }));
    });

    colorRow.appendChild(colorBtn);
    frag.appendChild(colorRow);

    /* Store refs so global onSettingsChanged can update picker when accent changes */
    _panelBgPickerBtn   = colorBtn;
    _panelBgPickerInput = colorPickerInput;

    return frag;
  }

  /** Convert hex color → rgba glow string (alpha 0.18) */
  function hexToGlow(hex, alpha = 0.18) {
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  /** Apply accent color + its derived glow to CSS variables */
  function applyAccentMain(hex) {
    const root = document.documentElement;
    root.style.setProperty('--accent-main', hex);
    root.style.setProperty('--accent-main-glow', hexToGlow(hex, 0.18));
    root.style.setProperty('--accent-main-glow-sm', hexToGlow(hex, 0.12));
    /* If auto panel bg is on — update panel bg too */
    const S = window.BNT_STORAGE;
    const autoPanelBg = S ? (S.getSettings().autoPanelBg ?? SETTINGS_CONFIG.AUTO_PANEL_BG_DEFAULT) : SETTINGS_CONFIG.AUTO_PANEL_BG_DEFAULT;
    if (autoPanelBg) applyPanelBg(derivePanelBg(hex));
  }

  function applyAccentSearch(hex) {
    const root = document.documentElement;
    root.style.setProperty('--accent-search', hex);
    root.style.setProperty('--accent-search-glow', hexToGlow(hex, 0.14));
  }

  function applyAccentCmd(hex) {
    const root = document.documentElement;
    root.style.setProperty('--accent-cmd', hex);
    root.style.setProperty('--accent-cmd-glow', hexToGlow(hex, 0.14));
  }

  /**
   * accent → panelBg hex (--surface2 level, mix ~2.5%)
   * Produces a colour close to the base but with a breath of accent hue.
   */
  function derivePanelBg(accentHex) {
    const h = accentHex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    const mix = 0.012;
    const t = (base, ch) => Math.round(base + (ch - base) * mix);
    // Returns hex string so color picker can show it
    const to2 = n => n.toString(16).padStart(2, '0');
    return '#' + to2(t(30,r)) + to2(t(32,g)) + to2(t(41,b));
  }

  /**
   * panelBg hex → full surface palette.
   * All other levels are derived relative to panelBg with fixed deltas,
   * so the whole UI shifts together whether the colour came from accent
   * adaptation or from the user's manual pick.
   * panelBg is treated as --surface2 (mid level).
   * Deltas from original: bg=-16/-17/-22, s1=-8/-8/-10, s2=0, s3=+7/+7/+7
   */
  function applyPanelBg(panelBgHex) {
    const h = panelBgHex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    const clamp = v => Math.max(0, Math.min(255, v));
    const rgb = (dr, dg, db) => `rgb(${clamp(r+dr)},${clamp(g+dg)},${clamp(b+db)})`;
    const root = document.documentElement;
    root.style.setProperty('--panel-bg', panelBgHex);
    root.style.setProperty('--bg',       rgb(-16, -17, -22));
    root.style.setProperty('--surface',  rgb( -8,  -8, -10));
    root.style.setProperty('--surface2', panelBgHex);
    root.style.setProperty('--surface3', rgb(  7,   7,   7));
  }

  /** Универсальный color-picker с кнопкой-кружком */
  function buildColorPicker(storageKey, defaultVal, cssVar, applyFn = null) {
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
      if (applyFn) {
        applyFn(input.value);
      } else if (cssVar) {
        document.documentElement.style.setProperty(cssVar, input.value);
      }
    });

    /* Persist on close */
    input.addEventListener('change', async () => {
      const v = input.value;
      btn.style.background = v;
      if (applyFn) {
        applyFn(v);
      } else if (cssVar) {
        document.documentElement.style.setProperty(cssVar, v);
      }
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
  /* ══════════════════════════════════════════════════════════════
     WALLPAPER SECTION
  ══════════════════════════════════════════════════════════════ */

  const WP_TYPES = [
    { id: 'solid',         label: 'Solid Color' },
    { id: 'linear',        label: 'Linear Gradient' },
    { id: 'radial-points', label: 'Radial Points' },
    { id: 'image',         label: 'Static Image' },
    { id: 'video',         label: 'Video / GIF' },
    { id: 'app',           label: 'App / Widget' },
  ];

  let _wpType     = 'radial-points';
  let _wpViewMode = 'customization'; /* 'customization' | 'zones' */
  let _radialBgColor = '#0e0f13';
  const _radialPoints = [
    { x: 15, y: 22, color: '#7b93ff', radius: 55 },
    { x: 82, y: 74, color: '#ff7eb3', radius: 42 },
  ];

  /* Helper: make a standard bnt-s-row element */
  function wpMakeRow(iconKey, label, desc, ctrl) {
    const el = document.createElement('div');
    el.className = 'bnt-s-row';
    const ico = ICO[iconKey] ? `<span class="bnt-s-row-ico">${ICO[iconKey]}</span>` : '';
    const labelWrap = document.createElement('div');
    labelWrap.className = 'bnt-s-row-label';
    labelWrap.innerHTML = `<span>${label}</span><span class="bnt-s-row-desc">${desc}</span>`;
    el.innerHTML = ico;
    el.appendChild(labelWrap);
    if (ctrl) { ctrl.classList.add('bnt-s-control'); el.appendChild(ctrl); }
    return el;
  }

  /* Helper: make a standard slider control */
  function wpSlider(min, max, val, unit, onInput) {
    const wrap = document.createElement('div');
    wrap.className = 'bnt-s-slider-wrap';
    wrap.innerHTML = `<input type="range" min="${min}" max="${max}" step="1" value="${val}"><span class="bnt-s-slider-val">${val}${unit}</span>`;
    const input = wrap.querySelector('input');
    const valEl = wrap.querySelector('.bnt-s-slider-val');
    input.addEventListener('input', () => {
      valEl.textContent = input.value + unit;
      if (onInput) onInput(Number(input.value));
    });
    return wrap;
  }

  /* Helper: pill group control */
  function wpPills(options, activeIdx = 0, onChange) {
    const wrap = document.createElement('div');
    wrap.className = 'bnt-wp-pills';
    options.forEach((opt, i) => {
      const btn = document.createElement('button');
      btn.className = 'bnt-wp-pill' + (i === activeIdx ? ' active' : '');
      btn.textContent = opt;
      btn.addEventListener('click', () => {
        wrap.querySelectorAll('.bnt-wp-pill').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        if (onChange) onChange(opt, i);
      });
      wrap.appendChild(btn);
    });
    return wrap;
  }

  /* Helper: color button (matches bnt-s-color-btn style) */
  function wpColorBtn(hex) {
    const btn = document.createElement('button');
    btn.className = 'bnt-s-color-btn';
    btn.style.background = hex;
    btn.innerHTML = `<input type="color" value="${hex}">`;
    const inp = btn.querySelector('input');
    inp.addEventListener('input', () => { btn.style.background = inp.value; });
    return btn;
  }

  /* ── TEMPLATE: SOURCE ROW ── */
  function wpSourceRow(labelText, placeholder, accept) {
    const row = document.createElement('div');
    row.className = 'bnt-s-row bnt-s-row--source';
    row.innerHTML = `
      <div class="bnt-wp-src-header">
        <span class="bnt-s-row-ico">${ICO['image'] || ''}</span>
        <div class="bnt-s-row-label">
          <span>${labelText}</span>
          <span class="bnt-s-row-desc">File or URL</span>
        </div>
      </div>
      <div class="bnt-wp-src-body">
        <label class="bnt-wp-src-upload">
          <input type="file" accept="${accept}" hidden>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <span>Upload</span>
        </label>
        <div class="bnt-wp-src-url-wrap">
          <input type="text" class="bnt-wp-src-url" placeholder="${placeholder}">
          <button class="bnt-wp-src-paste-btn" title="Paste from clipboard">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
          </button>
        </div>
      </div>
    `;
    row.querySelector('.bnt-wp-src-paste-btn').addEventListener('click', async () => {
      try { row.querySelector('.bnt-wp-src-url').value = await navigator.clipboard.readText(); } catch {}
    });
    const fi = row.querySelector('input[type="file"]');
    fi.addEventListener('change', () => {
      if (fi.files[0]) {
        const n = fi.files[0].name;
        row.querySelector('.bnt-wp-src-upload span').textContent = n.length > 16 ? n.slice(0,15)+'…' : n;
      }
    });
    return row;
  }

  /* ── TEMPLATE: 2D POSITION PAD ── */
  /* move-arrows icon for Position */
  const ICO_MOVE = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg>`;

  function wpOffsetPad(initX, initY, onMove) {
    /* px: -100..100 (right = positive)
       py: -100..100 (UP = positive — inverted from screen coords) */
    let px = initX || 0, py = initY || 0;
    const row = document.createElement('div');
    row.className = 'bnt-s-row bnt-s-row--2d-pad';
    row.innerHTML = `
      <div class="bnt-wp-pad-header">
        <span class="bnt-s-row-ico bnt-wp-pad-ico">${ICO_MOVE}</span>
        <div class="bnt-s-row-label">
          <span>Position</span>
          <span class="bnt-s-row-desc">Drag to offset image on canvas</span>
        </div>
        <div class="bnt-wp-pad-vals">
          <label class="bnt-wp-pad-val-wrap">
            <span class="bnt-wp-pad-axis-lbl" style="color:#7eb3ff">X</span>
            <input type="number" class="bnt-wp-pad-input bnt-wp-pad-x-input" value="0" min="-100" max="100" step="1">
            <span class="bnt-wp-pad-unit">%</span>
          </label>
          <label class="bnt-wp-pad-val-wrap">
            <span class="bnt-wp-pad-axis-lbl" style="color:#ff7eb3">Y</span>
            <input type="number" class="bnt-wp-pad-input bnt-wp-pad-y-input" value="0" min="-100" max="100" step="1">
            <span class="bnt-wp-pad-unit">%</span>
          </label>
          <button class="bnt-wp-pad-reset" title="Reset to center">↺</button>
        </div>
      </div>
      <div class="bnt-wp-pad-area">
        <div class="bnt-wp-pad-line bnt-wp-pad-line--h"></div>
        <div class="bnt-wp-pad-line bnt-wp-pad-line--v"></div>
        <div class="bnt-wp-pad-dot"></div>
      </div>
    `;
    const area  = row.querySelector('.bnt-wp-pad-area');
    const dot   = row.querySelector('.bnt-wp-pad-dot');
    const xi    = row.querySelector('.bnt-wp-pad-x-input');
    const yi    = row.querySelector('.bnt-wp-pad-y-input');

    function upd(skipInputs) {
      /* screen: top=0, bottom=100 → Y on screen bottom is +100% visually
         we want UP = positive, so flip: screen_top  → py positive */
      dot.style.left = ((px + 100) / 200 * 100) + '%';
      dot.style.top  = ((-py + 100) / 200 * 100) + '%';  /* flipped */
      if (!skipInputs) { xi.value = px; yi.value = py; }
      /* glow colour changes with distance from center */
      const dist = Math.sqrt(px*px + py*py) / 141;
      const alpha = 0.3 + dist * 0.5;
      dot.style.boxShadow = `0 0 0 2px var(--surface3), 0 0 ${8 + dist*18}px ${dist*6}px rgba(var(--accent-main-rgb, 123,147,255),${alpha})`;
      if (onMove) onMove(px, py);
    }

    let drag = false;
    dot.addEventListener('mousedown', e => { e.preventDefault(); drag = true; dot.classList.add('dragging'); });
    document.addEventListener('mousemove', e => {
      if (!drag) return;
      const r = area.getBoundingClientRect();
      px = Math.round(Math.max(-100, Math.min(100, (e.clientX - r.left) / r.width  * 200 - 100)));
      py = Math.round(Math.max(-100, Math.min(100, -((e.clientY - r.top)  / r.height * 200 - 100)))); /* flipped */
      upd(false);
    });
    document.addEventListener('mouseup', () => { if (drag) { drag = false; dot.classList.remove('dragging'); } });
    area.addEventListener('click', e => {
      if (e.target === dot) return;
      const r = area.getBoundingClientRect();
      px = Math.round((e.clientX - r.left) / r.width  * 200 - 100);
      py = Math.round(-((e.clientY - r.top) / r.height * 200 - 100));
      upd(false);
    });
    xi.addEventListener('input', () => { px = Math.max(-100, Math.min(100, Number(xi.value)||0)); upd(true); });
    yi.addEventListener('input', () => { py = Math.max(-100, Math.min(100, Number(yi.value)||0)); upd(true); });
    row.querySelector('.bnt-wp-pad-reset').addEventListener('click', () => { px = 0; py = 0; upd(false); });
    upd(false);
    return row;
  }

  /* ── TEMPLATE: PILL-SELECT ROW ── */
  function buildPillSelectRow(iconKey, label, desc, options, activeIdx, onChange) {
    const row = document.createElement('div');
    row.className = 'bnt-s-row bnt-s-row--pill-select';
    if (iconKey && ICO[iconKey]) {
      const ico = document.createElement('span');
      ico.className = 'bnt-s-row-ico';
      ico.innerHTML = ICO[iconKey];
      row.appendChild(ico);
    }
    const lw = document.createElement('div');
    lw.className = 'bnt-s-row-label';
    lw.innerHTML = `<span>${label}</span><span class="bnt-s-row-desc">${desc}</span>`;
    row.appendChild(lw);
    const pg = document.createElement('div');
    pg.className = 'bnt-s-pill-group';
    options.forEach((opt, i) => {
      const o = typeof opt === 'string' ? { label: opt, id: opt } : opt;
      const btn = document.createElement('button');
      btn.className = 'bnt-s-pill-btn' + (i === activeIdx ? ' active' : '') + (o.disabled ? ' bnt-s-pill-disabled' : '');
      btn.innerHTML = o.label + (o.soon ? '<span class="bnt-s-pill-soon">soon</span>' : '');
      if (!o.disabled) btn.addEventListener('click', () => {
        pg.querySelectorAll('.bnt-s-pill-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (onChange) onChange(o, i);
      });
      pg.appendChild(btn);
    });
    row.appendChild(pg);
    return row;
  }

  /* Build the type-selector dropdown control (standard bnt-s-control) */
  function buildWpTypeDropdown(dynamicContainer) {
    const wrap = document.createElement('div');
    wrap.className = 'bnt-wp-type-wrap bnt-s-control';

    const btn = document.createElement('button');
    btn.className = 'bnt-wp-type-btn';
    const cur = WP_TYPES.find(t => t.id === _wpType) || WP_TYPES[2];
    btn.innerHTML = `<span class="bnt-wp-type-label">${cur.label}</span><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>`;

    const menu = document.createElement('div');
    menu.className = 'bnt-wp-type-menu';

    WP_TYPES.forEach(t => {
      const item = document.createElement('button');
      item.className = 'bnt-wp-type-item' + (t.id === _wpType ? ' active' : '');
      item.textContent = t.label;
      if (t.id === 'app') item.innerHTML += ' <span class="bnt-wp-soon">soon</span>';
      item.addEventListener('click', () => {
        if (t.id === 'app') { closeMenu(); showAppWidgetStub(); return; }
        _wpType = t.id;
        menu.querySelectorAll('.bnt-wp-type-item').forEach(el => el.classList.remove('active'));
        item.classList.add('active');
        btn.querySelector('.bnt-wp-type-label').textContent = t.label;
        closeMenu();
        renderWpDynamic(dynamicContainer);
      });
      menu.appendChild(item);
    });

    function openMenu()  { menu.classList.add('open'); }
    function closeMenu() { menu.classList.remove('open'); }
    btn.addEventListener('click', e => { e.stopPropagation(); menu.classList.contains('open') ? closeMenu() : openMenu(); });
    document.addEventListener('click', closeMenu);

    wrap.appendChild(btn);
    wrap.appendChild(menu);
    return wrap;
  }

  function renderWpDynamic(container) {
    container.innerHTML = '';
    switch (_wpType) {
      case 'solid':         wpRows_Solid(container);  break;
      case 'linear':        wpRows_Linear(container); break;
      case 'radial-points': wpRows_Radial(container); break;
      case 'image':         wpRows_Image(container);  break;
      case 'video':         wpRows_Video(container);  break;
    }
  }

  /* ── TYPE 1: Solid ── */
  function wpRows_Solid(c) {
    const colorBtn = wpColorBtn('#0e0f13');
    colorBtn.querySelector('input').addEventListener('input', e => {
      const canvas = document.querySelector('.bnt-wp-canvas--solid');
      if (canvas) canvas.style.background = e.target.value;
    });
    c.appendChild(wpMakeRow('brush', 'Color', 'Background fill color', colorBtn));
    wpAppendOverlayRows(c);
  }

  /* ── TYPE 2: Linear Gradient ── */
  function wpRows_Linear(c) {
    /* State: stops array + angle */
    let stops = [
      { pos: 0,   color: '#0e0f13' },
      { pos: 100, color: '#1a1f3a' },
    ];
    let angle = 135;
    let selIdx = null;

    const row = document.createElement('div');
    row.className = 'bnt-s-row bnt-s-row--grad-editor';
    row.innerHTML = `
      <div class="bnt-wp-grad-header">
        <span class="bnt-s-row-ico">${ICO['palette'] || ''}</span>
        <div class="bnt-s-row-label">
          <span>Gradient</span>
          <span class="bnt-s-row-desc">Click stop to edit · Drag to reposition · Double-click track to add</span>
        </div>
      </div>
      <div class="bnt-wp-grad-body">
        <div class="bnt-wp-grad-track-wrap">
          <div class="bnt-wp-grad-preview-strip"></div>
          <div class="bnt-wp-grad-stops-row"></div>
        </div>
        <div class="bnt-wp-grad-stop-editor" style="display:none">
          <div class="bnt-wp-grad-ed-row">
            <span class="bnt-wp-grad-ed-lbl">Color</span>
            <input type="color" class="bnt-wp-grad-ed-color" value="#0e0f13">
          </div>
          <div class="bnt-wp-grad-ed-row">
            <span class="bnt-wp-grad-ed-lbl">Position</span>
            <input type="range" class="bnt-wp-grad-ed-pos" min="0" max="100" step="1" value="0">
            <span class="bnt-wp-grad-ed-posval">0%</span>
          </div>
          <button class="bnt-wp-grad-ed-del">Remove</button>
        </div>
        <div class="bnt-wp-grad-footer">
          <div class="bnt-wp-grad-angle-wrap">
            <span class="bnt-wp-grad-angle-lbl">${ICO['eye'] || ''}Angle</span>
            <input type="range" class="bnt-wp-grad-angle-slider" min="0" max="360" step="1" value="135">
            <input type="number" class="bnt-wp-grad-angle-num" min="0" max="360" value="135">
            <span class="bnt-wp-grad-angle-unit">°</span>
          </div>
        </div>
      </div>
    `;
    c.appendChild(row);

    const previewStrip = row.querySelector('.bnt-wp-grad-preview-strip');
    const stopsRow     = row.querySelector('.bnt-wp-grad-stops-row');
    const editor       = row.querySelector('.bnt-wp-grad-stop-editor');
    const edColor      = row.querySelector('.bnt-wp-grad-ed-color');
    const edPos        = row.querySelector('.bnt-wp-grad-ed-pos');
    const edPosVal     = row.querySelector('.bnt-wp-grad-ed-posval');
    const edDel        = row.querySelector('.bnt-wp-grad-ed-del');
    const angleSlider  = row.querySelector('.bnt-wp-grad-angle-slider');
    const angleNum     = row.querySelector('.bnt-wp-grad-angle-num');

    function cssGradient() {
      const sorted = [...stops].sort((a,b) => a.pos - b.pos);
      const stops_css = sorted.map(s => `${s.color} ${s.pos}%`).join(', ');
      return `linear-gradient(${angle}deg, ${stops_css})`;
    }

    function repaint() {
      previewStrip.style.background = cssGradient();
      /* live canvas update */
      const canvas = document.querySelector('.bnt-wp-canvas--linear');
      if (canvas) canvas.style.background = cssGradient();
      renderStops();
    }

    function renderStops() {
      stopsRow.innerHTML = '';
      stops.forEach((s, i) => {
        const pin = document.createElement('div');
        pin.className = 'bnt-wp-grad-pin' + (i === selIdx ? ' selected' : '');
        pin.style.cssText = `left:${s.pos}%;background:${s.color};box-shadow:0 0 0 2px ${s.color},0 0 0 3.5px rgba(255,255,255,0.5)`;
        /* left-click OR right-click to open editor */
        pin.addEventListener('click', e => { e.stopPropagation(); selectStop(i); });
        pin.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); selectStop(i); });
        /* drag — only left button */
        let drag = false, startX, startPos;
        pin.addEventListener('mousedown', e => {
          if (e.button !== 0) return;
          e.preventDefault(); drag = true;
          startX = e.clientX; startPos = s.pos;
          pin.classList.add('dragging');
        });
        document.addEventListener('mousemove', e => {
          if (!drag) return;
          const r = stopsRow.getBoundingClientRect();
          s.pos = Math.max(0, Math.min(100, startPos + (e.clientX - startX) / r.width * 100));
          s.pos = Math.round(s.pos);
          pin.style.left = s.pos + '%';
          if (i === selIdx) { edPos.value = s.pos; edPosVal.textContent = s.pos + '%'; }
          repaint();
        });
        document.addEventListener('mouseup', () => { if (drag) { drag = false; pin.classList.remove('dragging'); renderStops(); } });
        stopsRow.appendChild(pin);
      });
    }

    function selectStop(i) {
      selIdx = i;
      const s = stops[i];
      edColor.value = s.color;
      edPos.value   = s.pos;
      edPosVal.textContent = s.pos + '%';
      editor.style.display = 'flex';
      edDel.style.display = stops.length > 2 ? 'inline-flex' : 'none';
      renderStops();
    }

    edColor.addEventListener('input', () => {
      if (selIdx === null) return;
      stops[selIdx].color = edColor.value;
      repaint();
    });
    edPos.addEventListener('input', () => {
      if (selIdx === null) return;
      stops[selIdx].pos = Number(edPos.value);
      edPosVal.textContent = edPos.value + '%';
      repaint();
    });
    edDel.addEventListener('click', () => {
      if (selIdx === null || stops.length <= 2) return;
      stops.splice(selIdx, 1);
      selIdx = null;
      editor.style.display = 'none';
      repaint();
    });

    /* double-click track to add stop */
    previewStrip.addEventListener('dblclick', e => {
      const r = previewStrip.getBoundingClientRect();
      const pos = Math.round((e.clientX - r.left) / r.width * 100);
      /* interpolate color from existing gradient */
      const sorted = [...stops].sort((a,b) => a.pos - b.pos);
      let color = sorted[0].color;
      for (let i = 0; i < sorted.length - 1; i++) {
        if (pos >= sorted[i].pos && pos <= sorted[i+1].pos) {
          color = sorted[i].color; break;
        }
      }
      stops.push({ pos, color });
      selectStop(stops.length - 1);
      repaint();
    });

    /* angle — slider wraps 0↔360, num input unbounded then normalised */
    function setAngle(v) {
      angle = ((Number(v) % 360) + 360) % 360;
      angleSlider.value = angle; angleNum.value = angle;
      repaint();
    }
    angleSlider.addEventListener('input', () => setAngle(angleSlider.value));
    /* wrap: when slider hits 0 or 360 extremes, loop it */
    angleSlider.addEventListener('change', () => {
      if (Number(angleSlider.value) === 360) { angle = 0; angleSlider.value = 0; angleNum.value = 0; repaint(); }
    });
    angleNum.addEventListener('input', () => setAngle(angleNum.value));

    /* click outside editor to deselect */
    document.addEventListener('click', e => {
      if (!row.contains(e.target)) { selIdx = null; editor.style.display = 'none'; renderStops(); }
    });

    repaint();
    wpAppendOverlayRows(c);
  }

  /* ── TYPE 3: Radial Points ── */
  function wpRows_Radial(c) {
    const bgColorBtn = wpColorBtn(_radialBgColor);
    bgColorBtn.querySelector('input').addEventListener('input', e => {
      _radialBgColor = e.target.value;
      const canvas = document.querySelector('.bnt-wp-canvas--radial-points');
      if (canvas) canvas.style.backgroundColor = _radialBgColor;
    });
    c.appendChild(wpMakeRow('brush', 'Background', 'Base fill color behind glow points', bgColorBtn));
    wpAppendOverlayRows(c);
  }

  /* ── TYPE 4: Static Image ── */
  function wpRows_Image(c) {
    c.appendChild(wpSourceRow('Source', 'Paste image URL…', 'image/*'));
    c.appendChild(wpMakeRow('eye', 'Fit', 'How the image fills the screen', wpPills(['Cover','Contain','Fill','None'], 0)));
    c.appendChild(wpMakeRow('palette', 'Scale', 'Zoom level', wpSlider(50, 200, 100, '%')));
    c.appendChild(wpOffsetPad(0, 0));
    c.appendChild(wpMakeRow('brush', 'Filter', 'Visual filter applied to image', wpPills(['None','B&W','Sepia','Invert','Warm','Cool'], 0)));
  }

  /* ── TYPE 5: Video / GIF ── */
  function wpRows_Video(c) {
    c.appendChild(wpSourceRow('Source', 'Paste video or GIF URL…', 'video/*,image/gif'));
    c.appendChild(wpMakeRow('eye', 'Speed', 'Playback rate', wpSlider(25, 200, 100, '%')));
    const at = document.createElement('div');
    at.className = 'bnt-s-section-title'; at.textContent = 'Audio';
    c.appendChild(at);
    c.appendChild(wpMakeRow('eye', 'Source', 'Audio track to use', wpPills(['From video','Upload','URL','None'], 0)));
    c.appendChild(wpMakeRow('eye', 'Volume', 'Playback volume', wpSlider(0, 100, 50, '%')));
  }

  /* ── Radial canvas (interactive) ── */
  function _buildRadialCanvas(canvas) {
    function repaint() {
      canvas.style.backgroundImage = _radialPoints.map(p =>
        `radial-gradient(ellipse ${p.radius}% ${p.radius}% at ${p.x}% ${p.y}%, ${p.color}40 0%, transparent 100%)`
      ).join(',');
      canvas.style.backgroundColor = _radialBgColor;
    }
    function renderDots() {
      canvas.querySelectorAll('.bnt-wp-radial-dot').forEach(d => d.remove());
      _radialPoints.forEach((pt, idx) => {
        const dot = document.createElement('div');
        dot.className = 'bnt-wp-radial-dot';
        dot.style.cssText = `left:${pt.x}%;top:${pt.y}%;background:${pt.color};box-shadow:0 0 10px ${pt.color}80,0 0 24px ${pt.color}30`;
        let drag = false, sx, sy, spx, spy;
        dot.addEventListener('mousedown', e => {
          e.preventDefault(); drag = true;
          sx = e.clientX; sy = e.clientY; spx = pt.x; spy = pt.y;
          dot.classList.add('dragging');
        });
        document.addEventListener('mousemove', e => {
          if (!drag) return;
          const r = canvas.getBoundingClientRect();
          pt.x = Math.max(2, Math.min(98, spx + (e.clientX - sx) / r.width  * 100));
          pt.y = Math.max(2, Math.min(98, spy + (e.clientY - sy) / r.height * 100));
          dot.style.left = pt.x + '%'; dot.style.top = pt.y + '%';
          repaint();
        });
        document.addEventListener('mouseup', () => { if (drag) { drag = false; dot.classList.remove('dragging'); } });
        dot.addEventListener('dblclick', e => {
          e.stopPropagation();
          canvas.querySelectorAll('.bnt-wp-dot-editor').forEach(el => el.remove());
          const ed = _buildDotEditor(pt, idx, () => { repaint(); renderDots(); }, () => { _radialPoints.splice(idx,1); repaint(); renderDots(); });
          ed.style.left = Math.min(pt.x, 65) + '%';
          ed.style.top  = (pt.y > 55 ? (pt.y - 44) : (pt.y + 8)) + '%';
          canvas.appendChild(ed);
        });
        canvas.appendChild(dot);
      });
    }
    canvas.addEventListener('click', () => canvas.querySelectorAll('.bnt-wp-dot-editor').forEach(el => el.remove()));
    repaint(); renderDots();
  }

  function _buildDotEditor(pt, idx, onChange, onDelete) {
    const ed = document.createElement('div');
    ed.className = 'bnt-wp-dot-editor'; ed.dataset.idx = idx;
    ed.innerHTML = `
      <div class="bnt-wp-dot-ed-row">
        <span class="bnt-wp-dot-ed-label">Color</span>
        <input type="color" class="bnt-wp-dot-ed-color" value="${pt.color}">
      </div>
      <div class="bnt-wp-dot-ed-row">
        <span class="bnt-wp-dot-ed-label">Radius</span>
        <input type="range" class="bnt-wp-dot-ed-slider" min="10" max="90" value="${pt.radius}">
        <span class="bnt-wp-dot-ed-val">${pt.radius}%</span>
      </div>
      <button class="bnt-wp-dot-ed-del">Remove</button>
    `;
    ed.addEventListener('click', e => e.stopPropagation());
    const ci = ed.querySelector('.bnt-wp-dot-ed-color');
    ci.addEventListener('input', () => { pt.color = ci.value; onChange(); });
    const ri = ed.querySelector('.bnt-wp-dot-ed-slider'), rv = ed.querySelector('.bnt-wp-dot-ed-val');
    ri.addEventListener('input', () => { pt.radius = Number(ri.value); rv.textContent = pt.radius + '%'; onChange(); });
    ed.querySelector('.bnt-wp-dot-ed-del').addEventListener('click', onDelete);
    return ed;
  }

  /* ── renderPreviewCanvas ── */
  function renderPreviewCanvas(wrap, toolbarEl) {
    wrap.innerHTML = '';
    if (toolbarEl) toolbarEl.innerHTML = '';

    if (_wpViewMode === 'zones') {
      const stub = document.createElement('div');
      stub.className = 'bnt-wp-canvas bnt-wp-canvas--zones';
      stub.innerHTML = `
        <div class="bnt-wp-canvas-zone-hint">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
            <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
          </svg>
          <span class="bnt-wp-canvas-zone-label">Zone Layout</span>
          <span class="bnt-wp-canvas-soon-badge">Coming soon</span>
          <span class="bnt-wp-canvas-zone-sub">Drag &amp; reorder page elements</span>
        </div>`;
      wrap.appendChild(stub);
      return;
    }

    const canvas = document.createElement('div');
    canvas.className = 'bnt-wp-canvas bnt-wp-canvas--' + _wpType;

    if (_wpType === 'solid') {
      canvas.style.background = '#0e0f13';
      const l = document.createElement('span'); l.className = 'bnt-wp-canvas-type-label'; l.textContent = 'Solid Color';
      canvas.appendChild(l);
    } else if (_wpType === 'linear') {
      canvas.style.background = 'linear-gradient(135deg,#0e0f13 0%,#1a1f3a 100%)';
      const l = document.createElement('span'); l.className = 'bnt-wp-canvas-type-label'; l.textContent = 'Linear Gradient';
      canvas.appendChild(l);
    } else if (_wpType === 'radial-points') {
      _buildRadialCanvas(canvas);
      if (toolbarEl) {
        const addBtn = document.createElement('button');
        addBtn.className = 'bnt-wp-add-point-btn';
        addBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Add point`;
        addBtn.addEventListener('click', e => {
          e.stopPropagation();
          _radialPoints.push({ x: 35 + Math.random()*30, y: 25 + Math.random()*50, color: '#7eb3ff', radius: 45 });
          renderPreviewCanvas(wrap, toolbarEl);
        });
        toolbarEl.appendChild(addBtn);
      }
    } else if (_wpType === 'image') {
      canvas.innerHTML = `<div class="bnt-wp-canvas-empty">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
        </svg>
        <span>No image loaded</span>
        <button class="bnt-wp-canvas-upload-btn">Upload image</button>
      </div>`;
    } else if (_wpType === 'video') {
      canvas.innerHTML = `<div class="bnt-wp-canvas-empty">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>
        </svg>
        <span>No video loaded</span>
        <button class="bnt-wp-canvas-upload-btn">Upload video / GIF</button>
      </div>`;
    }
    wrap.appendChild(canvas);
  }

  /* ── buildWallpaperSection ── */
  function buildWallpaperSection() {
    const frag = document.createDocumentFragment();

    /* SECTION: Preview */
    const previewSec = document.createElement('div');
    previewSec.className = 'bnt-s-section';
    const previewTitle = document.createElement('div');
    previewTitle.className = 'bnt-s-section-title';
    previewTitle.textContent = 'Preview';
    previewSec.appendChild(previewTitle);

    const canvasWrap = document.createElement('div');
    canvasWrap.className = 'bnt-wp-canvas-wrap';

    /* toolbarEl: between Preview and Background — declared early for closure access */
    const toolbarEl = document.createElement('div');
    toolbarEl.className = 'bnt-wp-canvas-toolbar';

    const viewModeRow = buildPillSelectRow(
      'eye', 'View mode', 'Switch between wallpaper editor and page layout',
      [
        { label: 'Wallpaper Customization', id: 'customization' },
        { label: 'Zone Layout', id: 'zones', disabled: true, soon: true },
      ],
      0,
      (opt) => { _wpViewMode = opt.id; renderPreviewCanvas(canvasWrap, toolbarEl); }
    );
    previewSec.appendChild(viewModeRow);
    renderPreviewCanvas(canvasWrap, toolbarEl);
    previewSec.appendChild(canvasWrap);
    frag.appendChild(previewSec);
    frag.appendChild(toolbarEl);

    /* SECTION: Background */
    const bgSec = document.createElement('div');
    bgSec.className = 'bnt-s-section';
    const bgTitle = document.createElement('div');
    bgTitle.className = 'bnt-s-section-title';
    bgTitle.textContent = 'Background';
    bgSec.appendChild(bgTitle);

    const dynamicContainer = document.createElement('div');
    dynamicContainer.className = 'bnt-wp-dynamic';

    const typeRow = buildPillSelectRow(
      'image', 'Type', 'Wallpaper style',
      WP_TYPES.map(t => ({ label: t.label, id: t.id, soon: t.id === 'app' })),
      WP_TYPES.findIndex(t => t.id === _wpType),
      (opt) => {
        if (opt.id === 'app') { showAppWidgetStub(); return; }
        _wpType = opt.id;
        renderWpDynamic(dynamicContainer);
        renderPreviewCanvas(canvasWrap, toolbarEl);
      }
    );
    bgSec.appendChild(typeRow);
    bgSec.appendChild(dynamicContainer);
    frag.appendChild(bgSec);

    renderWpDynamic(dynamicContainer);
    return frag;
  }

  /* ── Overlay rows (shared by Solid / Linear / Radial) ── */
  function wpAppendOverlayRows(c) {
    const overlayTitle = document.createElement('div');
    overlayTitle.className = 'bnt-s-section-title';
    overlayTitle.textContent = 'Overlay';
    c.appendChild(overlayTitle);

    /* Dynamic params container */
    const paramsEl = document.createElement('div');
    paramsEl.className = 'bnt-wp-overlay-params';

    const modePills = wpPills(['None','Blur','Noise','Pattern'], 0, (opt) => {
      paramsEl.innerHTML = '';
      if (opt === 'Blur') {
        paramsEl.appendChild(wpMakeRow('eye', 'Intensity', 'Blur radius', wpSlider(0, 40, 10, 'px')));
      } else if (opt === 'Noise') {
        paramsEl.appendChild(wpMakeRow('eye', 'Coverage', 'Noise density', wpSlider(0, 100, 30, '%')));
        paramsEl.appendChild(wpMakeRow('brush', 'Color', 'Noise pixel color', wpColorBtn('#888888')));
      } else if (opt === 'Pattern') {
        const charsWrap = document.createElement('div');
        charsWrap.className = 'bnt-s-control';
        charsWrap.innerHTML = `<input type="text" class="bnt-wp-url-input" value="· ∙ • ◦" style="width:120px">`;
        paramsEl.appendChild(wpMakeRow('eye', 'Chars', 'Characters used in pattern', charsWrap));
        paramsEl.appendChild(wpMakeRow('eye', 'Size', 'Character size', wpSlider(8, 48, 14, 'px')));
        paramsEl.appendChild(wpMakeRow('eye', 'Opacity', 'Pattern opacity', wpSlider(0, 100, 20, '%')));
        paramsEl.appendChild(wpMakeRow('eye', 'Gap', 'Spacing between characters', wpSlider(4, 40, 16, 'px')));
      }
    });
    modePills.classList.add('bnt-s-control');
    c.appendChild(wpMakeRow('eye', 'Mode', 'Overlay applied on top of background', modePills));
    c.appendChild(paramsEl);
  }



  /* ── App / Widget stub modal ── */
  function showAppWidgetStub() {
    let modal = document.getElementById('bnt-wp-app-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'bnt-wp-app-modal';
      modal.className = 'bnt-wp-modal-overlay';
      modal.innerHTML = `
        <div class="bnt-wp-modal">
          <div class="bnt-wp-modal-icon">🔮</div>
          <div class="bnt-wp-modal-title">App / Widget</div>
          <div class="bnt-wp-modal-sub">Coming soon</div>
          <p class="bnt-wp-modal-body">This mode will let you embed live widgets or web apps as your background.</p>
          <button class="bnt-wp-modal-ok">Got it</button>
        </div>
      `;
      modal.addEventListener('click', e => {
        if (e.target === modal || e.target.classList.contains('bnt-wp-modal-ok')) modal.classList.remove('open');
      });
      document.body.appendChild(modal);
    }
    modal.classList.add('open');
  }

  function buildControl(row) {
    /* ── Wallpaper ── */
    if (row.label === 'Wallpaper') {
      return buildWallpaperSection(); /* returns DocumentFragment */
    }

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
      return buildColorPicker('accentMain', SETTINGS_CONFIG.ACCENT_MAIN_DEFAULT, '--accent-main', applyAccentMain);
    }

    if (row.label === 'Search accent') {
      return buildColorPicker('accentSearch', SETTINGS_CONFIG.ACCENT_SEARCH_DEFAULT, '--accent-search', applyAccentSearch);
    }

    if (row.label === 'Command accent') {
      return buildColorPicker('accentCmd', SETTINGS_CONFIG.ACCENT_CMD_DEFAULT, '--accent-cmd', applyAccentCmd);
    }

    /* Special: this label triggers a 2-row fragment (toggle + color picker) */
    if (row.label === 'Adaptive panel tint') {
      return buildAutoPanelBgRows();
    }

    /* Default — placeholder for rows not yet implemented */
    const el = document.createElement('div');
    el.className = 'bnt-s-control bnt-s-placeholder';
    el.textContent = 'Coming soon';
    return el;
  }

  function buildRow(row, highlight = '') {
    /* Special case: some labels return a DocumentFragment of multiple rows */
    const ctrl = buildControl(row);
    if (ctrl instanceof DocumentFragment) return ctrl;

    /* WallpaperCard — returns the card directly, no standard row wrapping */
    if (row.label === 'Wallpaper') return ctrl;

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
    el.appendChild(ctrl);

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

      if (sec.title) {
        const titleEl = document.createElement('div');
        titleEl.className = 'bnt-s-section-title';
        titleEl.textContent = sec.title;
        secEl.appendChild(titleEl);
      }

      sec.rows.forEach(row => secEl.append(buildRow(row)));
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

      matchRows.forEach(row => elSearchRes.append(buildRow(row, q)));
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

    /* If accent changed and auto panel bg is on — update picker preview */
    if (patch.accentMain && _panelBgPickerBtn?.isConnected && _panelBgPickerInput?.isConnected) {
      const isAuto = merged.autoPanelBg ?? SETTINGS_CONFIG.AUTO_PANEL_BG_DEFAULT;
      if (isAuto) {
        const newColor = derivePanelBg(patch.accentMain);
        _panelBgPickerBtn.style.background = newColor;
        _panelBgPickerInput.value = newColor;
      }
    }

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

/* ══════════════════════════════════════════════════════════════
   EARLY ACCENT APPLY
   Применяем сохранённый акцентный цвет сразу при загрузке страницы,
   до того как пользователь что-либо открыл. Запускается один раз.
   hexToGlow продублирована здесь т.к. она внутри IIFE выше.
══════════════════════════════════════════════════════════════ */
(async () => {
  function _hexToGlow(hex, alpha) {
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  /* accent hex → panelBg hex (mix 2.5% into surface2 base) */
  function _derivePanelBg(accentHex) {
    const h = accentHex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    const mix = 0.012;
    const t = (base, ch) => Math.round(base + (ch - base) * mix);
    const to2 = n => n.toString(16).padStart(2, '0');
    return '#' + to2(t(30,r)) + to2(t(32,g)) + to2(t(41,b));
  }

  /* panelBg hex → apply full surface hierarchy */
  function _applyPanelSurfaces(root, panelBgHex) {
    const h = panelBgHex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    const clamp = v => Math.max(0, Math.min(255, v));
    const rgb = (dr, dg, db) => `rgb(${clamp(r+dr)},${clamp(g+dg)},${clamp(b+db)})`;
    root.style.setProperty('--panel-bg', panelBgHex);
    root.style.setProperty('--bg',       rgb(-16, -17, -22));
    root.style.setProperty('--surface',  rgb( -8,  -8, -10));
    root.style.setProperty('--surface2', panelBgHex);
    root.style.setProperty('--surface3', rgb(  7,   7,   7));
  }

  try {
    await window.BNT_STORAGE_READY;
    const s    = window.BNT_STORAGE?.getSettings() ?? {};
    const root = document.documentElement;

    const accent = s.accentMain;
    if (accent && accent !== '#7eff84') {
      root.style.setProperty('--accent-main',         accent);
      root.style.setProperty('--accent-main-glow',    _hexToGlow(accent, 0.18));
      root.style.setProperty('--accent-main-glow-sm', _hexToGlow(accent, 0.12));
    }

    const accentSearch = s.accentSearch;
    if (accentSearch && accentSearch !== '#7b93ff') {
      root.style.setProperty('--accent-search',      accentSearch);
      root.style.setProperty('--accent-search-glow', _hexToGlow(accentSearch, 0.14));
    }

    const accentCmd = s.accentCmd;
    if (accentCmd && accentCmd !== '#ff7eb3') {
      root.style.setProperty('--accent-cmd',      accentCmd);
      root.style.setProperty('--accent-cmd-glow', _hexToGlow(accentCmd, 0.14));
    }

    /* Panel bg */
    const autoPanelBg = s.autoPanelBg ?? false;
    if (autoPanelBg) {
      const base = accent || '#7eff84';
      _applyPanelSurfaces(root, _derivePanelBg(base));
    } else if (s.panelBg) {
      _applyPanelSurfaces(root, s.panelBg);
    }
  } catch (e) {
    /* storage not ready — CSS defaults are fine */
  }
})();
