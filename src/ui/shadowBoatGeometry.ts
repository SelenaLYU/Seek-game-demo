export type Point = { x: number; y: number };
export type PieceId = 'hull' | 'sail' | 'mast';
export type PieceState = { id: PieceId; x: number; y: number; rotation: 0 | 1 };
export const PIECE_IDS: PieceId[] = ['hull', 'sail', 'mast'];

// Orthographic camera: screen (x, y) = (X, 500 - Y - .45 Z).
// Props stand on Z=200. The receiving wall is Z=360 + .2 (X-650).
// This keeps light, occluder and projected vertex collinear on screen too.
const OBJECT_DEPTH = 200;
export const WALL_X_OFFSET = -105;
export const LIGHT_Y = 500;
export const SOLUTION_LIGHT_X = 320;
// Shared stylized wall scale: connected props must stay connected in shadow.
const SHADOW_SCALE = .67;
export const SOLUTION: Record<PieceId, PieceState> = {
  hull: { id: 'hull', x: 527, y: 369.6, rotation: 0 },
  sail: { id: 'sail', x: 550.2, y: 325.6, rotation: 0 },
  mast: { id: 'mast', x: 548.6, y: 322.4, rotation: 0 },
};
const ART_CONTOURS: Record<PieceId, [number, number][]> = {
  // Traced in normalized PNG coordinates, including the triangle's open centre.
  // The doubled bridge into the hole has zero area and preserves its winding.
  hull: [[.08,.2],[.16,.24],[.48,.28],[.75,.25],[.97,.2],[.965,.45],[.94,.64],[.9,.75],[.79,.8],[.6,.84],[.35,.83],[.18,.76],[.12,.67],[.09,.49],[.065,.7],[.035,.67],[.045,.48],[.075,.34]],
  sail: [[.055,.035],[.98,.95],[.055,.95],[.055,.61],[.32,.61],[.32,.75],[.53,.75],[.33,.55],[.32,.61],[.055,.61]],
  mast: [[.06,.015],[.83,.015],[.86,.08],[.98,.12],[.96,.17],[.89,.16],[.9,.82],[1,.91],[.97,.97],[.67,.98],[.23,.87],[.08,.82]],
};
const PIECE_SIZE: Record<PieceId, [number, number]> = { hull: [74,18], sail: [37,52], mast: [4,63] };
const SHAPES = {} as Record<PieceId, Point[]>;
for (const id of PIECE_IDS) {
  SHAPES[id] = ART_CONTOURS[id].map(([x,y]) => ({ x: x * PIECE_SIZE[id][0], y: y * PIECE_SIZE[id][1] }));
}

// The flashlight aims at the prop stand. Its finite elliptical aperture on
// the prop plane defines both the visible light volume and shadow clipping.
export const APERTURE: Point[] = Array.from({ length: 48 }, (_, i) => {
  const angle = i * Math.PI * 2 / 48;
  return { x: 555 + 98 * Math.cos(angle), y: 352 + 87 * Math.sin(angle) };
});

export function piecePolygon(state: PieceState): Point[] {
  const shape = SHAPES[state.id];
  const cx = PIECE_SIZE[state.id][0] / 2;
  const cy = PIECE_SIZE[state.id][1] / 2;
  return shape.map(p => state.rotation === 0
    ? { x: state.x + p.x, y: state.y + p.y }
    : { x: state.x + cx - (p.y - cy), y: state.y + cy + (p.x - cx) });
}

export function projectToWall(point: Point, lightX: number): Point {
  // Ray L + t(P-L), intersected with the oblique receiving wall.
  const t = (230 + .2 * lightX) / (OBJECT_DEPTH - .2 * (point.x - lightX));
  const worldHeight = LIGHT_Y - .45 * OBJECT_DEPTH - point.y;
  return { x: lightX + t * (point.x - lightX) + WALL_X_OFFSET, y: LIGHT_Y - t * worldHeight - .45 * t * OBJECT_DEPTH };
}

const cross = (a: Point, b: Point, p: Point) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);

export function clipPolygon(polygon: Point[], boundary: Point[]): Point[] {
  let result = polygon;
  for (let i = 0; i < boundary.length && result.length; i++) {
    const a = boundary[i], b = boundary[(i + 1) % boundary.length];
    const input = result;
    result = [];
    for (let j = 0; j < input.length; j++) {
      const p = input[j], q = input[(j + 1) % input.length];
      const dp = cross(a, b, p), dq = cross(a, b, q);
      if (dp >= 0) result.push(p);
      if ((dp >= 0) !== (dq >= 0)) {
        const t = dp / (dp - dq);
        result.push({ x: p.x + t * (q.x - p.x), y: p.y + t * (q.y - p.y) });
      }
    }
  }
  return result;
}

// One receiving surface, extending beyond the picture; shadows never float
// in front of the floor. The drawing and the shadows share this wall plane.
export const WALL: Point[] = [{ x: 20, y: 58 }, { x: 940, y: 58 }, { x: 940, y: 311.9 }, { x: 20, y: 394.7 }];
export const illuminatedPolygon = (state: PieceState) => clipPolygon(piecePolygon(state), APERTURE);
export const shadowPolygon = (state: PieceState, lightX: number) =>
  (() => {
    const projected = clipPolygon(illuminatedPolygon(state).map(p => projectToWall(p, lightX)), WALL);
    if (projected.length < 3) return projected;
    const center = projectToWall({ x: 550, y: 360 }, lightX);
    return projected.map(point => ({
      x: center.x + (point.x - center.x) * SHADOW_SCALE,
      y: center.y + (point.y - center.y) * SHADOW_SCALE,
    }));
  })();
export const TARGET = PIECE_IDS.map(id => shadowPolygon(SOLUTION[id], SOLUTION_LIGHT_X));

export function polygonPath(points: Point[]): string {
  return points.length < 3 ? '' : `M ${points.map(p => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' L ')} Z`;
}

export function contains(point: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

const samples: { point: Point; target: boolean; pieces: boolean[] }[] = [];
for (let y = 58; y < 396; y += 2) {
  for (let x = 20; x < 940; x += 2) {
    const point = { x: x + 1, y: y + 1 };
    const target = TARGET.some(polygon => contains(point, polygon));
    // The narrow ruler can fall between grid samples. Give its presence check
    // the same edge tolerance as the candidate, without inflating its shadow.
    const pieces = TARGET.map((polygon, i) => i === 2 ? nearPolygon(point, polygon) : contains(point, polygon));
    samples.push({ point, target, pieces });
  }
}

function nearPolygon(point: Point, polygon: Point[]): boolean {
  if (contains(point, polygon)) return true;
  // A thin mast needs a few pixels of edge tolerance after reducing the boat.
  // Keep the union overlap strict, and require each actual part to be present.
  return polygon.some((a, i) => {
    const b = polygon[(i + 1) % polygon.length];
    const dx = b.x - a.x, dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared ? Math.max(0, Math.min(1,
      ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared)) : 0;
    return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy) <= 5;
  });
}

export function alignment(polygons: Point[][]): { overlap: number; ready: boolean } {
  let intersection = 0, union = 0;
  const coverage = [0, 0, 0], totals = [0, 0, 0];
  for (const sample of samples) {
    const shadow = polygons.some(p => contains(sample.point, p));
    if (shadow && sample.target) intersection++;
    if (shadow || sample.target) union++;
    sample.pieces.forEach((hit, i) => {
      if (hit) { totals[i]++; if (nearPolygon(sample.point, polygons[i] ?? [])) coverage[i]++; }
    });
  }
  const overlap = union ? intersection / union : 0;
  return { overlap, ready: overlap >= .78 && coverage.every((n, i) => n / totals[i] >= .78) };
}
