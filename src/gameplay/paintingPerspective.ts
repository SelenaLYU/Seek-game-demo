export type Point = { x: number; y: number };
export const PAINTING_WIDTH = 1100;
export const PAINTING_HEIGHT = 688;
export const PAINTING_REST = { x: 550, y: 340 };
export const PAINTING_START = { x: 785, y: 440 };
export const PAINTING_MARK = { x: 505, y: 322 };

/** One continuous displacement field for every painted surface, including its silhouette.
 * Zero displacement around the perimeter prevents exposed edges. No separate clue sprites.
 */
export function warpLandscape(p: Point, handle: Point): Point {
  const u = p.x / PAINTING_WIDTH, v = p.y / PAINTING_HEIGHT;
  const edge = Math.sin(Math.PI * u) ** 2 * Math.sin(Math.PI * v) ** 2;
  const dx = handle.x - PAINTING_REST.x, dy = handle.y - PAINTING_REST.y;
  return {
    x: p.x + edge * (dx * (0.26 + 0.34 * Math.sin(v * Math.PI * 2)) + dy * 0.18 * Math.cos(u * Math.PI)),
    y: p.y + edge * (dy * (0.3 + 0.32 * Math.cos(u * Math.PI * 2)) + dx * 0.15 * Math.sin(v * Math.PI * 2)),
  };
}
