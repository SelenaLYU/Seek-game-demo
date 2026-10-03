import Phaser from 'phaser';
import { applyHDCamera, BASE_HEIGHT, BASE_WIDTH } from '../systems/Resolution';
import {
  loadChapterOneRoomProgress,
  hasSavedProgress,
  clearSavedProgress,
  type ChapterOneRoomProgress,
} from '../gameplay/ChapterOneRoomProgress';

/** 统一水彩风格游戏主菜单：包含新游戏、继续游戏(读档)、关卡选择、重置存档 */
export default class MenuScene extends Phaser.Scene {
  private savedProgress!: ChapterOneRoomProgress;
  private hasSave = false;

  constructor() {
    super('menu');
  }

  create(): void {
    applyHDCamera(this);
    this.cameras.main.setBackgroundColor('#0d1815');

    // 背景水彩微光与渐变
    this.add
      .rectangle(BASE_WIDTH / 2, BASE_HEIGHT / 2, BASE_WIDTH, BASE_HEIGHT, 0x12241f)
      .setDepth(-10);

    // 主标题与意境副标题
    this.add
      .text(BASE_WIDTH / 2, 130, 'S E E K', {
        fontFamily: 'serif',
        fontSize: '52px',
        color: '#fff6e2',
        letterSpacing: 10,
      })
      .setOrigin(0.5);

    this.add
      .text(BASE_WIDTH / 2, 185, '江南海边的童年记忆之旅', {
        fontFamily: 'sans-serif',
        fontSize: '15px',
        color: '#a3beaf',
        letterSpacing: 4,
      })
      .setOrigin(0.5);

    // 读取持久化存档
    this.savedProgress = loadChapterOneRoomProgress();
    this.hasSave = hasSavedProgress(this.savedProgress);

    const btnYStart = 245;
    const btnGap = 48;
    let index = 0;

    const createMenuBtn = (
      label: string,
      enabled: boolean,
      bg: string,
      hoverBg: string,
      onClick: () => void,
      hint?: string,
    ) => {
      const y = btnYStart + index * btnGap;
      index++;

      const btn = this.add
        .text(BASE_WIDTH / 2, y, label, {
          fontFamily: 'sans-serif',
          fontSize: '16px',
          color: enabled ? '#fff8e4' : '#697a72',
          backgroundColor: enabled ? bg : '#1a221f',
          padding: { x: 32, y: 10 },
        })
        .setOrigin(0.5);

      if (enabled) {
        btn.setInteractive({ useHandCursor: true });
        btn.on('pointerover', () => btn.setBackgroundColor(hoverBg));
        btn.on('pointerout', () => btn.setBackgroundColor(bg));
        btn.on('pointerup', onClick);
      }

      if (hint) {
        this.add
          .text(BASE_WIDTH / 2 + 160, y, hint, {
            fontFamily: 'sans-serif',
            fontSize: '12px',
            color: '#e0c98f',
          })
          .setOrigin(0, 0.5);
      }

      return btn;
    };

    // 1. 开始新游戏
    createMenuBtn('【 开始新游戏 】', true, '#265444', '#387962', () => {
      clearSavedProgress();
      this.scene.start('intro');
    });

    // 2. 读取存档继续游戏
    const stageNameMap: Record<string, string> = {
      forest: '第一章 · 海边跑酷',
      room: '第一章 · 记忆之房',
      island: '章节枢纽 · 记忆之岛',
    };
    const savedStageName = stageNameMap[this.savedProgress.currentStage] ?? '第一章 · 海边跑酷';
    const continueHint = this.hasSave
      ? `进度: ${savedStageName} (积分: ${this.savedProgress.score.toLocaleString()})`
      : '无旧存档';

    createMenuBtn(
      this.hasSave ? `【 继续游戏 】` : '【 继续游戏 (暂无存档) 】',
      this.hasSave,
      '#364f3d',
      '#4c6e56',
      () => {
        // 按存档记录的当前阶段启动场景
        const stage = this.savedProgress.currentStage;
        if (stage === 'room') this.scene.start('room');
        else if (stage === 'island') this.scene.start('island');
        else this.scene.start('forest');
      },
      this.hasSave ? continueHint : undefined,
    );

    // 3. 关卡选择
    createMenuBtn('【 关卡快速选择 】', true, '#263b36', '#3b5851', () => {
      this.openStageSelectModal();
    });

    // 4. 重置存档
    if (this.hasSave) {
      createMenuBtn('重置并清空存档', true, '#362424', '#523434', () => {
        clearSavedProgress();
        this.cameras.main.flash(200, 240, 200, 180);
        this.time.delayedCall(220, () => this.scene.restart());
      });
    }

    // 底部控制说明
    this.add
      .text(BASE_WIDTH / 2, 495, '全屏与声音支持 · 回车键直接开始 · 操作指南随时按 [H]', {
        fontFamily: 'sans-serif',
        fontSize: '12px',
        color: '#6e8578',
      })
      .setOrigin(0.5);

    this.input.keyboard?.once('keydown-ENTER', () => {
      if (this.hasSave) {
        const stage = this.savedProgress.currentStage;
        if (stage === 'room') this.scene.start('room');
        else if (stage === 'island') this.scene.start('island');
        else this.scene.start('forest');
      } else {
        this.scene.start('intro');
      }
    });
  }

  /** 关卡选择弹窗：直达任意游玩阶段 */
  private openStageSelectModal(): void {
    const modal = this.add.container(0, 0).setDepth(200);

    const mask = this.add
      .rectangle(0, 0, BASE_WIDTH, BASE_HEIGHT, 0x050f0c, 0.85)
      .setOrigin(0)
      .setInteractive();
    modal.add(mask);

    const panel = this.add.container(BASE_WIDTH / 2, BASE_HEIGHT / 2);
    const bg = this.add
      .rectangle(0, 0, 520, 340, 0x142b23, 0.98)
      .setStrokeStyle(2, 0xe4d19e, 0.85);

    const title = this.add
      .text(0, -135, '— 关卡与阶段快速选择 —', {
        fontFamily: 'sans-serif',
        fontSize: '18px',
        color: '#fff3d2',
      })
      .setOrigin(0.5);

    const stages: Array<{ label: string; sceneKey: string; desc: string }> = [
      { label: '序章 · 剧情占位', sceneKey: 'intro', desc: '病床蒙太奇与相册入口待制作' },
      { label: '第一章 · 海边跑酷探索', sceneKey: 'forest', desc: '错落礁石、飞鸥摆荡、限时滚浪、门楣钥匙' },
      { label: '第一章 · 记忆之房解谜', sceneKey: 'room', desc: '照片拼图、收音机调频、光影小船三笔风' },
      { label: '章节枢纽 · 3D 记忆之岛', sceneKey: 'island', desc: '三维程序化岛屿、记忆街区点亮演出' },
    ];

    stages.forEach((st, i) => {
      const y = -75 + i * 46;
      const btn = this.add
        .text(-120, y, `【 ${st.label} 】`, {
          fontFamily: 'sans-serif',
          fontSize: '14px',
          color: '#fff5d5',
          backgroundColor: '#264e3f',
          padding: { x: 14, y: 7 },
        })
        .setOrigin(0, 0.5)
        .setInteractive({ useHandCursor: true });

      btn.on('pointerover', () => btn.setBackgroundColor('#387962'));
      btn.on('pointerout', () => btn.setBackgroundColor('#264e3f'));
      btn.on('pointerdown', () => this.scene.start(st.sceneKey));

      const note = this.add
        .text(100, y, st.desc, {
          fontFamily: 'sans-serif',
          fontSize: '11px',
          color: '#a8c2b3',
        })
        .setOrigin(0, 0.5);

      panel.add([btn, note]);
    });

    const closeBtn = this.add
      .text(0, 130, '关闭返回', {
        fontFamily: 'sans-serif',
        fontSize: '13px',
        color: '#dedede',
        backgroundColor: '#2e3532',
        padding: { x: 18, y: 6 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    closeBtn.on('pointerover', () => closeBtn.setBackgroundColor('#45504c'));
    closeBtn.on('pointerout', () => closeBtn.setBackgroundColor('#2e3532'));
    closeBtn.on('pointerdown', () => modal.destroy());

    panel.add([bg, title, closeBtn]);
    modal.add(panel);
  }
}
