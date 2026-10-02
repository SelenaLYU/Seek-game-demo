export type Point = { x: number; y: number };
export type PieceId = 'hull' | 'sail' | 'mast';
export type PieceState = { id: PieceId; x: number; y: number; rotation: 0 | 1 };

export const PIECE_IDS: PieceId[] = ['hull', 'sail', 'mast'];
export const SOLUTION_LIGHT_X = 320;
export const SOLUTION: Record<PieceId, PieceState> = {
  hull: { id: 'hull', x: 527, y: 369.6, rotation: 0 },
  sail: { id: 'sail', x: 550.2, y: 325.6, rotation: 0 },
  mast: { id: 'mast', x: 548.6, y: 322.4, rotation: 0 },
};
