import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  ensureDirs, newId, list, get, put, remove, UPLOAD_DIR, DATA_DIR,
} from './store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');
const PORT = process.env.PORT || 5173;

await ensureDirs();

const app = express();
app.use(express.json({ limit: '2mb' }));

// ---- アップロード設定（画像/PDFのみ、50MBまで）----
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${newId()}${ext}`);
  },
});
const ALLOWED = new Set([
  'application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif',
]);
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, ALLOWED.has(file.mimetype));
  },
});

const now = () => new Date().toISOString();
const asArray = (v) => (Array.isArray(v) ? v : typeof v === 'string' && v.trim()
  ? v.split(',').map((s) => s.trim()).filter(Boolean) : []);

// ============ オリジナル楽譜（コード譜 / TAB譜）============
app.get('/api/scores', async (_req, res) => {
  const items = (await list('scores')).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  res.json(items);
});

app.get('/api/scores/:id', async (req, res) => {
  const item = await get('scores', req.params.id);
  if (!item) return res.status(404).json({ error: 'not found' });
  res.json(item);
});

app.post('/api/scores', async (req, res) => {
  const b = req.body || {};
  const record = {
    id: newId(),
    kind: 'score',
    type: b.type === 'tab' ? 'tab' : 'chord',
    title: (b.title || '無題').toString().slice(0, 200),
    artist: (b.artist || '').toString().slice(0, 200),
    key: (b.key || '').toString().slice(0, 20),
    capo: Number.isFinite(+b.capo) ? +b.capo : 0,
    tuning: (b.tuning || 'EADGBE').toString().slice(0, 40),
    bpm: (b.bpm || '').toString().slice(0, 10),
    tags: asArray(b.tags),
    body: (b.body || '').toString(),
    createdAt: now(),
    updatedAt: now(),
  };
  await put('scores', record);
  res.status(201).json(record);
});

app.put('/api/scores/:id', async (req, res) => {
  const existing = await get('scores', req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const b = req.body || {};
  const updated = {
    ...existing,
    type: b.type === 'tab' ? 'tab' : (b.type === 'chord' ? 'chord' : existing.type),
    title: b.title !== undefined ? b.title.toString().slice(0, 200) : existing.title,
    artist: b.artist !== undefined ? b.artist.toString().slice(0, 200) : existing.artist,
    key: b.key !== undefined ? b.key.toString().slice(0, 20) : existing.key,
    capo: b.capo !== undefined && Number.isFinite(+b.capo) ? +b.capo : existing.capo,
    tuning: b.tuning !== undefined ? b.tuning.toString().slice(0, 40) : existing.tuning,
    bpm: b.bpm !== undefined ? b.bpm.toString().slice(0, 10) : existing.bpm,
    tags: b.tags !== undefined ? asArray(b.tags) : existing.tags,
    body: b.body !== undefined ? b.body.toString() : existing.body,
    updatedAt: now(),
  };
  await put('scores', updated);
  res.json(updated);
});

app.delete('/api/scores/:id', async (req, res) => {
  const ok = await remove('scores', req.params.id);
  res.json({ ok });
});

// ============ アップロード楽譜（PDF / 画像）============
app.get('/api/documents', async (_req, res) => {
  const items = (await list('documents')).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  res.json(items);
});

app.get('/api/documents/:id', async (req, res) => {
  const item = await get('documents', req.params.id);
  if (!item) return res.status(404).json({ error: 'not found' });
  res.json(item);
});

app.post('/api/documents', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'ファイルが必要です（PDFまたは画像）' });
  const b = req.body || {};
  const record = {
    id: newId(),
    kind: 'document',
    title: (b.title || req.file.originalname || '無題').toString().slice(0, 200),
    artist: (b.artist || '').toString().slice(0, 200),
    source: (b.source || '').toString().slice(0, 40), // 例: Yamaha, U-FRET
    key: (b.key || '').toString().slice(0, 20),
    capo: Number.isFinite(+b.capo) ? +b.capo : 0,
    tuning: (b.tuning || '').toString().slice(0, 40),
    tags: asArray(b.tags),
    notes: (b.notes || '').toString().slice(0, 5000),
    fileType: req.file.mimetype === 'application/pdf' ? 'pdf' : 'image',
    filename: req.file.filename,
    originalName: req.file.originalname,
    mime: req.file.mimetype,
    size: req.file.size,
    createdAt: now(),
    updatedAt: now(),
  };
  await put('documents', record);
  res.status(201).json(record);
});

app.put('/api/documents/:id', async (req, res) => {
  const existing = await get('documents', req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const b = req.body || {};
  const fields = ['title', 'artist', 'source', 'key', 'tuning', 'notes'];
  const updated = { ...existing, updatedAt: now() };
  for (const f of fields) if (b[f] !== undefined) updated[f] = b[f].toString();
  if (b.capo !== undefined && Number.isFinite(+b.capo)) updated.capo = +b.capo;
  if (b.tags !== undefined) updated.tags = asArray(b.tags);
  await put('documents', updated);
  res.json(updated);
});

app.delete('/api/documents/:id', async (req, res) => {
  const existing = await get('documents', req.params.id);
  if (existing?.filename) {
    try { await fs.unlink(path.join(UPLOAD_DIR, existing.filename)); } catch { /* noop */ }
  }
  const ok = await remove('documents', req.params.id);
  res.json({ ok });
});

// アップロードした実ファイルを返す（PDFはインライン表示）
app.get('/api/documents/:id/file', async (req, res) => {
  const item = await get('documents', req.params.id);
  if (!item?.filename) return res.status(404).end();
  const filePath = path.join(UPLOAD_DIR, item.filename);
  res.setHeader('Content-Type', item.mime || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(item.originalName || item.filename)}"`);
  res.sendFile(filePath, (err) => { if (err && !res.headersSent) res.status(404).end(); });
});

// ============ バックアップ用エクスポート（メタデータをまとめてJSONで）============
app.get('/api/export', async (_req, res) => {
  const [scores, documents] = await Promise.all([list('scores'), list('documents')]);
  res.setHeader('Content-Disposition', `attachment; filename="clau-guitar-backup-${Date.now()}.json"`);
  res.json({ exportedAt: now(), scores, documents });
});

// ============ 静的ファイル（PWAフロント）============
app.use(express.static(PUBLIC_DIR));
// SPAフォールバック（APIとファイル以外はindex.htmlを返す）
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🎸 clau-guitar が起動しました`);
  console.log(`  このPC:      http://localhost:${PORT}`);
  console.log(`  スマホから:  http://<このPCのIPアドレス>:${PORT}  （同じWi‑Fiに接続）`);
  console.log(`  データ保存先: ${DATA_DIR}\n`);
});
