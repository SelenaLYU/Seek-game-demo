export const TEACHER = { x: 28, groundY: 260 };
export const LIGHT_ORIGIN = { x: TEACHER.x + 18, y: TEACHER.groundY - 30 };
export const LIGHT_LENGTH = 4200;
export const LIGHT_HALF_ANGLE = .065;
export const DETECTION_MS = 950;
const MIN_ANGLE = -.18;
const MAX_ANGLE = 1.28;
const SWEEP_SPEED = .24; // 单程约 6 秒；解除追踪后从当前位置继续扫。

export type SearchlightState = { angle: number; direction: number; tracking: boolean; exposure: number };
export const initialSearchlight = (): SearchlightState => ({ angle: .1, direction: 1, tracking: false, exposure: 0 });

export function isInBeam(angle: number, x: number, y: number): boolean {
  const dx = x - LIGHT_ORIGIN.x, dy = y - LIGHT_ORIGIN.y;
  const forward = dx * Math.cos(angle) + dy * Math.sin(angle);
  const sideways = Math.abs(-dx * Math.sin(angle) + dy * Math.cos(angle));
  return forward >= 0 && forward <= LIGHT_LENGTH && sideways <= forward * Math.tan(LIGHT_HALF_ANGLE);
}

export function updateLight(state: SearchlightState, input: {
  x: number; y: number; moving: boolean; covered: boolean; enabled: boolean; delta: number;
}): SearchlightState {
  const next = { ...state };
  const hit = isInBeam(state.angle, input.x, input.y);
  next.tracking = input.enabled && !input.covered && input.moving && (state.tracking || hit);
  if (next.tracking) {
    next.angle = Math.atan2(input.y - LIGHT_ORIGIN.y, input.x - LIGHT_ORIGIN.x);
    next.exposure = Math.min(DETECTION_MS, state.exposure + input.delta);
  } else {
    next.angle += next.direction * SWEEP_SPEED * input.delta / 1000;
    if (next.angle >= MAX_ANGLE) { next.angle = MAX_ANGLE; next.direction = -1; }
    if (next.angle <= MIN_ANGLE) { next.angle = MIN_ANGLE; next.direction = 1; }
    const recovery = input.covered ? 1.5 : !input.moving ? 2 : .15;
    next.exposure = input.enabled ? Math.max(0, state.exposure - input.delta * recovery) : 0;
  }
  return next;
}

export function belowStreet(x: number, feetY: number): boolean {
  // 左侧落空区，以及误入道路下方的角色，均在碰到世界底边前返回。
  const roadY = x < 1090 ? 820 : x < 1900 ? 865 : x < 2700 ? 910 : 950;
  return feetY > roadY + 70;
}
