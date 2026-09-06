// MV3 service worker: performs downloads on behalf of content script + popup.
chrome.runtime.onMessage.addListener((m, _s, reply) => {
  if (!m || (m.kind !== 'video' && m.kind !== 'data')) return false;
  chrome.downloads.download({ url: m.url, filename: m.filename, saveAs: false }, (id) => {
    if (chrome.runtime.lastError) reply({ ok: false, error: chrome.runtime.lastError.message });
    else reply({ ok: true, id });
  });
  return true; // async reply
});
