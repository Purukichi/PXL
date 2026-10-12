import type { Ratio } from './types';

type Props = {
  ar: Ratio;
  active: boolean;
  onClick: () => void;
};

export function RatioChip({ ar, active, onClick }: Props) {
  const cW = 28, cH = 20, m = 2;
  const maxW = cW - m * 2, maxH = cH - m * 2;
  const arR = ar.w / ar.h;
  let rw = maxW, rh = rw / arR;
  if (rh > maxH) { rh = maxH; rw = rh * arR; }
  rw = Math.max(rw, 2); rh = Math.max(rh, 2);
  return (
    <button className={`ratio-chip${active ? ' active' : ''}`} onClick={onClick} aria-pressed={active}>
      <svg width={cW} height={cH} viewBox={`0 0 ${cW} ${cH}`} style={{ display: 'block' }}>
        <rect
          x={(cW - rw) / 2} y={(cH - rh) / 2} width={rw} height={rh}
          fill="currentColor" fillOpacity={active ? 0.18 : 0.08}
          stroke="currentColor" strokeWidth="1.3" rx="1.5"
        />
      </svg>
      <span className="rl">{ar.label}</span>
    </button>
  );
}
