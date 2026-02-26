const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const axios = require('axios');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;

// ── Middleware ──────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 500 });
app.use(limiter);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// ── M3U Parser ──────────────────────────────────────────────────────
function parseM3U(content) {
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
  const channels = [];
  let current = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('#EXTINF:')) {
      current = { id: Date.now() + i, title: '', group: 'Uncategorized', logo: '', url: '', tvgId: '', tvgName: '' };
      // Parse attributes
      const titleMatch = line.match(/,(.+)$/);
      if (titleMatch) current.title = titleMatch[1].trim();
      const groupMatch = line.match(/group-title="([^"]*)"/);
      if (groupMatch) current.group = groupMatch[1];
      const logoMatch = line.match(/tvg-logo="([^"]*)"/);
      if (logoMatch) current.logo = logoMatch[1];
      const tvgIdMatch = line.match(/tvg-id="([^"]*)"/);
      if (tvgIdMatch) current.tvgId = tvgIdMatch[1];
      const tvgNameMatch = line.match(/tvg-name="([^"]*)"/);
      if (tvgNameMatch) current.tvgName = tvgNameMatch[1];
    } else if (current && !line.startsWith('#')) {
      current.url = line;
      channels.push(current);
      current = null;
    }
  }
  return channels;
}

// ── Routes ──────────────────────────────────────────────────────────

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

// Parse M3U from URL
app.post('/api/m3u/url', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL required' });
    const response = await axios.get(url, {
      timeout: 30000,
      headers: { 'User-Agent': 'IPTV-Player/1.0' },
      responseType: 'text'
    });
    const channels = parseM3U(response.data);
    res.json({ channels, count: channels.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch M3U: ' + err.message });
  }
});

// Parse M3U from file upload
app.post('/api/m3u/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'File required' });
    const content = req.file.buffer.toString('utf-8');
    const channels = parseM3U(content);
    res.json({ channels, count: channels.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to parse M3U: ' + err.message });
  }
});

// Parse M3U from raw text
app.post('/api/m3u/text', (req, res) => {
  try {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'Content required' });
    const channels = parseM3U(content);
    res.json({ channels, count: channels.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to parse M3U: ' + err.message });
  }
});

// Proxy stream (for CORS bypass)
app.get('/api/proxy/stream', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'URL required' });

    const response = await axios({
      method: 'GET',
      url: decodeURIComponent(url),
      responseType: 'stream',
      timeout: 15000,
      headers: { 'User-Agent': 'IPTV-Player/1.0' }
    });

    res.setHeader('Content-Type', response.headers['content-type'] || 'video/mp2t');
    res.setHeader('Access-Control-Allow-Origin', '*');
    response.data.pipe(res);
  } catch (err) {
    res.status(500).json({ error: 'Proxy error: ' + err.message });
  }
});

// Get stream info (check if alive)
app.post('/api/stream/check', async (req, res) => {
  try {
    const { url } = req.body;
    const response = await axios.head(url, { timeout: 8000, headers: { 'User-Agent': 'IPTV-Player/1.0' } });
    res.json({ alive: true, contentType: response.headers['content-type'], status: response.status });
  } catch (err) {
    res.json({ alive: false, error: err.message });
  }
});

// EPG fetch
app.post('/api/epg/fetch', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'EPG URL required' });
    const response = await axios.get(url, {
      timeout: 30000,
      headers: { 'User-Agent': 'IPTV-Player/1.0' },
      responseType: 'text'
    });
    // Return raw XML - frontend will parse
    res.setHeader('Content-Type', 'application/xml');
    res.send(response.data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch EPG: ' + err.message });
  }
});

// Download proxy (for films/videos)
app.get('/api/download', async (req, res) => {
  try {
    const { url, filename } = req.query;
    if (!url) return res.status(400).json({ error: 'URL required' });

    const decodedUrl = decodeURIComponent(url);
    const name = filename ? decodeURIComponent(filename) : path.basename(decodedUrl) || 'video.mp4';

    const response = await axios({
      method: 'GET',
      url: decodedUrl,
      responseType: 'stream',
      timeout: 60000,
      headers: { 'User-Agent': 'IPTV-Player/1.0' }
    });

    const contentLength = response.headers['content-length'];
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.setHeader('Content-Type', response.headers['content-type'] || 'application/octet-stream');
    if (contentLength) res.setHeader('Content-Length', contentLength);
    res.setHeader('Access-Control-Allow-Origin', '*');
    response.data.pipe(res);
  } catch (err) {
    res.status(500).json({ error: 'Download failed: ' + err.message });
  }
});

// ── Start ───────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 IPTV Player Backend running on port ${PORT}`);
});
