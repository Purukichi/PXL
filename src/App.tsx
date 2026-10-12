import { useState, useEffect, useRef } from 'react';
import type { MouseEvent as ReactMouseEvent, DragEvent as ReactDragEvent, ChangeEvent as ReactChangeEvent } from 'react';
import { Ic, CAT_ICONS } from './icons';
import { RATIOS, TEMPLATES, SAFE_AREAS } from './data';
import {
  computeScale, getBodyZoom, toRatio, detectRatio,
  computeHistogram, sampleColor, extractPaletteWithPositions,
  GUIDE_MODES, guideLines, formatColor, stepDownSource,
} from './utils';
import type { GuideMode, ColorFmt } from './utils';

type ExportFmt = 'jpg' | 'png' | 'webp';
type Prefs = {
  ratio: string; linked: boolean; width: number; height: number; dark: boolean;
  paletteMode: PaletteMode; colorFmt: ColorFmt; guide: GuideMode;
  exportFmt: ExportFmt; exportQuality: number; exportOverlays: boolean;
};
const PREFS_KEY = 'pxl:prefs:v1';
const loadPrefs = (): Partial<Prefs> => {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') as Partial<Prefs>; } catch { return {}; }
};
const MIME: Record<ExportFmt, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
type Menu = 'export' | 'guides' | 'keys' | null;

const SHORTCUTS: [string, string][] = [
  ['O', 'Choose image'], ['⌘V', 'Paste image'], ['⌘S', 'Export'],
  ['R', 'Swap orientation'], ['L', 'Lock aspect ratio'], ['G', 'Cycle guides'],
  ['S', 'Safe area'], ['H', 'Show / hide image'], ['M', 'Monochrome'],
  ['B', 'Gaussian blur'], ['0', 'Reset zoom'],
];
import { RatioChip } from './RatioChip';
import type {
  Histogram, ImgNat, PaletteMode, Picker, Ratio, SnapMode, Template, Vec2,
} from './types';

export default function App() {
  const prefs = useRef<Partial<Prefs>>(loadPrefs()).current;
  const [ratio,    setRatio]   = useState<Ratio>(() => RATIOS.find(r => r.label === prefs.ratio) ?? RATIOS[3]);
  const [linked,   setLinked]  = useState<boolean>(prefs.linked ?? true);
  const [width,    setWidth]   = useState<number>(prefs.width ?? 1920);
  const [height,   setHeight]  = useState<number>(prefs.height ?? 1080);
  const [cat,      setCat]     = useState<string>('all');
  const [tpl,      setTpl]     = useState<string | null>(null);

  // Image
  const [showImg,   setShowImg]  = useState<boolean>(false);
  const [imgSrc,    setImgSrc]   = useState<string | null>(null);
  const [imgNat,    setImgNat_]  = useState<ImgNat>({ w: 0, h: 0 });
  const imgNatRef  = useRef<ImgNat>({ w: 0, h: 0 });
  const setImgNat = (v: ImgNat) => { imgNatRef.current = v; setImgNat_(v); };
  const [fileDrag,  setFileDrag] = useState<boolean>(false);
  const dragCounterRef = useRef(0);
  const imgOffRef  = useRef<Vec2>({ x: 0, y: 0 });
  const [imgOff,    setImgOff_]  = useState<Vec2>({ x: 0, y: 0 });
  const setImgOff = (v: Vec2 | ((prev: Vec2) => Vec2)) => {
    const val = typeof v === 'function' ? v(imgOffRef.current) : v;
    imgOffRef.current = val; setImgOff_(val);
  };
  const imgZoomRef = useRef<number>(100);
  const [imgZoom,   setImgZoom_] = useState<number>(100);
  const setImgZoom = (v: number) => {
    const val = Math.max(10, Math.min(1000, Math.round(v)));
    imgZoomRef.current = val; setImgZoom_(val);
  };
  const resetZoom = () => { setImgZoom(100); setImgOff({ x: 0, y: 0 }); };
  const [imgFileName, setImgFileName] = useState<string>('');
  const snapModeRef = useRef<SnapMode>('h');
  const [snapMode,  setSnapMode_] = useState<SnapMode>('h');
  const setSnapMode = (v: SnapMode) => { snapModeRef.current = v; setSnapMode_(v); };
  const [panning,   setPanning]  = useState<boolean>(false);

  // Overlays
  const [showSafe, setShowSafe] = useState<boolean>(false);
  const [showBW,   setShowBW]   = useState<boolean>(false);
  const showBlurRef = useRef<boolean>(false);
  const [showBlur, setShowBlur_] = useState<boolean>(false);
  const setShowBlur = (v: boolean) => { showBlurRef.current = v; setShowBlur_(v); };
  const blurAmountRef = useRef<number>(10);
  const [blurAmount, setBlurAmount_] = useState<number>(10);
  const setBlurAmount = (v: number) => {
    const val = Math.max(1, Math.round(v));
    blurAmountRef.current = val; setBlurAmount_(val);
  };

  const [paletteMode, setPaletteMode] = useState<PaletteMode>(prefs.paletteMode ?? 'VIVID');
  const [colorFmt,    setColorFmt]    = useState<ColorFmt>(prefs.colorFmt ?? 'HEX');
  const [guide,       setGuide]       = useState<GuideMode>(prefs.guide ?? 'none');
  const [exportFmt,     setExportFmt]     = useState<ExportFmt>(prefs.exportFmt ?? 'jpg');
  const [exportQuality, setExportQuality] = useState<number>(prefs.exportQuality ?? 100);
  const [exportOverlays, setExportOverlays] = useState<boolean>(prefs.exportOverlays ?? false);
  const [sizeCopied, setSizeCopied] = useState<boolean>(false);
  const [pickerData,  setPickerData]  = useState<Picker[] | null>(null);
  const [copiedColor, setCopiedColor] = useState<string | null>(null);
  const [histogram,   setHistogram]   = useState<Histogram | null>(null);
  const displayHistRef = useRef<Histogram | null>(null);
  const histAnimRef    = useRef<number | null>(null);
  const [displayHistogram, setDisplayHistogram_] = useState<Histogram | null>(null);
  const setDisplayHistogram = (v: Histogram | null) => { displayHistRef.current = v; setDisplayHistogram_(v); };
  const [openMenu, setOpenMenu] = useState<Menu>(null);
  const toggleMenu = (m: Menu) => setOpenMenu(cur => (cur === m ? null : m));
  const [showPickerDots, setShowPickerDots] = useState<boolean>(true);

  // Theme
  const [dark, setDark] = useState<boolean>(() => {
    if (typeof prefs.dark === 'boolean') return prefs.dark;
    const forced = document.documentElement.getAttribute('data-theme');
    if (forced) return forced === 'dark';
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  });

  const fileRef    = useRef<HTMLInputElement | null>(null);
  const imgRef     = useRef<HTMLImageElement | null>(null);
  const pvWrapRef  = useRef<HTMLDivElement | null>(null);
  const pvAreaRef  = useRef<HTMLDivElement | null>(null);
  const [pvAreaW, setPvAreaW] = useState<number>(600);
  const [pvAreaH, setPvAreaH] = useState<number>(320);

  const paletteModeRef   = useRef<PaletteMode>(prefs.paletteMode ?? 'VIVID');
  const initialPickerRef = useRef<Picker[] | null>(null);
  const histTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getPvSize = () => ({
    pw: pvWrapRef.current ? pvWrapRef.current.offsetWidth  : pvW,
    ph: pvWrapRef.current ? pvWrapRef.current.offsetHeight : pvH,
  });

  // Apply dark class to body
  useEffect(() => {
    document.body.classList.toggle('dark', dark);
  }, [dark]);

  // Close format menu on outside click
  useEffect(() => {
    if (!openMenu) return;
    const close = () => setOpenMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenMenu(null); };
    document.addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('click', close); document.removeEventListener('keydown', onKey); };
  }, [openMenu]);

  // Remember preferences between visits
  useEffect(() => {
    const p: Prefs = { ratio: ratio.label, linked, width, height, dark, paletteMode, colorFmt, guide, exportFmt, exportQuality, exportOverlays };
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* storage unavailable */ }
  }, [ratio, linked, width, height, dark, paletteMode, colorFmt, guide, exportFmt, exportQuality, exportOverlays]);

  // Measure preview-area container for dynamic pvW/pvH
  useEffect(() => {
    if (!pvAreaRef.current) return;
    const ro = new ResizeObserver(([e]) => {
      const { width: cw, height: ch } = e.contentRect;
      setPvAreaW(cw);
      setPvAreaH(ch);
    });
    ro.observe(pvAreaRef.current);
    return () => ro.disconnect();
  }, []);

  // Sync image transform to pv-wrap actual size every frame (follows CSS transition)
  useEffect(() => {
    let rafId: number;
    const tick = () => {
      if (pvWrapRef.current && imgRef.current && imgNatRef.current.w) {
        const nat = imgNatRef.current;
        const scale = computeScale(pvWrapRef.current.offsetWidth, pvWrapRef.current.offsetHeight, nat, snapModeRef.current, imgZoomRef.current);
        const off = imgOffRef.current;
        const next = `translate(calc(-50% + ${off.x}px), calc(-50% + ${off.y}px)) scale(${scale})`;
        if (imgRef.current.style.transform !== next) imgRef.current.style.transform = next;
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  // Preview sizing — fit inside available area maintaining aspect ratio
  const MAX_W = Math.max(pvAreaW - 90, 32);
  const MAX_H = Math.max(pvAreaH - 80, 32);
  const arNum = width && height ? width / height : 1;
  const pvByH = MAX_H * arNum;
  const pvH = pvByH <= MAX_W ? MAX_H : Math.max(Math.round(MAX_W / arNum), 32);
  const pvW = pvByH <= MAX_W ? Math.max(Math.round(pvByH), 32) : MAX_W;

  // scheduleHistogram: recompute histogram for current visible crop (uses refs → safe to call anywhere)
  const scheduleHistogram = () => {
    if (histTimerRef.current) clearTimeout(histTimerRef.current);
    histTimerRef.current = setTimeout(() => {
      if (!imgRef.current || !imgNatRef.current.w || !pvWrapRef.current) return;
      const nat = imgNatRef.current;
      const sm  = snapModeRef.current;
      const off = imgOffRef.current;
      const { pw, ph } = getPvSize();
      if (!pw || !ph) return;
      const sc = computeScale(pw, ph, nat, sm, imgZoomRef.current);
      const cropX = Math.max(0, nat.w / 2 - (pw / 2 + off.x) / sc);
      const cropY = Math.max(0, nat.h / 2 - (ph / 2 + off.y) / sc);
      const cropW = Math.min(pw / sc, nat.w - cropX);
      const cropH = Math.min(ph / sc, nat.h - cropY);
      if (cropW > 0 && cropH > 0) {
        setHistogram(computeHistogram(imgRef.current, {
          x: cropX / nat.w, y: cropY / nat.h,
          w: cropW / nat.w, h: cropH / nat.h,
        }));
      }
    }, 120);
  };

  // Recompute histogram when visible crop changes (aspect ratio / snap mode)
  useEffect(() => {
    if (!imgSrc || !imgNat.w) return;
    scheduleHistogram();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pvW, pvH, snapMode, imgSrc, imgNat.w, imgNat.h]);

  // Animate histogram toward new target whenever it changes
  useEffect(() => {
    if (!histogram) {
      if (histAnimRef.current) cancelAnimationFrame(histAnimRef.current);
      setDisplayHistogram(null); return;
    }
    const EMPTY: Histogram = { r: new Array(64).fill(0), g: new Array(64).fill(0), b: new Array(64).fill(0), lum: new Array(64).fill(0) };
    const from: Histogram = displayHistRef.current
      ? { r: [...displayHistRef.current.r], g: [...displayHistRef.current.g], b: [...displayHistRef.current.b], lum: [...displayHistRef.current.lum] }
      : EMPTY;
    const to = histogram;
    if (histAnimRef.current) cancelAnimationFrame(histAnimRef.current);
    const t0 = performance.now(), dur = 500;
    const ease = (t: number) => t < 0.5 ? 2*t*t : -1 + (4-2*t)*t;
    const step = (now: number) => {
      const p = ease(Math.min((now - t0) / dur, 1));
      setDisplayHistogram({
        r:   from.r.map((v, i)   => v + (to.r[i]   - v) * p),
        g:   from.g.map((v, i)   => v + (to.g[i]   - v) * p),
        b:   from.b.map((v, i)   => v + (to.b[i]   - v) * p),
        lum: from.lum.map((v, i) => v + (to.lum[i] - v) * p),
      });
      if (p < 1) histAnimRef.current = requestAnimationFrame(step);
    };
    histAnimRef.current = requestAnimationFrame(step);
    return () => { if (histAnimRef.current) cancelAnimationFrame(histAnimRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [histogram]);

  const handleW = (v: string) => { const n = parseInt(v) || 0; setWidth(n);  if (linked) setHeight(Math.round(n * ratio.h / ratio.w)); setTpl(null); };
  const handleH = (v: string) => { const n = parseInt(v) || 0; setHeight(n); if (linked) setWidth (Math.round(n * ratio.w / ratio.h)); setTpl(null); };

  const applyTpl = (t2: Template) => {
    setTpl(t2.name); setWidth(t2.w); setHeight(t2.h);
    let best: Ratio | null = null, bestD = 9999;
    const r = t2.w / t2.h;
    for (const ar of RATIOS) { const d = Math.abs(r - ar.w / ar.h); if (d < bestD) { bestD = d; best = ar; } }
    if (best && bestD < 0.05) setRatio(best);
  };

  const loadFile = (file: File | undefined | null) => {
    if (!file || !file.type.startsWith('image/')) return;
    const baseName = file.name.replace(/\.[^.]+$/, '');
    setImgFileName(baseName);
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const nw = img.naturalWidth, nh = img.naturalHeight;
      setImgNat({ w: nw, h: nh });
      setWidth(nw); setHeight(nh); setTpl(null);
      const r = nw / nh;
      let best: Ratio | null = null, bestD = 9999;
      for (const ar of RATIOS) { const d = Math.abs(r - ar.w / ar.h); if (d < bestD) { bestD = d; best = ar; } }
      if (best) setRatio(best);
      const result = extractPaletteWithPositions(img, paletteModeRef.current);
      if (result) { setPickerData(result); initialPickerRef.current = result.map(p => ({ ...p })); }
      setHistogram(computeHistogram(img));
    };
    img.src = url;
    setImgSrc(url);
    setImgOff({ x: 0, y: 0 });
    setShowImg(true);
  };

  // On ratio/dim change: auto-select snapMode that causes overflow, then clamp offset
  useEffect(() => {
    if (!imgNat.w || !imgNat.h) { setImgOff({ x: 0, y: 0 }); return; }
    const imgAR  = imgNat.w / imgNat.h;
    const frameAR = pvW / pvH;
    const bestSnap: SnapMode = imgAR > frameAR ? 'h' : 'v';
    setSnapMode(bestSnap);
    const scale = bestSnap === 'h' ? pvH / imgNat.h : pvW / imgNat.w;
    const iw = imgNat.w * scale, ih = imgNat.h * scale;
    const maxX = Math.max(0, (iw - pvW) / 2);
    const maxY = Math.max(0, (ih - pvH) / 2);
    setImgOff(prev => ({
      x: Math.max(-maxX, Math.min(maxX, prev.x)),
      y: Math.max(-maxY, Math.min(maxY, prev.y)),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pvW, pvH]);

  // File drag-drop onto preview area (always active, counter prevents flicker)
  const onFileDrop = (e: ReactDragEvent) => { e.preventDefault(); dragCounterRef.current = 0; setFileDrag(false); loadFile(e.dataTransfer.files[0]); setShowImg(true); };
  const onFileDragOver  = (e: ReactDragEvent) => { e.preventDefault(); };
  const onFileDragEnter = (e: ReactDragEvent) => { e.preventDefault(); dragCounterRef.current++; setFileDrag(true); };
  const onFileDragLeave = () => { dragCounterRef.current--; if (dragCounterRef.current <= 0) { dragCounterRef.current = 0; setFileDrag(false); } };

  const loadBlobAsImage = (blob: Blob, type: string) => {
    const ext = type.split('/')[1] || 'png';
    loadFile(new File([blob], `pasted.${ext}`, { type }));
    setShowImg(true);
  };

  // Global paste (Ctrl/Cmd+V): image lands directly, no browser confirmation
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const it of items) {
        if (it.kind === 'file' && it.type.startsWith('image/')) {
          const f = it.getAsFile();
          if (f) { e.preventDefault(); loadFile(f); setShowImg(true); return; }
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Button click fallback: uses async Clipboard API (Chrome shows confirm popup)
  const pasteFromClipboard = async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find(t => t.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          loadBlobAsImage(blob, imageType);
          return;
        }
      }
    } catch {
      /* clipboard denied or no image */
    }
  };

  // Image pan: h-snap → X only moves, v-snap → Y only moves
  const onCanvasMouseDown = (e: ReactMouseEvent) => {
    if (!showImg || !imgSrc) return;
    e.preventDefault();
    const nat = imgNatRef.current;
    const sm  = snapModeRef.current;
    const { pw, ph } = getPvSize();
    const sc  = computeScale(pw, ph, nat, sm, imgZoomRef.current);
    const maxX = Math.max(0, (nat.w * sc - pw) / 2);
    const maxY = Math.max(0, (nat.h * sc - ph) / 2);
    const clamp = (v: number, max: number) => Math.max(-max, Math.min(max, v));
    const z = getBodyZoom();
    let prevMx = e.clientX, prevMy = e.clientY;
    setPanning(true);
    const onMove = (ev: MouseEvent) => {
      const dx = (ev.clientX - prevMx) * 0.38 / z;
      const dy = (ev.clientY - prevMy) * 0.38 / z;
      prevMx = ev.clientX; prevMy = ev.clientY;
      setImgOff(prev => {
        const nx = clamp(prev.x + dx, maxX), ny = clamp(prev.y + dy, maxY);
        return (nx === prev.x && ny === prev.y) ? prev : { x: nx, y: ny };
      });
    };
    const onUp = () => { setPanning(false); window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); scheduleHistogram(); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
  };

  const natRatio = imgNat.w && imgNat.h ? toRatio(imgNat.w, imgNat.h) : null;
  const detR     = detectRatio(width, height);
  const cats     = ['all', 'display', 'video', 'social', 'mobile', 'print', 'music'];

  // Draggable number input: 5px mouse movement = 1px value change
  const makeDragInput = (getValue: () => number, setValue: (v: number) => void) => ({
    onMouseDown: (e: ReactMouseEvent) => {
      if (e.button !== 0) return;
      const startX   = e.clientX;
      const startVal = getValue();
      (e.target as HTMLElement).blur?.();
      const onMove = (ev: MouseEvent) => {
        const delta = Math.round((ev.clientX - startX) / 5);
        setValue(Math.max(1, startVal + delta));
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup',   onUp);
    },
  });

  const filtTpls = cat === 'all' ? TEMPLATES : TEMPLATES.filter(t2 => t2.cat === cat);

  const dragW = makeDragInput(() => width,  v => { setWidth(v);  if (linked) setHeight(Math.round(v * ratio.h / ratio.w)); setTpl(null); });
  const dragH = makeDragInput(() => height, v => { setHeight(v); if (linked) setWidth (Math.round(v * ratio.w / ratio.h)); setTpl(null); });
  const dragZoom = makeDragInput(() => imgZoom, v => {
    setImgZoom(v);
    if (!pvWrapRef.current || !imgNatRef.current.w) { setImgOff({ x: 0, y: 0 }); return; }
    const { pw, ph } = getPvSize();
    const nat = imgNatRef.current, sm = snapModeRef.current;
    const sc = computeScale(pw, ph, nat, sm, Math.max(10, Math.min(1000, Math.round(v))));
    const maxX = Math.max(0, (nat.w * sc - pw) / 2);
    const maxY = Math.max(0, (nat.h * sc - ph) / 2);
    setImgOff(prev => {
      const nx = Math.max(-maxX, Math.min(maxX, prev.x));
      const ny = Math.max(-maxY, Math.min(maxY, prev.y));
      return (nx === prev.x && ny === prev.y) ? prev : { x: nx, y: ny };
    });
  });

  // ── Export ───────────────────────────────────────────────────────────────
  // Notes on quality:
  // - Chromium's JPEG encoder subsamples chroma (4:2:0) at any quality below 1.0,
  //   which smears saturated edges. Quality defaults to 100% (4:4:4).
  // - Large downscales are stepped (stepDownSource) with high smoothing to avoid aliasing.
  // - toBlob avoids huge base64 data URLs.
  const exportImg = (fmt: ExportFmt = exportFmt) => {
    const cW = width, cH = height;
    if (!cW || !cH) return;
    const canvas = document.createElement('canvas');
    canvas.width = cW; canvas.height = cH;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if (fmt === 'jpg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, cW, cH);
    }
    const pxScale = cW / pvW; // output px per preview px
    if (imgSrc && imgRef.current && showImg) {
      const img = imgRef.current;
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, cW, cH); ctx.clip();
      const zf = imgZoom / 100;
      const scaleBase = (snapMode === 'h' ? pvH / img.naturalHeight : pvW / img.naturalWidth) * zf;
      const outScale  = (snapMode === 'h' ? cH  / img.naturalHeight : cW  / img.naturalWidth) * zf;
      const ratioScale = outScale / scaleBase;
      const iw = img.naturalWidth  * outScale;
      const ih = img.naturalHeight * outScale;
      const ix = cW / 2 + imgOff.x * ratioScale - iw / 2;
      const iy = cH / 2 + imgOff.y * ratioScale - ih / 2;
      // Blur radius is set in preview pixels; scale it so the export matches what you see.
      const filters = [showBW ? 'grayscale(1)' : '', showBlur ? `blur(${blurAmount * ratioScale}px)` : ''].filter(Boolean);
      if (filters.length) ctx.filter = filters.join(' ');
      ctx.drawImage(stepDownSource(img, iw, ih), ix, iy, iw, ih);
      ctx.restore();
    }
    if (exportOverlays) {
      const lw = Math.max(1, pxScale);
      if (guide !== 'none') {
        guideLines(guide, cW, cH).forEach(([x1, y1, x2, y2]) => {
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
          ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = lw * 2; ctx.stroke();
          ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = lw; ctx.stroke();
        });
      }
      if (showSafe) {
        SAFE_AREAS.forEach(sa => {
          const inX = cW * (1 - sa.pct) / 2;
          const inY = cH * (1 - sa.pct) / 2;
          ctx.strokeStyle = sa.color;
          ctx.lineWidth = lw;
          ctx.setLineDash(sa.dash ? sa.dash.split(',').map(n => Number(n) * pxScale) : []);
          ctx.strokeRect(inX, inY, cW - inX * 2, cH - inY * 2);
        });
        ctx.setLineDash([]);
      }
    }
    const q = fmt === 'png' ? undefined : exportQuality / 100;
    canvas.toBlob(blob => {
      if (!blob) return;
      const ext = EXT[blob.type] ?? fmt; // browsers without WebP encoding fall back to PNG
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.download = `${imgFileName || 'image'}_${cW}x${cH}.${ext}`;
      a.href = url;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }, MIME[fmt], q);
  };

  const copyText = async (text: string) => {
    try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
  };
  const copyColor = (hex: string) => {
    copyText(formatColor(hex, colorFmt));
    setCopiedColor(hex); setTimeout(() => setCopiedColor(null), 1500);
  };
  const copyAllColors = () => {
    if (!pickerData) return;
    copyText(pickerData.map(c => formatColor(c.hex, colorFmt)).join('\n'));
    setCopiedColor('__all'); setTimeout(() => setCopiedColor(null), 1500);
  };
  const copySize = () => {
    copyText(`${width}×${height}`);
    setSizeCopied(true); setTimeout(() => setSizeCopied(false), 1500);
  };
  const cycleGuide = () => {
    const ids = GUIDE_MODES.map(g => g.id);
    setGuide(g => ids[(ids.indexOf(g) + 1) % ids.length]);
  };

  const clearImage = () => {
    setImgSrc(null); setImgNat({ w: 0, h: 0 }); resetZoom();
    setPickerData(null); setCopiedColor(null); setHistogram(null);
    initialPickerRef.current = null;
    if (fileRef.current) fileRef.current.value = '';
  };

  const getVisibleCropNorm = () => {
    if (!imgNatRef.current.w || !pvWrapRef.current) return null;
    const nat = imgNatRef.current, off = imgOffRef.current, sm = snapModeRef.current;
    const { pw, ph } = getPvSize();
    if (!pw || !ph) return null;
    const sc = computeScale(pw, ph, nat, sm, imgZoomRef.current);
    const x  = Math.max(0, 0.5 - (pw / 2 + off.x) / (nat.w * sc));
    const y  = Math.max(0, 0.5 - (ph / 2 + off.y) / (nat.h * sc));
    const x1 = Math.min(1, 0.5 + (pw / 2 - off.x) / (nat.w * sc));
    const y1 = Math.min(1, 0.5 + (ph / 2 - off.y) / (nat.h * sc));
    return { x, y, w: Math.max(0, x1 - x), h: Math.max(0, y1 - y) };
  };

  const runPaletteWithMode = (mode: PaletteMode) => {
    if (!imgRef.current || !imgNatRef.current.w) return;
    const crop = getVisibleCropNorm() || undefined;
    const result = extractPaletteWithPositions(imgRef.current, mode, crop);
    if (result) { setPickerData(result); initialPickerRef.current = result.map(p => ({ ...p })); }
  };

  const handlePaletteModeChange = (e: ReactChangeEvent<HTMLSelectElement>) => {
    const m = e.target.value as PaletteMode;
    paletteModeRef.current = m;
    setPaletteMode(m);
    runPaletteWithMode(m);
  };

  const resetPalette = () => {
    if (initialPickerRef.current) setPickerData(initialPickerRef.current.map(p => ({ ...p })));
  };

  const rerollPalette = () => runPaletteWithMode(paletteModeRef.current);

  const startPickerDrag = (e: ReactMouseEvent, idx: number) => {
    if (!imgRef.current || !imgNatRef.current.w) return;
    e.preventDefault(); e.stopPropagation();
    const { pw, ph } = getPvSize();
    const nat = imgNatRef.current;
    const sm  = snapModeRef.current;
    const sc  = computeScale(pw, ph, nat, sm, imgZoomRef.current);
    const off = imgOffRef.current;
    const natScW = nat.w * sc, natScH = nat.h * sc;
    const vx0 = Math.max(0, 0.5 - (pw / 2 + off.x) / natScW);
    const vx1 = Math.min(1, 0.5 + (pw / 2 - off.x) / natScW);
    const vy0 = Math.max(0, 0.5 - (ph / 2 + off.y) / natScH);
    const vy1 = Math.min(1, 0.5 + (ph / 2 - off.y) / natScH);
    const z = getBodyZoom();
    let prevMx = e.clientX, prevMy = e.clientY;
    const onMove = (ev: MouseEvent) => {
      const dx = (ev.clientX - prevMx) / z, dy = (ev.clientY - prevMy) / z;
      prevMx = ev.clientX; prevMy = ev.clientY;
      setPickerData(prev => {
        if (!prev) return prev;
        return prev.map((p, i) => {
          if (i !== idx) return p;
          const newX = Math.max(vx0, Math.min(vx1, p.x + dx / natScW));
          const newY = Math.max(vy0, Math.min(vy1, p.y + dy / natScH));
          if (newX === p.x && newY === p.y) return p;
          return { x: newX, y: newY, hex: sampleColor(imgRef.current!, newX, newY) };
        });
      });
    };
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const rotateAspect = () => {
    const newW = height, newH = width;
    setWidth(newW); setHeight(newH);
    const r = newW / newH;
    let best: Ratio | null = null, bestD = 9999;
    for (const ar of RATIOS) { const d = Math.abs(r - ar.w / ar.h); if (d < bestD) { bestD = d; best = ar; } }
    if (best) setRatio(best);
    setTpl(null);
  };

  // Keyboard shortcuts (latest handler kept in a ref so the listener is registered once)
  const keyHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyHandlerRef.current = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); exportImg(); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    switch (e.key.toLowerCase()) {
      case 'o': setShowImg(true); fileRef.current?.click(); break;
      case 'r': rotateAspect(); break;
      case 'l': setLinked(v => !v); break;
      case 'g': cycleGuide(); break;
      case 's': setShowSafe(v => !v); break;
      case 'h': setShowImg(v => !v); break;
      case 'm': setShowBW(v => !v); break;
      case 'b': setShowBlur(!showBlurRef.current); break;
      case '0': resetZoom(); break;
      case '?': toggleMenu('keys'); break;
      default: return;
    }
    e.preventDefault();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyHandlerRef.current(e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const sortedRatios = [...RATIOS].sort((a, b) => b.w / b.h - a.w / a.h);
  const CAT_LABELS: Record<string, string> = {
    all: 'All', display: 'Display', video: 'Video', social: 'Social',
    mobile: 'Mobile', print: 'Print', music: 'Music',
  };
  const BLUR_MAX = 100;
  const resetToNative = () => {
    setWidth(imgNat.w); setHeight(imgNat.h); setTpl(null); resetZoom();
    const r = imgNat.w / imgNat.h;
    let best: Ratio | null = null, bestD = 9999;
    for (const ar of RATIOS) { const d = Math.abs(r - ar.w / ar.h); if (d < bestD) { bestD = d; best = ar; } }
    if (best) setRatio(best);
  };

  return (
    <div>
      {/* ── Global nav ── */}
      <nav className="topbar">
        <div className="topbar-inner">
          <div className="logo">PXL</div>
          <div className="nav-spacer"/>
          <a className="nav-link" href="https://x.com/Purukichi3" target="_blank" rel="noopener noreferrer">{'> ⇀ <'}</a>
          <div style={{ position: 'relative' }}>
            <button className={`ic-btn${openMenu === 'keys' ? ' on' : ''}`} title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts"
              onClick={e => { e.stopPropagation(); toggleMenu('keys'); }}>
              <Ic.keyboard/>
            </button>
            {openMenu === 'keys' && (
              <div className="menu keys-menu" onClick={e => e.stopPropagation()}>
                <div className="menu-label">Keyboard shortcuts</div>
                {SHORTCUTS.map(([k, label]) => (
                  <div key={k} className="key-row"><span>{label}</span><kbd>{k}</kbd></div>
                ))}
              </div>
            )}
          </div>
          <button className="ic-btn" onClick={() => setDark(d => !d)} title={dark ? 'Light mode' : 'Dark mode'} aria-label="Toggle theme">
            {dark ? <Ic.sun/> : <Ic.moon/>}
          </button>
        </div>
      </nav>

      <div className="page">

        {/* ── Sidebar ── */}
        <aside className="sidebar">

          {/* Aspect ratio */}
          <section className="card">
            <div className="card-inner">
              <div className="card-head">
                <div>
                  <div className="sec-title">Aspect Ratio</div>
                  <div className="sec-sub">{detR || toRatio(width, height)}</div>
                </div>
                <button className="ic-btn" onClick={rotateAspect} title="Swap orientation (R)" aria-label="Swap orientation">
                  <Ic.rotate/>
                </button>
              </div>
              <div className="ratio-grid">
                {sortedRatios.map(ar2 => (
                  <RatioChip key={ar2.label} ar={ar2} active={ratio.label === ar2.label}
                    onClick={() => { setRatio(ar2); setHeight(Math.round(width * ar2.h / ar2.w)); setTpl(null); }} />
                ))}
              </div>
            </div>
          </section>

          {/* Histogram */}
          <section className="card">
            <div className="card-inner">
              <div className="card-head" style={{ marginBottom: 10 }}>
                <div className="sec-title">Histogram</div>
              </div>
              {displayHistogram ? (() => {
                const dh = displayHistogram;
                const W = 260, H = 72, N = dh.r.length;
                const maxVal = Math.max(...dh.lum, ...dh.r, ...dh.g, ...dh.b, 1);
                const toPath = (bins: number[]) => {
                  const pts = bins.map((v, i) => `${(i / (N - 1) * W).toFixed(1)},${(H - v / maxVal * H * 0.93).toFixed(1)}`).join(' L ');
                  return `M 0,${H} L ${pts} L ${W},${H} Z`;
                };
                return (
                  <div>
                    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
                      style={{ display: 'block', borderRadius: 8, overflow: 'hidden', background: 'var(--fill)', mixBlendMode: 'normal' }}>
                      <path d={toPath(dh.r)}   fill="rgba(255,59,48,0.45)"/>
                      <path d={toPath(dh.g)}   fill="rgba(52,199,89,0.45)"/>
                      <path d={toPath(dh.b)}   fill="rgba(0,122,255,0.45)"/>
                      <path d={toPath(dh.lum)} fill="var(--t1)" opacity="0.18"/>
                    </svg>
                    <div className="hist-legend">
                      <span>Shadows</span>
                      <div className="rgb">
                        <span style={{ color: '#ff3b30' }}>R</span>
                        <span style={{ color: '#34c759' }}>G</span>
                        <span style={{ color: '#007aff' }}>B</span>
                      </div>
                      <span>Highlights</span>
                    </div>
                  </div>
                );
              })() : (
                <div className="empty-note">Add an image to see its tonal range.</div>
              )}
            </div>
          </section>

          {/* Palette */}
          <section className="card">
            <div className="card-inner">
              <div className="card-head">
                <div className="sec-title">Colors</div>
                <div className="toolbar">
                  <button className="ic-btn" onClick={resetPalette} disabled={!pickerData} title="Reset picks" aria-label="Reset picks"><Ic.refresh/></button>
                  <button className="ic-btn" onClick={rerollPalette} disabled={!imgSrc} title="Shuffle" aria-label="Shuffle"><Ic.shuffle/></button>
                  <button className={`ic-btn${copiedColor === '__all' ? ' on' : ''}`} onClick={copyAllColors} disabled={!pickerData} title={`Copy all as ${colorFmt}`} aria-label="Copy all colors">
                    {copiedColor === '__all' ? <Ic.check/> : <Ic.copy/>}
                  </button>
                  <button className={`ic-btn${showPickerDots ? ' on' : ''}`} onClick={() => setShowPickerDots(v => !v)} title="Show pickers" aria-label="Show pickers">
                    {showPickerDots ? <Ic.eyeOn/> : <Ic.eyeOff/>}
                  </button>
                </div>
              </div>
              <div className="colors-ctl">
                <div className="select-wrap">
                  <select id="palette-mode" value={paletteMode} onChange={handlePaletteModeChange} aria-label="Palette mode">
                    {(['DARK', 'BRIGHT', 'VIVID', 'WARM', 'COLD', 'TRITONE'] as PaletteMode[]).map(m => (
                      <option key={m} value={m}>{m.charAt(0) + m.slice(1).toLowerCase()}</option>
                    ))}
                  </select>
                  <Ic.chevronDown/>
                </div>
                <div className="seg" role="group" aria-label="Copy format">
                  {(['HEX', 'RGB', 'HSL'] as ColorFmt[]).map(f => (
                    <button key={f} className={colorFmt === f ? 'on' : ''} onClick={() => setColorFmt(f)}>{f}</button>
                  ))}
                </div>
              </div>
              {pickerData ? (
                <div className="swatches">
                  {pickerData.map((c, i) => (
                    <div key={i} className="swatch">
                      <button
                        className="swatch-chip"
                        onClick={() => copyColor(c.hex)}
                        style={{ background: c.hex }}
                        title={`Copy ${formatColor(c.hex, colorFmt)}`}
                        aria-label={`Copy ${formatColor(c.hex, colorFmt)}`}
                      />
                      <span className={`swatch-hex${copiedColor === c.hex ? ' copied' : ''}`}>
                        {copiedColor === c.hex ? 'Copied' : c.hex.toUpperCase().slice(1)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-note">Colors appear once an image is loaded.</div>
              )}
            </div>
          </section>

          {/* Adjustments */}
          <section className="card">
            <div className="card-inner">
              <div className="card-head">
                <div className="sec-title">Adjustments</div>
              </div>
              <div className="adj-row">
                <div className="adj-icon"><Ic.bw/></div>
                <span className="adj-label">Monochrome <kbd>M</kbd></span>
                <button className={`switch${showBW ? ' on' : ''}`} role="switch" aria-checked={showBW} aria-label="Monochrome"
                  onClick={() => setShowBW(v => !v)}/>
              </div>
              <div className="adj-row" style={{ flexWrap: 'wrap' }}>
                <div className="adj-icon"><Ic.blur/></div>
                <span className="adj-label">Gaussian Blur <kbd>B</kbd></span>
                <button className={`switch${showBlur ? ' on' : ''}`} role="switch" aria-checked={showBlur} aria-label="Gaussian blur"
                  onClick={() => setShowBlur(!showBlur)}/>
                <div className="adj-slider" style={{ width: '100%' }}>
                  <input className="range" type="range" min={1} max={BLUR_MAX} value={Math.min(blurAmount, BLUR_MAX)}
                    disabled={!showBlur}
                    style={{ ['--p' as string]: `${((Math.min(blurAmount, BLUR_MAX) - 1) / (BLUR_MAX - 1)) * 100}%` }}
                    onChange={e => setBlurAmount(parseInt(e.target.value) || 1)}
                    aria-label="Blur radius"/>
                  <span className="adj-value">{blurAmount}px</span>
                </div>
              </div>
            </div>
          </section>

        </aside>

        {/* ── Main ── */}
        <main className="main">

          {/* Preview */}
          <section className="card">
            <div className="card-inner">
              <div className="card-head preview-head">
                <div>
                  <div className="sec-title">Preview</div>
                  <div className="sec-sub">{width || '—'} × {height || '—'} px{tpl ? ` · ${tpl}` : ''}</div>
                </div>
                <div className="toolbar">
                  <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
                    onChange={e => loadFile(e.target.files?.[0])}/>
                  {showImg && imgSrc && (
                    <button className="ic-btn danger" onClick={clearImage} title="Remove image" aria-label="Remove image"><Ic.trash/></button>
                  )}
                  <button className="ic-btn" onClick={() => { setShowImg(true); fileRef.current?.click(); }} title="Choose image (O)" aria-label="Choose image"><Ic.upload/></button>
                  <div style={{ position: 'relative' }}>
                    <button className={`ic-btn${guide !== 'none' ? ' on' : ''}`} title="Composition guides (G)" aria-label="Composition guides"
                      onClick={e => { e.stopPropagation(); toggleMenu('guides'); }}><Ic.guides/></button>
                    {openMenu === 'guides' && (
                      <div className="menu" onClick={e => e.stopPropagation()}>
                        <div className="menu-label">Guides</div>
                        {GUIDE_MODES.map(g => (
                          <button key={g.id} className={`menu-item${guide === g.id ? ' sel' : ''}`} onClick={() => { setGuide(g.id); setOpenMenu(null); }}>
                            {g.label}{guide === g.id && <Ic.check size={14}/>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button className={`ic-btn${showSafe ? ' on' : ''}`} onClick={() => setShowSafe(v => !v)} title="Safe area (S)" aria-label="Safe area"><Ic.safe/></button>
                  <button className={`ic-btn${showImg ? ' on' : ''}`} onClick={() => setShowImg(v => !v)} title="Show image (H)" aria-label="Show image">
                    {showImg ? <Ic.eyeOn/> : <Ic.eyeOff/>}
                  </button>
                  <div className="tb-sep"/>
                  <div style={{ position: 'relative' }}>
                    <button className="btn-primary" aria-expanded={openMenu === 'export'}
                      onClick={e => { e.stopPropagation(); toggleMenu('export'); }}>
                      <Ic.download/> Export
                    </button>
                    {openMenu === 'export' && (
                      <div className="menu export-menu" onClick={e => e.stopPropagation()}>
                        <div className="menu-label">Format</div>
                        <div className="seg seg-full" role="group" aria-label="Format">
                          {(['jpg', 'png', 'webp'] as ExportFmt[]).map(f => (
                            <button key={f} className={exportFmt === f ? 'on' : ''} onClick={() => setExportFmt(f)}>{f.toUpperCase()}</button>
                          ))}
                        </div>
                        {exportFmt !== 'png' ? (
                          <>
                            <div className="menu-label menu-label-row">
                              <span>Quality</span><span className="menu-val">{exportQuality}%</span>
                            </div>
                            <div className="menu-range">
                              <input id="export-quality" className="range" type="range" min={50} max={100} value={exportQuality}
                                style={{ ['--p' as string]: `${(exportQuality - 50) * 2}%` }}
                                onChange={e => setExportQuality(parseInt(e.target.value) || 100)} aria-label="Quality"/>
                            </div>
                            <div className="menu-note">
                              {exportFmt === 'jpg' && exportQuality < 100
                                ? 'Below 100%, browsers halve color resolution. Reds and fine edges may blur.'
                                : exportFmt === 'jpg' ? 'Full color resolution. Largest file.' : 'Smaller files with transparency support.'}
                            </div>
                          </>
                        ) : (
                          <div className="menu-note">Lossless, keeps transparency.</div>
                        )}
                        <label className="menu-check">
                          <input id="export-overlays" type="checkbox" checked={exportOverlays} onChange={e => setExportOverlays(e.target.checked)}/>
                          Include guides and safe area
                        </label>
                        <button className="btn-primary btn-block" onClick={() => { exportImg(); setOpenMenu(null); }}>
                          Save {width} × {height} {exportFmt.toUpperCase()}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div
                className="preview-area"
                ref={pvAreaRef}
                onDrop={onFileDrop}
                onDragOver={onFileDragOver}
                onDragEnter={onFileDragEnter}
                onDragLeave={onFileDragLeave}
              >
                {fileDrag && <div className="drop-overlay"><Ic.drop/></div>}
                <button
                  className="paste-btn"
                  onClick={e => { e.stopPropagation(); pasteFromClipboard(); }}
                  title="Or press ⌘V / Ctrl+V to paste instantly"
                >
                  Paste from clipboard
                  <span className="kbd">⌘V</span>
                </button>

                <div className="pv-wrap" ref={pvWrapRef} style={{ width: pvW, height: pvH }}>
                  <div
                    className={`pv-canvas${showImg && imgSrc ? ' has-img' : ''}${!imgSrc ? ' empty' : ''}${panning ? ' panning' : ''}`}
                    onMouseDown={onCanvasMouseDown}
                    onClick={() => { if (!imgSrc) { setShowImg(true); fileRef.current?.click(); } }}
                  >
                    {showImg && imgSrc && (
                      <img
                        ref={imgRef}
                        src={imgSrc}
                        alt=""
                        className="pv-img"
                        style={{
                          maxWidth: 'none', maxHeight: 'none',
                          filter: [showBW ? 'grayscale(1)' : '', showBlur ? `blur(${blurAmount}px)` : ''].filter(Boolean).join(' ') || 'none',
                        }}
                      />
                    )}
                    {!imgSrc && pvW > 180 && pvH > 120 && (
                      <div className="drop-hint">
                        <div className="dh-icon"><Ic.drop/></div>
                        <div className="dh-title">Drop an image</div>
                        <div className="dh-sub">or <b>browse</b> · paste with ⌘V</div>
                      </div>
                    )}
                  </div>

                  {showSafe && (
                    <svg className="pv-safe" viewBox={`0 0 ${pvW} ${pvH}`} preserveAspectRatio="none" width={pvW} height={pvH}>
                      {SAFE_AREAS.map(sa => {
                        const inX = pvW * (1 - sa.pct) / 2;
                        const inY = pvH * (1 - sa.pct) / 2;
                        return (
                          <g key={sa.label}>
                            <rect
                              x={inX} y={inY}
                              width={pvW - inX * 2} height={pvH - inY * 2}
                              fill="none" stroke={sa.color} strokeWidth="0.75"
                              strokeDasharray={sa.dash}
                            />
                            <text x={inX + 6} y={inY + 14} fill={sa.color} fontSize="10" fontWeight="500" fontFamily="inherit">{sa.label}</text>
                          </g>
                        );
                      })}
                    </svg>
                  )}

                  {guide !== 'none' && (
                    <svg className="pv-safe" viewBox={`0 0 ${pvW} ${pvH}`} width={pvW} height={pvH} aria-hidden="true">
                      {guideLines(guide, pvW, pvH).map(([x1, y1, x2, y2], k) => (
                        <g key={k}>
                          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(0,0,0,0.3)" strokeWidth="2"/>
                          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255,255,255,0.85)" strokeWidth="1"/>
                        </g>
                      ))}
                    </svg>
                  )}

                  <div className="pv-frame"></div>

                  {showPickerDots && pickerData && showImg && imgSrc && imgNat.w > 0 && pickerData.map((picker, idx) => {
                    const sc = (snapMode === 'h' ? pvH / imgNat.h : pvW / imgNat.w) * (imgZoom / 100);
                    const sx = pvW / 2 + imgOff.x + (picker.x * imgNat.w - imgNat.w / 2) * sc;
                    const sy = pvH / 2 + imgOff.y + (picker.y * imgNat.h - imgNat.h / 2) * sc;
                    if (sx < -12 || sx > pvW + 12 || sy < -12 || sy > pvH + 12) return null;
                    return (
                      <div key={idx}
                        style={{ position: 'absolute', left: sx, top: sy, transform: 'translate(-50%,-50%)',
                          zIndex: 9, cursor: 'crosshair', pointerEvents: 'all', color: 'rgba(255,255,255,0.95)',
                          filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))' }}
                        onMouseDown={e => startPickerDrag(e, idx)}>
                        <div style={{ position: 'absolute', bottom: 'calc(100% + 4px)', left: '50%', transform: 'translateX(-50%)',
                          width: 20, height: 20, borderRadius: '50%', background: picker.hex,
                          border: '2.5px solid #fff', boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
                          pointerEvents: 'none' }}/>
                        <Ic.crosshair/>
                      </div>
                    );
                  })}

                  <div className="pv-badge-r">{detR || toRatio(width, height)}</div>
                </div>
              </div>

              {/* footer */}
              <div className="pv-foot">
                {natRatio ? (
                  <div className="meta">
                    <span className="meta-label">Original</span>
                    <strong>{natRatio}</strong>
                    <span>{imgNat.w} × {imgNat.h}</span>
                    <button className="link-btn" onClick={resetToNative} title="Use original size and reset position">Use original</button>
                  </div>
                ) : (
                  <div className="meta"><span className="meta-label">Drag to reposition · drag picker dots to sample colors</span></div>
                )}
                {showImg && imgSrc && (
                  <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', alignItems: 'center' }}>
                    <div className="seg">
                      <button className={snapMode === 'h' ? 'on' : ''} title="Fit height" aria-label="Fit height"
                        onClick={() => { setSnapMode('h'); resetZoom(); }}><Ic.fitH/></button>
                      <button className={snapMode === 'v' ? 'on' : ''} title="Fit width" aria-label="Fit width"
                        onClick={() => { setSnapMode('v'); resetZoom(); }}><Ic.fitW/></button>
                    </div>
                    <div className="seg">
                      <div className="seg-input" title="Drag to zoom · Alt+click or 0 to reset"
                        onMouseDown={e => {
                          if (e.altKey) { e.preventDefault(); resetZoom(); return; }
                          dragZoom.onMouseDown(e);
                        }}>
                        <input className="no-spin" type="number" value={imgZoom} min={10} max={1000} aria-label="Zoom"
                          onChange={e => { setImgZoom(parseInt(e.target.value) || 100); setImgOff({ x: 0, y: 0 }); }}/>
                        <span>%</span>
                      </div>
                      {imgZoom !== 100 && (
                        <button title="Reset zoom" aria-label="Reset zoom" onClick={resetZoom}>Reset</button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Dimensions */}
          <section className="card">
            <div className="card-inner">
              <div className="card-head">
                <div className="sec-title">Dimensions</div>
                <div className="toolbar">
                  <span className="sec-sub hint">Drag a field sideways to adjust</span>
                  <button className={`ic-btn${sizeCopied ? ' on' : ''}`} onClick={copySize} title="Copy size" aria-label="Copy size">
                    {sizeCopied ? <Ic.check/> : <Ic.copy/>}
                  </button>
                </div>
              </div>
              <div className="input-row">
                <label className="dim-field drag-input-wrap">
                  <span className="dim-label">W</span>
                  <input type="number" value={width || ''} placeholder="1920"
                    onChange={e => handleW(e.target.value)}
                    {...dragW}
                  />
                  <span className="dim-unit">px</span>
                </label>
                <button className={`lock-btn${linked ? ' locked' : ''}`}
                  title={linked ? 'Aspect ratio locked (L)' : 'Aspect ratio free (L)'}
                  aria-label={linked ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
                  onClick={() => setLinked(l => !l)}>
                  {linked ? <Ic.lock/> : <Ic.unlock/>}
                </button>
                <label className="dim-field drag-input-wrap">
                  <span className="dim-label">H</span>
                  <input type="number" value={height || ''} placeholder="1080"
                    onChange={e => handleH(e.target.value)}
                    {...dragH}
                  />
                  <span className="dim-unit">px</span>
                </label>
              </div>
            </div>
          </section>

          {/* Presets */}
          <details className="card presets">
            <summary>
              <span className="chev"><Ic.chevron/></span>
              <span className="sec-title" style={{ flex: 1 }}>Presets</span>
              <span className="sec-sub">{TEMPLATES.length} sizes</span>
            </summary>
            <div className="presets-body">
              <div className="cat-row">
                <div className="seg">
                  {cats.map(c => {
                    const Icon = CAT_ICONS[c];
                    return (
                      <button key={c} className={cat === c ? 'on' : ''} onClick={() => setCat(c)}>
                        <Icon/>{CAT_LABELS[c]}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="tpl-grid">
                {filtTpls.map(t2 => {
                  const CatIcon = CAT_ICONS[t2.cat];
                  return (
                    <button key={t2.name} className={`tpl-item${tpl === t2.name ? ' active' : ''}`} onClick={() => applyTpl(t2)}>
                      <span className="tpl-left">
                        <CatIcon/>
                        <span className="tpl-name">{t2.name}</span>
                      </span>
                      <span className="tpl-size">{t2.w} × {t2.h}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </details>
        </main>
      </div>
      <div className="foot">PXL — Everything runs locally in your browser.</div>
    </div>
  );
}
