let DATA = null;

const $ = id => document.getElementById(id);
const status = (m, cls) => { const s = $('status'); s.textContent = m; s.className = cls || ''; };
const safeName = s => (s || 'video').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/youtube\.com\/watch/.test(tab.url || '')) { status('Open a YouTube video tab first.', 'err'); return null; }
  return tab;
}

// extractor.js runs in page context (youtube.com origin -> caption fetch has no CORS issues).
async function runInPage(tabId, func, args) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ['extractor.js'] });
  const [r] = await chrome.scripting.executeScript({ target: { tabId }, func, args });
  return r.result;
}

async function init() {
  const tab = await activeTab();
  if (!tab) return;
  try {
    DATA = await runInPage(tab.id, () => ytExtract());
  } catch (e) { status('Cannot read page data. Reload the video tab.', 'err'); return; }
  if (!DATA || DATA.error) { status('No player data. Reload the video tab.', 'err'); return; }
  $('title').textContent = DATA.title;
  const vf = $('vfmt'); vf.innerHTML = '';
  DATA.formats.filter(f => f.url).forEach(f => {
    const o = document.createElement('option');
    o.value = f.url;
    o.textContent = `${f.quality || ''} ${f.mime || ''} ${f.size ? '(' + Math.round(f.size / 1048576) + ' MB)' : ''}`.trim();
    vf.appendChild(o);
  });
  if (!vf.options.length) {
    const o = document.createElement('option');
    o.textContent = DATA.ciphered ? 'No direct URLs (streams are signature-protected)' : 'No downloadable streams';
    vf.appendChild(o); $('dlv').disabled = true;
  }
  const cl = $('clang'); cl.innerHTML = '';
  DATA.captions.forEach((c, i) => {
    const o = document.createElement('option');
    o.value = i; o.textContent = `${c.name} (${c.lang})`; cl.appendChild(o);
  });
  if (!DATA.captions.length) status('No caption tracks on this video.', 'err');
}

async function getCaps() {
  const tab = await activeTab(); if (!tab) return null;
  const c = DATA.captions[+$('clang').value];
  const caps = await runInPage(tab.id, async (u) => ytFetchCaptions(u), [c.baseUrl]);
  return { caps, track: c };
}

const pad = (n, l = 2) => String(n).padStart(l, '0');
const ts = s => `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(Math.floor(s) % 60)},${pad(Math.floor(s % 1 * 1000), 3)}`;
const toSRT = caps => caps.map((c, i) => `${i + 1}\n${ts(c.t)} --> ${ts(c.t + 3)}\n${c.text}\n`).join('\n');
const toTXT = caps => caps.map(c => `[${pad(Math.floor(c.t / 60))}:${pad(Math.floor(c.t) % 60)}] ${c.text}`).join('\n');

function download(url, filename) {
  return new Promise((res, rej) => chrome.downloads.download({ url, filename, saveAs: false }, id => {
    if (chrome.runtime.lastError) rej(new Error(chrome.runtime.lastError.message)); else res(id);
  }));
}

$('dlv').onclick = async () => {
  const u = $('vfmt').value; if (!u || !u.startsWith('http')) return;
  status('Downloading video…');
  try { await download(u, safeName(DATA.title) + '.mp4'); status('Video download started.', 'ok'); }
  catch (e) { status('Download failed: ' + e.message, 'err'); }
};
$('dltxt').onclick = async () => {
  try {
    const { caps, track } = await getCaps();
    const blob = new Blob([toTXT(caps)], { type: 'text/plain' });
    await download(URL.createObjectURL(blob), `${safeName(DATA.title)}.${track.lang}.txt`);
    status('Transcript .txt started.', 'ok');
  } catch (e) { status('Failed: ' + e.message, 'err'); }
};
$('dlsrt').onclick = async () => {
  try {
    const { caps, track } = await getCaps();
    const blob = new Blob([toSRT(caps)], { type: 'text/srt' });
    await download(URL.createObjectURL(blob), `${safeName(DATA.title)}.${track.lang}.srt`);
    status('Captions .srt started.', 'ok');
  } catch (e) { status('Failed: ' + e.message, 'err'); }
};
$('cp').onclick = async () => {
  try {
    const { caps } = await getCaps();
    await navigator.clipboard.writeText(toTXT(caps));
    status(`Copied ${caps.length} lines.`, 'ok');
  } catch (e) { status('Copy failed: ' + e.message, 'err'); }
};

init();
