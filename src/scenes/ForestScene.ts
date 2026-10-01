import Phaser from 'phaser';
import { applyHDCamera } from '../systems/Resolution';
import { Player } from '../gameplay/Player';
import { Terrain } from '../gameplay/Terrain';
import { Sfx } from '../systems/Sfx';

// 角色序列帧：全部状态合并为一张「按状态分区」的精灵图
//   assets/character/meimei-sheet-right-96x112-8x4.png
//   8 列 × 4 行 = 32 格，单帧 96×112，行序 = idle / run / jump / fall
//   帧号：idle 0-7、run 8-15、jump 16-19、fall 24-27（20-23 / 28-31 为预留空位）
// 换美术时只需替换这张图，保持同样的行序与帧数即可，Player 里的常量不用动。
import footstepUrl from '../../assets/audio/sfx-footstep.wav?url';
import jumpSfxUrl from '../../assets/audio/sfx-jump.wav?url';
import forestBgmUrl from '../../assets/audio/forest-bgm.mp3?url';

export default class ForestScene extends Phaser.Scene {
  private player!: Player;
  private terrain!: Terrain;
  private sfx!: Sfx;
  private keyCollected = false;
  private statusText!: Phaser.GameObjects.Text;

  constructor() {
    super({
      key: 'forest',
      physics: {
        default: 'arcade',
        arcade: { gravity: { x: 0, y: 1100 }, debug: false },
      },
    });
  }

  preload(): void {
    if (!this.textures.exists(Player.SHEET)) {
      this.load.spritesheet(Player.SHEET, Player.SHEET_URL, {
        frameWidth: Player.FRAME_W,
        frameHeight: Player.FRAME_H,
      });
    }
    const audio: Array<[string, string]> = [
      ['sfx-footstep', footstepUrl],
      ['sfx-jump', jumpSfxUrl],
      ['forest-bgm', forestBgmUrl],
    ];
    for (const [key, url] of audio) {
      if (!this.cache.audio.exists(key)) this.load.audio(key, url);
    }
    // 当前海边关卡图与仍在使用的钥匙、出口素材。
    const env: Array<[string, string]> = [
      ['env-level1-coast-gameplay-bg', 'assets/environment/env-level1-coast-gameplay-bg-v1.png'],
      ['env-jasmine-door', 'assets/environment/env-manchurian-jasmine-door-256x384.png'],
      ['item-golden-key', 'assets/environment/item-golden-jasmine-key-192x256.png'],
    ];
    for (const [key, url] of env) {
      if (!this.textures.exists(key)) this.load.image(key, url);
    }
  }

  create(): void {
    applyHDCamera(this);
    this.sfx = new Sfx(this);
    this.cameras.main.setBackgroundColor('#10160f');
    // 关卡概念图按逻辑画布完整铺开，避免底部前景被裁掉；碰撞面按图中岩台对齐。
    this.add
      .image(0, 0, 'env-level1-coast-gameplay-bg')
      .setOrigin(0, 0)
      .setDisplaySize(1900, 540)
      .setDepth(-10);
    // 整图包含可玩台阶，必须与世界坐标同步滚动，不能做视差偏移。
    this.physics.world.setBounds(0, 0, 1900, 540);
    this.cameras.main.setBounds(0, 0, 1900, 540);

    this.add
      .text(32, 26, '海边关卡', {
        fontFamily: 'sans-serif',
        fontSize: '18px',
        color: '#888888',
      })
      .setScrollFactor(0);

    // 四段碰撞面与概念图里的沙地 / 岩台顶面对应，跳跃高度和平台间距保持可达。
    this.terrain = new Terrain(this, false);
    this.terrain.addPlatform({ x: 0, y: 410, width: 490, height: 130 });
    this.terrain.addPlatform({ x: 610, y: 336, width: 410, height: 204, kind: 'float' });
    this.terrain.addPlatform({ x: 1020, y: 264, width: 410, height: 276, kind: 'float' });
    this.terrain.addPlatform({ x: 1435, y: 384, width: 465, height: 156 });

    // 真实角色：替换原灰色矩形占位。Player 自带物理体、输入与 idle/run/jump/fall 动画。
    this.player = new Player(this, { x: 120, y: 376, sfx: this.sfx });
    this.physics.add.collider(this.player.view, this.terrain.solids);

    const key = this.add.image(1210, 222, 'item-golden-key').setScale(0.32);
    this.physics.add.existing(key, true);
    this.physics.add.overlap(this.player.view, key, () => {
      if (this.keyCollected) return;
      this.keyCollected = true;
      key.destroy();
      this.statusText.setText('已取得钥匙，前往右侧出口');
      door.setTint(0xbfe6c8);
    });

    const door = this.add.image(1770, 330, 'env-jasmine-door').setScale(0.28);
    this.physics.add.existing(door, true);
    this.physics.add.overlap(this.player.view, door, () => {
      if (this.keyCollected) {
        this.scene.start('room');
      } else {
        this.statusText.setText('门被锁住了，先寻找钥匙');
      }
    });

    // 装饰层：旧「茉莉花」占位素材已全部移除（2026-10-01 用户反馈"藤蔓在画面里特别巨大"）。
    // 原因：这些 128×512 / 256×384 的占位图带着 0.9 / 0.7 / 0.8 的缩放直接摆进 540 高的世界，
    // 藤蔓实渲 461px ≈ 画面高度的 85%，本来就是比例失控的临时占位，不是设计意图。
    // 海边装饰（礁石 / 蒲苇 / 木栈道桩 / 贝壳）待正式素材替换后再按层摆回。

    this.statusText = this.add
      .text(18, 500, 'A/D 或方向键移动 · 空格/W/↑ 跳跃（可二段跳）· 找到钥匙后进入门', {
        fontFamily: 'sans-serif',
        fontSize: '14px',
        color: '#dedede',
        backgroundColor: '#171717',
        padding: { x: 10, y: 7 },
      })
      .setScrollFactor(0)
      .setDepth(100);

    this.cameras.main.startFollow(this.player.view, true, 0.1, 0.1);
    this.cameras.main.setDeadzone(180, 100);

    if (!this.sound.isPlaying('forest-bgm')) {
      this.sound.play('forest-bgm', { loop: true, volume: 0.3 });
    }

    this.createTouchControls();
  }

  update(_time: number, delta: number): void {
    this.player.update(delta);
  }

  private createTouchControls(): void {
    if (!window.matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints === 0) return;
    const makeButton = (x: number, label: string, onDown: () => void, onUp: () => void) => {
      const button = this.add
        .text(x, 460, label, {
          fontFamily: 'sans-serif',
          fontSize: '26px',
          color: '#dddddd',
          backgroundColor: '#303030',
          padding: { x: 18, y: 12 },
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(120)
        .setInteractive();
      button.on('pointerdown', onDown);
      button.on('pointerup', onUp);
      button.on('pointerout', onUp);
    };
    makeButton(74, '◀', () => this.player.setTouchMove(-1), () => this.player.setTouchMove(0));
    makeButton(154, '▶', () => this.player.setTouchMove(1), () => this.player.setTouchMove(0));
    makeButton(885, '↑', () => this.player.pressTouchJump(true), () => this.player.pressTouchJump(false));
  }
}
