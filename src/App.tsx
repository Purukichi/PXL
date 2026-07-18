import { useState, useEffect, useRef } from 'react';
import type { CSSProperties, MouseEvent as ReactMouseEvent, DragEvent as ReactDragEvent, ChangeEvent as ReactChangeEvent } from 'react';
import { Ic, CAT_ICONS } from './icons';
import { RATIOS, TEMPLATES, SAFE_AREAS } from './data';
import {
  computeScale, getBodyZoom, toRatio, detectRatio,
  computeHistogram, sampleColor, extractPaletteWithPositions,
} from './utils';
import { RatioChip } from './RatioChip';
import type {
  Histogram, ImgNat, PaletteMode, Picker, Ratio, SnapMode, Template, Vec2,
} from './types';

export default function App() {
  const [ratio,    setRatio]   = useState<Ratio>(RATIOS[3]);
  const [linked,   setLinked]  = useState<boolean>(true);
  const [width,    setWidth]   = useState<number>(1920);
  const [height,   setHeight]  = useState<number>(1080);
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

  const [paletteMode, setPaletteMode] = useState<PaletteMode>('VIVID');
  const [pickerData,  setPickerData]  = useState<Picker[] | null>(null);
  const [copiedColor, setCopiedColor] = useState<string | null>(null);
  const [histogram,   setHistogram]   = useState<Histogram | null>(null);
  const displayHistRef = useRef<Histogram | null>(null);
  const histAnimRef    = useRef<number | null>(null);
  const [displayHistogram, setDisplayHistogram_] = useState<Histogram | null>(null);
  const setDisplayHistogram = (v: Histogram | null) => { displayHistRef.current = v; setDisplayHistogram_(v); };
  const [showFmtMenu, setShowFmtMenu] = useState<boolean>(false);
  const [showPickerDots, setShowPickerDots] = useState<boolean>(true);

  // Theme
  const [dark, setDark] = useState<boolean>(false);

  const fileRef    = useRef<HTMLInputElement | null>(null);
  const imgRef     = useRef<HTMLImageElement | null>(null);
  const pvWrapRef  = useRef<HTMLDivElement | null>(null);
  const pvAreaRef  = useRef<HTMLDivElement | null>(null);
  const [pvAreaW, setPvAreaW] = useState<number>(600);
  const [pvAreaH, setPvAreaH] = useState<number>(320);

  const paletteModeRef   = useRef<PaletteMode>('VIVID');
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
    if (!showFmtMenu) return;
    const close = () => setShowFmtMenu(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [showFmtMenu]);

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

  const pasteFromClipboard = async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find(t => t.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          const ext = imageType.split('/')[1] || 'png';
          loadFile(new File([blob], `pasted.${ext}`, { type: imageType }));
          setShowImg(true);
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
  const dragBlur = makeDragInput(() => blurAmount, setBlurAmount);

  // ── Export (JPG or PNG) ──────────────────────────────────────────────────
  const exportImg = (fmt: 'jpg' | 'png') => {
    const cW = width, cH = height;
    const canvas = document.createElement('canvas');
    canvas.width = cW; canvas.height = cH;
    const ctx = canvas.getContext('2d')!;
    if (fmt === 'jpg') {
      ctx.fillStyle = dark ? '#181715' : '#f0efe9';
      ctx.fillRect(0, 0, cW, cH);
    }
    if (imgSrc && imgRef.current) {
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
      const filters = [showBW ? 'grayscale(1)' : '', showBlur ? `blur(${blurAmount}px)` : ''].filter(Boolean);
      if (filters.length) ctx.filter = filters.join(' ');
      ctx.drawImage(img, ix, iy, iw, ih);
      ctx.restore();
    }
    if (showSafe) {
      SAFE_AREAS.forEach(sa => {
        const inX = cW * (1 - sa.pct) / 2;
        const inY = cH * (1 - sa.pct) / 2;
        ctx.strokeStyle = sa.color;
        ctx.lineWidth = 0.5;
        ctx.setLineDash(sa.dash ? sa.dash.split(',').map(Number) : []);
        ctx.strokeRect(inX, inY, cW - inX * 2, cH - inY * 2);
      });
      ctx.setLineDash([]);
    }
    const ratio_str = `${width}x${height}`;
    const base = imgFileName || 'image';
    const a = document.createElement('a');
    a.download = `${base}_${ratio_str}.${fmt}`;
    a.href = fmt === 'jpg'
      ? canvas.toDataURL('image/jpeg', 0.93)
      : canvas.toDataURL('image/png');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
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

  const dragInputWrapStyle: CSSProperties = {
    flex: 1, display: 'flex', alignItems: 'center', gap: 6,
    fontSize: 10, fontWeight: 500, lineHeight: 1,
    border: '1px solid var(--border)', borderRadius: 'var(--rs)',
    padding: '6px 8px', background: 'transparent', cursor: 'ew-resize',
    transition: 'border-color 0.12s, color 0.12s',
  };

  return (
    <div>
      {/* ── Topbar ── */}
      <div className="topbar">
        <div className="logo">PXL</div>
        <button className={`dark-toggle${dark ? ' on' : ''}`} onClick={() => setDark(d => !d)}>
          {dark ? <Ic.sun/> : <Ic.moon/>}
        </button>
      </div>

      <div className="page" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14 }}>

        {/* ── Left sidebar ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: 220, flexShrink: 0 }}>
          <div className="card">
            <div className="card-inner">
              {[
                { svg: <svg width="16" height="10" viewBox="0 0 16 10" fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="0.7" y="0.7" width="14.6" height="8.6" rx="1"/></svg>, list: RATIOS.filter(r => r.w > r.h) },
                { svg: <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="0.7" y="0.7" width="10.6" height="10.6" rx="1"/></svg>, list: RATIOS.filter(r => r.w === r.h) },
              ].map((group, i) => (
                group.list.length ? (
                  <div key={i} style={{ marginBottom: 8 }}>
                    <div style={{ color: 'var(--t3)', marginBottom: 5, opacity: 0.7 }}>{group.svg}</div>
                    <div className="ratio-grid">
                      {group.list.map(ar2 => (
                        <RatioChip key={ar2.label} ar={ar2} active={ratio.label === ar2.label}
                          onClick={() => { setRatio(ar2); setHeight(Math.round(width * ar2.h / ar2.w)); }} />
                      ))}
                    </div>
                  </div>
                ) : null
              ))}
              <button className="ic-btn"
                style={{ width: '100%', marginTop: 4, gap: 6, justifyContent: 'center' }}
                onClick={rotateAspect} title="90°">
                <Ic.rotate/>
              </button>
            </div>
          </div>

          {/* ── Luminance Histogram ── */}
          <div className="card">
            <div className="card-inner" style={{ padding: '12px 14px' }}>
              {displayHistogram ? (() => {
                const dh = displayHistogram;
                const W = 192, H = 56, N = dh.r.length;
                const maxVal = Math.max(...dh.lum, ...dh.r, ...dh.g, ...dh.b, 1);
                const toPath = (bins: number[]) => {
                  const pts = bins.map((v, i) => `${(i / N * W).toFixed(1)},${(H - v / maxVal * H * 0.93).toFixed(1)}`).join(' L ');
                  return `M 0,${H} L ${pts} L ${W},${H} Z`;
                };
                return (
                  <div>
                    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: 'block', borderRadius: 3, overflow: 'hidden' }}>
                      <path d={toPath(dh.r)}   fill="rgba(255,70,70,0.4)"/>
                      <path d={toPath(dh.g)}   fill="rgba(50,190,80,0.4)"/>
                      <path d={toPath(dh.b)}   fill="rgba(60,120,255,0.4)"/>
                      <path d={toPath(dh.lum)} fill="var(--t1)" opacity="0.25"/>
                    </svg>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, fontSize: 8, color: 'var(--t3)', fontWeight: 500 }}>
                      <span>DARK</span>
                      <div style={{ display: 'flex', gap: 5 }}>
                        <span style={{ color: 'rgba(255,70,70,0.8)' }}>R</span>
                        <span style={{ color: 'rgba(50,190,80,0.9)' }}>G</span>
                        <span style={{ color: 'rgba(80,140,255,0.9)' }}>B</span>
                      </div>
                      <span>LIGHT</span>
                    </div>
                  </div>
                );
              })() : (
                <div style={{ height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 9, color: 'var(--t3)' }}>—</span>
                </div>
              )}
            </div>
          </div>

          {/* ── Color Palette ── */}
          <div className="card">
            <div className="card-inner" style={{ padding: '10px 14px' }}>
              <div style={{ display: 'flex', gap: 4, marginBottom: 8, alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <select
                    value={paletteMode}
                    onChange={handlePaletteModeChange}
                    style={{
                      width: '100%', fontSize: 10, fontWeight: 500, letterSpacing: '0.04em',
                      border: '1px solid var(--border)', borderRadius: 'var(--rs)',
                      background: 'var(--bg)', color: 'var(--t1)', padding: '6px 20px 6px 8px',
                      cursor: 'pointer', outline: 'none', appearance: 'none', WebkitAppearance: 'none',
                      fontFamily: 'inherit',
                    }}>
                    {(['DARK', 'BRIGHT', 'VIVID', 'WARM', 'COLD', 'TRITONE'] as PaletteMode[]).map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                  <svg style={{ position: 'absolute', right: 5, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
                    width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="var(--t3)" strokeWidth="1.4">
                    <polyline points="1,2.5 4,5.5 7,2.5"/>
                  </svg>
                </div>
                <button className="ic-btn" onClick={resetPalette} disabled={!pickerData} title="Reset"><Ic.refresh/></button>
                <button className="ic-btn" onClick={rerollPalette} disabled={!imgSrc} title="Random"><Ic.dice/></button>
                <button className={`ic-btn${showPickerDots ? ' on' : ''}`} onClick={() => setShowPickerDots(v => !v)} title="On/Off">
                  {showPickerDots ? <Ic.eyeOn/> : <Ic.eyeOff/>}
                </button>
              </div>
              {pickerData ? (
                <div style={{ display: 'flex', gap: 4 }}>
                  {pickerData.map((c, i) => (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                      <div
                        onClick={() => { navigator.clipboard.writeText(c.hex); setCopiedColor(c.hex); setTimeout(() => setCopiedColor(null), 1500); }}
                        style={{ width: '100%', height: 24, background: c.hex, borderRadius: 'var(--rs)', cursor: 'pointer', border: '1px solid rgba(0,0,0,0.1)', transition: 'transform 0.1s' }}
                        onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.08)')}
                        onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                        title="Get!"
                      />
                      <span style={{ fontSize: 7, fontWeight: 500, color: copiedColor === c.hex ? 'var(--t1)' : 'var(--t3)', letterSpacing: '0.02em', fontVariantNumeric: 'tabular-nums', textAlign: 'center', lineHeight: 1 }}>
                        {copiedColor === c.hex ? 'COPIED' : c.hex.toUpperCase()}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 9, color: 'var(--t3)' }}>—</span>
                </div>
              )}
            </div>
          </div>

          {/* ── B&W Toggle ── */}
          <div className="card">
            <div className="card-inner" style={{ padding: '8px 14px' }}>
              <button
                className={`ic-btn${showBW ? ' on' : ''}`}
                style={{ width: '100%', justifyContent: 'center', gap: 6 }}
                onClick={() => setShowBW(v => !v)}
                title="Monochrome">
                <Ic.bw/>
              </button>
            </div>
          </div>

          {/* ── Blur ── */}
          <div className="card">
            <div className="card-inner" style={{ padding: '8px 14px' }}>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <div style={{ ...dragInputWrapStyle, opacity: showBlur ? 1 : 0.45 }}
                     onMouseDown={dragBlur.onMouseDown}>
                  <Ic.blurGauss/>
                  <input className="no-spin" type="number" value={blurAmount} min={1}
                    onChange={e => setBlurAmount(parseInt(e.target.value) || 1)}
                    style={{ flex: 1, width: 0, border: 'none', background: 'transparent', fontSize: 10, fontWeight: 500,
                             color: 'var(--t1)', textAlign: 'right', outline: 'none', padding: 0, cursor: 'ew-resize' }}
                  />
                  <span style={{ color: 'var(--t2)' }}>°</span>
                </div>
                <button
                  className={`ic-btn${showBlur ? ' on' : ''}`}
                  onClick={() => setShowBlur(!showBlur)}
                  title="On/Off">
                  {showBlur ? <Ic.eyeOn/> : <Ic.eyeOff/>}
                </button>
              </div>
            </div>
          </div>

          {/* ── Link ── */}
          <div className="card">
            <div className="card-inner" style={{ padding: '8px 14px' }}>
              <a
                href="https://x.com/Purukichi3"
                target="_blank"
                rel="noopener noreferrer"
                className="ic-btn"
                style={{ display: 'flex', width: '100%', justifyContent: 'center', textDecoration: 'none', fontSize: 12, letterSpacing: '0.06em' }}>
                {'> ⇀ <'}
              </a>
            </div>
          </div>
        </div>

        {/* ── Right column ── */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* ── Preview ── */}
          <div className="card">
            <div className="card-inner">
              <div className="card-head">
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--t3)' }}>
                  <Ic.image/>
                </div>
                <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                  {showImg && imgSrc && (
                    <button className="ic-btn danger" onClick={clearImage} title="Remove"><Ic.trash/></button>
                  )}
                  <button className={`ic-btn${showSafe ? ' on' : ''}`} onClick={() => setShowSafe(v => !v)} title="Safe Area"><Ic.safe/></button>
                  {showImg && (
                    <>
                      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
                        onChange={e => loadFile(e.target.files?.[0])}/>
                      <button className="ic-btn" onClick={() => fileRef.current?.click()} title="Put your photo"><Ic.upload/></button>
                    </>
                  )}
                  <button className={`ic-btn${showImg ? ' on' : ''}`} onClick={() => setShowImg(v => !v)} title="On/Off">
                    {showImg ? <Ic.eyeOn/> : <Ic.eyeOff/>}
                  </button>
                  <div style={{ width: 1, height: 14, background: 'var(--border)', margin: '0 1px' }}/>
                  <div style={{ position: 'relative' }}>
                    <button className="ic-btn"
                      onClick={e => { e.stopPropagation(); setShowFmtMenu(v => !v); }}>
                      <Ic.download/>
                    </button>
                    {showFmtMenu && (
                      <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 4px)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--rs)', zIndex: 20, overflow: 'hidden', minWidth: 64 }}>
                        {(['jpg', 'png'] as const).map(fmt => (
                          <button key={fmt}
                            style={{ display: 'block', width: '100%', padding: '7px 12px', fontSize: 10, fontWeight: 500, letterSpacing: '0.06em', background: 'transparent', border: 'none', color: 'var(--t1)', cursor: 'pointer', textAlign: 'left' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                            onClick={() => { exportImg(fmt); setShowFmtMenu(false); }}>
                            {fmt.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
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
                    title="Paste from clipboard"
                  >paste</button>

                  <div className="pv-wrap" ref={pvWrapRef} style={{ width: pvW, height: pvH }}>
                    <div
                      className={`pv-canvas${showImg && imgSrc ? ' has-img' : ''}${showImg && !imgSrc ? ' empty' : ''}${panning ? ' panning' : ''}`}
                      style={{ position: 'absolute', inset: 0 }}
                      onMouseDown={onCanvasMouseDown}
                      onClick={() => { if (showImg && !imgSrc) fileRef.current?.click(); }}
                    >
                      {showImg && imgSrc && (
                        <img
                          ref={imgRef}
                          src={imgSrc}
                          alt=""
                          className="pv-img"
                          style={{
                            pointerEvents: 'none', userSelect: 'none',
                            maxWidth: 'none', maxHeight: 'none',
                            filter: [showBW ? 'grayscale(1)' : '', showBlur ? `blur(${blurAmount}px)` : ''].filter(Boolean).join(' ') || 'none',
                          }}
                        />
                      )}
                      {showImg && !imgSrc && (
                        <div className="drop-hint">
                          <Ic.drop/>
                          <span>drop / select</span>
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
                                fill="none" stroke={sa.color} strokeWidth="0.5"
                                strokeDasharray={sa.dash}
                              />
                              <text x={inX + 4} y={inY + 10} fill={sa.color} fontSize="8" fontWeight="500" fontFamily="inherit">{sa.label}</text>
                            </g>
                          );
                        })}
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
                            zIndex: 9, cursor: 'crosshair', pointerEvents: 'all', color: 'rgba(255,255,255,0.9)' }}
                          onMouseDown={e => startPickerDrag(e, idx)}>
                          <div style={{ position: 'absolute', bottom: 'calc(100% + 4px)', left: '50%', transform: 'translateX(-50%)',
                            width: 18, height: 18, borderRadius: '50%', background: picker.hex,
                            border: '2px solid rgba(255,255,255,0.95)', boxShadow: '0 2px 6px rgba(0,0,0,0.7)',
                            pointerEvents: 'none' }}/>
                          <Ic.crosshair/>
                        </div>
                      );
                    })}

                    <div className="pv-badge-r">{detR || toRatio(width, height)}</div>
                  </div>
                </div>
              </div>

              {/* bottom bar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
                {natRatio && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--t2)', fontVariantNumeric: 'tabular-nums' }}>
                    <span style={{ fontWeight: 500, color: 'var(--t1)' }}>{natRatio}</span>
                    <span>{imgNat.w}×{imgNat.h}</span>
                    <button
                      onClick={() => {
                        setWidth(imgNat.w); setHeight(imgNat.h); setTpl(null); resetZoom();
                        const r = imgNat.w / imgNat.h;
                        let best: Ratio | null = null, bestD = 9999;
                        for (const ar of RATIOS) { const d = Math.abs(r - ar.w / ar.h); if (d < bestD) { bestD = d; best = ar; } }
                        if (best) setRatio(best);
                      }}
                      style={{ fontSize: 9, fontWeight: 500, color: 'var(--t2)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--rs)', padding: '2px 7px', cursor: 'pointer' }}
                      title="Reset Position"
                    >↩</button>
                  </div>
                )}
                {showImg && imgSrc && (
                  <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 2,
                                 fontSize: 10, fontWeight: 500, lineHeight: 1,
                                 border: '1px solid var(--border)', borderRadius: 'var(--rs)',
                                 padding: '4px 8px', background: 'transparent', cursor: 'ew-resize',
                                 transition: 'border-color 0.12s, color 0.12s' }}
                         onMouseDown={e => {
                           if (e.altKey) { e.preventDefault(); resetZoom(); return; }
                           dragZoom.onMouseDown(e);
                         }}>
                      <input className="no-spin" type="number" value={imgZoom} min={10} max={1000}
                        onChange={e => { setImgZoom(parseInt(e.target.value) || 100); setImgOff({ x: 0, y: 0 }); }}
                        style={{ width: 28, border: 'none', background: 'transparent', fontSize: 10, fontWeight: 500,
                                 color: 'var(--t1)', textAlign: 'right', outline: 'none', padding: 0, cursor: 'ew-resize' }}
                      />
                      <span style={{ color: 'var(--t2)' }}>%</span>
                    </div>
                    {imgZoom !== 100 && (
                      <button className="zoom-action-btn" title="Reset Zoom" onClick={resetZoom}>×</button>
                    )}
                    <button className="zoom-action-btn" title="Snap⇕"
                      style={{ borderColor: snapMode === 'h' ? 'var(--t1)' : 'var(--border)', color: snapMode === 'h' ? 'var(--t1)' : 'var(--t3)' }}
                      onClick={() => { setSnapMode('h'); resetZoom(); }}>
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                        <line x1="1" y1="2" x2="11" y2="2"/><line x1="1" y1="10" x2="11" y2="10"/>
                      </svg>
                    </button>
                    <button className="zoom-action-btn" title="Snap⇔"
                      style={{ borderColor: snapMode === 'v' ? 'var(--t1)' : 'var(--border)', color: snapMode === 'v' ? 'var(--t1)' : 'var(--t3)' }}
                      onClick={() => { setSnapMode('v'); resetZoom(); }}>
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                        <line x1="2" y1="1" x2="2" y2="11"/><line x1="10" y1="1" x2="10" y2="11"/>
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Pixel input ── */}
          <div className="card">
            <div className="card-inner" style={{ padding: '12px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div className="input-row" style={{ flex: 1 }}>
                  <div className="input-grp drag-input-wrap">
                    <div className="input-icon"><Ic.width/></div>
                    <input type="number" value={width || ''} placeholder="1920"
                      onChange={e => handleW(e.target.value)}
                      {...dragW}
                    />
                  </div>
                  <button className={`lock-btn${linked ? ' locked' : ''}`}
                    title={linked ? 'Aspect ratio locked' : 'Aspect ratio free'}
                    onClick={() => setLinked(l => !l)}>
                    {linked ? <Ic.lock/> : <Ic.unlock/>}
                  </button>
                  <div className="input-grp drag-input-wrap">
                    <div className="input-icon"><Ic.height/></div>
                    <input type="number" value={height || ''} placeholder="1080"
                      onChange={e => handleH(e.target.value)}
                      {...dragH}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Presets ── */}
          <details className="card">
            <summary style={{ padding: '10px 14px', fontSize: 10, fontWeight: 500, color: 'var(--t3)', letterSpacing: '0.05em', cursor: 'pointer', listStyle: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ flex: 1 }}>PRESETS</span>
            </summary>
            <div style={{ borderTop: '1px solid var(--border)', padding: '8px 10px 4px' }}>
              <div style={{ display: 'flex', gap: 4, marginBottom: 6, flexWrap: 'wrap' }}>
                {cats.map(c => {
                  const Icon = CAT_ICONS[c];
                  return (
                    <button key={c} className={`cat-tab${cat === c ? ' active' : ''}`}
                      onClick={() => setCat(c)}>
                      <Icon/>
                    </button>
                  );
                })}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 2 }}>
                {filtTpls.map(t2 => {
                  const CatIcon = CAT_ICONS[t2.cat];
                  return (
                    <div key={t2.name} className={`tpl-item${tpl === t2.name ? ' active' : ''}`} onClick={() => applyTpl(t2)}>
                      <div className="tpl-left">
                        <CatIcon/>
                        <span className="tpl-name">{t2.name}</span>
                      </div>
                      <span className="tpl-size">{t2.w}×{t2.h}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </details>

        </div>
      </div>
    </div>
  );
}
