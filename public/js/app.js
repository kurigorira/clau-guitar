import { api } from './api.js';
import { parseChordPro, renderChordPro } from './chordpro.js';
import { chordDiagram, CHORD_LIBRARY } from './chords.js';
import { transposeChord, transposeKey, shiftLabel } from './transpose.js';

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
          <div class="sub">${esc(s.artist || '')} <span id="metaline">${metaLine(s)}</span></div></div>
        <div class="head-actions">
          <button class="btn" id="rec">＋ 練習を記録</button>
          <button class="btn" id="edit">編集</button>
          <button class="btn" id="print">🖨 印刷</button>
          <button class="btn danger" id="del">削除</button>
        </div>
      </div>
      <div id="controls"></div>
      <div id="body"></div>
    </div>
  `);
  const body = view.querySelector('#body');
  const controls = view.querySelector('#controls');

  if (s.type === 'tab') {
    body.appendChild(renderTabView(s));
  } else {
    // 移調・カポ換算の状態（表示のみ、保存はしない）
    const state = { shift: 0, capo: Number(s.capo) || 0 };
    const rerender = () => {
      body.replaceChildren(renderChordView(s, state));
      view.querySelector('#metaline').innerHTML = metaLine(s, state);
    };
    controls.appendChild(chordControls(state, rerender));
    rerender();
  }

  view.querySelector('#rec').onclick = () => openPracticeDialog({ kind: 'score', id: s.id, title: s.title, artist: s.artist });
  view.querySelector('#edit').onclick = () => navigate(`/scores/${id}/edit`);
  view.querySelector('#print').onclick = () => window.print();
  view.querySelector('#del').onclick = async () => {
    if (!confirm('この楽譜を削除しますか？')) return;
    await api.deleteScore(id); toast('削除しました'); navigate('/');
  };
  app.replaceChildren(view);
});

// 移調(±半音) と カポ の操作バー
function chordControls(state, rerender) {
  const bar = el(`
    <div class="ctrl-bar">
      <div class="ctrl-group">
        <span class="ctrl-label">移調</span>
        <button class="ctrl-btn" id="down">♭ −1</button>
        <span class="ctrl-val" id="shiftval">±0</span>
        <button class="ctrl-btn" id="up">♯ +1</button>
        <button class="ctrl-btn ghost" id="reset">リセット</button>
      </div>
      <div class="ctrl-group">
        <span class="ctrl-label">カポ</span>
        <select id="capo" class="ctrl-select"></select>
      </div>
      <div class="ctrl-note" id="note"></div>
    </div>
  `);
  const capoSel = bar.querySelector('#capo');
  for (let i = 0; i <= 9; i++) capoSel.insertAdjacentHTML('beforeend', `<option value="${i}" ${i === state.capo ? 'selected' : ''}>${i === 0 ? 'なし' : i + 'フレット'}</option>`);
  const refresh = () => {
    bar.querySelector('#shiftval').textContent = shiftLabel(state.shift);
    const note = bar.querySelector('#note');
    if (state.capo > 0) {
      note.innerHTML = '上のコード＝実際に鳴る音／<b>下の図＝カポを付けて押さえる形</b>';
      note.hidden = false;
    } else { note.hidden = true; }
  };
  bar.querySelector('#down').onclick = () => { state.shift--; rerender(); refresh(); };
  bar.querySelector('#up').onclick = () => { state.shift++; rerender(); refresh(); };
  bar.querySelector('#reset').onclick = () => { state.shift = 0; rerender(); refresh(); };
  capoSel.onchange = () => { state.capo = Number(capoSel.value); rerender(); refresh(); };
  refresh();
  return bar;
}

function metaLine(s, state = {}) {
  const shift = state.shift || 0;
  const parts = [];
  if (s.key) {
    const shownKey = shift ? transposeKey(s.key, shift) : s.key;
    parts.push(shift ? `Key: ${shownKey}（原曲 ${s.key} ${shiftLabel(shift)}）` : `Key: ${s.key}`);
  } else if (shift) {
    parts.push(`移調 ${shiftLabel(shift)}`);
  }
  const capo = state.capo !== undefined ? state.capo : s.capo;
  if (capo) parts.push(`Capo: ${capo}`);
  if (s.tuning && s.tuning !== 'EADGBE') parts.push(`Tuning: ${s.tuning}`);
  if (s.bpm) parts.push(`♩=${s.bpm}`);
  return parts.length ? `<span class="metaline">${esc(parts.join(' / '))}</span>` : '';
}

// state = { shift: 表示の移調(半音), capo: カポ位置 }
// 歌詞の上のコード = 実際に鳴る音（原曲 + shift）
// ダイアグラム = 押さえる形（鳴る音 − capo）
function renderChordView(s, state = {}) {
  const shift = state.shift || 0;
  const capo = state.capo || 0;
  const parsed = parseChordPro(s.body);
  const wrap = el('<div class="score-sheet"></div>');

  // ダイアグラム（押さえる形）
  const shapeShift = shift - capo;
  const chords = parsed.usedChords;
  if (chords.length) {
    const panel = el('<div class="diagram-panel"></div>');
    for (const name of chords) {
      const shape = transposeChord(name, shapeShift);
      // カポ0・移調0のときだけ独自定義を使える（移調後は名前が変わり辞書対象外）
      const defs = shapeShift === 0 ? parsed.customDefs : {};
      panel.insertAdjacentHTML('beforeend', `<div class="diagram">${chordDiagram(shape, defs)}</div>`);
    }
    wrap.appendChild(panel);
  }

  // 歌詞上のコード（鳴る音）を移調して描画
  const shown = shift
    ? { ...parsed, blocks: parsed.blocks.map((b) => (b.type === 'line'
      ? { ...b, segs: b.segs.map((seg) => ({ chord: seg.chord ? transposeChord(seg.chord, shift) : seg.chord, text: seg.text })) }
      : b)) }
    : parsed;
  wrap.insertAdjacentHTML('beforeend', `<div class="chord-sheet">${renderChordPro(shown)}</div>`);
  return wrap;
}

function renderTabView(s) {
  const wrap = el('<div class="score-sheet"></div>');
  wrap.insertAdjacentHTML('beforeend', `<pre class="tab-sheet">${esc(s.body || '')}</pre>`);
  return wrap;
}

// ---------------- スコア編集 / 新規 ----------------
route('/scores/new', async (_args, params) => {
  const type = params.get('type') || 'chord';
  const refId = params.get('ref');
  let ref = null;
  if (refId) { try { ref = await api.getDocument(refId); } catch { /* 元ファイルが無ければ通常編集に */ } }
  editor(null, type, ref);
});
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

// 書き起こしモードの初期テンプレ（元楽譜の情報だけ埋め、中身は空欄からスタート）
function traceStarter(ref) {
  return `{title: ${ref.title || ''}}
{artist: ${ref.artist || ''}}
{key: ${ref.key || ''}}
{capo: ${ref.capo || 0}}

# 左の元楽譜を見ながら、下に書き起こしていきます。
# 使い方: [G]歌詞  … コードは角カッコ、そのうしろに歌詞
#         {c: サビ} … セクション見出し
# 下のサンプル行を消して入力してください。

{c: Aメロ}
[G]ここに歌詞[D]
`;
}

function editor(existing, type, ref = null) {
  const isTab = type === 'tab';
  const trace = !!ref && !existing;
  const startBody = isTab ? TAB_SAMPLE : (trace ? traceStarter(ref) : CHORD_SAMPLE);
  const s = existing || {
    type,
    title: trace ? (ref.title || '') : '',
    artist: trace ? (ref.artist || '') : '',
    key: trace ? (ref.key || '') : '',
    capo: trace ? (ref.capo || 0) : 0,
    tuning: trace ? (ref.tuning || 'EADGBE') : 'EADGBE',
    bpm: '',
    tags: trace ? [...(ref.tags || []), '書き起こし'] : [],
    body: startBody,
  };

  const splitInner = `
    <div class="editor-split">
      <div class="editor-pane">
        <div class="pane-head">入力 ${isTab ? '（TAB譜）' : '（ChordPro形式）'}</div>
        <textarea id="f-body" class="${isTab ? 'mono' : ''}" spellcheck="false">${esc(s.body)}</textarea>
      </div>
      <div class="editor-pane">
        <div class="pane-head">プレビュー</div>
        <div id="preview" class="preview"></div>
      </div>
    </div>`;

  const refPane = trace ? `
    <div class="trace-ref">
      <div class="pane-head">元の楽譜 ${ref.source ? `（${esc(ref.source)}）` : ''}
        <a class="ref-open" href="${api.documentFileUrl(ref.id)}" target="_blank" rel="noopener">拡大</a></div>
      <div class="trace-ref-body">
        ${ref.fileType === 'pdf'
          ? `<iframe class="pdf-frame" src="${api.documentFileUrl(ref.id)}#view=FitH" title="元の楽譜"></iframe>`
          : `<img class="doc-img" src="${api.documentFileUrl(ref.id)}" alt="元の楽譜">`}
      </div>
    </div>` : '';

  const view = el(`
    <div>
      <div class="page-head">
        <div><a class="back" href="${existing ? `#/scores/${s.id}` : (trace ? `#/documents/${ref.id}` : '#/')}">← 戻る</a>
          <h1>${existing ? '編集' : (isTab ? '新規 TAB譜' : (trace ? '書き起こし（コード譜）' : '新規 コード譜'))}</h1>
          ${trace ? '<div class="sub">左の元楽譜を見ながら入力してください。コードは <code>[G]</code> のように書きます</div>' : ''}</div>
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
        ${trace ? `<div class="trace">${refPane}<div class="trace-main">${splitInner}</div></div>` : splitInner}
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
          <button class="btn primary" id="trace">✎ コード譜に書き起こす</button>
          <button class="btn" id="rec">＋ 練習を記録</button>
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
  view.querySelector('#trace').onclick = () => navigate(`/scores/new?type=chord&ref=${d.id}`);
  view.querySelector('#rec').onclick = () => openPracticeDialog({ kind: 'document', id: d.id, title: d.title, artist: d.artist });
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

// ---------------- ライブラリ選択肢（ピッカー用） ----------------
async function loadLibraryItems() {
  const [scores, docs] = await Promise.all([api.listScores(), api.listDocuments()]);
  return [
    ...scores.map((s) => ({ kind: 'score', id: s.id, title: s.title, artist: s.artist })),
    ...docs.map((d) => ({ kind: 'document', id: d.id, title: d.title, artist: d.artist })),
  ];
}
function libraryOptions(items, selected = '') {
  return ['<option value="">（曲を選択 / 任意）</option>']
    .concat(items.map((i) => {
      const val = `${i.kind}:${i.id}`;
      const label = `${i.title}${i.artist ? ' / ' + i.artist : ''}`;
      return `<option value="${esc(val)}" ${val === selected ? 'selected' : ''}>${esc(label)}</option>`;
    })).join('');
}

// ---------------- モーダル ----------------
function modal(innerHtml) {
  const overlay = el(`<div class="modal-overlay"><div class="modal">${innerHtml}</div></div>`);
  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', function onEsc(ev) { if (ev.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); } });
  document.body.appendChild(overlay);
  return { overlay, close };
}

function starWidget(initial = 0) {
  const wrap = el('<div class="stars" data-val="' + initial + '"></div>');
  const paint = (v) => wrap.querySelectorAll('button').forEach((b, i) => b.classList.toggle('on', i < v));
  for (let i = 1; i <= 5; i++) {
    const b = el(`<button type="button" aria-label="${i}">★</button>`);
    b.onclick = () => { wrap.dataset.val = String(i === Number(wrap.dataset.val) ? 0 : i); paint(Number(wrap.dataset.val)); };
    wrap.appendChild(b);
  }
  paint(initial);
  return wrap;
}

// 練習記録ダイアログ。item省略時は曲を選べるようにする。
async function openPracticeDialog(item = null) {
  const today = new Date().toISOString().slice(0, 10);
  let items = [];
  if (!item) { try { items = await loadLibraryItems(); } catch { /* noop */ } }
  const { overlay, close } = modal(`
    <h2>練習を記録</h2>
    ${item ? `<div class="modal-song">🎵 ${esc(item.title)}${item.artist ? ' / ' + esc(item.artist) : ''}</div>`
      : `<label class="ml">曲（任意）<select id="p-song">${libraryOptions(items)}</select></label>`}
    <div class="modal-row">
      <label class="ml">日付<input type="date" id="p-date" value="${today}"></label>
      <label class="ml">練習時間（分）<input type="number" id="p-min" min="0" max="1440" value="30"></label>
    </div>
    <label class="ml">できばえ<div id="p-stars"></div></label>
    <label class="ml">メモ<textarea id="p-memo" rows="3" placeholder="今日やったこと・課題など"></textarea></label>
    <div class="modal-actions">
      <button class="btn" id="p-cancel">キャンセル</button>
      <button class="btn primary" id="p-save">記録する</button>
    </div>
  `);
  const stars = starWidget(0);
  overlay.querySelector('#p-stars').appendChild(stars);
  overlay.querySelector('#p-cancel').onclick = close;
  overlay.querySelector('#p-save').onclick = async () => {
    let chosen = item;
    if (!item) {
      const v = overlay.querySelector('#p-song').value;
      if (v) { const [kind, id] = v.split(':'); const found = items.find((x) => x.kind === kind && x.id === id); chosen = found || null; }
    }
    const data = {
      date: overlay.querySelector('#p-date').value,
      minutes: overlay.querySelector('#p-min').value,
      rating: stars.dataset.val,
      memo: overlay.querySelector('#p-memo').value,
      itemKind: chosen ? chosen.kind : '',
      itemId: chosen ? chosen.id : '',
      itemTitle: chosen ? chosen.title : '',
    };
    try {
      await api.createPractice(data);
      close(); toast('練習を記録しました');
      if ((location.hash.slice(1) || '/').startsWith('/practice')) render();
    } catch (e) { toast(`記録失敗: ${e.message}`, 'err'); }
  };
}

// ---------------- 練習記録ページ ----------------
route('/practice', async () => {
  const logs = await api.listPractice();
  const totalMin = logs.reduce((a, l) => a + (l.minutes || 0), 0);
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 6 * 864e5).toISOString().slice(0, 10);
  const weekMin = logs.filter((l) => l.date >= weekAgo).reduce((a, l) => a + (l.minutes || 0), 0);
  const days = new Set(logs.map((l) => l.date)).size;

  const view = el(`
    <div>
      <div class="page-head">
        <div><h1>📝 練習記録</h1><div class="sub">日々の練習を記録して振り返り</div></div>
        <div class="head-actions"><button class="btn primary" id="add">＋ 記録する</button></div>
      </div>
      <div class="stat-row">
        <div class="stat"><div class="stat-num">${Math.floor(weekMin / 60)}時間${weekMin % 60}分</div><div class="stat-label">直近7日</div></div>
        <div class="stat"><div class="stat-num">${Math.floor(totalMin / 60)}時間${totalMin % 60}分</div><div class="stat-label">累計</div></div>
        <div class="stat"><div class="stat-num">${days}日</div><div class="stat-label">練習した日数</div></div>
        <div class="stat"><div class="stat-num">${logs.length}回</div><div class="stat-label">記録数</div></div>
      </div>
      <div id="loglist"></div>
    </div>
  `);
  const list = view.querySelector('#loglist');
  if (logs.length === 0) {
    list.appendChild(el('<div class="empty">まだ練習記録がありません。<br>「＋ 記録する」か、各楽譜ページの「練習を記録」から追加できます。</div>'));
  } else {
    for (const l of logs) list.appendChild(practiceRow(l));
  }
  view.querySelector('#add').onclick = () => openPracticeDialog(null);
  app.replaceChildren(view);
});

function practiceRow(l) {
  const stars = '★'.repeat(l.rating || 0) + '☆'.repeat(5 - (l.rating || 0));
  const link = l.itemId ? `#/${l.itemKind === 'document' ? 'documents' : 'scores'}/${l.itemId}` : '';
  const row = el(`
    <div class="log-row">
      <div class="log-date">${esc(l.date)}</div>
      <div class="log-main">
        <div class="log-title">${l.itemTitle ? (link ? `<a href="${link}">${esc(l.itemTitle)}</a>` : esc(l.itemTitle)) : '<span class="muted">（曲の指定なし）</span>'}</div>
        ${l.memo ? `<div class="log-memo">${esc(l.memo).replace(/\n/g, '<br>')}</div>` : ''}
      </div>
      <div class="log-side">
        <div class="log-min">${l.minutes}分</div>
        ${l.rating ? `<div class="log-stars">${stars}</div>` : ''}
        <button class="icon-btn" title="削除" data-del="${l.id}">✕</button>
      </div>
    </div>
  `);
  row.querySelector('[data-del]').onclick = async () => {
    if (!confirm('この記録を削除しますか？')) return;
    await api.deletePractice(l.id); toast('削除しました'); render();
  };
  return row;
}

// ---------------- セットリスト一覧 ----------------
route('/setlists', async () => {
  const lists = await api.listSetlists();
  const view = el(`
    <div>
      <div class="page-head">
        <div><h1>🎼 セットリスト</h1><div class="sub">弾きたい曲・ライブや練習の曲順をまとめる</div></div>
        <div class="head-actions"><button class="btn primary" id="new">＋ 新規</button></div>
      </div>
      <div class="grid" id="grid"></div>
    </div>
  `);
  const grid = view.querySelector('#grid');
  if (lists.length === 0) {
    grid.appendChild(el('<div class="empty">まだセットリストがありません。<br>「＋ 新規」で作成しましょう。</div>'));
  } else {
    for (const sl of lists) {
      grid.appendChild(el(`
        <a class="card setlist-card" href="#/setlists/${sl.id}">
          <div class="thumb thumb-set">🎼 ${sl.items.length}曲</div>
          <div class="card-body">
            <div class="card-top"><span class="badge set">セットリスト</span><span class="card-date">${fmtDate(sl.updatedAt)}</span></div>
            <div class="card-title">${esc(sl.name)}</div>
            <div class="card-artist">${sl.items.slice(0, 3).map((i) => esc(i.title)).join(' / ')}${sl.items.length > 3 ? ' …' : ''}</div>
          </div>
        </a>
      `));
    }
  }
  view.querySelector('#new').onclick = async () => {
    const name = prompt('セットリスト名を入力してください', '新しいセットリスト');
    if (name === null) return;
    const created = await api.createSetlist({ name: name.trim() || '無題のセットリスト', items: [] });
    navigate(`/setlists/${created.id}`);
  };
  app.replaceChildren(view);
});

// ---------------- セットリスト詳細 ----------------
route('/setlists/:id', async ({ id }) => {
  const sl = await api.getSetlist(id);
  const libItems = await loadLibraryItems();
  const view = el(`
    <div>
      <div class="page-head">
        <div><a class="back" href="#/setlists">← セットリスト</a>
          <h1 class="editable" id="name" title="クリックで名前を編集">${esc(sl.name)}</h1>
          <div class="sub">${sl.items.length}曲</div></div>
        <div class="head-actions">
          <button class="btn" id="print">🖨 印刷</button>
          <button class="btn danger" id="del">削除</button>
        </div>
      </div>
      <div class="set-add">
        <select id="add-song" class="ctrl-select">${libraryOptions(libItems)}</select>
        <button class="btn" id="add-btn">＋ 追加</button>
      </div>
      <ol class="set-items" id="items"></ol>
    </div>
  `);
  const itemsEl = view.querySelector('#items');

  const save = async () => { await api.updateSetlist(id, { items: sl.items }); };
  const paint = () => {
    itemsEl.replaceChildren();
    if (sl.items.length === 0) { itemsEl.appendChild(el('<div class="empty">曲がありません。上のメニューから追加してください。</div>')); return; }
    sl.items.forEach((it, idx) => {
      const href = `#/${it.kind === 'document' ? 'documents' : 'scores'}/${it.id}`;
      const li = el(`
        <li class="set-item">
          <span class="set-no">${idx + 1}</span>
          <a class="set-title" href="${href}">${esc(it.title)}${it.artist ? `<span class="set-artist"> / ${esc(it.artist)}</span>` : ''}</a>
          <span class="set-ctrls">
            <button class="icon-btn" data-up title="上へ" ${idx === 0 ? 'disabled' : ''}>▲</button>
            <button class="icon-btn" data-down title="下へ" ${idx === sl.items.length - 1 ? 'disabled' : ''}>▼</button>
            <button class="icon-btn" data-rm title="外す">✕</button>
          </span>
        </li>
      `);
      li.querySelector('[data-up]').onclick = async () => { [sl.items[idx - 1], sl.items[idx]] = [sl.items[idx], sl.items[idx - 1]]; paint(); await save(); };
      li.querySelector('[data-down]').onclick = async () => { [sl.items[idx + 1], sl.items[idx]] = [sl.items[idx], sl.items[idx + 1]]; paint(); await save(); };
      li.querySelector('[data-rm]').onclick = async () => { sl.items.splice(idx, 1); paint(); await save(); };
      itemsEl.appendChild(li);
    });
  };
  paint();

  view.querySelector('#add-btn').onclick = async () => {
    const v = view.querySelector('#add-song').value;
    if (!v) return;
    const [kind, iid] = v.split(':');
    const found = libItems.find((x) => x.kind === kind && x.id === iid);
    if (found) { sl.items.push({ kind: found.kind, id: found.id, title: found.title, artist: found.artist }); paint(); await save(); toast('追加しました'); }
  };
  view.querySelector('#name').onclick = async () => {
    const name = prompt('セットリスト名', sl.name);
    if (name === null) return;
    sl.name = name.trim() || sl.name;
    view.querySelector('#name').textContent = sl.name;
    await api.updateSetlist(id, { name: sl.name });
  };
  view.querySelector('#print').onclick = () => window.print();
  view.querySelector('#del').onclick = async () => {
    if (!confirm('このセットリストを削除しますか？')) return;
    await api.deleteSetlist(id); toast('削除しました'); navigate('/setlists');
  };
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
