// Runs IN the YouTube page (youtube.com origin -> no CORS issues).
function ytExtract() {
  const pr = window.ytInitialPlayerResponse;
  if (!pr) return { error: 'no-player-response' };
  const det = pr.videoDetails || {};
  const sd = pr.streamingData || {};
  return {
    title: det.title || 'video',
    author: det.author || '',
    formats: (sd.formats || []).map(f => ({
      itag: f.itag, quality: f.qualityLabel || f.quality,
      mime: (f.mimeType || '').split(';')[0],
      url: f.url || null, size: f.contentLength || null
    })),
    ciphered: (sd.formats || []).filter(f => !f.url).length,
    captions: (((pr.captions || {}).playerCaptionsTracklistRenderer || {}).captionTracks || [])
      .map(c => ({ lang: c.languageCode, name: (c.name && c.name.simpleText) || c.languageCode, baseUrl: c.baseUrl }))
  };
}

// Runs IN the YouTube page. Returns [{t, text}] (seconds, plain text).
async function ytFetchCaptions(baseUrl) {
  const r = await fetch(baseUrl + '&fmt=json3');
  if (!r.ok) throw new Error('captions HTTP ' + r.status);
  const j = await r.json();
  return (j.events || [])
    .filter(e => e.segs)
    .map(e => ({ t: (e.tStartMs || 0) / 1000, text: e.segs.map(s => s.utf8 || '').join('').replace(/\n/g, ' ').trim() }))
    .filter(e => e.text);
}
