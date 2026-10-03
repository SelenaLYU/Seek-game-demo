import type { ChapterOneRoomProgress } from './ChapterOneRoomProgress';
import type { PieceId, PieceState } from './ShadowBoatModel';

export const REQUIRED_ROOM_FRAGMENTS = ['photo', 'radio', 'shadowBoat'] as const;

export type ChapterOneRoomEvent =
  | { type: 'forest-key-collected' }
  | { type: 'forest-door-entered' }
  | { type: 'photo-placement-added'; tile: number }
  | { type: 'photo-base-arranged' }
  | { type: 'photo-piece-collected' }
  | { type: 'photo-solved' }
  | { type: 'radio-message-heard' }
  | { type: 'battery-collected' }
  | { type: 'flashlight-powered' }
  | { type: 'paint-brush-collected' }
  | { type: 'shadow-boat-aligned'; pieces: Record<PieceId, PieceState>; lightX: number }
  | { type: 'shadow-boat-state-changed'; pieces: Record<PieceId, PieceState>; lightX: number }
  | { type: 'wind-stroke-completed'; index: 1 | 2 | 3 }
  | { type: 'shadow-boat-solved' }
  | { type: 'clock-solved' }
  | { type: 'chapter-one-completed' }
  | { type: 'score-added'; delta: number }
  | { type: 'lives-changed'; lives: number }
  | { type: 'stage-changed'; stage: 'forest' | 'room' | 'island' }
  | { type: 'fragment-collected'; fragment: typeof REQUIRED_ROOM_FRAGMENTS[number] };

function addFragment(
  progress: ChapterOneRoomProgress,
  fragment: typeof REQUIRED_ROOM_FRAGMENTS[number],
): ChapterOneRoomProgress['fragments'] {
  return progress.fragments.includes(fragment) ? progress.fragments : [...progress.fragments, fragment];
}

/** Pure domain transition: scenes report player actions; this module enforces prerequisites. */
export function reduceChapterOneRoomProgress(
  progress: ChapterOneRoomProgress,
  event: ChapterOneRoomEvent,
): ChapterOneRoomProgress {
  switch (event.type) {
    case 'forest-key-collected':
      return { ...progress, forestKeyCollected: true, score: progress.score + 500 };
    case 'forest-door-entered':
      return canEnterChapterOneRoom(progress)
        ? { ...progress, forestDoorEntered: true, currentStage: 'room', score: progress.score + 1000 }
        : progress;
    case 'photo-placement-added': {
      if (!Number.isInteger(event.tile) || event.tile < 0 || event.tile > 15) return progress;
      if (event.tile === 15 && !progress.photoMissingPieceCollected) return progress;
      const photoPlacements = [...new Set([...progress.photoPlacements, event.tile])];
      return {
        ...progress,
        photoPlacements,
        photoBaseArranged: progress.photoBaseArranged || photoPlacements.length >= 15,
      };
    }
    case 'photo-base-arranged':
      return progress.photoPlacements.length >= 15
        ? { ...progress, photoBaseArranged: true }
        : progress;
    case 'photo-piece-collected':
      return canCollectPhotoMissingPiece(progress)
        ? { ...progress, photoMissingPieceCollected: true }
        : progress;
    case 'photo-solved':
      return progress.photoMissingPieceCollected && progress.photoPlacements.length === 16
        ? {
          ...progress,
          photoSolved: true,
          photoBaseArranged: true,
          score: progress.score + 600,
          fragments: addFragment(progress, 'photo'),
        }
        : progress;
    case 'radio-message-heard':
      return {
        ...progress,
        radioMessageHeard: true,
        score: progress.score + 300,
        fragments: addFragment(progress, 'radio'),
      };
    case 'battery-collected':
      return canCollectFlashlightBattery(progress) ? { ...progress, batteryCollected: true } : progress;
    case 'flashlight-powered':
      return canPowerFlashlight(progress) ? { ...progress, flashlightPowered: true } : progress;
    case 'paint-brush-collected':
      return { ...progress, paintBrushCollected: true };
    case 'shadow-boat-aligned':
      return canOpenShadowBoatPuzzle(progress)
        ? { ...progress, shadowBoatAligned: true, shadowBoatPieces: event.pieces, shadowBoatLightX: event.lightX }
        : progress;
    case 'shadow-boat-state-changed':
      return canOpenShadowBoatPuzzle(progress)
        ? { ...progress, shadowBoatPieces: event.pieces, shadowBoatLightX: event.lightX }
        : progress;
    case 'wind-stroke-completed':
      return canDrawWind(progress) && event.index === progress.windStrokeCount + 1
        ? { ...progress, windStrokeCount: event.index }
        : progress;
    case 'shadow-boat-solved':
      return progress.shadowBoatAligned && progress.windStrokeCount === 3
        ? {
          ...progress,
          shadowBoatSolved: true,
          score: progress.score + 800,
          fragments: addFragment(progress, 'shadowBoat'),
        }
        : progress;
    case 'clock-solved':
      return { ...progress, clockSolved: true, score: progress.score + 200 };
    case 'chapter-one-completed':
      return hasAllRoomFragments(progress)
        ? { ...progress, chapterOneCompleted: true, currentStage: 'island', score: progress.score + 2000 }
        : progress;
    case 'score-added':
      return { ...progress, score: Math.max(0, progress.score + event.delta) };
    case 'lives-changed':
      return { ...progress, lives: Math.max(0, Math.min(3, event.lives)) };
    case 'stage-changed':
      return { ...progress, currentStage: event.stage };
    case 'fragment-collected':
      return canAwardRoomFragment(progress, event.fragment)
        ? { ...progress, fragments: addFragment(progress, event.fragment) }
        : progress;
  }
}

export function canEnterChapterOneRoom(progress: ChapterOneRoomProgress): boolean {
  return progress.forestKeyCollected;
}

export function canCollectPhotoMissingPiece(progress: ChapterOneRoomProgress): boolean {
  return progress.radioMessageHeard && !progress.photoMissingPieceCollected;
}

export function canCollectFlashlightBattery(progress: ChapterOneRoomProgress): boolean {
  return progress.photoSolved && !progress.batteryCollected;
}

export function canPowerFlashlight(progress: ChapterOneRoomProgress): boolean {
  return progress.batteryCollected && !progress.flashlightPowered;
}

export function canOpenShadowBoatPuzzle(progress: ChapterOneRoomProgress): boolean {
  return progress.flashlightPowered;
}

export function canDrawWind(progress: ChapterOneRoomProgress): boolean {
  return progress.shadowBoatAligned && progress.paintBrushCollected && progress.windStrokeCount < 3;
}

export function canAwardRoomFragment(
  progress: ChapterOneRoomProgress,
  fragment: typeof REQUIRED_ROOM_FRAGMENTS[number],
): boolean {
  if (fragment === 'photo') return progress.photoSolved;
  if (fragment === 'radio') return progress.radioMessageHeard;
  return progress.shadowBoatSolved;
}

export function hasAllRoomFragments(progress: ChapterOneRoomProgress): boolean {
  return REQUIRED_ROOM_FRAGMENTS.every(fragment => progress.fragments.includes(fragment));
}
