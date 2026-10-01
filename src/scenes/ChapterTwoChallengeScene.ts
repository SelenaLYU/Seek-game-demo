import Phaser from 'phaser';
import { Player } from '../gameplay/Player';
import { Terrain } from '../gameplay/Terrain';
import { applyHDCamera } from '../systems/Resolution';

/** 第二关玩法灰盒：取得信物后开启出口，正式玩法可在此场景内替换。 */
export default class ChapterTwoChallengeScene extends Phaser.Scene {
  private player!: Player;
  private terrain!: Terrain;
  private tokenCollected = false;
  private leaving = false;
  private title!: Phaser.GameObjects.Text;
  private status!: Phaser.GameObjects.Text;

  constructor() {
    super({
      key: 'chapter2',
      physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 1100 }, debug: false } },
    });
  }

  preload(): void {
    if (!this.textures.exists(Player.SHEET)) {
      this.load.spritesheet(Player.SHEET, Player.SHEET_URL, {
        frameWidth: Player.FRAME_W,
        frameHeight: Player.FRAME_H,
      });
    }
  }

  create(): void {
    this.tokenCollected = false;
    this.leaving = false;
    applyHDCamera(this);
    this.cameras.main.setBackgroundColor('#cad8d4');
    this.physics.world.setBounds(0, 0, 1680, 540);
    this.cameras.main.setBounds(0, 0, 1680, 540);

    const backdrop = this.add.graphics().setDepth(-20);
    backdrop.fillStyle(0xcad8d4).fillRect(0, 0, 1680, 540);
    backdrop.fillStyle(0xaebfba, .7);
    for (let x = 80; x < 1680; x += 190) backdrop.fillCircle(x, 135 + (x % 3) * 18, 54);
    backdrop.fillStyle(0xdfe5de, .8).fillRect(0, 335, 1680, 205);

    this.title = this.add.text(32, 25, '第二关 · 玩法灰盒', {
      fontFamily: 'sans-serif', fontSize: '20px', color: '#263d38',
      backgroundColor: 'rgba(244,247,239,.82)', padding: { x: 12, y: 8 },
    }).setOrigin(0).setDepth(100);

    this.terrain = new Terrain(this, true);
    this.terrain.addPlatform({ x: 0, y: 430, width: 1680, height: 110 });
    this.terrain.addPlatform({ x: 370, y: 352, width: 230, height: 22, kind: 'float' });
    this.terrain.addPlatform({ x: 720, y: 295, width: 230, height: 22, kind: 'float' });
    this.terrain.addPlatform({ x: 1060, y: 350, width: 220, height: 22, kind: 'float' });

    this.player = new Player(this, { x: 110, y: 386 });
    this.physics.add.collider(this.player.view, this.terrain.solids);

    const tokenGlow = this.add.circle(835, 247, 25, 0xe8ca76, .24).setDepth(20);
    const token = this.add.star(835, 247, 6, 9, 20, 0xe3bd58).setStrokeStyle(2, 0x695332).setDepth(21);
    const tokenLabel = this.add.text(835, 210, '记忆信物', {
      fontFamily: 'sans-serif', fontSize: '13px', color: '#3b3222',
      backgroundColor: 'rgba(247,242,220,.85)', padding: { x: 7, y: 4 },
    }).setOrigin(.5).setDepth(22);
    const tokenHit = this.add.rectangle(835, 247, 54, 64, 0xffffff, 0);
    this.physics.add.existing(tokenHit, true);

    const door = this.add.rectangle(1570, 350, 76, 160, 0x596761).setStrokeStyle(5, 0x34433e).setDepth(12);
    const doorSign = this.add.text(1570, 316, '记忆房间', {
      fontFamily: 'sans-serif', fontSize: '14px', color: '#e8e5d6', align: 'center',
    }).setOrigin(.5).setDepth(13);
    const doorHit = this.add.rectangle(1570, 350, 96, 178, 0xffffff, 0);
    this.physics.add.existing(doorHit, true);

    this.status = this.add.text(18, 495, '找到这一关的记忆信物，再打开右侧的门。', {
      fontFamily: 'sans-serif', fontSize: '14px', color: '#f1ead5',
      backgroundColor: 'rgba(22,37,33,.86)', padding: { x: 11, y: 8 },
    }).setOrigin(0).setDepth(100);

    this.physics.add.overlap(this.player.view, tokenHit, () => {
      if (this.tokenCollected) return;
      this.tokenCollected = true;
      token.destroy(); tokenGlow.destroy(); tokenLabel.destroy(); tokenHit.destroy();
      door.setFillStyle(0x789b88).setStrokeStyle(5, 0xd5c589);
      doorSign.setText('门已开启');
      this.status.setText('已取得记忆信物，前往右侧进入记忆房间。');
      this.tweens.add({ targets: door, alpha: { from: .68, to: 1 }, duration: 420, yoyo: true });
    });

    this.physics.add.overlap(this.player.view, doorHit, () => {
      if (!this.tokenCollected) {
        this.status.setText('门还没有回应。先找到这一关的记忆信物。');
        return;
      }
      if (this.leaving) return;
      this.leaving = true;
      this.cameras.main.fadeOut(450, 21, 34, 31);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        this.scene.start('chapter2-room', { entryItem: 'memory-token-2' });
      });
    });

    this.cameras.main.startFollow(this.player.view, true, .1, .1);
    this.cameras.main.setDeadzone(180, 100);
  }

  update(_time: number, delta: number): void {
    if (!this.leaving) this.player.update(delta);
    this.layoutHud();
  }

  private layoutHud(): void {
    const view = this.cameras.main.worldView;
    this.title.setPosition(view.x + 32, view.y + 25);
    this.status.setPosition(view.x + 18, view.y + 490);
  }
}
