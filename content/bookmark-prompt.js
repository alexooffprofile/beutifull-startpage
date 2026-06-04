/**
 * bookmark-prompt.js — Beautiful New Tab · Bookmark prompt content script
 *
 * Injected into target pages by background.js when:
 *   A) User bookmarks the page via browser UI  → shows "add to newtab?" prompt
 *   B) User clicks extension icon              → shows edit/add prompt for current tab
 *
 * Listens for:
 *   BNT_SHOW_PROMPT  { bookmarkId, title, url, images, existingMeta? }
 *   BNT_REMOVE_PROMPT  (close if open)
 *
 * Sends to background:
 *   BNT_ADD_TO_PANEL  { bookmarkId, title, url, thumbDataUrl }
 *
 * Guards against double-injection — if root element already exists, skip.
 */

(() => {
  'use strict';

  /* ── Already injected guard ── */
  if (document.getElementById('bnt-prompt-root')) return;

  /* ══════════════════════════════════════════════════════════════
     STATE
  ══════════════════════════════════════════════════════════════ */
  let images        = [];   /* string[] — URLs from background */
  let imageIndex    = 0;
  let selectedThumb = null; /* data-url | external URL | null */
  let promptData    = null; /* last BNT_SHOW_PROMPT payload */

  /* ══════════════════════════════════════════════════════════════
     BUILD DOM
  ══════════════════════════════════════════════════════════════ */
  const root = document.createElement('div');
  root.id = 'bnt-prompt-root';

  const card = document.createElement('div');
  card.id = 'bnt-prompt';

  /* ── Header ── */
  const header = document.createElement('div');
  header.id = 'bnt-prompt-header';

  const label = document.createElement('span');
  label.id = 'bnt-prompt-label';
  label.textContent = 'Add to New Tab';

  const closeBtn = document.createElement('button');
  closeBtn.id = 'bnt-prompt-close';
  closeBtn.title = 'Dismiss';
  closeBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>`;
  closeBtn.addEventListener('click', removePrompt);

  header.append(label, closeBtn);

  /* ── Title input ── */
  const titleInput = document.createElement('input');
  titleInput.id = 'bnt-prompt-title';
  titleInput.type = 'text';
  titleInput.placeholder = 'Bookmark title…';
  titleInput.autocomplete = 'off';
  titleInput.spellcheck = false;

  /* ── URL display ── */
  const urlDisplay = document.createElement('div');
  urlDisplay.id = 'bnt-prompt-url';

  /* ── Thumbnail row ── */
  const thumbRow = document.createElement('div');
  thumbRow.id = 'bnt-thumb-row';

  const prevBtn = document.createElement('button');
  prevBtn.className = 'bnt-thumb-nav';
  prevBtn.title = 'Previous image';
  prevBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
    <polyline points="15 18 9 12 15 6"/>
  </svg>`;

  const nextBtn = document.createElement('button');
  nextBtn.className = 'bnt-thumb-nav';
  nextBtn.title = 'Next image';
  nextBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
    <polyline points="9 18 15 12 9 6"/>
  </svg>`;

  /* Preview box */
  const preview = document.createElement('div');
  preview.id = 'bnt-thumb-preview';

  const thumbImg = document.createElement('img');
  thumbImg.id = 'bnt-thumb-img';
  thumbImg.alt = '';
  thumbImg.draggable = false;

  const thumbEmpty = document.createElement('div');
  thumbEmpty.id = 'bnt-thumb-empty';
  thumbEmpty.textContent = 'No images found';

  const counter = document.createElement('div');
  counter.id = 'bnt-thumb-counter';

  /* Upload button — overlaid on preview bottom-left */
  const uploadBtn = document.createElement('button');
  uploadBtn.id = 'bnt-thumb-upload';
  uploadBtn.title = 'Upload your own image';
  uploadBtn.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
    <polyline points="16 16 12 12 8 16"/>
    <line x1="12" y1="12" x2="12" y2="21"/>
    <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
  </svg> Upload`;
  uploadBtn.addEventListener('click', pickFile);

  preview.append(thumbImg, thumbEmpty, counter, uploadBtn);
  thumbRow.append(prevBtn, preview, nextBtn);

  /* ── Add button ── */
  const addBtn = document.createElement('button');
  addBtn.id = 'bnt-prompt-add';
  addBtn.textContent = 'Add to Home Page';
  addBtn.addEventListener('click', handleAdd);

  card.append(header, titleInput, urlDisplay, thumbRow, addBtn);
  root.appendChild(card);

  /* ══════════════════════════════════════════════════════════════
     THUMBNAIL LOGIC
  ══════════════════════════════════════════════════════════════ */
  function renderThumb() {
    const hasImages = images.length > 0;
    thumbEmpty.style.display = hasImages ? 'none' : 'block';
    counter.style.display    = hasImages ? 'block' : 'none';
    prevBtn.disabled = !hasImages || imageIndex === 0;
    nextBtn.disabled = !hasImages || imageIndex === images.length - 1;

    if (!hasImages) {
      thumbImg.classList.remove('visible');
      thumbImg.src = '';
      selectedThumb = null;
      return;
    }

    counter.textContent = `${imageIndex + 1} / ${images.length}`;
    thumbImg.classList.remove('visible');

    const url = images[imageIndex];
    thumbImg.onload  = () => { thumbImg.classList.add('visible'); };
    thumbImg.onerror = () => {
      /* Skip broken images */
      if (imageIndex < images.length - 1) {
        images.splice(imageIndex, 1);
        renderThumb();
      } else {
        thumbImg.classList.remove('visible');
      }
    };
    thumbImg.src  = url;
    selectedThumb = url;
  }

  prevBtn.addEventListener('click', () => {
    if (imageIndex > 0) { imageIndex--; renderThumb(); }
  });
  nextBtn.addEventListener('click', () => {
    if (imageIndex < images.length - 1) { imageIndex++; renderThumb(); }
  });

  /* ── File picker ── */
  function pickFile() {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    inp.addEventListener('change', () => {
      const file = inp.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = e => {
        const dataUrl = e.target.result;
        /* Compress via canvas before using */
        const img = new Image();
        img.onload = () => {
          const maxW = 960, maxH = 600;
          const ratio = Math.min(maxW / img.width, maxH / img.height, 1);
          const canvas = document.createElement('canvas');
          canvas.width  = Math.round(img.width  * ratio);
          canvas.height = Math.round(img.height * ratio);
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          const compressed = canvas.toDataURL('image/jpeg', 0.82);
          /* Prepend to images list and show it */
          images.unshift(compressed);
          imageIndex = 0;
          renderThumb();
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    });
    inp.click();
  }

  /* ══════════════════════════════════════════════════════════════
     POPULATE PROMPT
  ══════════════════════════════════════════════════════════════ */
  function populate(data) {
    promptData   = data;
    images       = (data.images || []).slice();
    imageIndex   = 0;
    selectedThumb = null;

    titleInput.value  = data.title || '';
    urlDisplay.textContent = data.url || '';

    /* If already on newtab panel — change label and button text */
    const isEdit = !!data.existingMeta;
    label.textContent  = isEdit ? 'Edit Bookmark' : 'Add to New Tab';
    addBtn.textContent = isEdit ? 'Save Changes'  : 'Add to Home Page';

    renderThumb();
    titleInput.focus();
    titleInput.select();
  }

  /* ══════════════════════════════════════════════════════════════
     ADD / SAVE
  ══════════════════════════════════════════════════════════════ */
  async function handleAdd() {
    const title = titleInput.value.trim();
    if (!title || !promptData) return;

    addBtn.disabled    = true;
    addBtn.textContent = '…';

    /* If selected thumb is an external URL, fetch and convert to dataUrl
       so background can store it properly. If it's already a dataUrl, use as-is. */
    let thumbDataUrl = null;
    if (selectedThumb) {
      if (selectedThumb.startsWith('data:')) {
        thumbDataUrl = selectedThumb;
      } else {
        try {
          const resp = await fetch(selectedThumb);
          const blob = await resp.blob();
          thumbDataUrl = await blobToDataUrl(blob);
        } catch {
          thumbDataUrl = null; /* thumbnail fetch failed — proceed without */
        }
      }
    }

    chrome.runtime.sendMessage({
      type:         'BNT_ADD_TO_PANEL',
      bookmarkId:   promptData.bookmarkId,
      title,
      url:          promptData.url,
      thumbDataUrl,
      isEdit:       !!promptData.existingMeta,
    }, response => {
      if (response?.ok) {
        /* Success feedback then auto-close */
        card.classList.add('bnt-success');
        addBtn.textContent = '✓ Added';
        setTimeout(removePrompt, 900);
      } else {
        addBtn.disabled    = false;
        addBtn.textContent = promptData.existingMeta ? 'Save Changes' : 'Add to Home Page';
        console.warn('[BNT] Add to panel failed:', response?.error);
      }
    });
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload  = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }

  /* ══════════════════════════════════════════════════════════════
     SHOW / REMOVE
  ══════════════════════════════════════════════════════════════ */
  function showPrompt(data) {
    /* Attach to DOM if not already there */
    if (!root.isConnected) document.documentElement.appendChild(root);
    card.classList.remove('bnt-success');
    populate(data);
  }

  function removePrompt() {
    root.remove();
    promptData    = null;
    images        = [];
    selectedThumb = null;
  }

  /* ── Keyboard: Escape closes, Enter submits ── */
  document.addEventListener('keydown', e => {
    if (!root.isConnected) return;
    if (e.key === 'Escape') { e.stopPropagation(); removePrompt(); }
    if (e.key === 'Enter' && document.activeElement === titleInput) {
      e.preventDefault(); handleAdd();
    }
  }, true);

  /* ══════════════════════════════════════════════════════════════
     MESSAGE LISTENER
  ══════════════════════════════════════════════════════════════ */
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'BNT_SHOW_PROMPT')  showPrompt(msg);
    if (msg.type === 'BNT_REMOVE_PROMPT') removePrompt();
  });

})();
