import { readProgress, writeProgress } from '../gameplay/ProgressPersistence';
import { completeChapterOne, isChapterOneCompleted } from '../gameplay/ChapterOneRoomSession';

// New-story namespace: do not inherit predecessor plot completion. Old data is left untouched.
const STORAGE_KEY = 'seek-life-memory-island-v1';
const normalizeChapters = (saved: unknown): number[] => Array.isArray(saved)
  ? [...new Set(saved.filter((id): id is number => Number.isInteger(id) && id >= 1 && id <= 6))]
  : [];
let completed = readProgress(STORAGE_KEY, () => [], normalizeChapters);
let chapterOneCompleted = isChapterOneCompleted();
let lastSavePersistent = true;

export function completedChapters(): number[] {
  const result = [...completed];
  if (chapterOneCompleted && !result.includes(1)) result.push(1);
  return result;
}
export function wasLastChapterSavePersistent(): boolean { return lastSavePersistent; }
export function completeChapter(id: number): boolean {
  if (!Number.isInteger(id) || id < 1 || id > 6) return false;
  if (id === 1) {
    if (completed.includes(1) || chapterOneCompleted) return false;
    const result = completeChapterOne();
    lastSavePersistent = result.persistent;
    chapterOneCompleted = result.completed || chapterOneCompleted;
    return result.completed;
  }
  if (completed.includes(id)) return false;
  completed.push(id);
  lastSavePersistent = writeProgress(STORAGE_KEY, completed);
  return true;
}
export function chapterState(id: number): 'completed' | 'available' | 'locked' {
  const done = completedChapters();
  if (done.includes(id)) return 'completed';
  return id === 1 || done.includes(id - 1) ? 'available' : 'locked';
}
