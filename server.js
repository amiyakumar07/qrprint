/**
 * SocioDL — Express backend
 * Uses yt-dlp-exec to fetch metadata and stream downloads.
 * No files are stored on disk — everything is streamed.
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const ytdlp = require('yt-dlp-exec');
const path = require('path');
const { spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Rate limiting: max 10 requests per minute per IP
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Max 10 per minute. Please wait.' }
});
app.use('/api/', limiter);

// ── Helpers ─────────────────────────────────────────────────────────────────
const SUPPORTED = [
  /instagram\.com/,
  /tiktok\.com/,
  /youtube\.com/,
  /youtu\.be/,
  /facebook\.com/,
  /fb\.watch/,
  /twitter\.com/,
  /x\.com/,
  /pinterest\.com/,
  /pin\.it/
];

function isSupportedUrl(url) {
  try {
    new URL(url); // validate
    return SUPPORTED.some(p => p.test(url));
  } catch {
    return false;
  }
}

// Map quality label → yt-dlp format selector
function qualityFormat(quality, isAudio = false) {
  if (isAudio) return 'bestaudio/best';
  switch (quality) {
    case 'low':      return 'worstvideo[ext=mp4]+worstaudio[ext=m4a]/worst[ext=mp4]/worst';
    case 'medium':   return 'bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480][ext=mp4]/best[height<=480]';
    case 'high':     return 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best[height<=1080]';
    case 'original': return 'bestvideo+bestaudio/best';
    default:         return 'bestvideo[height<=1080]+bestaudio/best';
  }
}

// ── POST /api/fetch — get metadata ──────────────────────────────────────────
app.post('/api/fetch', async (req, res) => {
  const { url, quality = 'high' } = req.body;

  if (!url || !isSupportedUrl(url)) {
    return res.status(400).json({ error: 'Unsupported or invalid URL.' });
  }

  try {
    const info = await ytdlp(url, {
      dumpSingleJson: true,
      noWarnings: true,
      noCheckCertificates: true,
      preferFreeFormats: true,
      addHeader: ['referer:youtube.com', 'user-agent:Mozilla/5.0'],
    });

    const isPhoto = info.ext === 'jpg' || info.ext === 'png' || info.ext === 'webp' ||
                    info._type === 'photo' || !info.duration;

    // Pick the best thumbnail
    const thumbnail = info.thumbnail ||
      (info.thumbnails && info.thumbnails[info.thumbnails.length - 1]?.url) ||
      null;

    // Estimate filesize string
    let filesize = '';
    if (info.filesize) {
      const mb = (info.filesize / 1048576).toFixed(1);
      filesize = `~${mb} MB`;
    } else if (info.filesize_approx) {
      const mb = (info.filesize_approx / 1048576).toFixed(1);
      filesize = `~${mb} MB`;
    }

    res.json({
      type: isPhoto ? 'photo' : 'video',
      title: info.title || info.description?.slice(0, 80) || 'Media',
      uploader: info.uploader || info.channel || info.creator || '',
      thumbnail,
      duration: info.duration ? Math.round(info.duration) : null,
      ext: isPhoto ? (info.ext || 'jpg') : 'mp4',
      filesize,
      streamUrl: `/api/stream?url=${encodeURIComponent(url)}&quality=${quality}`,
    });
  } catch (err) {
    console.error('[fetch error]', err.message);
    const msg = err.message?.includes('Unsupported URL')
      ? 'This URL is not supported. Make sure it links to a public post.'
      : err.message?.includes('Private')
      ? 'This content is private and cannot be downloaded.'
      : 'Failed to fetch media. The URL may be private or unsupported.';
    res.status(500).json({ error: msg });
  }
});

// ── GET /api/download — stream file to browser ──────────────────────────────
app.get('/api/download', (req, res) => {
  const { url, quality = 'high' } = req.query;

  if (!url || !isSupportedUrl(url)) {
    return res.status(400).json({ error: 'Invalid URL.' });
  }

  const format = qualityFormat(quality);

  // Use yt-dlp to pipe output directly to response (no disk writes)
  const ytdlpArgs = [
    url,
    '-f', format,
    '--merge-output-format', 'mp4',
    '--no-playlist',
    '--no-warnings',
    '--no-check-certificates',
    '-o', '-',  // output to stdout
  ];

  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Content-Disposition', `attachment; filename="sociodl-${Date.now()}.mp4"`);
  res.setHeader('Transfer-Encoding', 'chunked');

  const proc = spawn('yt-dlp', ytdlpArgs, { stdio: ['ignore', 'pipe', 'pipe'] });

  proc.stdout.pipe(res);

  proc.stderr.on('data', d => {
    // Uncomment to debug: console.error('[yt-dlp stderr]', d.toString());
  });

  proc.on('error', err => {
    console.error('[yt-dlp spawn error]', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'yt-dlp not found. Please install it.' });
    }
  });

  proc.on('close', code => {
    if (code !== 0 && !res.writableEnded) {
      res.end();
    }
  });

  req.on('close', () => proc.kill('SIGTERM'));
});

// ── GET /api/stream — stream for in-browser preview ─────────────────────────
app.get('/api/stream', (req, res) => {
  const { url, quality = 'high' } = req.query;

  if (!url || !isSupportedUrl(url)) {
    return res.status(400).json({ error: 'Invalid URL.' });
  }

  const format = qualityFormat(quality);

  const ytdlpArgs = [
    url,
    '-f', format,
    '--merge-output-format', 'mp4',
    '--no-playlist',
    '--no-warnings',
    '--no-check-certificates',
    '-o', '-',
  ];

  res.setHeader('Content-Type', 'video/mp4');

  const proc = spawn('yt-dlp', ytdlpArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
  proc.stdout.pipe(res);
  proc.on('error', () => res.status(500).end());
  req.on('close', () => proc.kill('SIGTERM'));
});

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ status: 'ok', version: '1.0.0' }));

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅  SocioDL running at http://localhost:${PORT}`);
  console.log(`   Make sure yt-dlp is installed: pip install yt-dlp`);
});
