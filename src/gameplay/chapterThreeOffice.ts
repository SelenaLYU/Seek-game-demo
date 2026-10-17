/** Chapter three greybox: authored route and shared movement rules. */
export type OfficeStage = 'badge' | 'crowd' | 'lift' | 'office' | 'chair' | 'glide' | 'roof' | 'rope' | 'phones' | 'door' | 'done';
export const OFFICE_ROUTE = {
  width: 11400, ground: 1050, upper: 530,
  gate: 390, lift: 1990, chair: 4270, folder: 4500,
  landing: 6500, rope: 8770, ropeEnd: 9340, brush: 10720, door: 11100,
} as const;
export const CHAIR_SEAT = { left: OFFICE_ROUTE.chair - 35, right: OFFICE_ROUTE.chair + 35, top: 506 };
export const OFFICE_DESKS = [2630, 3180, 3720].map(left => ({ left, right: left + 140, top: 450, bottom: 530 }));
export const COLLAPSE = { lead: 260, warningSeconds: 2, speed: 310, stopX: 9290 } as const;
export const PAPER_STORM = { firstX: 2690, spacing: 166, distance: 460, speed: 170, waveSeconds: 6, warningSeconds: .8, staggerSeconds: .81 } as const;
/** Independent emitters spread through the office. Each finishes its own flight
 * before fading, regardless of the other emitters' attack timings. */
export function paperStormFrame(seconds: number, index: number) {
  const cycle = (seconds + index * PAPER_STORM.staggerSeconds) % PAPER_STORM.waveSeconds;
  const age = cycle - PAPER_STORM.warningSeconds;
  const startX = PAPER_STORM.firstX + index * PAPER_STORM.spacing;
  const endX = startX - PAPER_STORM.distance;
  const x = startX - Math.max(0, age) * PAPER_STORM.speed;
  return {
    startX, endX,
    x, warning: age >= -PAPER_STORM.warningSeconds && age < 0,
    visible: age >= 0 && x >= endX,
    alpha: Math.max(0, Math.min(1, (x - endX) / 50)),
  };
}
export function collapsePosition(start: number, seconds: number) {
  return Math.min(COLLAPSE.stopX, start + Math.max(0, seconds - COLLAPSE.warningSeconds) * COLLAPSE.speed);
}
/** Solid desk sides and undersides; the existing landing test handles their tops. */
export function resolveDeskMotion(oldX: number, oldFeet: number, x: number, feet: number, height = 54) {
  let ceiling = false;
  for (const desk of OFFICE_DESKS) {
    if (oldFeet > desk.top + 1 && feet > desk.top + 1 && feet - height < desk.bottom) {
      if (oldX + 13 <= desk.left && x + 13 > desk.left) x = desk.left - 13;
      else if (oldX - 13 >= desk.right && x - 13 < desk.right) x = desk.right + 13;
    }
    if (x + 13 > desk.left && x - 13 < desk.right && oldFeet - height >= desk.bottom && feet - height < desk.bottom) {
      feet = desk.bottom + height; ceiling = true;
    }
  }
  return { x, feet, ceiling };
}
export const COMMUTERS = [
  { x: 630, scale: .95 },
  { x: 855, scale: 1.05 }, { x: 887, scale: .90 }, { x: 924, scale: 1 },
  { x: 1170, scale: 1.08 }, { x: 1214, scale: .94 },
  { x: 1460, scale: 1 },
  { x: 1700, scale: .92 }, { x: 1734, scale: 1.04 },
] as const;
export function onChairSeat(x: number, feet: number, grounded: boolean) {
  return grounded && x >= CHAIR_SEAT.left && x <= CHAIR_SEAT.right && Math.abs(feet - CHAIR_SEAT.top) < 2;
}
export const OFFICE_CHECKPOINTS = {
  badge: { x: 180, y: 1050 }, crowd: { x: 480, y: 1050 },
  office: { x: 2110, y: 530 }, chair: { x: 4140, y: 530 },
  roof: { x: 6590, y: 530 }, phones: { x: 9400, y: 1050 },
} as const;
export type OfficeCheckpoint = keyof typeof OFFICE_CHECKPOINTS;
export type Ledge = { left: number; right: number; top: number };
export const OFFICE_LEDGES: readonly Ledge[] = [
  { left: 0, right: 2050, top: 1050 },
  { left: 2050, right: 4650, top: 530 },
  ...OFFICE_DESKS,
  CHAIR_SEAT,
  { left: 4450, right: 4580, top: 305 },
  { left: 6500, right: 7160, top: 530 },
  { left: 7290, right: 7710, top: 490 },
  { left: 7830, right: 8190, top: 530 },
  { left: 8310, right: 8750, top: 490 },
  { left: 9290, right: 11400, top: 1050 },
];
/** Crossing a one-way platform from above (also handles low frame rates). */
export function landingSurface(x: number, previousFeet: number, feet: number, radius = 13): Ledge | undefined {
  if (feet < previousFeet) return;
  return OFFICE_LEDGES.filter(p => x + radius > p.left && x - radius < p.right
    && previousFeet <= p.top + 1 && feet >= p.top).sort((a, b) => a.top - b.top)[0];
}
export function glideStep(x: number, y: number, horizontal: number, vertical: number, dt: number) {
  return {
    x: Math.max(4480, Math.min(6580, x + (90 + horizontal * 230) * dt)),
    y: Math.max(205, Math.min(650, y + vertical * 215 * dt)),
  };
}
export function ropePoint(progress: number) {
  const t = Math.max(0, Math.min(1, progress));
  return { x: OFFICE_ROUTE.rope + (OFFICE_ROUTE.ropeEnd - OFFICE_ROUTE.rope) * t, y: 420 + 510 * t };
}
