/**
 * background.js — Beautiful New Tab · Background Script (Firefox MV2)
 *
 * Firefox Manifest V2 compatible:
 *   - chrome.tabs.executeScript   (not chrome.scripting)
 *   - chrome.browserAction        (not chrome.action)
 *   - persistent: false background
 *
 * Content scripts (bookmark-prompt.js/css) are already injected
 * via manifest content_scripts, so we only need to sendMessage to the tab.
 */

'use strict';

/* ══════════════════════════════════════════════════════════════
   CONSTANTS
══════════════════════════════════════════════════════════════ */
const EXT_FOLDER = 'NewTab Extension';
const SC_FOLDER  = 'shortcuts';
const BM_FOLDER  = 'bookmarks_panel';

const BLOCKED_SCHEMES = [
  'chrome://', 'chrome-extension://',
  'moz-extension://', 'about:',
  'edge://', 'opera://', 'brave://',
  'file://', 'data:', 'javascript:',
  'view-source:',
];

/* ══════════════════════════════════════════════════════════════
   STORAGE HELPERS
══════════════════════════════════════════════════════════════ */
function csGet(key) {
  return new Promise(resolve => {
    chrome.storage.local.get(key, r => resolve(r[key] ?? null));
  });
}

function csSet(key, value) {
  return new Promise(resolve => {
    chrome.storage.local.set({ [key]: value }, resolve);
  });
}

/* ══════════════════════════════════════════════════════════════
   FOLDER MANAGEMENT
══════════════════════════════════════════════════════════════ */
let _folderIds = null;

function ensureFolders() {
  return new Promise(resolve => {
    chrome.bookmarks.getTree(tree => {
      const root = tree[0];

      let extNode = null;
      for (const container of (root.children || [])) {
        extNode = (container.children || []).find(n => !n.url && n.title === EXT_FOLDER) || null;
        if (extNode) break;
      }

      function ensureSub(parentId, name, cb) {
        chrome.bookmarks.getChildren(parentId, kids => {
          if (chrome.runtime.lastError || !kids) {
            console.error('[BNT] ensureSub getChildren failed:', chrome.runtime.lastError);
            cb(null); return;
          }
          const found = kids.find(n => !n.url && n.title === name);
          if (found) { cb(found); return; }
          chrome.bookmarks.create({ parentId, title: name }, node => {
            if (chrome.runtime.lastError || !node) {
              console.error('[BNT] ensureSub create failed:', chrome.runtime.lastError);
              cb(null); return;
            }
            cb(node);
          });
        });
      }

      function afterExt(ext) {
        if (!ext || !ext.id) {
          console.error('[BNT] afterExt called with invalid node:', ext);
          resolve(null);
          return;
        }
        ensureSub(ext.id, SC_FOLDER, scNode => {
          ensureSub(ext.id, BM_FOLDER, bmNode => {
            const ids = { extId: ext.id, scId: scNode.id, bmId: bmNode.id };
            resolve(ids);
          });
        });
      }

      if (extNode) {
        afterExt(extNode);
      } else {
        /* Firefox uses named IDs, Chrome uses '1' for Bookmarks Bar.
           Pick the first real container that has children (toolbar > menu > unfiled) */
        const containers = (root.children || []).filter(n => !n.url && n.children);
        const target = containers[0];
        if (!target) { resolve(null); return; }
        chrome.bookmarks.create({ parentId: target.id, title: EXT_FOLDER }, afterExt);
      }
    });
  });
}

async function getFolderIds() {
  if (_folderIds) return _folderIds;
  const cached = await csGet('bnt_folder_ids');
  if (cached) { _folderIds = cached; return _folderIds; }
  _folderIds = await ensureFolders();
  await csSet('bnt_folder_ids', _folderIds);
  return _folderIds;
}

/* ══════════════════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════════════════ */
function isInjectableUrl(url) {
  if (!url) return false;
  return !BLOCKED_SCHEMES.some(s => url.startsWith(s));
}

function getNewtabTabs() {
  return new Promise(resolve => {
    const newtabUrl = chrome.runtime.getURL('newtab.html');
    chrome.tabs.query({ url: newtabUrl }, tabs => resolve(tabs || []));
  });
}

async function notifyNewtab(msg) {
  const tabs = await getNewtabTabs();
  for (const tab of tabs) {
    chrome.tabs.sendMessage(tab.id, msg, () => void chrome.runtime.lastError);
  }
}

/* Collect og:image and large <img> from a tab — runs in tab context */
function collectPageImages() {
  const results = new Set();
  const metaSelectors = [
    'meta[property="og:image"]',
    'meta[name="og:image"]',
    'meta[name="twitter:image"]',
    'meta[name="twitter:image:src"]',
  ];
  for (const sel of metaSelectors) {
    const content = document.querySelector(sel)?.content;
    if (content) { try { results.add(new URL(content, location.href).href); } catch {} }
  }
  for (const img of document.querySelectorAll('img')) {
    if (results.size >= 12) break;
    if (!img.src || img.naturalWidth < 80 || img.naturalHeight < 80) continue;
    try { results.add(new URL(img.src, location.href).href); } catch {}
  }
  return [...results].slice(0, 12);
}

/* Execute a function in a tab and return result (MV2 compatible) */
function execInTab(tabId, func) {
  return new Promise(resolve => {
    chrome.tabs.executeScript(tabId, { code: `(${func.toString()})()` }, results => {
      if (chrome.runtime.lastError) { resolve([]); return; }
      resolve(results?.[0] || []);
    });
  });
}

/* Send message to tab — content script already injected via manifest */
function sendToTab(tabId, msg) {
  return new Promise(resolve => {
    chrome.tabs.sendMessage(tabId, msg, response => {
      void chrome.runtime.lastError; /* suppress if content script not ready */
      resolve(response);
    });
  });
}

/* ══════════════════════════════════════════════════════════════
   1. onInstalled / onStartup — ensure folders exist
      onInstalled: fresh install or update
      onStartup:   browser restart (service worker may have lost _folderIds)
══════════════════════════════════════════════════════════════ */
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  console.log('[BNT] onInstalled, reason:', reason);
  /* Always re-verify folders on install/update, clear stale cache */
  await csSet('bnt_folder_ids', null);
  _folderIds = null;
  const ids = await ensureFolders();
  await csSet('bnt_folder_ids', ids);
  console.log('[BNT] Folders ready:', ids);
});

chrome.runtime.onStartup.addListener(async () => {
  /* Verify cached folder IDs still exist */
  const cached = await csGet('bnt_folder_ids');
  if (cached) {
    _folderIds = cached;
  } else {
    _folderIds = await ensureFolders();
    await csSet('bnt_folder_ids', _folderIds);
  }
  console.log('[BNT] onStartup, folder IDs:', _folderIds);
});

/* ══════════════════════════════════════════════════════════════
   2. bookmarks.onCreated — show prompt on the active tab
══════════════════════════════════════════════════════════════ */
chrome.bookmarks.onCreated.addListener(async (id, bookmark) => {
  if (!bookmark.url) return;

  /* Skip bookmarks created in our own folders */
  const folders = await getFolderIds();
  if (folders) {
    if ([folders.bmId, folders.scId, folders.extId].includes(bookmark.parentId)) return;
  }

  /* Get the active tab */
  chrome.tabs.query({ active: true, lastFocusedWindow: true }, async tabs => {
    const tab = tabs?.[0];
    if (!tab?.id || !isInjectableUrl(tab.url)) return;

    /* Collect images from page */
    const images = await execInTab(tab.id, collectPageImages);

    /* Send prompt data — content script is already on page via manifest */
    sendToTab(tab.id, {
      type:       'BNT_SHOW_PROMPT',
      bookmarkId: id,
      title:      bookmark.title || tab.title || '',
      url:        bookmark.url,
      images,
    });
  });
});

/* ══════════════════════════════════════════════════════════════
   3. bookmarks.onRemoved — notify newtab ONLY when browser removes
      a bookmark from outside our UI (e.g. user deletes via browser
      bookmark manager). Removals done by our own UI are tracked in
      _selfRemovedIds and skipped.
══════════════════════════════════════════════════════════════ */

/* IDs removed by our own UI — skip notification for these */
const _selfRemovedIds = new Set();

function markSelfRemoved(id) {
  _selfRemovedIds.add(id);
  /* Clean up after a tick to avoid memory leak */
  setTimeout(() => _selfRemovedIds.delete(id), 3000);
}

chrome.bookmarks.onRemoved.addListener(async (id, removeInfo) => {
  const folders = await getFolderIds();
  if (!folders) return;
  if (removeInfo.parentId !== folders.bmId) return;

  /* Skip if we removed it ourselves */
  if (_selfRemovedIds.has(id)) { _selfRemovedIds.delete(id); return; }

  /* Queue message — deliver to open newtab tabs or store for later */
  const msg = {
    type:       'BNT_BOOKMARK_REMOVED',
    bookmarkId: id,
    title:      removeInfo.node?.title || '',
    url:        removeInfo.node?.url   || '',
  };

  const tabs = await getNewtabTabs();
  if (tabs.length) {
    /* Newtab is open — deliver directly */
    for (const tab of tabs) {
      chrome.tabs.sendMessage(tab.id, msg, () => void chrome.runtime.lastError);
    }
  } else {
    /* Queue for next time newtab opens */
    const queue = await csGet('bnt_msg_queue') || [];
    queue.push({ ...msg, ts: Date.now() });
    await csSet('bnt_msg_queue', queue);
  }
});

/* ══════════════════════════════════════════════════════════════
   4. browserAction.onClicked — open prompt for current tab (MV2)
══════════════════════════════════════════════════════════════ */
chrome.browserAction.onClicked.addListener(async tab => {
  if (!tab?.id || !isInjectableUrl(tab.url)) return;

  const folders = await getFolderIds();

  /* Check if this URL is already in our panel */
  let existingNode = null;
  let existingMeta = null;
  if (folders) {
    const children = await new Promise(r => chrome.bookmarks.getChildren(folders.bmId, r));
    existingNode = children.find(b => b.url === tab.url) || null;
    if (existingNode) {
      const raw = await csGet('bnt_meta');
      existingMeta = raw?.[existingNode.id] || null;
    }
  }

  const images = await execInTab(tab.id, collectPageImages);

  sendToTab(tab.id, {
    type:         'BNT_SHOW_PROMPT',
    bookmarkId:   existingNode?.id || null,
    title:        existingNode?.title || tab.title || '',
    url:          tab.url,
    images,
    existingMeta,
  });
});

/* ══════════════════════════════════════════════════════════════
   5. Message handler — from newtab or content scripts
══════════════════════════════════════════════════════════════ */
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {

  if (msg.type === 'BNT_GET_FOLDER_IDS') {
    getFolderIds()
      .then(ids => sendResponse({ ok: true, ids }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true; /* keep channel open */
  }

  if (msg.type === 'BNT_SELF_REMOVE') {
    /* bookmarks.js tells us it's about to remove this ID itself */
    markSelfRemoved(msg.bookmarkId);
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === 'BNT_PAGE_OPENED') {
    /* Newtab opened — drain queued messages */
    csGet('bnt_msg_queue').then(async queue => {
      if (!queue?.length) return;
      await csSet('bnt_msg_queue', []);
      for (const qmsg of queue) {
        sendResponse && chrome.tabs.sendMessage(_sender.tab?.id || 0, qmsg, () => void chrome.runtime.lastError);
        await notifyNewtab(qmsg);
      }
    });
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === 'BNT_ADD_TO_PANEL') {
    handleAddToPanel(msg)
      .then(sendResponse)
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }

});

async function handleAddToPanel({ bookmarkId, title, url, thumbDataUrl, isEdit }) {
  const folders = await getFolderIds();
  if (!folders) return { ok: false, error: 'Folders not ready' };

  let targetId = bookmarkId;

  if (isEdit && bookmarkId) {
    await new Promise((resolve, reject) => {
      chrome.bookmarks.update(bookmarkId, { title }, node => {
        chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve(node);
      });
    });
  } else {
    const created = await new Promise((resolve, reject) => {
      chrome.bookmarks.create({ parentId: folders.bmId, title, url }, node => {
        chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve(node);
      });
    });
    targetId = created.id;
  }

  /* Store thumb dataUrl in chrome.storage.local temporarily so newtab
     can pick it up, convert to Blob, and save to IndexedDB.
     Key: bnt_pending_thumb_{id}, cleaned up by bookmarks.js after use. */
  if (thumbDataUrl && targetId) {
    await new Promise(resolve => {
      chrome.storage.local.set({ [`bnt_pending_thumb_${targetId}`]: thumbDataUrl }, resolve);
    });
  }

  return { ok: true, newBookmarkId: targetId };
}
