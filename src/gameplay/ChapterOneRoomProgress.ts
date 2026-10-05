import {
  PIECE_IDS,
  SOLUTION,
  SOLUTION_LIGHT_X,
  type PieceId,
  type PieceState,
} from './ShadowBoatModel';
import { readProgress, writeProgress } from './ProgressPersistence';

export interface ChapterOneRoomProgress {
  /**
   * 第一关布局版本号。
   * 阶段 3 改了通关路线（门楣金钥匙 + 滚浪限时平台），旧存档里「钥匙已拿到」是在旧
   * 路线上成立的，直接沿用会让玩家跳过整段门楣摘钥匙/开门流程，所以 normalize 时按
   * 版本号把这项作废（房间解谜进度/分数不受影响）。
   */
  layoutVersion: number;
  forestKeyCollected: boolean;
  forestDoorEntered: boolean;
  radioMessageHeard: boolean;
  photoBaseArranged: boolean;
  photoMissingPieceCollected: boolean;
  photoPlacements: number[];
  photoSolved: boolean;
  batteryCollected: boolean;
  flashlightCollected: boolean;
  flashlightPowered: boolean;
  flashlightPlaced: boolean;
  paintBrushCollected: boolean;
  paintBrushUsed: boolean;
  shadowBoatAligned: boolean;
  shadowBoatPieces?: Record<PieceId, PieceState>;
  shadowBoatLightX?: number;
  shadowBoatSolved: boolean;
  windStrokeCount: number;
  clockSolved: boolean;
  chapterOneCompleted: boolean;
  fragments: Array<'photo' | 'radio' | 'shadowBoat'>;
  score: number;
  lives: number;
  currentStage: 'forest' | 'room' | 'island';
}

// New-story namespace: do not inherit predecessor plot completion. Old data is left untouched.
const STORAGE_KEY = 'seek-life-chapter-one-v1';
const FRAGMENT_IDS = ['photo', 'radio', 'shadowBoat'] as const;
/** 与 src/scenes/ForestScene.ts 的第一关布局版本对齐；改关卡路线时 +1 */
export const CHAPTER_ONE_LAYOUT_VERSION = 2;
const DEFAULT_PROGRESS: ChapterOneRoomProgress = {
  layoutVersion: CHAPTER_ONE_LAYOUT_VERSION,
  forestKeyCollected: false,
  forestDoorEntered: false,
  radioMessageHeard: false,
  photoBaseArranged: false,
  photoMissingPieceCollected: false,
  photoPlacements: [],
  photoSolved: false,
  batteryCollected: false,
  flashlightCollected: false,
  flashlightPowered: false,
  flashlightPlaced: false,
  paintBrushCollected: false,
  paintBrushUsed: false,
  shadowBoatAligned: false,
  shadowBoatSolved: false,
  windStrokeCount: 0,
  clockSolved: false,
  chapterOneCompleted: false,
  fragments: [],
  score: 0,
  lives: 3,
  currentStage: 'forest',
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

  // 旧布局存档（没有 layoutVersion 或版本更早）→ 门楣金钥匙路线没走过，作废这两项
  const layoutVersion = Math.floor(boundedNumber(input.layoutVersion, 0, 0, 999));
  const forestKeyCollected = layoutVersion >= CHAPTER_ONE_LAYOUT_VERSION
    && input.forestKeyCollected === true;

  return {
    layoutVersion: CHAPTER_ONE_LAYOUT_VERSION,
    forestKeyCollected,
    forestDoorEntered: forestKeyCollected && input.forestDoorEntered === true,
    radioMessageHeard,
    photoBaseArranged: input.photoBaseArranged === true || photoSolved,
    photoMissingPieceCollected: input.photoMissingPieceCollected === true || photoSolved,
    photoPlacements: photoSolved ? Array.from({ length: 16 }, (_, index) => index) : placements,
    photoSolved,
    batteryCollected: input.batteryCollected === true || flashlightPowered,
    flashlightCollected: input.flashlightCollected === true || flashlightPowered,
    flashlightPowered,
    flashlightPlaced: input.flashlightPlaced === true || savedAlignmentIsValid || shadowBoatSolved,
    paintBrushCollected: input.paintBrushCollected === true,
    paintBrushUsed: input.paintBrushUsed === true || shadowBoatSolved,
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
    score: boundedNumber(input.score, 0, 0, 999999),
    lives: boundedNumber(input.lives, 3, 1, 3),
    currentStage: (['forest', 'room', 'island'].includes(input.currentStage as string)
      ? input.currentStage
      : 'forest') as 'forest' | 'room' | 'island',
  };
}

function defaultProgress(): ChapterOneRoomProgress {
  return { ...DEFAULT_PROGRESS, photoPlacements: [], fragments: [] };
}

export function loadChapterOneRoomProgress(): ChapterOneRoomProgress {
  return readProgress(STORAGE_KEY, defaultProgress, normalizeChapterOneRoomProgress);
}

/** 检查是否存在有效存档进度（供主菜单「继续游戏」判断） */
export function hasSavedProgress(progress: ChapterOneRoomProgress): boolean {
  return progress.forestKeyCollected
    || progress.forestDoorEntered
    || progress.score > 0
    || progress.fragments.length > 0
    || progress.currentStage !== 'forest';
}

/** 清空当前存档并返回默认进度（供主菜单「重置存档」调用） */
export function clearSavedProgress(): ChapterOneRoomProgress {
  const fresh = defaultProgress();
  writeProgress(STORAGE_KEY, fresh);
  return fresh;
}

/** Store a sanitized snapshot; false means it is available for this session only. */
export function saveChapterOneRoomProgress(progress: ChapterOneRoomProgress): boolean {
  return writeProgress(STORAGE_KEY, normalizeChapterOneRoomProgress(progress));
}
