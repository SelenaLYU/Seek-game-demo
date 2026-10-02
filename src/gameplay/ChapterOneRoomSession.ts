import {
  loadChapterOneRoomProgress,
  saveChapterOneRoomProgress,
  type ChapterOneRoomProgress,
} from './ChapterOneRoomProgress';
import { reduceChapterOneRoomProgress, type ChapterOneRoomEvent } from './ChapterOneRoomRules';

/** Owns the chapter's in-session simulation state independently from Phaser scenes. */
export class ChapterOneRoomSession {
  private constructor(private current: ChapterOneRoomProgress) {}

  static restore(): ChapterOneRoomSession {
    return new ChapterOneRoomSession(loadChapterOneRoomProgress());
  }

  get state(): ChapterOneRoomProgress {
    return this.current;
  }

  dispatch(event: ChapterOneRoomEvent): void {
    this.current = reduceChapterOneRoomProgress(this.current, event);
  }

  save(): boolean {
    return saveChapterOneRoomProgress(this.current);
  }
}

export function completeChapterOne(): { completed: boolean; persistent: boolean } {
  const session = ChapterOneRoomSession.restore();
  if (session.state.chapterOneCompleted) return { completed: false, persistent: true };
  session.dispatch({ type: 'chapter-one-completed' });
  if (!session.state.chapterOneCompleted) return { completed: false, persistent: true };
  return { completed: true, persistent: session.save() };
}

export function isChapterOneCompleted(): boolean {
  return ChapterOneRoomSession.restore().state.chapterOneCompleted;
}
