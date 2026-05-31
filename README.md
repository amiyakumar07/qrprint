# SocioDL

> Download Reels, Shorts & Photos from Instagram, TikTok, YouTube, Facebook, X and Pinterest.

**Stack:** HTML5 + Tailwind-styled vanilla JS frontend · Node.js + Express backend · [`yt-dlp`](https://github.com/yt-dlp/yt-dlp) media extractor

---

## Features

- Paste any link → fetch metadata → preview thumbnail → choose quality → download
- Supports: Instagram, TikTok, YouTube Shorts, Facebook Reels, X/Twitter videos, Pinterest
- Quality selector: Low / Medium / High / Original
- Dark & Light theme toggle
- Rate limiting: 10 requests/min per IP
- Zero server-side storage — files streamed directly to browser
- Mobile-first responsive design

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | ≥ 18 | https://nodejs.org |
| yt-dlp | latest | `pip install yt-dlp` or see below |
| ffmpeg | any | `sudo apt install ffmpeg` / `brew install ffmpeg` |

### Install yt-dlp

```bash
# macOS
brew install yt-dlp

# Linux
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp

# Windows (via pip)
pip install yt-dlp

# Verify
yt-dlp --version
```

---

## Run Locally

```bash
# 1. Clone / unzip the project
cd sociodl

# 2. Install Node dependencies
npm install

# 3. Start the server
npm start
# → http://localhost:3000

# For development with auto-reload:
npm run dev
```

Open `http://localhost:3000` in your browser. Paste a social media URL and click **Fetch**.

---

## Project Structure

```
sociodl/
├── public/
│   └── index.html      ← Full frontend (HTML + CSS + JS, single file)
├── server.js           ← Express app with all API routes
├── package.json
└── README.md
```

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/fetch` | Get metadata (title, thumbnail, duration) |
| `GET`  | `/api/download` | Stream file download to browser |
| `GET`  | `/api/stream` | In-browser preview stream |
| `GET`  | `/api/health` | Health check |

#### POST `/api/fetch`
```json
{ "url": "https://www.instagram.com/reel/...", "quality": "high" }
```
Returns:
```json
{
  "type": "video",
  "title": "...",
  "uploader": "username",
  "thumbnail": "https://...",
  "duration": 30,
  "ext": "mp4",
  "filesize": "~8.2 MB",
  "streamUrl": "/api/stream?url=...&quality=high"
}
```

---

## Deploy to Railway

1. Push this folder to a GitHub repo
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Add environment variable: `PORT=3000` (Railway sets this automatically)
4. In the Railway shell, run: `pip install yt-dlp` (add as a Nixpacks command)
5. Deploy — Railway gives you a public URL

**Procfile** (create if needed):
```
web: npm start
```

**nixpacks.toml** (for yt-dlp + ffmpeg on Railway):
```toml
[phases.setup]
nixPkgs = ["yt-dlp", "ffmpeg"]
```

---

## Deploy to Render

1. Push to GitHub
2. New Web Service → connect repo
3. Build command: `npm install`
4. Start command: `node server.js`
5. Add a `render-build.sh`:
```bash
#!/bin/bash
npm install
pip install yt-dlp
```

---

## Security Notes

- Rate limiting is enforced at the API level (10 req/min/IP via `express-rate-limit`)
- No files are written to disk — yt-dlp pipes stdout directly to the HTTP response
- Input URLs are validated against a whitelist of supported domain patterns
- This tool is for **personal and educational use only**. Respect each platform's ToS.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `yt-dlp: command not found` | Install yt-dlp and ensure it's in your PATH |
| `ffmpeg not found` | Install ffmpeg (needed for merging audio+video) |
| Instagram/TikTok fails | Some content requires a logged-in session. Use `--cookies-from-browser` flag in `server.js` |
| Rate limit hit | Wait 60 seconds and try again |
| Private content error | Only public posts can be downloaded |

### Cookies for private content (optional)

In `server.js`, add to the `ytdlpArgs` array:
```js
'--cookies-from-browser', 'chrome'  // or 'firefox'
```

---

## License

MIT — Use freely for personal and educational purposes. Not for commercial redistribution.
