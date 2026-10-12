import { RATIOS } from './data';
import type { CropNorm, Histogram, ImgNat, PaletteMode, Picker, SnapMode } from './types';

// Returns the effective CSS zoom factor of <body> (viewport px / CSS px).
// Comparing getBoundingClientRect to offsetWidth is reliable across browsers.
export const getBodyZoom = (): number => {
  const bw = document.body.offsetWidth;
  const br = document.body.getBoundingClientRect().width;
  return bw > 0 ? br / bw : 1;
};

export const computeScale = (pw: number, ph: number, nat: ImgNat, sm: SnapMode, zf: number): number =>
  (sm === 'h' ? ph / nat.h : pw / nat.w) * (zf / 100);

function gcd(a: number, b: number): number { return b === 0 ? a : gcd(b, a % b); }

export function toRatio(w: number, h: number): string {
  if (!w || !h) return '—';
  const g = gcd(Math.round(w), Math.round(h));
  const rw = Math.round(w / g), rh = Math.round(h / g);
  if (rw > 60 || rh > 60) return `${(w / h).toFixed(3)}:1`;
  return `${rw}:${rh}`;
}

export function detectRatio(w: number, h: number): string | null {
  if (!w || !h) return null;
  const r = w / h;
  for (const ar of RATIOS) {
    if (Math.abs(r - ar.w / ar.h) < 0.013) return ar.label;
  }
  return null;
}

// ── Luminance histogram ────────────────────────────────────────────────────
export function computeHistogram(imgEl: HTMLImageElement, cropNorm?: CropNorm): Histogram {
  const MAX = 160;
  let srcX = 0, srcY = 0, srcW = imgEl.naturalWidth, srcH = imgEl.naturalHeight;
  if (cropNorm) {
    srcX = Math.max(0, Math.round(cropNorm.x * imgEl.naturalWidth));
    srcY = Math.max(0, Math.round(cropNorm.y * imgEl.naturalHeight));
    srcW = Math.max(1, Math.min(Math.round(cropNorm.w * imgEl.naturalWidth),  imgEl.naturalWidth  - srcX));
    srcH = Math.max(1, Math.min(Math.round(cropNorm.h * imgEl.naturalHeight), imgEl.naturalHeight - srcY));
  }
  const scale = Math.min(MAX / srcW, MAX / srcH, 1);
  const sw = Math.max(1, Math.round(srcW * scale));
  const sh = Math.max(1, Math.round(srcH * scale));
  const oc = document.createElement('canvas');
  oc.width = sw; oc.height = sh;
  const octx = oc.getContext('2d')!;
  octx.drawImage(imgEl, srcX, srcY, srcW, srcH, 0, 0, sw, sh);
  const data = octx.getImageData(0, 0, sw, sh).data;
  const N = 64;
  const r = new Array(N).fill(0), g = new Array(N).fill(0);
  const b = new Array(N).fill(0), lum = new Array(N).fill(0);
  for (let i = 0; i < data.length; i += 4) {
    if (data[i+3] > 0) {
      r[Math.min(N-1, data[i] >> 2)]++;
      g[Math.min(N-1, data[i+1] >> 2)]++;
      b[Math.min(N-1, data[i+2] >> 2)]++;
      const l = Math.round(0.299*data[i] + 0.587*data[i+1] + 0.114*data[i+2]);
      lum[Math.min(N-1, l >> 2)]++;
    }
  }
  return { r, g, b, lum };
}

// ── Color helpers ─────────────────────────────────────────────────────────
export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s, l];
}

export function sampleColor(imgEl: HTMLImageElement, px: number, py: number): string {
  const S = 5;
  const x = Math.max(0, Math.round(px * imgEl.naturalWidth - S / 2));
  const y = Math.max(0, Math.round(py * imgEl.naturalHeight - S / 2));
  const oc = document.createElement('canvas'); oc.width = S; oc.height = S;
  const octx = oc.getContext('2d')!;
  octx.drawImage(imgEl, x, y, S, S, 0, 0, S, S);
  const data = octx.getImageData(0, 0, S, S).data;
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 0) { r += data[i]; g += data[i+1]; b += data[i+2]; n++; }
  }
  if (!n) return '#000000';
  return '#' + [Math.round(r/n), Math.round(g/n), Math.round(b/n)].map(v => v.toString(16).padStart(2, '0')).join('');
}

// ── K-means++ palette extractor (mode-aware, returns [{hex,x,y}]) ──────────
type Pixel = { r: number; g: number; b: number; px: number; py: number };
type Cluster = { r: number; g: number; b: number };
type Rep = { hex: string; x: number; y: number; h: number; s: number; l: number };

export function extractPaletteWithPositions(
  imgEl: HTMLImageElement,
  mode: PaletteMode,
  cropNorm?: CropNorm,
): Picker[] | null {
  const MAX = 160, K_POOL = 20;
  const outK = mode === 'TRITONE' ? 3 : 5;
  const scale = Math.min(MAX / imgEl.naturalWidth, MAX / imgEl.naturalHeight, 1);
  const sw = Math.max(1, Math.round(imgEl.naturalWidth * scale));
  const sh = Math.max(1, Math.round(imgEl.naturalHeight * scale));
  const oc = document.createElement('canvas'); oc.width = sw; oc.height = sh;
  const octx = oc.getContext('2d')!;
  octx.drawImage(imgEl, 0, 0, sw, sh);
  const data = octx.getImageData(0, 0, sw, sh).data;
  const pixels: Pixel[] = [];
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const nx = x / sw, ny = y / sh;
      if (cropNorm && (nx < cropNorm.x || nx > cropNorm.x + cropNorm.w || ny < cropNorm.y || ny > cropNorm.y + cropNorm.h)) continue;
      const i = (y * sw + x) * 4;
      if (data[i + 3] > 128) pixels.push({ r: data[i], g: data[i+1], b: data[i+2], px: nx, py: ny });
    }
  }
  if (pixels.length < K_POOL) return null;
  // K-means++ init
  const centers: Pixel[] = [pixels[Math.floor(Math.random() * pixels.length)]];
  for (let c = 1; c < K_POOL; c++) {
    const dists = pixels.map(p => centers.reduce((mn, cn) =>
      Math.min(mn, (p.r-cn.r)**2 + (p.g-cn.g)**2 + (p.b-cn.b)**2), Infinity));
    const total = dists.reduce((a, b) => a + b, 0);
    let rand = Math.random() * total, idx = 0;
    for (let i = 0; i < dists.length; i++) { rand -= dists[i]; if (rand <= 0) { idx = i; break; } }
    centers.push(pixels[idx]);
  }
  // K-means iterations
  let clusters: Cluster[] = centers.map(p => ({ r: p.r, g: p.g, b: p.b }));
  let assigns: Pixel[][] = [];
  for (let iter = 0; iter < 20; iter++) {
    assigns = Array.from({ length: K_POOL }, () => [] as Pixel[]);
    for (const p of pixels) {
      let bc = 0, bd = Infinity;
      for (let c = 0; c < K_POOL; c++) {
        const d = (p.r-clusters[c].r)**2 + (p.g-clusters[c].g)**2 + (p.b-clusters[c].b)**2;
        if (d < bd) { bd = d; bc = c; }
      }
      assigns[bc].push(p);
    }
    clusters = assigns.map((grp, c) => {
      if (!grp.length) return clusters[c];
      const n = grp.length;
      return {
        r: Math.round(grp.reduce((s, p) => s + p.r, 0) / n),
        g: Math.round(grp.reduce((s, p) => s + p.g, 0) / n),
        b: Math.round(grp.reduce((s, p) => s + p.b, 0) / n),
      };
    });
  }
  // Build cluster reps with representative pixel position
  const hueDist = (a: number, b: number): number => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };
  const reps: Rep[] = clusters.flatMap((cl, ci) => {
    const grp = assigns[ci];
    if (!grp.length) return [];
    let bestPx = grp[0], bd = Infinity;
    for (const p of grp) { const d = (p.r-cl.r)**2+(p.g-cl.g)**2+(p.b-cl.b)**2; if (d < bd) { bd = d; bestPx = p; } }
    const hex = '#' + [cl.r, cl.g, cl.b].map(v => v.toString(16).padStart(2, '0')).join('');
    const [h, s, l] = rgbToHsl(cl.r, cl.g, cl.b);
    return [{ hex, x: bestPx.px, y: bestPx.py, h, s, l }];
  });
  // Select by mode
  let selected: Rep[] = [];
  if (mode === 'DARK')         selected = [...reps].sort((a, b) => a.l - b.l).slice(0, outK);
  else if (mode === 'BRIGHT')  selected = [...reps].sort((a, b) => b.l - a.l).slice(0, outK);
  else if (mode === 'VIVID')   selected = [...reps].sort((a, b) => b.s - a.s).slice(0, outK);
  else if (mode === 'WARM')    selected = [...reps].sort((a, b) => hueDist(a.h, 30)  - hueDist(b.h, 30)).slice(0, outK);
  else if (mode === 'COLD')    selected = [...reps].sort((a, b) => hueDist(a.h, 210) - hueDist(b.h, 210)).slice(0, outK);
  else if (mode === 'TRITONE') {
    let best: [number, number, number] = [0, 1, 2], bscore = -1;
    for (let i = 0; i < reps.length; i++)
      for (let j = i + 1; j < reps.length; j++)
        for (let k = j + 1; k < reps.length; k++) {
          const score = Math.min(hueDist(reps[i].h, reps[j].h), hueDist(reps[i].h, reps[k].h), hueDist(reps[j].h, reps[k].h));
          if (score > bscore) { bscore = score; best = [i, j, k]; }
        }
    selected = best.map(i => reps[i]);
  }
  return selected.map(c => ({ hex: c.hex, x: c.x, y: c.y }));
}

// ── Composition guides ─────────────────────────────────────────────────────
export type GuideMode = 'none' | 'thirds' | 'golden' | 'center' | 'grid';
export const GUIDE_MODES: { id: GuideMode; label: string }[] = [
  { id: 'none',   label: 'None' },
  { id: 'thirds', label: 'Rule of thirds' },
  { id: 'golden', label: 'Golden ratio' },
  { id: 'center', label: 'Center & diagonals' },
  { id: 'grid',   label: 'Square grid' },
];

// Returns line segments [x1, y1, x2, y2] for a w×h frame.
export function guideLines(mode: GuideMode, w: number, h: number): [number, number, number, number][] {
  const v = (x: number): [number, number, number, number] => [x, 0, x, h];
  const hz = (y: number): [number, number, number, number] => [0, y, w, y];
  switch (mode) {
    case 'thirds': return [v(w / 3), v(w * 2 / 3), hz(h / 3), hz(h * 2 / 3)];
    case 'golden': {
      const g = 0.381966;
      return [v(w * g), v(w * (1 - g)), hz(h * g), hz(h * (1 - g))];
    }
    case 'center': return [v(w / 2), hz(h / 2), [0, 0, w, h], [w, 0, 0, h]];
    case 'grid': {
      const cell = Math.min(w, h) / 6;
      const out: [number, number, number, number][] = [];
      for (let x = w / 2 % cell; x < w; x += cell) if (x > 0.5) out.push(v(x));
      for (let y = h / 2 % cell; y < h; y += cell) if (y > 0.5) out.push(hz(y));
      return out;
    }
    default: return [];
  }
}

// ── Color formats ──────────────────────────────────────────────────────────
export type ColorFmt = 'HEX' | 'RGB' | 'HSL';
export function formatColor(hex: string, fmt: ColorFmt): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (fmt === 'HEX') return hex.toUpperCase();
  if (fmt === 'RGB') return `rgb(${r}, ${g}, ${b})`;
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn), l = (max + min) / 2;
  let hDeg = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    hDeg = max === rn ? (gn - bn) / d + (gn < bn ? 6 : 0) : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4;
    hDeg *= 60;
  }
  return `hsl(${Math.round(hDeg)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
}

// ── High-quality downscaling ───────────────────────────────────────────────
// A single large drawImage downscale aliases badly; halve in steps until the
// source is within 2× of the target, then let the final draw do the rest.
export function stepDownSource(img: HTMLImageElement, targetW: number, targetH: number): CanvasImageSource {
  let src: CanvasImageSource = img;
  let w = img.naturalWidth, h = img.naturalHeight;
  while (w / 2 >= targetW && h / 2 >= targetH && w > 2 && h > 2) {
    w = Math.round(w / 2); h = Math.round(h / 2);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d')!;
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    x.drawImage(src, 0, 0, w, h);
    src = c;
  }
  return src;
}
