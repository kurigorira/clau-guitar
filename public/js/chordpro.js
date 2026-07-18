// 歌詞の中に [C] のようにコードを書く「ChordPro風」テキストを解析して、
// 歌詞の上にコードを載せた見やすい譜面に変換する。
// 対応ディレクティブ:
//   {title: ...} {artist: ...} {key: ...} {capo: N} {tempo: N}
//   {comment: ...} または {c: ...}  … セクション見出し（例: Aメロ, サビ）
//   {define: 名前 base:F frets:x,x,x,x,x,x} … オリジナルの押さえ方を定義
// 行頭が「#」の行はメモ扱いで無視。

export function parseChordPro(text) {
  const lines = (text || '').replace(/\r\n?/g, '\n').split('\n');
  const meta = {};
  const customDefs = {};
  const blocks = []; // { type: 'section'|'line'|'blank', ... }
  const usedChords = new Set();

  for (const raw of lines) {
    const line = raw;
    const dir = line.match(/^\s*\{\s*([a-zA-Z_]+)\s*:?\s*(.*?)\s*\}\s*$/);
    if (dir) {
      const key = dir[1].toLowerCase();
      const val = dir[2];
      if (key === 'title' || key === 't') meta.title = val;
      else if (key === 'artist' || key === 'subtitle' || key === 'st') meta.artist = val;
      else if (key === 'key') meta.key = val;
      else if (key === 'capo') meta.capo = val;
      else if (key === 'tempo' || key === 'bpm') meta.tempo = val;
      else if (key === 'comment' || key === 'c') blocks.push({ type: 'section', text: val });
      else if (key === 'define') {
        const def = parseDefine(val);
        if (def) customDefs[def.name] = def.def;
      }
      continue;
    }
    if (/^\s*#/.test(line)) continue; // コメント行
    if (line.trim() === '') { blocks.push({ type: 'blank' }); continue; }
    const segs = parseLine(line, usedChords);
    blocks.push({ type: 'line', segs });
  }

  return { meta, blocks, customDefs, usedChords: [...usedChords] };
}

function parseLine(line, usedChords) {
  // [C]歌詞[G]... を [chord, text] の連なりに分解
  const segs = [];
  const re = /\[([^\]]+)\]/g;
  let last = 0;
  let m;
  let pendingChord = null;
  while ((m = re.exec(line)) !== null) {
    const before = line.slice(last, m.index);
    if (before) {
      segs.push({ chord: pendingChord, text: before });
      pendingChord = null;
    } else if (pendingChord !== null) {
      // 連続コード（歌詞なし） → 前のコードを独立表示
      segs.push({ chord: pendingChord, text: '' });
    }
    pendingChord = m[1];
    if (m[1]) usedChords.add(m[1].trim());
    last = re.lastIndex;
  }
  const tail = line.slice(last);
  if (pendingChord !== null || tail) segs.push({ chord: pendingChord, text: tail });
  if (segs.length === 0) segs.push({ chord: null, text: line });
  return segs;
}

function parseDefine(val) {
  // 例: "Cadd9 base:1 frets:x,3,2,0,3,0"
  const nameMatch = val.match(/^(\S+)/);
  if (!nameMatch) return null;
  const name = nameMatch[1];
  const baseMatch = val.match(/base:\s*(\d+)/i);
  const fretsMatch = val.match(/frets:\s*([0-9xX,\-\s]+)/i);
  if (!fretsMatch) return null;
  const frets = fretsMatch[1].split(',').map((s) => {
    const t = s.trim().toLowerCase();
    if (t === 'x' || t === '-1' || t === '') return -1;
    const n = parseInt(t, 10);
    return Number.isFinite(n) ? n : -1;
  });
  if (frets.length !== 6) return null;
  return { name, def: { frets, base: baseMatch ? parseInt(baseMatch[1], 10) : 1 } };
}

// 解析結果を HTML 文字列に描画（コードは歌詞の上に配置）
export function renderChordPro(parsed) {
  const out = [];
  for (const b of parsed.blocks) {
    if (b.type === 'blank') { out.push('<div class="cp-blank"></div>'); continue; }
    if (b.type === 'section') { out.push(`<div class="cp-section">${escapeHtml(b.text)}</div>`); continue; }
    // line
    const cells = b.segs.map((s) => {
      const chord = s.chord ? `<span class="cp-chord">${escapeHtml(s.chord)}</span>` : '<span class="cp-chord"></span>';
      const text = `<span class="cp-lyric">${escapeHtml(s.text) || '&nbsp;'}</span>`;
      return `<span class="cp-cell">${chord}${text}</span>`;
    }).join('');
    out.push(`<div class="cp-line">${cells}</div>`);
  }
  return out.join('');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
