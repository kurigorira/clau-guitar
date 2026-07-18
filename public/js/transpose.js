// コードの移調（トランスポーズ）ユーティリティ。
// コード名の「ルート音」を半音単位でずらす。分数コード(オンコード)のベース音も一緒にずらす。

const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const NOTE_INDEX = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

// 単一の音名（例 "C#", "Bb"）を 0-11 のインデックスに
function noteToIndex(note) {
  const m = note.match(/^([A-G])([#b]?)/);
  if (!m) return null;
  let idx = NOTE_INDEX[m[1]];
  if (m[2] === '#') idx += 1;
  else if (m[2] === 'b') idx -= 1;
  return ((idx % 12) + 12) % 12;
}

function indexToNote(idx, preferFlat) {
  const table = preferFlat ? FLAT : SHARP;
  return table[((idx % 12) + 12) % 12];
}

// 単一コード名を shift 半音ぶん移調して返す（コードとして解釈できなければそのまま返す）
export function transposeChord(name, shift, opts = {}) {
  if (!name || !shift) return name;
  const parts = name.split('/');
  const shifted = parts.map((p) => transposeToken(p.trim(), shift, opts));
  return shifted.join('/');
}

function transposeToken(token, shift, opts) {
  const m = token.match(/^([A-G][#b]?)(.*)$/);
  if (!m) return token;
  const root = m[1];
  const rest = m[2];
  const idx = noteToIndex(root);
  if (idx === null) return token;
  // 元の表記が♭ならフラット寄り、♯ならシャープ寄りで綴る（指定があればそちら優先）
  const preferFlat = opts.preferFlat !== undefined ? opts.preferFlat : root.includes('b');
  const newRoot = indexToNote(idx + shift, preferFlat);
  return newRoot + rest;
}

// キー名(例 "G", "Bb")を移調
export function transposeKey(key, shift, opts = {}) {
  if (!key) return key;
  const m = key.match(/^([A-G][#b]?)(m?.*)$/);
  if (!m) return key;
  const idx = noteToIndex(m[1]);
  if (idx === null) return key;
  const preferFlat = opts.preferFlat !== undefined ? opts.preferFlat : m[1].includes('b');
  return indexToNote(idx + shift, preferFlat) + m[2];
}

// shift(半音)を "+2" のような表示にする
export function shiftLabel(shift) {
  if (!shift) return '±0';
  return shift > 0 ? `+${shift}` : `${shift}`;
}
