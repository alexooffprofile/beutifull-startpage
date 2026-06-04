/**
 * bm-folders.js — Beautiful New Tab
 * Resolves the extension's bookmark folder IDs from background.js.
 * Does NOT create folders — that happens once in background.js onInstalled.
 *
 * Exposes: window.BNT_FOLDERS_READY
 *   → Promise<{ extId, scId, bmId } | null>
 *
 * Returns null if:
 *   - Not running in extension context (no chrome.runtime)
 *   - Background script didn't respond (folders not ready yet)
 *
 * Load order: storage.js → migration.js → bm-folders.js → ...
 */

window.BNT_FOLDERS_READY = (() => {
  if (typeof chrome === 'undefined' || !chrome?.runtime) {
    return Promise.resolve(null);
  }

  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type: 'BNT_GET_FOLDER_IDS' }, response => {
      if (chrome.runtime.lastError || !response?.ok) {
        console.warn('[BNT] bm-folders: could not get folder IDs from background:', chrome.runtime.lastError?.message);
        resolve(null);
        return;
      }
      resolve(response.ids);
    });
  });
})();
