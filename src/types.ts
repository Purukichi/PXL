export type Ratio = { label: string; w: number; h: number };
export type Template = { name: string; w: number; h: number; cat: string };
export type SafeArea = { label: string; pct: number; color: string; dash: string };

export type SnapMode = 'h' | 'v';
export type Vec2 = { x: number; y: number };
export type ImgNat = { w: number; h: number };
export type CropNorm = { x: number; y: number; w: number; h: number };

export type PaletteMode = 'DARK' | 'BRIGHT' | 'VIVID' | 'WARM' | 'COLD' | 'TRITONE';
export type Picker = { hex: string; x: number; y: number };

export type Histogram = {
  r: number[];
  g: number[];
  b: number[];
  lum: number[];
};
