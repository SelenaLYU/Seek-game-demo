import {
  PIECE_IDS,
  SOLUTION,
  SOLUTION_LIGHT_X,
  type PieceId,
  type PieceState,
} from './ShadowBoatModel';
import { readProgress, writeProgress } from './ProgressPersistence';

export interface ChapterOneRoomProgress {
  forestKeyCollected: boolean;
  forestDoorEntered: boolean;
  radioMessageHeard: boolean;
  photoBaseArranged: boolean;
  photoMissingPieceCollected: boolean;
  photoPlacements: number[];
  photoSolved: boolean;
  batteryCollected: boolean;
  flashlightPowered: boolean;
  paintBrushCollected: boolean;
  shadowBoatAligned: boolean;
  shadowBoatPieces?: Record<PieceId, PieceState>;
  shadowBoatLightX?: number;
  shadowBoatSolved: boolean;
  windStrokeCount: number;
  clockSolved: boolean;
  chapterOneCompleted: boolean;
  fragments: Array<'photo' | 'radio' | 'shadowBoat'>;
}

const STORAGE_KEY = 'seek-chapter-one-room-v1';
const FRAGMENT_IDS = ['photo', 'radio', 'shadowBoat'] as const;
const DEFAULT_PROGRESS: ChapterOneRoomProgress = {
  forestKeyCollected: false,
  forestDoorEntered: false,
  radioMessageHeard: false,
  photoBaseArranged: false,
  photoMissingPieceCollected: false,
  photoPlacements: [],
  photoSolved: false,
  batteryCollected: false,
  flashlightPowered: false,
  paintBrushCollected: false,
  shadowBoatAligned: false,
  shadowBoatSolved: false,
  windStrokeCount: 0,
  clockSolved: false,
  chapterOneCompleted: false,
  fragments: [],
};

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function normalizePiece(id: PieceId, value: unknown): PieceState | undefined {
  const candidate = record(value);
  if (candidate.id !== id || (candidate.rotation !== 0 && candidate.rotation !== 1)) return undefined;
  if (typeof candidate.x !== 'number' || !Number.isFinite(candidate.x)) return undefined;
  if (typeof candidate.y !== 'number' || !Number.isFinite(candidate.y)) return undefined;
  const maxY = id === 'hull' ? 390 : id === 'sail' ? 355 : 345;
  if (candidate.x < 360 || candidate.x > 720 || candidate.y < 275 || candidate.y > maxY) return undefined;
  return {
    id,
    x: candidate.x,
    y: candidate.y,
    rotation: candidate.rotation,
  };
}

/** Validate stored data and repair facts that can be derived from completed objectives. */
export function normalizeChapterOneRoomProgress(value: unknown): ChapterOneRoomProgress {
  const input = record(value);
  const validFragments = Array.isArray(input.fragments)
    ? input.fragments.filter((item): item is typeof FRAGMENT_IDS[number] =>
      FRAGMENT_IDS.includes(item as typeof FRAGMENT_IDS[number]))
    : [];
  const fragmentSet = new Set(validFragments);
  const placements = Array.isArray(input.photoPlacements)
    ? [...new Set(input.photoPlacements.filter((item): item is number =>
      typeof item === 'number' && Number.isInteger(item) && item >= 0 && item < 16))]
    : [];
  const photoSolved = input.photoSolved === true || fragmentSet.has('photo')
    || (input.photoMissingPieceCollected === true && placements.length === 16);
  const radioMessageHeard = input.radioMessageHeard === true || fragmentSet.has('radio');
  const flashlightPowered = input.flashlightPowered === true;
  const pieces = record(input.shadowBoatPieces);
  const normalizedPieces = Object.fromEntries(
    PIECE_IDS.map(id => [id, normalizePiece(id, pieces[id])]),
  ) as Partial<Record<PieceId, PieceState>>;
  const hasAllPieces = PIECE_IDS.every(id => normalizedPieces[id] !== undefined);
  const rawLightX = input.shadowBoatLightX;
  const validLightX = typeof rawLightX === 'number' && Number.isFinite(rawLightX)
    && rawLightX >= 220 && rawLightX <= 760;
  const savedWindStrokeCount = Math.floor(boundedNumber(input.windStrokeCount, 0, 0, 3));
  const savedAlignmentIsValid = input.shadowBoatAligned === true && hasAllPieces && validLightX;
  const shadowBoatSolved = input.shadowBoatSolved === true || fragmentSet.has('shadowBoat')
    || (savedAlignmentIsValid && savedWindStrokeCount === 3);
  const shadowBoatPieces = hasAllPieces
    ? normalizedPieces as Record<PieceId, PieceState>
    : shadowBoatSolved
      ? Object.fromEntries(PIECE_IDS.map(id => [id, { ...SOLUTION[id] }])) as Record<PieceId, PieceState>
      : undefined;

  return {
    forestKeyCollected: input.forestKeyCollected === true,
    forestDoorEntered: input.forestDoorEntered === true,
    radioMessageHeard,
    photoBaseArranged: input.photoBaseArranged === true || photoSolved,
    photoMissingPieceCollected: input.photoMissingPieceCollected === true || photoSolved,
    photoPlacements: photoSolved ? Array.from({ length: 16 }, (_, index) => index) : placements,
    photoSolved,
    batteryCollected: input.batteryCollected === true || flashlightPowered,
    flashlightPowered,
    paintBrushCollected: input.paintBrushCollected === true,
    shadowBoatAligned: shadowBoatSolved || (input.shadowBoatAligned === true && hasAllPieces && validLightX),
    shadowBoatPieces,
    shadowBoatLightX: validLightX ? rawLightX as number : shadowBoatSolved ? SOLUTION_LIGHT_X : undefined,
    shadowBoatSolved,
    windStrokeCount: shadowBoatSolved
      ? 3
      : savedWindStrokeCount,
    clockSolved: input.clockSolved === true,
    chapterOneCompleted: input.chapterOneCompleted === true,
    fragments: [
      ...(photoSolved ? ['photo' as const] : []),
      ...(radioMessageHeard ? ['radio' as const] : []),
      ...(shadowBoatSolved ? ['shadowBoat' as const] : []),
    ],
  };
}

function defaultProgress(): ChapterOneRoomProgress {
  return { ...DEFAULT_PROGRESS, photoPlacements: [], fragments: [] };
}

export function loadChapterOneRoomProgress(): ChapterOneRoomProgress {
  return readProgress(STORAGE_KEY, defaultProgress, normalizeChapterOneRoomProgress);
}

/** Store a sanitized snapshot; false means it is available for this session only. */
export function saveChapterOneRoomProgress(progress: ChapterOneRoomProgress): boolean {
  return writeProgress(STORAGE_KEY, normalizeChapterOneRoomProgress(progress));
}
