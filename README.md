# YT Transcript + Downloader

Chrome/Edge/Brave extension (Manifest V3): on any `youtube.com/watch` page it can

- **Download video** — best available progressive MP4 stream (direct URL when YouTube exposes one)
- **Download captions** — `.txt` and `.srt` for any caption track
- **Copy transcript** — timestamped text to clipboard

## Install (any Chromium browser)

1. Download this repo (or the `yt-transcript-downloader.zip` from Releases)
2. Open `edge://extensions` (or `chrome://extensions`), enable **Developer mode**
3. **Load unpacked** → select this folder

## Use

1. Open a YouTube video, click the extension icon
2. Pick quality / caption language, hit the button

## Notes / limits

- Video download works when YouTube exposes a direct (non-signature-protected) progressive stream URL — typically up to 720p. Signature-ciphered / DASH-only videos report "No direct URLs".
- Downloading videos may violate YouTube's Terms of Service. Use only for content you own or that is licensed for download (e.g. Creative Commons, your own uploads).
- The Chrome Web Store forbids YouTube downloaders, so this is distributed as source here, not via the store.

## Files

- `manifest.json` — MV3 manifest
- `popup.html` / `popup.js` — UI + download/clipboard logic
- `extractor.js` — runs in page context, reads `ytInitialPlayerResponse`, fetches captions as JSON3
