import Phaser from 'phaser';
import { applyHDCamera, BASE_HEIGHT, BASE_WIDTH } from '../systems/Resolution';
import {
  loadChapterOneRoomProgress,
  hasSavedProgress,
  clearSavedProgress,
  type ChapterOneRoomProgress,
} from '../gameplay/ChapterOneRoomProgress';
import menuBackgroundUrl from '../../assets/ui/menu-main-v1.png?url';
import { isBackgroundMusicEnabled, setBackgroundMusicEnabled } from '../MenuRoomMusic';

/** 统一水彩风格游戏主菜单：包含新游戏、继续游戏(读档)、关卡选择、重置存档 */
export default class MenuScene extends Phaser.Scene {
  private savedProgress!: ChapterOneRoomProgress;
  private hasSave = false;
  private guide?: HTMLDivElement;

  constructor() {
    super('menu');
  }

  preload(): void {
    if (!this.textures.exists('menu-main-v1')) this.load.image('menu-main-v1', menuBackgroundUrl);
  }

  create(): void {
    applyHDCamera(this);
    // 首页音乐键已经画在封面里，清掉旧的独立 DOM 按钮。
    document.getElementById('seek-music-toggle')?.remove();
    this.cameras.main.setBackgroundColor('#171712');
    this.add.image(BASE_WIDTH / 2, BASE_HEIGHT / 2, 'menu-main-v1')
      .setDisplaySize(BASE_WIDTH, BASE_HEIGHT);

    // 读取持久化存档
    this.savedProgress = loadChapterOneRoomProgress();
    this.hasSave = hasSavedProgress(this.savedProgress);

    // 新主图已经画好了全部按钮，这里只叠加完全透明的点击热区。
    const createMenuHitArea = (y: number, enabled: boolean, onClick: () => void) => {
      const hit = this.add.zone(BASE_WIDTH / 2, y, 205, 40).setDepth(20);
      if (enabled) {
        hit.setInteractive({ useHandCursor: true });
        hit.on('pointerup', onClick);
      }
    };

    createMenuHitArea(292, true, () => {
      clearSavedProgress();
      this.scene.start('intro');
    });

    createMenuHitArea(341, this.hasSave, () => {
        // 按存档记录的当前阶段启动场景
        const stage = this.savedProgress.currentStage;
        if (stage === 'room') this.scene.start('room');
        else if (stage === 'island') this.scene.start('island');
        else this.scene.start('forest');
    });

    createMenuHitArea(390, true, () => {
      this.openStageSelectModal();
    });

    createMenuHitArea(440, true, () => this.openHowToPlay());

    // 右上角音乐按钮同样直接使用封面上的图案，不再叠加旧按钮外观。
    const musicNotice = this.add.text(902, 66, '', {
      fontFamily: '"Microsoft YaHei", sans-serif',
      fontSize: '12px',
      color: '#fff0cf',
      backgroundColor: '#302b24dd',
      padding: { x: 8, y: 4 },
    }).setOrigin(0.5).setDepth(30).setAlpha(0);
    let noticeTween: Phaser.Tweens.Tween | undefined;
    this.add.zone(902, 34, 126, 52)
      .setDepth(20)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        const enabled = !isBackgroundMusicEnabled();
        setBackgroundMusicEnabled(enabled);
        noticeTween?.stop();
        musicNotice.setText(enabled ? '音乐已开启' : '音乐已关闭').setAlpha(1);
        noticeTween = this.tweens.add({ targets: musicNotice, alpha: 0, delay: 700, duration: 300 });
      });

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

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.guide?.remove();
      this.guide = undefined;
    });
  }

  private openHowToPlay(): void {
    if (this.guide) return;
    const styleId = 'seek-menu-guide-style';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        .seek-menu-guide { position:fixed; inset:0; z-index:2100; display:grid; place-items:center;
          font-family:Arial,"Microsoft YaHei",sans-serif; color:#f6e9cc; }
        .seek-menu-guide__blur { position:absolute; inset:0; background:rgba(19,18,14,.28);
          backdrop-filter:blur(9px); -webkit-backdrop-filter:blur(9px); }
        .seek-menu-guide__panel { position:relative; width:min(520px,calc(100vw - 44px)); padding:38px 46px 34px;
          border:1px solid rgba(242,221,181,.68); border-radius:12px;
          background:linear-gradient(145deg,rgba(45,42,35,.94),rgba(24,27,25,.94));
          box-shadow:0 22px 70px rgba(0,0,0,.48),inset 0 1px rgba(255,255,255,.08); }
        .seek-menu-guide h2 { margin:0 0 24px; text-align:center; font:500 25px/1.2 Georgia,"STSong",serif;
          letter-spacing:.18em; color:#fff0cf; }
        .seek-menu-guide ul { margin:0; padding:0; list-style:none; display:grid; gap:15px; }
        .seek-menu-guide li { padding:11px 14px; border-bottom:1px solid rgba(238,218,179,.16);
          color:rgba(249,237,211,.9); font-size:15px; line-height:1.65; }
        .seek-menu-guide strong { display:inline-block; min-width:78px; color:#e9c98f; font-weight:600; }
        .seek-menu-guide__close { display:block; margin:27px auto 0; min-width:150px; padding:10px 22px;
          border:1px solid rgba(244,222,181,.62); border-radius:7px; color:#f8eaca;
          background:rgba(86,96,88,.42); font:16px/1.2 Georgia,"STSong",serif; letter-spacing:.15em; cursor:pointer; }
        .seek-menu-guide__close:hover { background:rgba(104,125,116,.6); }
      `;
      document.head.append(style);
    }

    const root = document.createElement('div');
    root.className = 'seek-menu-guide';
    root.innerHTML = `
      <div class="seek-menu-guide__blur" data-close></div>
      <section class="seek-menu-guide__panel" aria-label="玩法说明">
        <h2>玩法说明</h2>
        <ul>
          <li><strong>移动探索</strong>使用 A / D 或方向键移动，空格键跳跃。</li>
          <li><strong>寻找线索</strong>点击场景里的物品，观察文字与画面提示。</li>
          <li><strong>完成谜题</strong>拖拽、旋转或描画物件，让记忆重新完整。</li>
          <li><strong>收集回忆</strong>找回记忆碎片，解锁新的房间和故事。</li>
        </ul>
        <button class="seek-menu-guide__close" type="button" data-close>返回</button>
      </section>`;
    const close = () => { root.remove(); if (this.guide === root) this.guide = undefined; };
    root.querySelectorAll<HTMLElement>('[data-close]').forEach(element => element.addEventListener('click', close));
    document.body.append(root);
    this.guide = root;
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

