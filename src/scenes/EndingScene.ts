import Phaser from 'phaser';
import { applyHDCamera, BASE_HEIGHT, BASE_WIDTH } from '../systems/Resolution';
import { CHAPTER_ONE_MEMORY_TEXT } from '../story/ChapterOneStory';

/** New-story text preview. Legacy media stays disconnected until its content is verified. */
export default class EndingScene extends Phaser.Scene {
  constructor() { super('ending'); }

  create(data: { completedChapter?: number } = {}): void {
    applyHDCamera(this);
    this.cameras.main.setBackgroundColor('#101817');
    // 第二关走 ChapterTwoMemoryScene 自行回岛；这里仍接受 1/2，避免任何章节被静默丢掉完成状态。
    const completedChapter = data.completedChapter === 1 || data.completedChapter === 2
      ? data.completedChapter
      : undefined;
    const isChildhoodChapter = completedChapter !== 2;
    this.add.text(BASE_WIDTH / 2, 110, isChildhoodChapter ? '童年 · 海边与贝壳' : '记忆回放占位', {
      fontFamily: 'serif', fontSize: '28px', color: '#efe8d2',
    }).setOrigin(0.5);
    this.add.text(BASE_WIDTH / 2, 175, '回忆动画占位 · 正式动画与配音待核验／制作', {
      fontSize: '14px', color: '#a8b7b1',
    }).setOrigin(0.5);
    this.add.text(BASE_WIDTH / 2, 270, isChildhoodChapter ? CHAPTER_ONE_MEMORY_TEXT : '这一段回忆的正式演出待制作。', {
      fontFamily: 'sans-serif', fontSize: '21px', color: '#efe8d2',
      wordWrap: { width: 650 }, lineSpacing: 12, align: 'center',
    }).setOrigin(0.5);
    this.add.text(BASE_WIDTH / 2, 365, '故事设计：这一刻定格为家庭照片，收入相册。相册系统待接入。', {
      fontSize: '14px', color: '#a8b7b1',
    }).setOrigin(0.5);
    let leaving = false;
    const enterIsland = () => {
      if (leaving) return;
      leaving = true;
      this.scene.start('island', completedChapter ? { completedChapter } : {});
    };
    this.add.text(BASE_WIDTH / 2, BASE_HEIGHT - 85, '继续前往记忆之岛 →', {
      fontSize: '20px', color: '#f7edcf', backgroundColor: '#294d45', padding: { x: 24, y: 13 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true }).on('pointerdown', enterIsland);
  }
}
