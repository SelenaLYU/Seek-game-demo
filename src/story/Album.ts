/**
 * 相册（故事文档第十一节「跨章节系统」）：每完成一段记忆，回忆动画结束时增加一张照片。
 * 骨架阶段：章节登记 + 获得状态，照片美术尚未制作。
 *
 * 获得状态直接由「已完成的章节」派生（`src/island/Progress.ts` 是章节完成的唯一真源），
 * 相册自己不再存一份，避免两处进度漂移。调用方把已完成的章节号传进来，便于测试。
 */
export interface AlbumChapter {
  chapter: number;
  /** 章节副标题，取自 GAME_STORY_AND_LEVEL_DESIGN.md 的关卡标题 */
  label: string;
  /** 该关的记忆物，回忆动画定格的那张照片就是它 */
  memory: string;
}

export const ALBUM_CHAPTERS: readonly AlbumChapter[] = [
  { chapter: 1, label: '童年 · 海边与贝壳', memory: '贝壳' },
  { chapter: 2, label: '初中 · 逃课与小卖部', memory: '辣辣王子' },
  { chapter: 3, label: '成年 · 城市与设计工作', memory: '草图' },
  { chapter: 4, label: '相遇 · 面馆与爱情', memory: '一碗面' },
  { chapter: 5, label: '家庭 · 雨天回家', memory: '一袋感冒药' },
  { chapter: 6, label: '老年 · 遗忘与最后的家', memory: '贝壳' },
];

export const ALBUM_SIZE = ALBUM_CHAPTERS.length;

/** 相册列表：六格固定，未完成的显示为尚未找回。 */
export function albumEntries(completed: readonly number[]): Array<AlbumChapter & { unlocked: boolean }> {
  const done = new Set(completed);
  return ALBUM_CHAPTERS.map(entry => ({ ...entry, unlocked: done.has(entry.chapter) }));
}

/** 已收录的照片数，用于「N / 6」。 */
export function albumPhotoCount(completed: readonly number[]): number {
  return albumEntries(completed).filter(entry => entry.unlocked).length;
}
