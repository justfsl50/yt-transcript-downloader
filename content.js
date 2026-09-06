// YT Transcript + Downloader — content script (isolated world).
// Injects a page-world bridge (page can read ytInitialPlayerResponse +
// fetch captions without CORS issues) and renders a floating panel.
(() => {
  const PANEL_ID = 'ytd-float-panel';
  const BTN_ID = 'ytd-float-btn';
  const cur = () => new URLSearchParams(location.search).get('v');

  const BRIDGE = `
    function ytExtract() {
      const pr = window.ytInitialPlayerResponse;
      if (!pr) return { error: 'no-player-response' };
      const det = pr.videoDetails || {};
      const sd = pr.streamingData || {};
      return {
        title: det.title || 'video', author: det.author || '',
        formats: (sd.formats || []).map(f => ({ itag: f.itag, quality: f.qualityLabel || f.quality,
          mime: (f.mimeType || '').split(';')[0], url: f.url || null, size: f.contentLength || null })),
        ciphered: (sd.formats || []).filter(f => !f.url).length,
        captions: (((pr.captions || {}).playerCaptionsTracklistRenderer || {}).captionTracks || [])
          .map(c => ({ lang: c.languageCode, name: (c.name && c.name.simpleText) || c.languageCode, baseUrl: c.baseUrl }))
      };
    }
    async function ytFetchCaptions(baseUrl) {
      const r = await fetch(baseUrl + '&fmt=json3');
      if (!r.ok) throw new Error('captions HTTP ' + r.status);
      const j = await r.json();
      return (j.events || []).filter(e => e.segs)
        .map(e => ({ t: (e.tStartMs || 0) / 1000, text: e.segs.map(s => s.utf8 || '').join('').replace(/\\n/g, ' ').trim() }))
        .filter(e => e.text);
    }
    window.addEventListener('message', async (ev) => {
      const m = ev.data;
      if (!m || m.src !== 'ytd-req') return;
      try {
        let result;
        if (m.op === 'extract') result = ytExtract();
        else if (m.op === 'caps') result = await ytFetchCaptions(m.baseUrl);
        else throw new Error('bad-op');
        window.postMessage({ src: 'ytd-res', id: m.id, ok: true, result }, '*');
      } catch (e) {
        window.postMessage({ src: 'ytd-res', id: m.id, ok: false, error: String(e && e.message || e) }, '*');
      }
    });
  `;

  function ensureBridge() {
    if (document.getElementById('ytd-bridge')) return;
    const s = document.createElement('script');
    s.id = 'ytd-bridge';
    s.textContent = BRIDGE;
    (document.head || document.documentElement).appendChild(s);
  }

  let seq = 0;
  const pending = {};
  window.addEventListener('message', (ev) => {
    const m = ev.data;
    if (!m || m.src !== 'ytd-res' || !pending[m.id]) return;
    pending[m.id](m); delete pending[m.id];
  });
  function ask(op, baseUrl) {
    return new Promise((res, rej) => {
      const id = ++seq;
      pending[id] = (m) => m.ok ? res(m.result) : rej(new Error(m.error));
      window.postMessage({ src: 'ytd-req', id, op, baseUrl }, '*');
      setTimeout(() => { if (pending[id]) { delete pending[id]; rej(new Error('page-timeout')); } }, 15000);
    });
  }

  const CSS = `#${PANEL_ID}{position:fixed;right:16px;bottom:16px;width:300px;background:#0f0f0f;color:#fff;
    border:1px solid #3d3d3d;border-radius:12px;padding:12px;z-index:99999;font:13px Arial,sans-serif;
    box-shadow:0 4px 24px rgba(0,0,0,.6)}
    #${PANEL_ID} .t{font-weight:700;margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #${PANEL_ID} select{width:100%;margin:4px 0;padding:5px;background:#222;color:#fff;border:1px solid #444;border-radius:6px}
    #${PANEL_ID} button{width:100%;margin-top:6px;padding:7px;border:0;border-radius:8px;cursor:pointer;font-weight:600}
    #${PANEL_ID} .dl{background:#c00;color:#fff} #${PANEL_ID} .tx{background:#272727;color:#fff}
    #${PANEL_ID} .st{font-size:12px;color:#aaa;min-height:16px;margin-top:6px}
    #${PANEL_ID} .hd{display:flex;justify-content:space-between;align-items:center}
    #${PANEL_ID} .x{background:none;border:0;color:#aaa;cursor:pointer;font-size:14px;width:auto;margin:0;padding:0 4px}
    #${BTN_ID}{position:fixed;right:16px;bottom:16px;z-index:99999;background:#c00;color:#fff;border:0;
    border-radius:50%;width:44px;height:44px;font-weight:800;cursor:pointer;display:none;box-shadow:0 4px 16px rgba(0,0,0,.5)}`;
  function css() {
    if (document.getElementById('ytd-css')) return;
    const s = document.createElement('style'); s.id = 'ytd-css'; s.textContent = CSS;
    document.head.appendChild(s);
  }

  const pad = (n, l = 2) => String(n).padStart(l, '0');
  const stamp = s => `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(Math.floor(s) % 60)},${pad(Math.floor(s % 1 * 1000), 3)}`;
  const toSRT = c => c.map((x, i) => `${i + 1}\n${stamp(x.t)} --> ${stamp(x.t + 3)}\n${x.text}\n`).join('\n');
  const toTXT = c => c.map(x => `[${pad(Math.floor(x.t / 60))}:${pad(Math.floor(x.t) % 60)}] ${x.text}`).join('\n');
  const safe = s => (s || 'video').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
  const b64 = s => { const b = new Blob([s], { type: 'text/plain' }); return new Promise(res => {
    const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(b); }); };
  const st = m => { const e = document.querySelector(`#${PANEL_ID} .st`); if (e) e.textContent = m; };

  async function downloadVideo() {
    const sel = document.getElementById('ytd-vf'); const u = sel && sel.value;
    if (!u || !u.startsWith('http')) { st('No direct video URL for this video.'); return; }
    st('Starting video download…');
    chrome.runtime.sendMessage({ kind: 'video', url: u, filename: safe(window._ytdTitle) + '.mp4' }, (r) => {
      st(r && r.ok ? 'Video download started.' : 'Failed: ' + ((r && r.error) || 'unknown'));
    });
  }
  async function grabCaps() {
    const i = +(document.getElementById('ytd-cl').value || 0);
    const t = window._ytdCaps[i];
    const caps = await ask('caps', t.baseUrl);
    return { caps, track: t };
  }
  async function dl(kind) {
    try {
      st('Fetching captions…');
      const { caps, track } = await grabCaps();
      const txt = kind === 'srt' ? toSRT(caps) : toTXT(caps);
      const url = await b64(txt);
      chrome.runtime.sendMessage({ kind: 'data', url, filename: `${safe(window._ytdTitle)}.${track.lang}.${kind}` }, (r) => {
        st(r && r.ok ? `Saved (${caps.length} lines).` : 'Failed: ' + ((r && r.error) || 'unknown'));
      });
    } catch (e) { st('Failed: ' + e.message); }
  }
  async function copyTx() {
    try {
      st('Fetching captions…');
      const { caps } = await grabCaps();
      await navigator.clipboard.writeText(toTXT(caps));
      st(`Copied ${caps.length} lines.`);
    } catch (e) { st('Copy failed: ' + e.message); }
  }

  function build(data) {
    document.getElementById(PANEL_ID)?.remove();
    document.getElementById(BTN_ID)?.remove();
    window._ytdTitle = data.title; window._ytdCaps = data.captions;
    const p = document.createElement('div'); p.id = PANEL_ID;
    const vOpts = data.formats.filter(f => f.url).map(f =>
      `<option value="${f.url}">${(f.quality || '')} ${(f.mime || '')} ${f.size ? '(' + Math.round(f.size / 1048576) + ' MB)' : ''}</option>`).join('')
      || `<option value="">${data.ciphered ? 'No direct URLs (signature-protected)' : 'No downloadable streams'}</option>`;
    const cOpts = data.captions.map((c, i) => `<option value="${i}">${c.name} (${c.lang})</option>`).join('')
      || `<option value="">No captions</option>`;
    p.innerHTML = `<div class="hd"><div class="t" title="${data.title.replace(/"/g, '&quot;')}">${data.title}</div>
      <button class="x" id="ytd-x">–</button></div>
      <select id="ytd-vf">${vOpts}</select>
      <button class="dl" id="ytd-dlv">Download Video</button>
      <select id="ytd-cl">${cOpts}</select>
      <button class="tx" id="ytd-txt">Download .txt</button>
      <button class="tx" id="ytd-srt">Download .srt</button>
      <button class="tx" id="ytd-cp">Copy Transcript</button>
      <div class="st"></div>`;
    document.body.appendChild(p);
    const b = document.createElement('button'); b.id = BTN_ID; b.textContent = 'YT↓';
    document.body.appendChild(b);
    document.getElementById('ytd-dlv').onclick = downloadVideo;
    document.getElementById('ytd-txt').onclick = () => dl('txt');
    document.getElementById('ytd-srt').onclick = () => dl('srt');
    document.getElementById('ytd-cp').onclick = copyTx;
    document.getElementById('ytd-x').onclick = () => { p.style.display = 'none'; b.style.display = 'block'; };
    b.onclick = () => { p.style.display = 'block'; b.style.display = 'none'; };
    if (!data.captions.length) st('No caption tracks on this video.');
  }

  let lastVid = null, tries = 0;
  async function init() {
    const v = cur();
    if (!v) return;
    if (v === lastVid && document.getElementById(PANEL_ID)) return;
    ensureBridge(); css();
    try {
      const data = await ask('extract');
      if (data.error) { if (tries++ < 20) setTimeout(init, 1000); return; }
      tries = 0; lastVid = v; build(data);
    } catch (e) { if (tries++ < 20) setTimeout(init, 1000); }
  }
  document.addEventListener('yt-navigate-finish', () => { lastVid = null; tries = 0; setTimeout(init, 1500); });
  init();
})();
