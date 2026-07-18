import { api } from './api.js';
import { parseChordPro, renderChordPro } from './chordpro.js';
import { chordDiagram, CHORD_LIBRARY } from './chords.js';

const app = document.getElementById('app');
const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtDate = (iso) => { try { return new Date(iso).toLocaleDateString('ja-JP'); } catch { return ''; } };
const toast = (msg, kind = 'ok') => {
  const t = el(`<div class="toast ${kind}">${esc(msg)}</div>`);
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2600);
};

// ---------------- ルーター ----------------
const routes = [];
const route = (pattern, handler) => routes.push({ pattern, handler });
function navigate(path) { if (location.hash.slice(1) === path) render(); else location.hash = path; }
window.navigate = navigate;

async function render() {
  const path = location.hash.slice(1) || '/';
  const [pathname, query] = path.split('?');
  const params = new URLSearchParams(query || '');
  for (const r of routes) {
    const keys = [];
    const rx = new RegExp('^' + r.pattern.replace(/:[^/]+/g, (m) => { keys.push(m.slice(1)); return '([^/]+)'; }) + '$');
    const m = pathname.match(rx);
    if (m) {
      const args = {};
      keys.forEach((k, i) => { args[k] = decodeURIComponent(m[i + 1]); });
      setActiveNav(pathname);
      app.innerHTML = '<div class="loading">読み込み中…</div>';
      try { await r.handler(args, params); } catch (e) { app.innerHTML = `<div class="empty">エラー: ${esc(e.message)}</div>`; }
      window.scrollTo(0, 0);
      return;
    }
  }
  app.innerHTML = '<div class="empty">ページが見つかりません</div>';
}
window.addEventListener('hashchange', render);

function setActiveNav(pathname) {
  document.querySelectorAll('.nav a').forEach((a) => {
    const href = a.getAttribute('href').slice(1);
    a.classList.toggle('active', href === pathname || (href === '/' && pathname === '/'));
  });
}

// ---------------- ライブラリ（一覧） ----------------
route('/', async (_args, params) => {
  const [scores, docs] = await Promise.all([api.listScores(), api.listDocuments()]);
  const all = [
    ...scores.map((s) => ({ ...s, _kind: 'score' })),
    ...docs.map((d) => ({ ...d, _kind: 'document' })),
  ].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

  const q = (params.get('q') || '').toLowerCase();
  const filter = params.get('filter') || 'all';
  const tag = params.get('tag') || '';

  let items = all;
  if (filter === 'scores') items = items.filter((i) => i._kind === 'score');
  if (filter === 'documents') items = items.filter((i) => i._kind === 'document');
  if (tag) items = items.filter((i) => (i.tags || []).includes(tag));
  if (q) items = items.filter((i) => `${i.title} ${i.artist} ${(i.tags || []).join(' ')}`.toLowerCase().includes(q));

  const allTags = [...new Set(all.flatMap((i) => i.tags || []))].sort();

  const view = el(`
    <div>
      <div class="page-head">
        <h1>🎸 ライブラリ</h1>
        <div class="head-actions">
          <button class="btn" id="new-chord">+ コード譜</button>
          <button class="btn" id="new-tab">+ TAB譜</button>
          <button class="btn primary" id="upload">↑ PDF/画像</button>
        </div>
      </div>
      <div class="toolbar">
        <input class="search" id="search" type="search" placeholder="曲名・アーティスト・タグで検索…" value="${esc(params.get('q') || '')}">
        <div class="chips">
          <a class="chip ${filter === 'all' ? 'on' : ''}" href="#/?filter=all">すべて (${all.length})</a>
          <a class="chip ${filter === 'scores' ? 'on' : ''}" href="#/?filter=scores">オリジナル (${scores.length})</a>
          <a class="chip ${filter === 'documents' ? 'on' : ''}" href="#/?filter=documents">アップロード (${docs.length})</a>
        </div>
      </div>
      ${allTags.length ? `<div class="tagbar">${tag ? `<a class="tag on" href="#/?filter=${filter}">タグ: ${esc(tag)} ✕</a>` : ''}${allTags.filter((t) => t !== tag).map((t) => `<a class="tag" href="#/?filter=${filter}&tag=${encodeURIComponent(t)}">${esc(t)}</a>`).join('')}</div>` : ''}
      <div class="grid" id="grid"></div>
    </div>
  `);

  const grid = view.querySelector('#grid');
  if (items.length === 0) {
    grid.appendChild(el(`<div class="empty">まだ楽譜がありません。<br>「+ コード譜」で作成、または「↑ PDF/画像」でYamahaのPDFやU-FRETのスクショを取り込みましょう。</div>`));
  } else {
    for (const i of items) grid.appendChild(card(i));
  }

  view.querySelector('#new-chord').onclick = () => navigate('/scores/new?type=chord');
  view.querySelector('#new-tab').onclick = () => navigate('/scores/new?type=tab');
  view.querySelector('#upload').onclick = () => navigate('/upload');
  const search = view.querySelector('#search');
  search.oninput = debounce(() => {
    const v = search.value.trim();
    navigate(`/?filter=${filter}${v ? `&q=${encodeURIComponent(v)}` : ''}`);
    setTimeout(() => { const s = document.querySelector('#search'); if (s) { s.focus(); s.setSelectionRange(v.length, v.length); } }, 0);
  }, 250);

  app.replaceChildren(view);
});

function card(i) {
  const isScore = i._kind === 'score';
  const badge = isScore
    ? (i.type === 'tab' ? '<span class="badge tab">TAB</span>' : '<span class="badge chord">コード譜</span>')
    : (i.fileType === 'pdf' ? '<span class="badge pdf">PDF</span>' : '<span class="badge img">画像</span>');
  const thumb = isScore
    ? `<div class="thumb ${i.type === 'tab' ? 'thumb-tab' : 'thumb-chord'}">${i.type === 'tab' ? 'TAB' : '♪'}</div>`
    : (i.fileType === 'image'
      ? `<div class="thumb thumb-img" style="background-image:url('${api.documentFileUrl(i.id)}')"></div>`
      : `<div class="thumb thumb-pdf">PDF</div>`);
  const href = isScore ? `#/scores/${i.id}` : `#/documents/${i.id}`;
  const meta = [i.source, i.key ? `Key ${i.key}` : '', i.capo ? `Capo ${i.capo}` : ''].filter(Boolean).join(' · ');
  const c = el(`
    <a class="card" href="${href}">
      ${thumb}
      <div class="card-body">
        <div class="card-top">${badge}<span class="card-date">${fmtDate(i.updatedAt)}</span></div>
        <div class="card-title">${esc(i.title || '無題')}</div>
        <div class="card-artist">${esc(i.artist || '')}</div>
        ${meta ? `<div class="card-meta">${esc(meta)}</div>` : ''}
        ${(i.tags || []).length ? `<div class="card-tags">${i.tags.map((t) => `<span class="mini-tag">${esc(t)}</span>`).join('')}</div>` : ''}
      </div>
    </a>
  `);
  return c;
}

// ---------------- スコア表示 ----------------
route('/scores/:id', async ({ id }) => {
  const s = await api.getScore(id);
  const view = el(`
    <div>
      <div class="page-head">
        <div><a class="back" href="#/">← ライブラリ</a><h1>${esc(s.title)}</h1>
          <div class="sub">${esc(s.artist || '')} ${metaLine(s)}</div></div>
        <div class="head-actions">
          <button class="btn" id="edit">編集</button>
          <button class="btn" id="print">🖨 印刷</button>
          <button class="btn danger" id="del">削除</button>
        </div>
      </div>
      <div id="body"></div>
    </div>
  `);
  const body = view.querySelector('#body');
  if (s.type === 'tab') body.appendChild(renderTabView(s));
  else body.appendChild(renderChordView(s));

  view.querySelector('#edit').onclick = () => navigate(`/scores/${id}/edit`);
  view.querySelector('#print').onclick = () => window.print();
  view.querySelector('#del').onclick = async () => {
    if (!confirm('この楽譜を削除しますか？')) return;
    await api.deleteScore(id); toast('削除しました'); navigate('/');
  };
  app.replaceChildren(view);
});

function metaLine(s) {
  const parts = [];
  if (s.key) parts.push(`Key: ${s.key}`);
  if (s.capo) parts.push(`Capo: ${s.capo}`);
  if (s.tuning && s.tuning !== 'EADGBE') parts.push(`Tuning: ${s.tuning}`);
  if (s.bpm) parts.push(`♩=${s.bpm}`);
  return parts.length ? `<span class="metaline">${esc(parts.join(' / '))}</span>` : '';
}

function renderChordView(s) {
  const parsed = parseChordPro(s.body);
  const wrap = el('<div class="score-sheet"></div>');
  const chords = parsed.usedChords;
  if (chords.length) {
    const panel = el('<div class="diagram-panel"></div>');
    for (const name of chords) panel.insertAdjacentHTML('beforeend', `<div class="diagram">${chordDiagram(name, parsed.customDefs)}</div>`);
    wrap.appendChild(panel);
  }
  wrap.insertAdjacentHTML('beforeend', `<div class="chord-sheet">${renderChordPro(parsed)}</div>`);
  return wrap;
}

function renderTabView(s) {
  const wrap = el('<div class="score-sheet"></div>');
  wrap.insertAdjacentHTML('beforeend', `<pre class="tab-sheet">${esc(s.body || '')}</pre>`);
  return wrap;
}

// ---------------- スコア編集 / 新規 ----------------
route('/scores/new', async (_args, params) => editor(null, params.get('type') || 'chord'));
route('/scores/:id/edit', async ({ id }) => { const s = await api.getScore(id); editor(s, s.type); });

const CHORD_SAMPLE = `{title: 練習用サンプル}
{artist: }
{key: G}
{capo: 0}

{c: イントロ}
[G] [D] [Em] [C]

{c: Aメロ}
[G]ここに歌詞を[D]書きます
[Em]コードは角[C]カッコで[G]囲む

# ↑ の行のように [コード]歌詞 と書くと歌詞の上にコードが乗ります
# {c: 見出し} でセクション名、{define: 名前 base:1 frets:x,3,2,0,3,0} で独自コードも定義できます`;

const TAB_SAMPLE = `e|-----------------|
B|-----------------|
G|-----0-----------|
D|---2---2---0-----|
A|-3-------3-------|
E|-----------------|

# 数字=押さえるフレット、-=何もしない。
# 上から 1弦(e)→6弦(E)。小節は | で区切ります。`;

function editor(existing, type) {
  const isTab = type === 'tab';
  const s = existing || { type, title: '', artist: '', key: '', capo: 0, tuning: 'EADGBE', bpm: '', tags: [], body: isTab ? TAB_SAMPLE : CHORD_SAMPLE };
  const view = el(`
    <div>
      <div class="page-head">
        <div><a class="back" href="${existing ? `#/scores/${s.id}` : '#/'}">← 戻る</a>
          <h1>${existing ? '編集' : (isTab ? '新規 TAB譜' : '新規 コード譜')}</h1></div>
        <div class="head-actions">
          <button class="btn primary" id="save">保存</button>
        </div>
      </div>
      <div class="editor">
        <div class="editor-fields">
          <label>曲名<input id="f-title" value="${esc(s.title)}" placeholder="曲名"></label>
          <label>アーティスト<input id="f-artist" value="${esc(s.artist)}" placeholder="アーティスト"></label>
          <label>キー<input id="f-key" value="${esc(s.key)}" placeholder="G"></label>
          <label>カポ<input id="f-capo" type="number" min="0" max="12" value="${esc(s.capo || 0)}"></label>
          <label>チューニング<input id="f-tuning" value="${esc(s.tuning || 'EADGBE')}"></label>
          <label>テンポ(BPM)<input id="f-bpm" value="${esc(s.bpm)}" placeholder="120"></label>
          <label class="wide">タグ（カンマ区切り）<input id="f-tags" value="${esc((s.tags || []).join(', '))}" placeholder="練習中, ソロギター"></label>
        </div>
        <div class="editor-split">
          <div class="editor-pane">
            <div class="pane-head">入力 ${isTab ? '（TAB譜）' : '（ChordPro形式）'}</div>
            <textarea id="f-body" class="${isTab ? 'mono' : ''}" spellcheck="false">${esc(s.body)}</textarea>
          </div>
          <div class="editor-pane">
            <div class="pane-head">プレビュー</div>
            <div id="preview" class="preview"></div>
          </div>
        </div>
        ${isTab ? tabHelp() : chordHelp()}
      </div>
    </div>
  `);

  const bodyEl = view.querySelector('#f-body');
  const preview = view.querySelector('#preview');
  const updatePreview = () => {
    const s2 = { type, body: bodyEl.value, ...readMeta(view) };
    preview.replaceChildren(isTab ? renderTabView(s2) : renderChordView(s2));
  };
  bodyEl.addEventListener('input', debounce(updatePreview, 150));
  updatePreview();

  view.querySelector('#save').onclick = async () => {
    const data = { type, body: bodyEl.value, ...readMeta(view) };
    if (!data.title) data.title = '無題';
    try {
      const saved = existing ? await api.updateScore(s.id, data) : await api.createScore(data);
      toast('保存しました'); navigate(`/scores/${saved.id}`);
    } catch (e) { toast(`保存失敗: ${e.message}`, 'err'); }
  };
  app.replaceChildren(view);
}

function readMeta(view) {
  return {
    title: view.querySelector('#f-title').value.trim(),
    artist: view.querySelector('#f-artist').value.trim(),
    key: view.querySelector('#f-key').value.trim(),
    capo: view.querySelector('#f-capo').value,
    tuning: view.querySelector('#f-tuning').value.trim(),
    bpm: view.querySelector('#f-bpm').value.trim(),
    tags: view.querySelector('#f-tags').value,
  };
}

function chordHelp() {
  const chords = Object.keys(CHORD_LIBRARY).join(', ');
  return `<details class="help"><summary>コード譜の書き方 / 使えるコード</summary>
    <ul>
      <li><code>[C]歌詞</code> … 歌詞の上にコードが乗ります</li>
      <li><code>{c: サビ}</code> … セクション見出し（Aメロ・サビなど）</li>
      <li><code>{key: G}</code> <code>{capo: 2}</code> … 上部フィールドと同期しなくてもここで書けます</li>
      <li><code>{define: Cadd9 base:1 frets:x,3,2,0,3,0}</code> … オリジナルの押さえ方を追加</li>
      <li><code>#</code> で始まる行はメモ（表示されません）</li>
    </ul>
    <div class="help-chords"><b>収録コード:</b> ${esc(chords)}<br>（無い場合は {define:} で自作、または名前だけ表示されます）</div>
  </details>`;
}

function tabHelp() {
  return `<details class="help"><summary>TAB譜の書き方</summary>
    <ul>
      <li>6行で1弦〜6弦。数字=フレット、<code>-</code>=休み、<code>|</code>=小節線</li>
      <li>等幅フォントで表示されるので、桁を揃えると綺麗になります</li>
      <li>ハンマリング <code>h</code> / プリング <code>p</code> / スライド <code>/</code> <code>\\</code> などを混ぜてもOK</li>
    </ul></details>`;
}

// ---------------- ドキュメント表示 ----------------
route('/documents/:id', async ({ id }) => {
  const d = await api.getDocument(id);
  const fileUrl = api.documentFileUrl(id);
  const view = el(`
    <div>
      <div class="page-head">
        <div><a class="back" href="#/">← ライブラリ</a><h1>${esc(d.title)}</h1>
          <div class="sub">${esc(d.artist || '')} ${metaLine(d)} ${d.source ? `<span class="metaline">出典: ${esc(d.source)}</span>` : ''}</div></div>
        <div class="head-actions">
          <a class="btn" href="${fileUrl}" target="_blank" rel="noopener">別タブで開く</a>
          <button class="btn" id="edit">情報を編集</button>
          <button class="btn danger" id="del">削除</button>
        </div>
      </div>
      ${d.notes ? `<div class="doc-notes">📝 ${esc(d.notes).replace(/\n/g, '<br>')}</div>` : ''}
      <div class="viewer">
        ${d.fileType === 'pdf'
          ? `<iframe class="pdf-frame" src="${fileUrl}#view=FitH" title="${esc(d.title)}"></iframe>`
          : `<img class="doc-img" src="${fileUrl}" alt="${esc(d.title)}">`}
      </div>
    </div>
  `);
  view.querySelector('#edit').onclick = () => navigate(`/documents/${id}/edit`);
  view.querySelector('#del').onclick = async () => {
    if (!confirm('この楽譜（アップロードファイル）を削除しますか？')) return;
    await api.deleteDocument(id); toast('削除しました'); navigate('/');
  };
  app.replaceChildren(view);
});

// ---------------- ドキュメント情報編集 ----------------
route('/documents/:id/edit', async ({ id }) => {
  const d = await api.getDocument(id);
  const view = el(`
    <div>
      <div class="page-head">
        <div><a class="back" href="#/documents/${id}">← 戻る</a><h1>情報を編集</h1></div>
        <div class="head-actions"><button class="btn primary" id="save">保存</button></div>
      </div>
      <div class="editor-fields card-form">
        <label>曲名<input id="f-title" value="${esc(d.title)}"></label>
        <label>アーティスト<input id="f-artist" value="${esc(d.artist)}"></label>
        <label>出典<input id="f-source" value="${esc(d.source || '')}" placeholder="Yamaha / U-FRET など"></label>
        <label>キー<input id="f-key" value="${esc(d.key || '')}"></label>
        <label>カポ<input id="f-capo" type="number" min="0" max="12" value="${esc(d.capo || 0)}"></label>
        <label>チューニング<input id="f-tuning" value="${esc(d.tuning || '')}"></label>
        <label class="wide">タグ（カンマ区切り）<input id="f-tags" value="${esc((d.tags || []).join(', '))}"></label>
        <label class="wide">メモ<textarea id="f-notes" rows="4">${esc(d.notes || '')}</textarea></label>
      </div>
    </div>
  `);
  view.querySelector('#save').onclick = async () => {
    const data = {
      title: view.querySelector('#f-title').value.trim() || '無題',
      artist: view.querySelector('#f-artist').value.trim(),
      source: view.querySelector('#f-source').value.trim(),
      key: view.querySelector('#f-key').value.trim(),
      capo: view.querySelector('#f-capo').value,
      tuning: view.querySelector('#f-tuning').value.trim(),
      tags: view.querySelector('#f-tags').value,
      notes: view.querySelector('#f-notes').value,
    };
    await api.updateDocument(id, data); toast('保存しました'); navigate(`/documents/${id}`);
  };
  app.replaceChildren(view);
});

// ---------------- アップロード ----------------
route('/upload', async () => {
  const view = el(`
    <div>
      <div class="page-head"><div><a class="back" href="#/">← ライブラリ</a><h1>PDF / 画像をアップロード</h1>
        <div class="sub">YamahaのPDFや、U-FRET画面のスクリーンショットを取り込みます</div></div></div>
      <div class="upload-zone" id="drop">
        <div class="upload-inner">
          <div class="upload-icon">↑</div>
          <p>ここにファイルをドラッグ、または<label class="link" for="file">クリックして選択</label></p>
          <p class="hint">PDF / PNG / JPEG / WebP（最大50MB）</p>
          <input type="file" id="file" accept="application/pdf,image/*" hidden>
        </div>
      </div>
      <div id="preview-area"></div>
      <div class="editor-fields card-form" id="form" hidden>
        <label>曲名<input id="f-title" placeholder="曲名"></label>
        <label>アーティスト<input id="f-artist" placeholder="アーティスト"></label>
        <label>出典<input id="f-source" placeholder="Yamaha / U-FRET など"></label>
        <label>キー<input id="f-key" placeholder="G"></label>
        <label>カポ<input id="f-capo" type="number" min="0" max="12" value="0"></label>
        <label>チューニング<input id="f-tuning" placeholder="EADGBE"></label>
        <label class="wide">タグ（カンマ区切り）<input id="f-tags" placeholder="練習中, ソロギター"></label>
        <label class="wide">メモ<textarea id="f-notes" rows="3" placeholder="難所・運指のメモなど"></textarea></label>
        <div class="wide"><button class="btn primary" id="do-upload">アップロードして保存</button></div>
      </div>
    </div>
  `);
  const fileInput = view.querySelector('#file');
  const drop = view.querySelector('#drop');
  const form = view.querySelector('#form');
  const previewArea = view.querySelector('#preview-area');
  let selected = null;

  const pick = (file) => {
    if (!file) return;
    const okTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif'];
    if (!okTypes.includes(file.type)) { toast('PDFまたは画像を選んでください', 'err'); return; }
    selected = file;
    form.hidden = false;
    const titleInput = view.querySelector('#f-title');
    if (!titleInput.value) titleInput.value = file.name.replace(/\.[^.]+$/, '');
    previewArea.innerHTML = file.type === 'application/pdf'
      ? `<div class="upload-preview pdf">📄 ${esc(file.name)}（${(file.size / 1024 / 1024).toFixed(1)}MB）</div>`
      : `<div class="upload-preview"><img src="${URL.createObjectURL(file)}" alt="preview"></div>`;
  };

  fileInput.onchange = () => pick(fileInput.files[0]);
  drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
  drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); pick(e.dataTransfer.files[0]); };

  view.querySelector('#do-upload').onclick = async () => {
    if (!selected) { toast('ファイルを選んでください', 'err'); return; }
    const fd = new FormData();
    fd.append('file', selected);
    for (const [key, id] of [['title', 'f-title'], ['artist', 'f-artist'], ['source', 'f-source'], ['key', 'f-key'], ['capo', 'f-capo'], ['tuning', 'f-tuning'], ['tags', 'f-tags'], ['notes', 'f-notes']]) {
      fd.append(key, view.querySelector('#' + id).value);
    }
    try {
      const saved = await api.uploadDocument(fd);
      toast('アップロードしました'); navigate(`/documents/${saved.id}`);
    } catch (e) { toast(`アップロード失敗: ${e.message}`, 'err'); }
  };
  app.replaceChildren(view);
});

// ---------------- コード辞典 ----------------
route('/chords', async () => {
  const view = el(`
    <div>
      <div class="page-head"><div><a class="back" href="#/">← ライブラリ</a><h1>コード辞典</h1>
        <div class="sub">収録されているコードの押さえ方一覧</div></div></div>
      <div class="diagram-panel big" id="all"></div>
    </div>
  `);
  const all = view.querySelector('#all');
  for (const name of Object.keys(CHORD_LIBRARY)) {
    all.insertAdjacentHTML('beforeend', `<div class="diagram">${chordDiagram(name)}</div>`);
  }
  app.replaceChildren(view);
});

// ---------------- utils ----------------
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

// 起動
if (!location.hash) location.hash = '/';
render();

// サービスワーカー登録（PWA / オフライン対応）
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => { /* noop */ });
}
