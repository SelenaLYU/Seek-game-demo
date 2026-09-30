const STORAGE_KEY = 'seek-memory-island-v1';
let completed: number[] = [];
try {
  const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
  if (Array.isArray(saved)) completed = [...new Set(saved.filter((id): id is number => Number.isInteger(id) && id >= 1 && id <= 6))];
} catch { /* Storage can be unavailable in private browsing. */ }

export function completedChapters(): number[] { return [...completed]; }
export function completeChapter(id: number): boolean {
  if (!Number.isInteger(id) || id < 1 || id > 6 || completed.includes(id)) return false;
  completed.push(id);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(completed)); } catch { /* Keep progress for this session. */ }
  return true;
}
export function chapterState(id: number): 'completed' | 'available' | 'locked' {
  if (completed.includes(id)) return 'completed';
  return id === 1 || completed.includes(id - 1) ? 'available' : 'locked';
}
