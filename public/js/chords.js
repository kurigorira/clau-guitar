// ギターのコードダイアグラム（押さえ方の図）を SVG で描画するモジュール。
// frets 配列は低音弦(6弦/E)→高音弦(1弦/e) の順。 -1=ミュート, 0=開放, n=フレット番号。
// baseFret を指定すると図の左端がそのフレットから始まる（ハイコード/バレー用）。

// よく使う開放コード＆基本コードの辞書（標準チューニング EADGBE）。
// 独自のコードは楽譜内で {define: 名前 base:F frets:x,x,x,x,x,x} でも定義できる。
export const CHORD_LIBRARY = {
  'C':      { frets: [-1, 3, 2, 0, 1, 0] },
  'C7':     { frets: [-1, 3, 2, 3, 1, 0] },
  'Cmaj7':  { frets: [-1, 3, 2, 0, 0, 0] },
  'Cadd9':  { frets: [-1, 3, 2, 0, 3, 0] },
  'Csus4':  { frets: [-1, 3, 3, 0, 1, 1] },
  'D':      { frets: [-1, -1, 0, 2, 3, 2] },
  'D7':     { frets: [-1, -1, 0, 2, 1, 2] },
  'Dm':     { frets: [-1, -1, 0, 2, 3, 1] },
  'Dm7':    { frets: [-1, -1, 0, 2, 1, 1] },
  'Dmaj7':  { frets: [-1, -1, 0, 2, 2, 2] },
  'Dsus4':  { frets: [-1, -1, 0, 2, 3, 3] },
  'Dsus2':  { frets: [-1, -1, 0, 2, 3, 0] },
  'E':      { frets: [0, 2, 2, 1, 0, 0] },
  'E7':     { frets: [0, 2, 0, 1, 0, 0] },
  'Em':     { frets: [0, 2, 2, 0, 0, 0] },
  'Em7':    { frets: [0, 2, 0, 0, 0, 0] },
  'Emaj7':  { frets: [0, 2, 1, 1, 0, 0] },
  'Esus4':  { frets: [0, 2, 2, 2, 0, 0] },
  'F':      { frets: [1, 3, 3, 2, 1, 1], base: 1, barre: { fret: 1, from: 6, to: 1 } },
  'Fmaj7':  { frets: [-1, -1, 3, 2, 1, 0] },
  'FM7':    { frets: [-1, -1, 3, 2, 1, 0] },
  'F7':     { frets: [1, 3, 1, 2, 1, 1], base: 1, barre: { fret: 1, from: 6, to: 1 } },
  'G':      { frets: [3, 2, 0, 0, 0, 3] },
  'G7':     { frets: [3, 2, 0, 0, 0, 1] },
  'Gmaj7':  { frets: [3, 2, 0, 0, 0, 2] },
  'Gsus4':  { frets: [3, 3, 0, 0, 1, 3] },
  'A':      { frets: [-1, 0, 2, 2, 2, 0] },
  'A7':     { frets: [-1, 0, 2, 0, 2, 0] },
  'Am':     { frets: [-1, 0, 2, 2, 1, 0] },
  'Am7':    { frets: [-1, 0, 2, 0, 1, 0] },
  'Amaj7':  { frets: [-1, 0, 2, 1, 2, 0] },
  'Asus4':  { frets: [-1, 0, 2, 2, 3, 0] },
  'Asus2':  { frets: [-1, 0, 2, 2, 0, 0] },
  'B':      { frets: [-1, 2, 4, 4, 4, 2], base: 2, barre: { fret: 2, from: 5, to: 1 } },
  'B7':     { frets: [-1, 2, 1, 2, 0, 2] },
  'Bm':     { frets: [-1, 2, 4, 4, 3, 2], base: 2, barre: { fret: 2, from: 5, to: 1 } },
  'Bm7':    { frets: [-1, 2, 0, 2, 0, 2] },
  'Bb':     { frets: [-1, 1, 3, 3, 3, 1], base: 1, barre: { fret: 1, from: 5, to: 1 } },
  'F#m':    { frets: [2, 4, 4, 2, 2, 2], base: 2, barre: { fret: 2, from: 6, to: 1 } },
  'F#':     { frets: [2, 4, 4, 3, 2, 2], base: 2, barre: { fret: 2, from: 6, to: 1 } },
  'C#m':    { frets: [-1, 4, 6, 6, 5, 4], base: 4, barre: { fret: 4, from: 5, to: 1 } },
  'G#m':    { frets: [4, 6, 6, 4, 4, 4], base: 4, barre: { fret: 4, from: 6, to: 1 } },
};

// エイリアス（表記ゆれ吸収）
const ALIASES = { 'CM7': 'Cmaj7', 'DM7': 'Dmaj7', 'GM7': 'Gmaj7', 'AM7': 'Amaj7', 'EM7': 'Emaj7' };

export function lookupChord(name, customDefs = {}) {
  if (!name) return null;
  const clean = name.trim();
  if (customDefs[clean]) return customDefs[clean];
  if (CHORD_LIBRARY[clean]) return CHORD_LIBRARY[clean];
  if (ALIASES[clean.toUpperCase()]) return CHORD_LIBRARY[ALIASES[clean.toUpperCase()]];
  // オンコード（分数コード） "D/F#" などはルート側だけ図示
  if (clean.includes('/')) {
    const head = clean.split('/')[0];
    return CHORD_LIBRARY[head] || null;
  }
  return null;
}

// SVGのコードダイアグラムを文字列で返す
export function renderChordSVG(name, def, opts = {}) {
  const w = opts.width || 76;
  const h = opts.height || 96;
  const padX = 10, padTop = 22, padBottom = 12;
  const strings = 6;
  const fretsShown = 5;
  const gridW = w - padX * 2;
  const gridH = h - padTop - padBottom;
  const sx = gridW / (strings - 1);
  const fy = gridH / fretsShown;
  const stroke = 'var(--diagram-line)';
  const dot = 'var(--diagram-dot)';

  if (!def) {
    // 未知コードは名前だけ表示
    return `<svg class="chord-svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="${escapeAttr(name)}">
      <text x="${w / 2}" y="16" text-anchor="middle" class="chord-name">${escapeXml(name)}</text>
      <text x="${w / 2}" y="${h / 2 + 6}" text-anchor="middle" class="chord-unknown">?</text>
    </svg>`;
  }

  const base = def.base && def.base > 1 ? def.base : 1;
  let parts = [];
  parts.push(`<text x="${w / 2}" y="15" text-anchor="middle" class="chord-name">${escapeXml(name)}</text>`);

  // フレット線
  for (let i = 0; i <= fretsShown; i++) {
    const y = padTop + i * fy;
    const top = i === 0 && base === 1;
    parts.push(`<line x1="${padX}" y1="${y}" x2="${padX + gridW}" y2="${y}" stroke="${stroke}" stroke-width="${top ? 3 : 1}"/>`);
  }
  // 弦
  for (let s = 0; s < strings; s++) {
    const x = padX + s * sx;
    parts.push(`<line x1="${x}" y1="${padTop}" x2="${x}" y2="${padTop + gridH}" stroke="${stroke}" stroke-width="1"/>`);
  }
  // ベースフレット表示（ハイポジション）
  if (base > 1) {
    parts.push(`<text x="${padX - 4}" y="${padTop + fy * 0.7}" text-anchor="end" class="chord-base">${base}fr</text>`);
  }

  // バレー
  if (def.barre) {
    const rel = def.barre.fret - base + 1;
    if (rel >= 1 && rel <= fretsShown) {
      const y = padTop + (rel - 0.5) * fy;
      // from/to は弦番号(6=低音)。x座標へ変換
      const xFrom = padX + (strings - def.barre.from) * sx;
      const xTo = padX + (strings - def.barre.to) * sx;
      const x1 = Math.min(xFrom, xTo), x2 = Math.max(xFrom, xTo);
      parts.push(`<rect x="${x1 - 3}" y="${y - 4}" width="${x2 - x1 + 6}" height="8" rx="4" fill="${dot}"/>`);
    }
  }

  // 各弦の状態
  def.frets.forEach((f, idx) => {
    const x = padX + idx * sx;
    if (f === -1) {
      parts.push(`<text x="${x}" y="${padTop - 6}" text-anchor="middle" class="chord-mark">×</text>`);
    } else if (f === 0) {
      parts.push(`<circle cx="${x}" cy="${padTop - 9}" r="3.2" fill="none" stroke="${stroke}" stroke-width="1.4"/>`);
    } else {
      const rel = f - base + 1;
      if (rel >= 1 && rel <= fretsShown) {
        const y = padTop + (rel - 0.5) * fy;
        // バレー上の同フレット指はまとめて描いてあるので重複してもOK（見た目上問題なし）
        parts.push(`<circle cx="${x}" cy="${y}" r="4.6" fill="${dot}"/>`);
      }
    }
  });

  return `<svg class="chord-svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="${escapeAttr(name)}">${parts.join('')}</svg>`;
}

export function chordDiagram(name, customDefs = {}, opts = {}) {
  const def = lookupChord(name, customDefs);
  return renderChordSVG(name, def, opts);
}

function escapeXml(s) {
  return String(s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
}
function escapeAttr(s) {
  return String(s).replace(/["&<>]/g, (c) => ({ '"': '&quot;', '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}
