import Phaser from 'phaser';
import { applyHDCamera } from '../systems/Resolution';

/**
 * 森林玩法的中性占位版本。
 * 保留“移动、跳跃、取得钥匙、进入门、切换房间”的流程接口，
 * 不带入 Recall 的森林图片、角色图片、茉莉花画风或旧 UI。
 */
export default class ForestScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Rectangle;
  private playerBody!: Phaser.Physics.Arcade.Body;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private keyCollected = false;
  private statusText!: Phaser.GameObjects.Text;
  private touchMove: -1 | 0 | 1 = 0;
  private touchJumpQueued = false;

  constructor() {
    super({
      key: 'forest',
      physics: {
        default: 'arcade',
        arcade: { gravity: { x: 0, y: 1100 }, debug: false },
      },
    });
  }

  create(): void {
    applyHDCamera(this);
    this.cameras.main.setBackgroundColor('#202020');
    this.physics.world.setBounds(0, 0, 1900, 540);
    this.cameras.main.setBounds(0, 0, 1900, 540);

    this.add
      .text(32, 26, '森林视觉占位区域', {
        fontFamily: 'sans-serif',
        fontSize: '18px',
        color: '#888888',
      })
      .setScrollFactor(0);

    const platforms = this.physics.add.staticGroup();
    const addPlatform = (x: number, y: number, width: number, height: number) => {
      const platform = this.add
        .rectangle(x, y, width, height, 0x4b4b4b)
        .setStrokeStyle(1, 0x707070);
      this.physics.add.existing(platform, true);
      platforms.add(platform);
    };
    addPlatform(950, 510, 1900, 60);
    addPlatform(390, 410, 190, 22);
    addPlatform(690, 350, 180, 22);
    addPlatform(980, 300, 170, 22);
    addPlatform(1260, 365, 190, 22);

    this.player = this.add
      .rectangle(110, 420, 32, 58, 0xd8d8d8)
      .setStrokeStyle(2, 0xffffff);
    this.physics.add.existing(this.player);
    this.playerBody = this.player.body as Phaser.Physics.Arcade.Body;
    this.playerBody.setCollideWorldBounds(true).setMaxVelocity(240, 900);
    this.physics.add.collider(this.player, platforms);

    const key = this.add.circle(1260, 315, 12, 0xd2d2d2).setStrokeStyle(2, 0xffffff);
    this.physics.add.existing(key, true);
    this.physics.add.overlap(this.player, key, () => {
      if (this.keyCollected) return;
      this.keyCollected = true;
      key.destroy();
      this.statusText.setText('已取得钥匙，前往右侧出口');
      door.setFillStyle(0x777777);
    });

    const door = this.add
      .rectangle(1770, 400, 72, 160, 0x353535)
      .setStrokeStyle(3, 0x858585);
    this.physics.add.existing(door, true);
    this.physics.add.overlap(this.player, door, () => {
      if (this.keyCollected) {
        this.scene.start('room');
      } else {
        this.statusText.setText('门被锁住了，先寻找钥匙');
      }
    });

    this.statusText = this.add
      .text(18, 500, 'A/D 或方向键移动 · 空格跳跃 · 找到钥匙后进入门', {
        fontFamily: 'sans-serif',
        fontSize: '14px',
        color: '#dedede',
        backgroundColor: '#171717',
        padding: { x: 10, y: 7 },
      })
      .setScrollFactor(0)
      .setDepth(100);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keys = this.input.keyboard!.addKeys('A,D,W,SPACE') as Record<string, Phaser.Input.Keyboard.Key>;
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.cameras.main.setDeadzone(180, 100);
    this.createTouchControls();
  }

  update(): void {
    const left = this.cursors.left.isDown || this.keys.A.isDown || this.touchMove === -1;
    const right = this.cursors.right.isDown || this.keys.D.isDown || this.touchMove === 1;
    this.playerBody.setVelocityX(left ? -220 : right ? 220 : 0);

    const jumpPressed =
      Phaser.Input.Keyboard.JustDown(this.cursors.up) ||
      Phaser.Input.Keyboard.JustDown(this.keys.W) ||
      Phaser.Input.Keyboard.JustDown(this.keys.SPACE) ||
      this.touchJumpQueued;
    this.touchJumpQueued = false;
    if (jumpPressed && this.playerBody.onFloor()) {
      this.playerBody.setVelocityY(-570);
    }
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
    makeButton(74, '◀', () => (this.touchMove = -1), () => (this.touchMove = 0));
    makeButton(154, '▶', () => (this.touchMove = 1), () => (this.touchMove = 0));
    makeButton(885, '↑', () => (this.touchJumpQueued = true), () => undefined);
  }
}
