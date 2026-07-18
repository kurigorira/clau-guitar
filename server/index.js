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

// ============ 練習記録 ============
const clampInt = (v, min, max, def) => {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, n));
};

app.get('/api/practice', async (_req, res) => {
  const items = (await list('practice')).sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));
  res.json(items);
});

app.post('/api/practice', async (req, res) => {
  const b = req.body || {};
  const record = {
    id: newId(),
    kind: 'practice',
    date: /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? b.date : new Date().toISOString().slice(0, 10),
    minutes: clampInt(b.minutes, 0, 1440, 0),
    rating: clampInt(b.rating, 0, 5, 0),
    itemKind: ['score', 'document'].includes(b.itemKind) ? b.itemKind : '',
    itemId: (b.itemId || '').toString().slice(0, 80),
    itemTitle: (b.itemTitle || '').toString().slice(0, 200),
    memo: (b.memo || '').toString().slice(0, 4000),
    createdAt: now(),
  };
  await put('practice', record);
  res.status(201).json(record);
});

app.put('/api/practice/:id', async (req, res) => {
  const existing = await get('practice', req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const b = req.body || {};
  const updated = { ...existing };
  if (/^\d{4}-\d{2}-\d{2}$/.test(b.date)) updated.date = b.date;
  if (b.minutes !== undefined) updated.minutes = clampInt(b.minutes, 0, 1440, existing.minutes);
  if (b.rating !== undefined) updated.rating = clampInt(b.rating, 0, 5, existing.rating);
  if (b.memo !== undefined) updated.memo = b.memo.toString().slice(0, 4000);
  await put('practice', updated);
  res.json(updated);
});

app.delete('/api/practice/:id', async (req, res) => {
  res.json({ ok: await remove('practice', req.params.id) });
});

// ============ セットリスト ============
const cleanItems = (arr) => (Array.isArray(arr) ? arr : []).slice(0, 200).map((it) => ({
  kind: ['score', 'document'].includes(it.kind) ? it.kind : 'score',
  id: (it.id || '').toString().slice(0, 80),
  title: (it.title || '無題').toString().slice(0, 200),
  artist: (it.artist || '').toString().slice(0, 200),
})).filter((it) => it.id);

app.get('/api/setlists', async (_req, res) => {
  const items = (await list('setlists')).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  res.json(items);
});

app.get('/api/setlists/:id', async (req, res) => {
  const item = await get('setlists', req.params.id);
  if (!item) return res.status(404).json({ error: 'not found' });
  res.json(item);
});

app.post('/api/setlists', async (req, res) => {
  const b = req.body || {};
  const record = {
    id: newId(),
    kind: 'setlist',
    name: (b.name || '無題のセットリスト').toString().slice(0, 200),
    notes: (b.notes || '').toString().slice(0, 4000),
    items: cleanItems(b.items),
    createdAt: now(),
    updatedAt: now(),
  };
  await put('setlists', record);
  res.status(201).json(record);
});

app.put('/api/setlists/:id', async (req, res) => {
  const existing = await get('setlists', req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const b = req.body || {};
  const updated = { ...existing, updatedAt: now() };
  if (b.name !== undefined) updated.name = b.name.toString().slice(0, 200);
  if (b.notes !== undefined) updated.notes = b.notes.toString().slice(0, 4000);
  if (b.items !== undefined) updated.items = cleanItems(b.items);
  await put('setlists', updated);
  res.json(updated);
});

app.delete('/api/setlists/:id', async (req, res) => {
  res.json({ ok: await remove('setlists', req.params.id) });
});

// ============ バックアップ用エクスポート（メタデータをまとめてJSONで）============
app.get('/api/export', async (_req, res) => {
  const [scores, documents, practice, setlists] = await Promise.all([
    list('scores'), list('documents'), list('practice'), list('setlists'),
  ]);
  res.setHeader('Content-Disposition', `attachment; filename="clau-guitar-backup-${Date.now()}.json"`);
  res.json({ exportedAt: now(), scores, documents, practice, setlists });
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
