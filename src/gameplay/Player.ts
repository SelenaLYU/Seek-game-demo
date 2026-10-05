import Phaser from 'phaser';
import runSheetUrl from '../../assets/character/char-niannian-run-right-128x160-16f.png?url';
import jumpSheetUrl from '../../assets/character/char-niannian-jump-right-128x160-16f.png?url';
import grabSheetUrl from '../../assets/character/char-niannian-grab-up-right-128x160-16f.png?url';
import { Effects } from './Effects';
import { Vine } from './Vine';

export type PlayerState = 'idle' | 'run' | 'jump' | 'fall';

/** Player 用到的音效接口，Sfx 模块实现；测试或静音时可注入空实现 */
export interface PlayerSfx {
  jump(): void;
  land(): void;
  step(): void;
  doubleJump(): void;
  grab(): void;
}

export interface PlayerOptions {
  x: number;
  y: number;
  /** 碰撞体尺寸 */
  width?: number;
  height?: number;
  /** 水平速度 px/s */
  speed?: number;
  /** 起跳速度（负值向上） */
  jumpVelocity?: number;
  /** 按住跳跃时顶点区间叠加的重力（负值用于减轻重力）；可按关卡覆写滞空手感 */
  apexGravityExtra?: number;
  /** 顶点重力调整的速度窗口（负值阈值至 0） */
  apexVelocityWindow?: number;
  /** 二段跳相对起跳速度倍率 */
  airJumpMultiplier?: number;
  /** 土狼时间：离地后仍可起跳的窗口 ms（Celeste 同款宽容技巧） */
  coyoteMs?: number;
  /** 跳跃缓冲：落地前按跳、落地瞬间补跳的窗口 ms */
  jumpBufferMs?: number;
  /** 最大下落速度 */
  maxFallSpeed?: number;
  /** 轻落地速度阈值（低于此值只做轻反馈） */
  softLandThreshold?: number;
  /** 重落地阈值（触发镜头微震） */
  hardLandThreshold?: number;
  /** 是否渲染脚下接触阴影（第一关真实场景建议关掉） */
  showGroundShadow?: boolean;
  sfx?: PlayerSfx;
}

/**
 * 年年（Nian Nian）Smart Version 正式序列帧——队友交付，提交号 6a47ac1，
 * 逐帧语义与接入规格见 assets/character/README.md。
 *
 * 三张图均为「横向单排 16 帧、单帧 128×160、整图 2048×160、RGBA 透明、朝向为右」。
 * 逐帧实测（alpha≥128 的最低像素=脚底 bot、最高像素=头顶 top）得到的帧语义：
 *   run  0-15  跑步循环；头顶恒在 y=9、只有腿在动（美术按"身体不动、腿动"画的）
 *   jump  0    静立（bot=146）← 用作待机帧
 *         1-3  下蹲预备（bot=146）
 *         4    蹬地离地（bot=131）  5-6 上升（bot=125/129）
 *         7-8  顶点（bot=109/111）
 *         9-10 下落（bot=124/135）  11-12 伸脚触地（bot=146/152）
 *         13-15 落地恢复与起立（bot=153）
 *   grab 0-3   地面蹲地预备（头顶 y=40/47/60/43，双手还在髋部）
 *         4    蹬地起跳（头顶 y=32）
 *         5-10 上升、双手上伸至抓住（头顶 y=23→6）
 *         11-15 悬挂摆动循环（脚底 142→133→141→145→150）
 *
 * 空中姿势只取 4-11：跳图的 0-3 是蹲地预备、12 之后是触地恢复，都不该出现在空中。
 */

/**
 * 三张图不是同一绘制尺度：刚性部位代理（短裤 34×31 对 27×23、脸宽 30 对 23）指向 run 比 jump/grab
 * 大 1.26-1.30 倍；把 run f0 与 jump f0 的脚底对齐做 1.0/1.19/1.29 三档同屏 A/B，也是 1.29 档头部与躯干
 * 才对齐（1.19 档待机明显偏小）。
 * run 保持 0.525（显示高 76px，与旧 meimei 角色同高，关卡观感是按它调的）；
 * jump/grab 必须放大到 0.68，否则跑步↔待机/起跳切换时角色会"缩小一跳"。
 */
const SPRITE_SCALE = 0.525;
const JUMP_SCALE = 0.68;
const GRAB_SCALE = 0.68;
/** 脚底参考线（源图 y，帧高 160）：run 的落地帧与 jump 的触地帧都在 153 */
const GROUND_SOLE = 153;
/** 待机帧（跳图第 0 帧）自己的脚底线是 146，比同图的触地帧高 7px——不单独对齐就会悬空 4.8px */
const IDLE_SOLE = 146;
/** 抓取图悬挂循环 11-15 的脚底线均值：松手过渡的起点（身体此时还挂在握点下方） */
const HANG_SOLE = 142.25;

/**
 * 角色控制器：输入、物理与跳跃手感。
 * 画面为 B 的正式序列帧（Issue #4 到货接入）：idle/run/jump/fall 按状态切换；
 * 物理/手感数值与动画解耦，调参只动下面的常量。
 */
export class Player {
  /** 年年 128×160 三套正式序列帧（队友交付 6a47ac1） */
  static readonly RUN_SHEET = 'char-niannian-run';
  static readonly JUMP_SHEET = 'char-niannian-jump';
  static readonly GRAB_SHEET = 'char-niannian-grab';
  static readonly FRAME_W = 128;
  static readonly FRAME_H = 160;

  static readonly RUN_ANIM = 'niannian-run';
  static readonly GRAB_REACH_ANIM = 'niannian-grab-reach';
  static readonly GRAB_HANG_ANIM = 'niannian-grab-hang';

  /** 待机姿势：跳图第 0 帧是干净的静立（双臂垂下、双脚落地），比跑图的跨步帧适合静止 */
  static readonly IDLE_SHEET = Player.JUMP_SHEET;
  static readonly IDLE_FRAME = 0;

  /** 抓取序列：0-3 是地面蹲地预备、4 蹬地起跳、5-10 双手上伸至抓住 */
  static readonly GRAB_REACH_START = 4;
  static readonly GRAB_REACH_END = 10;
  /** 悬挂摆动循环：实测 11-15 首尾差最小（脚底 150→142 差 8 源 px，换 12-15 反而差 17） */
  static readonly GRAB_HANG_START = 11;
  static readonly GRAB_HANG_END = 15;

  /**
   * 悬挂握点：抓取图双手拳心在帧内 ≈(75, 11)（实测拳头占源 y=7..16、随后 y=17 起是 8px 宽的前臂；
   * 悬挂循环帧顶行手中心 71.8-79.2，均值 75）。取 11 而不是 6.5：后者是拳头最上沿、指尖之上，
   * 海鸥双脚会被画到拳头顶端，读作"用指尖顶着海鸥"。
   */
  static readonly GRAB_GRIP = { x: 75 / 128, y: 11 / 160 };

  /** 待机呼吸：周期 1.9s、纵向 ±1.5%（头顶起伏约 ±1.2px，脚底不动） */
  private static readonly IDLE_BREATH_MS = 1900;
  private static readonly IDLE_BREATH_SCALE = 0.015;
  /** 松手过渡：悬挂身体收回待机锚点的时长 */
  private static readonly RELEASE_SETTLE_MS = 90;

  /**
   * 三张序列帧由 Player 统一下发，场景 preload 里调用。
   * 第一关与第二关共用同一角色，避免两边各写一份加载参数而漂移。
   */
  static preload(scene: Phaser.Scene): void {
    const sheets: Array<[string, string]> = [
      [Player.RUN_SHEET, runSheetUrl],
      [Player.JUMP_SHEET, jumpSheetUrl],
      [Player.GRAB_SHEET, grabSheetUrl],
    ];
    for (const [key, url] of sheets) {
      if (!scene.textures.exists(key)) {
        scene.load.spritesheet(key, url, {
          frameWidth: Player.FRAME_W,
          frameHeight: Player.FRAME_H,
        });
      }
    }
  }

  /**
   * 起跳升空的逐帧姿势（jumpVelocity 为 -630、落地速度约 620）。
   * 速度是单调变化的，直接用阈值分段即可，不需要额外的低通滤波。
   * 首档用 -420（原 -300）：-300 让"刚蹬地"这一档占满整段滞空的 21%，是最长且姿势不动的一档。
   */
  private static airFrame(vy: number): number {
    if (vy < -420) return 4;   // 刚蹬地离地
    if (vy < -150) return 5;   // 快速上升
    if (vy < -40) return 6;    // 上升末段
    if (vy < 40) return 7;     // 顶点（团身）
    if (vy < 150) return 8;    // 顶点翻身
    if (vy < 320) return 9;    // 下落初段
    if (vy < 520) return 10;   // 加速下落
    return 11;                 // 伸脚准备落地
  }

  /**
   * 走落悬崖（无起跳、vy 从 0 起）时的姿势：跳图的 4-8 是"蹬地→顶点"画的，
   * 从边缘走下去直接落到下落段，否则会先播 110ms 的顶点团身姿势。
   */
  private static dropFrame(vy: number): number {
    if (vy < 150) return 9;
    if (vy < 520) return 10;
    return 11;
  }

  /** 物理与视觉根节点（Container），场景对它建 collider/overlap/follow */
  readonly view: Phaser.GameObjects.Container;

  state: PlayerState = 'idle';
  facing: -1 | 1 = 1;

  // —— 触摸输入（手机版屏幕按钮写入，桌面恒为默认值）——
  private touchMove = 0;
  private touchJumpHeld = false;
  private touchJumpQueued = false;
  private touchJumpReleased = false;

  /** 触摸方向键按下/抬起（-1 左、0 松、1 右） */
  setTouchMove(dir: -1 | 0 | 1): void {
    this.touchMove = dir;
  }

  /** 触摸跳跃键按下（走与键盘相同的跳跃缓冲通路，二段跳同样生效） */
  pressTouchJump(held: boolean): void {
    if (held && !this.touchJumpHeld) {
      this.touchJumpQueued = true;
    } else if (!held && this.touchJumpHeld) {
      this.touchJumpReleased = true;
    }
    this.touchJumpHeld = held;
  }

  // —— 移动模型常量（调手感改这里）——
  /** 地面/空中加速 px/s² */
  private static readonly ACCEL_GROUND = 2600;
  private static readonly ACCEL_AIR = 1900;
  /** 无输入时地面/空中减速 px/s² */
  private static readonly DECEL_GROUND = 3000;
  private static readonly DECEL_AIR = 1400;
  /** 急转变向的额外减速倍率 */
  private static readonly TURN_BOOST = 1.8;
  /** 下落加重（叠加在世界重力上，共 1.4×）——此前 1.6× 落地过沉 */
  private static readonly FALL_GRAVITY_EXTRA = 560;
  private static readonly SKID_DUST_MS = 320;
  /** 跑步脚步声间隔（与 run 动画步频对齐） */
  private static readonly STEP_INTERVAL_MS = 280;
  /** 跑步动画保持期 ms：换向时 vx 穿过 0（低于逐帧阈值）约半帧，这段内不切回 idle，
   *  否则再回 run 会 stop()→play() 把循环从第 0 帧重启，腿的姿势回跳（读作“跳帧”） */
  private static readonly RUN_HOLD_MS = 140;

  private readonly scene: Phaser.Scene;
  private readonly opts: Required<Omit<PlayerOptions, 'sfx'>> & {
    sfx?: PlayerSfx;
  };
  private readonly keys: Record<string, Phaser.Input.Keyboard.Key>;
  private readonly body: Phaser.Physics.Arcade.Body;
  private readonly sprite: Phaser.GameObjects.Sprite;
  private readonly shadow: Phaser.GameObjects.Ellipse;

  private coyoteTimer = 0;
  private jumpBufferTimer = 0;
  private wasOnGround = true;
  private prevFallSpeed = 0;
  private frozen = false;
  private squashing = false;
  /** 当前压扁还原 tween 的引用：retarget 时只销毁这一个，不波及 view 上的其他 tween（含场景的重生淡入） */
  private squashTween?: Phaser.Tweens.Tween;
  private stepTimer = 0;
  private skidDustAt = 0;
  private displayedFacing: -1 | 1 = 1;
  private currentAnim = '';
  /** 最近一次踩到的地面高度：用于接触阴影随离地高度淡化 */
  private lastGroundY = 0;
  /** 自动走位目标（房间点击物件后走近），到达即回调 */
  private autoWalkTarget: number | null = null;
  /** 跑步动画保持到该时刻（scene.time.now 口径）：换向穿过 0 时不切换动画 */
  private runHoldUntil = 0;
  private autoWalkDone: (() => void) | null = null;
  /** 空中可用的二段跳次数（落地恢复） */
  private airJumpsLeft = 0;
  /** 本次滞空是起跳（含二段跳、甩出）还是从边缘走落：取帧序列不同 */
  private airFromJump = false;
  private attachedVine: Vine | null = null;
  /** 当前姿势指纹（贴图/帧/缩放/脚底线）：变了才重写精灵的贴图与缩放 */
  private poseKey = '';
  /** 当前姿势的锚点 y（未叠加松手过渡的补偿） */
  private poseY = 0;
  /** 松手瞬间身体仍在握点下方，这个下沉量用 90ms 收回待机锚点（px，正=更靠下） */
  private releaseLift = 0;
  private releaseTween: Phaser.Tweens.Tween | null = null;

  constructor(scene: Phaser.Scene, options: PlayerOptions) {
    this.scene = scene;
    this.opts = {
      width: 36,
      height: 72,
      speed: 250,
      jumpVelocity: -630,
      apexGravityExtra: -700,
      apexVelocityWindow: -180,
      airJumpMultiplier: 0.92,
      coyoteMs: 130,
      jumpBufferMs: 140,
      maxFallSpeed: 1000,
      softLandThreshold: 220,
      hardLandThreshold: 700,
      showGroundShadow: true,
      ...options,
    };

    this.createAnims();

    // 脚下软阴影：贴着脚底位置（与精灵底部对齐），落地实、空中淡
    this.shadow = scene.add.ellipse(0, this.opts.height / 2, 30, 9, 0x0b170f, 0.28);
    if (!this.opts.showGroundShadow) this.shadow.setVisible(false);
    // 年年正式序列帧；初始用跳图第 0 帧（干净静立），脚底按它自己的 146 对齐
    this.sprite = scene.add.sprite(
      0,
      Player.spriteY(this.opts.height, JUMP_SCALE, IDLE_SOLE),
      Player.IDLE_SHEET,
      Player.IDLE_FRAME,
    );
    this.sprite.setOrigin(0.5, 1).setScale(JUMP_SCALE);
    this.poseY = this.sprite.y;

    // 抓取预备/上伸播完（双手已抓住）后，转入悬挂摆动循环
    this.sprite.on(Phaser.Animations.Events.ANIMATION_COMPLETE, (anim: Phaser.Animations.Animation) => {
      if (anim.key === Player.GRAB_REACH_ANIM && this.attachedVine) {
        this.sprite.play(Player.GRAB_HANG_ANIM);
      }
    });

    this.view = scene.add.container(options.x, options.y, [this.shadow, this.sprite]);

    scene.physics.add.existing(this.view);
    this.body = this.view.body as Phaser.Physics.Arcade.Body;
    this.body.setSize(this.opts.width, this.opts.height, false);
    this.body.setOffset(-this.opts.width / 2, -this.opts.height / 2);
    this.body.setCollideWorldBounds(true);

    this.keys = scene.input.keyboard
      ? (scene.input.keyboard.addKeys(
          'A,D,W,S,LEFT,RIGHT,UP,DOWN,SPACE',
        ) as Record<string, Phaser.Input.Keyboard.Key>)
      : {};
  }

  /**
   * 精灵 y 偏移：帧高 160，从帧底往上 (160 − sole) 处是脚底线，把它对齐到碰撞体底边。
   * sole 默认取 run/jump 共用的地面线 153；待机帧用 146（见 IDLE_SOLE）。
   */
  private static spriteY(bodyHeight: number, scale = SPRITE_SCALE, sole = GROUND_SOLE): number {
    return bodyHeight / 2 + (Player.FRAME_H - sole) * scale;
  }

  /**
   * 统一写精灵的姿势锚点：贴图/缩放只在指纹变化时写，纵坐标每帧都写
   * （松手过渡的 releaseLift 要跟着调整）。frame=null 表示帧由动画播放器接管（奔跑循环）。
   */
  private setPose(sheet: string, frame: number | null, scale: number, sole: number): void {
    const key = `${sheet}|${frame ?? 'anim'}|${scale}|${sole}`;
    if (this.poseKey !== key) {
      this.poseKey = key;
      if (frame !== null) {
        this.sprite.setTexture(sheet, frame);
      }
      this.sprite.setOrigin(0.5, 1);
      this.sprite.setScale(scale);
      this.poseY = Player.spriteY(this.opts.height, scale, sole);
    }
    this.sprite.y = this.poseY + this.releaseLift;
  }

  /**
   * 待机呼吸：没有 idle 序列（三张图里可用的静立帧只有跳图 f0 与 f15，二者头差 19 源 px，
   * 读作下蹲而不是呼吸），用纵向缩放做最小可行方案——脚底钉在碰撞体底边，只有头顶起伏 ±1.2px。
   */
  private applyIdleBreath(): void {
    const phase = Math.sin(this.scene.time.now * ((Math.PI * 2) / Player.IDLE_BREATH_MS));
    const scaleY = JUMP_SCALE * (1 + phase * Player.IDLE_BREATH_SCALE);
    this.sprite.scaleY = scaleY;
    this.sprite.y = Player.spriteY(this.opts.height, scaleY, IDLE_SOLE) + this.releaseLift;
  }

  /** 全局动画只建一次；重复进场景不重建。帧率按队友 README 的接入建议。 */
  private createAnims(): void {
    if (this.scene.anims.exists(Player.RUN_ANIM)) {
      return;
    }
    if (this.scene.textures.exists(Player.RUN_SHEET)) {
      // 帧率说明（与队友 README 的 16fps 有意偏离，原因如下）：
      // 16 帧 @16fps → 一圈 1.0s；叠加 timeScale 1.15 折合约 0.87s，
      // 而旧 meimei 跑动是 8 帧 @13fps → 0.535s。腿的摆动速度被拖慢 63%，
      // 表现为“脚下打滑 / 没之前流畅”（不是帧不够，而是帧多但放得慢）。
      // 16 帧 @26fps → 0.535s，回到已经调好的摆腿节奏，同时姿势密度翻倍。
      this.scene.anims.create({
        key: Player.RUN_ANIM,
        frames: this.scene.anims.generateFrameNumbers(Player.RUN_SHEET, { start: 0, end: 15 }),
        frameRate: 26,
        repeat: -1,
      });
    }
    if (this.scene.textures.exists(Player.GRAB_SHEET)) {
      // 蹬地→双手上伸→抓住：从 4 起播（跳过 0-3 的地面蹲地预备）。
      // 空中抓住海鸥时人物已经在飞，再播蹲地预备会看到“空中蹲一下再伸手”。
      this.scene.anims.create({
        key: Player.GRAB_REACH_ANIM,
        frames: this.scene.anims.generateFrameNumbers(Player.GRAB_SHEET, {
          start: Player.GRAB_REACH_START,
          end: Player.GRAB_REACH_END,
        }),
        frameRate: 16,
        repeat: 0,
      });
      // 抓住后循环最后 5 帧（11-15）形成轻微悬挂摆动
      this.scene.anims.create({
        key: Player.GRAB_HANG_ANIM,
        frames: this.scene.anims.generateFrameNumbers(Player.GRAB_SHEET, {
          start: Player.GRAB_HANG_START,
          end: Player.GRAB_HANG_END,
        }),
        frameRate: 8,
        repeat: -1,
      });
    }
  }

  update(delta: number): void {
    if (this.frozen) {
      this.body.setVelocity(0, 0);
      return;
    }

    if (this.attachedVine) {
      this.updateVineGrab(delta);
      return;
    }

    const onGround = this.body.onFloor();
    const left = this.isDown('A') || this.isDown('LEFT');
    const right = this.isDown('D') || this.isDown('RIGHT');
    const jumpHeld =
      this.isDown('SPACE') || this.isDown('W') || this.isDown('UP') || this.touchJumpHeld;
    const jumpPressed =
      this.justPressed('SPACE') ||
      this.justPressed('W') ||
      this.justPressed('UP') ||
      this.touchJumpQueued;
    const jumpReleased =
      ((!this.isDown('SPACE') && !this.isDown('W') && !this.isDown('UP') && !this.touchJumpHeld) &&
      (this.justReleased('SPACE') || this.justReleased('W') || this.justReleased('UP'))) ||
      this.touchJumpReleased;
    this.touchJumpReleased = false;

    // 土狼时间 + 跳跃缓冲（Celeste “& Forgiveness” 同款宽容技巧）
    if (onGround) {
      this.airJumpsLeft = 1;
      this.airFromJump = false;
    }
    this.coyoteTimer = onGround ? this.opts.coyoteMs : Math.max(0, this.coyoteTimer - delta);
    this.jumpBufferTimer = jumpPressed
      ? this.opts.jumpBufferMs
      : Math.max(0, this.jumpBufferTimer - delta);
    this.touchJumpQueued = false;

    if (this.jumpBufferTimer > 0 && this.coyoteTimer > 0) {
      this.body.setVelocityY(this.opts.jumpVelocity);
      this.jumpBufferTimer = 0;
      this.coyoteTimer = 0;
      this.airFromJump = true;
      this.opts.sfx?.jump();
      this.squash(0.93, 1.08);
      Effects.dust(this.scene, this.view.x, this.view.y + this.opts.height / 2 - 2, 4, 16);
    } else if (this.jumpBufferTimer > 0 && !onGround && this.airJumpsLeft > 0) {
      // 二段跳：稍弱。空翻已按反馈移除（2026-09-24）——单张精灵图整体旋转
      // 实机读作"纸片人转动"（无团身细节），与水彩氛围不搭，只留提气脉冲+光环
      this.airJumpsLeft -= 1;
      this.jumpBufferTimer = 0;
      this.body.setVelocityY(this.opts.jumpVelocity * this.opts.airJumpMultiplier);
      this.airFromJump = true;
      this.opts.sfx?.doubleJump();
      this.squash(0.94, 1.07);
      Effects.ring(this.scene, this.view.x, this.view.y + this.opts.height / 2 - 6, 0xd8e8d0);
    }

    // 分段重力：半重力顶点（按住跳跃滞空更可控）+ 下落加重（弧线漂亮、落地更沉）
    let extraGravity = 0;
    if (!onGround) {
      if (jumpHeld && this.body.velocity.y < 0 && this.body.velocity.y > this.opts.apexVelocityWindow) {
        extraGravity = this.opts.apexGravityExtra;
      } else if (this.body.velocity.y > 120) {
        extraGravity = Player.FALL_GRAVITY_EXTRA;
      }
    }
    this.body.setGravityY(extraGravity);

    // 提前松键截断上升，形成轻重两档跳高
    if (jumpReleased && this.body.velocity.y < 0) {
      this.body.setVelocityY(this.body.velocity.y * 0.45);
    }

    // 加速度/摩擦移动模型：起步加速、松键滑停、急转搓地；自动走位优先于键盘
    let inputDir: number;
    if (this.autoWalkTarget !== null) {
      const dx = this.autoWalkTarget - this.view.x;
      if (Math.abs(dx) <= 8) {
        this.autoWalkTarget = null;
        const arrived = this.autoWalkDone;
        this.autoWalkDone = null;
        this.body.setVelocityX(0);
        inputDir = 0;
        arrived?.();
      } else {
        inputDir = Math.sign(dx);
      }
    } else {
      inputDir = (right ? 1 : 0) - (left ? 1 : 0);
      // 触摸按钮（手机版）：键盘无输入时采用屏幕方向键
      if (inputDir === 0 && this.touchMove !== 0) {
        inputDir = this.touchMove;
      }
    }
    let vx = this.body.velocity.x;
    if (inputDir !== 0) {
      const turning = Math.sign(inputDir) !== Math.sign(vx) && Math.abs(vx) > 120;
      const accel = onGround ? Player.ACCEL_GROUND : Player.ACCEL_AIR;
      vx += inputDir * (turning ? accel * Player.TURN_BOOST : accel) * (delta / 1000);
      vx = Phaser.Math.Clamp(vx, -this.opts.speed, this.opts.speed);
      if (turning && onGround && this.scene.time.now >= this.skidDustAt) {
        this.skidDustAt = this.scene.time.now + Player.SKID_DUST_MS;
        Effects.dust(this.scene, this.view.x, this.view.y + this.opts.height / 2 - 2, 3, 14);
      }
    } else {
      const decel = (onGround ? Player.DECEL_GROUND : Player.DECEL_AIR) * (delta / 1000);
      vx = Math.abs(vx) <= decel ? 0 : vx - Math.sign(vx) * decel;
    }
    this.body.setVelocityX(vx);
    if (right) {
      this.facing = 1;
    } else if (left) {
      this.facing = -1;
    }
    if (this.facing !== this.displayedFacing) {
      this.displayedFacing = this.facing;
      this.view.scaleX = this.facing;
      // 压扁 tween 还在跑的时候换向：它的 scaleX 目标是**旧朝向**，会每帧把翻转写回去，
      // tween 结束后 displayedFacing 已经相等、也不会再赋值 → 角色朝向卡住。换向就要重定目标。
      if (this.squashing) this.retargetSquashTween();
    }

    if (this.body.velocity.y > this.opts.maxFallSpeed) {
      this.body.setVelocityY(this.opts.maxFallSpeed);
    }

    this.state = !onGround
      ? this.body.velocity.y < 0
        ? 'jump'
        : 'fall'
      : this.body.velocity.x !== 0
        ? 'run'
        : 'idle';

    // ---- 落地反馈：只在世界着地那一帧触发，强度随落速（白色尘土已按要求移除；
    //      2026-09-24 整体收一档：原 1.14/0.84 的挤压读作"果冻"，水彩氛围里显怪异）----
    if (onGround && !this.wasOnGround) {
      if (this.prevFallSpeed > this.opts.hardLandThreshold) {
        this.opts.sfx?.land();
        this.scene.cameras.main.shake(70, 0.002);
        this.squash(1.08, 0.9);
      } else if (this.prevFallSpeed > this.opts.softLandThreshold) {
        this.opts.sfx?.land();
        this.squash(1.04, 0.94);
      } else {
        this.squash(1.02, 0.97);
      }
    }
    this.prevFallSpeed = onGround ? 0 : this.body.velocity.y;
    this.wasOnGround = onGround;

    this.animate(delta, onGround);
  }

  /** 进入门/演出时锁住角色：不响应输入、不受重力 */
  freeze(): void {
    this.frozen = true;
    this.cancelAutoWalk();
    this.attachedVine?.startCooldown(0);
    this.attachedVine = null;
    this.body.enable = true;
    this.body.setAllowGravity(false);
    this.body.setGravityY(0);
    this.body.setVelocity(0, 0);
  }

  /** 解除锁定（房间交互面板关闭后恢复走动） */
  unfreeze(): void {
    this.frozen = false;
    // 必须与 freeze() 对称：freeze 关掉了重力，这里不还回来，「留在场景探索」后角色会永久失重
    this.body.setAllowGravity(true);
    this.body.setGravityY(0);
  }

  /** 自动走位到目标 x（房间点击物件自动走近），到达后回调一次 */
  autoWalkTo(x: number, onArrived?: () => void): void {
    // 目标收进本场景物理边界内，保证真的走得到并触发回调（森林边界覆盖全图，行为不变）
    const bounds = this.scene.physics.world.bounds;
    const minX = Math.max(20, bounds.left + 24);
    const maxX = Math.min(940, bounds.right - 24);
    this.autoWalkTarget = Phaser.Math.Clamp(x, minX, maxX);
    this.autoWalkDone = onArrived ?? null;
  }

  cancelAutoWalk(): void {
    this.autoWalkTarget = null;
    this.autoWalkDone = null;
  }

  get attached(): Vine | null {
    return this.attachedVine;
  }

  /**
   * 供场景在 player.update() 之前调用：玩家在空中、靠近抓点时自动抓住它（或按跳跃抓住）。
   * 标准横版平台动作手感：空中跳向海鸥触碰即抓住，无需极速连按两次跳跃。
   */
  tryGrabVine(vine: Vine, radius = 78): boolean {
    if (this.frozen || this.attachedVine || !this.body.enable || this.body.onFloor() || !vine.available) {
      return false;
    }
    const handY = this.view.y - this.opts.height / 2;
    if (Phaser.Math.Distance.Between(this.view.x, handY, vine.handX, vine.handY) > radius) {
      return false;
    }
    this.touchJumpQueued = false;
    this.attachVine(vine);
    return true;
  }

  /** 抓住藤蔓：停用物理体，由藤蔓摆荡驱动位置 */
  attachVine(vine: Vine): void {
    this.attachedVine = vine;
    vine.grab(this.body.velocity.x);
    this.body.setVelocity(0, 0);
    this.body.enable = false;
    this.opts.sfx?.grab();
    // 换装抓花序列：帧内的小茉莉钉在花环上，播放"蹬地→抓住→挂稳"
    this.sprite.anims.stop();
    this.currentAnim = '';
    this.enterGrabVisual();
    this.shadow.setAlpha(0.1);
    // 容器原点=抓点（双手拳心钉在上面），身体随 −angle 绕它摆动
    this.view.setScale(this.facing, 1);
    this.view.setPosition(vine.handX, vine.handY);
    this.view.setRotation(-vine.angle);
  }

  /** 抓鸥视觉：从抓取图上伸序列的第一帧开始，双手拳心对齐抓点 */
  private enterGrabVisual(): void {
    this.sprite.anims.stop();
    this.sprite.setTexture(Player.GRAB_SHEET, Player.GRAB_REACH_START);
    this.sprite.setOrigin(Player.GRAB_GRIP.x, Player.GRAB_GRIP.y);
    this.sprite.setScale(GRAB_SCALE);
    this.sprite.setPosition(0, 0);
    this.poseKey = '';
    // 握点固定在容器原点上，起跳/上伸时身体相对抓点上升，抓住后自动转入悬挂循环
    this.sprite.play(Player.GRAB_REACH_ANIM);
  }

  /**
   * 离开抓藤：精灵恢复常规行走序列的挂载方式。
   * 悬挂时容器原点 = 握点、身体画在容器下方 (HANG_SOLE−握点)×GRAB_SCALE ≈ 89px；
   * 直接换成“脚底对齐碰撞体底边”的锚点会让画面整体上跳 ~53px，所以先把精灵停在原来的视觉位置，
   * 再用 90ms 收回待机锚点（只做视觉补偿，不动 collider，甩向礁石的弹道不变）。
   */
  private exitGrabVisual(): void {
    this.sprite.anims.stop();
    this.currentAnim = '';
    this.poseKey = '';
    this.sprite.setTexture(Player.IDLE_SHEET, Player.IDLE_FRAME);
    this.sprite.setOrigin(0.5, 1);
    this.sprite.setScale(JUMP_SCALE);
    const target = Player.spriteY(this.opts.height, JUMP_SCALE, IDLE_SOLE);
    this.poseY = target;
    const hangDrop =
      (HANG_SOLE - Player.GRAB_GRIP.y * Player.FRAME_H) * GRAB_SCALE - this.opts.height / 2;
    this.settleFromGrab(hangDrop);
  }

  /** 松手后的 90ms 视觉收回：releaseLift 从 hangDrop 渐变到 0，帧驱动写在 setPose/animate 里 */
  private settleFromGrab(hangDrop: number): void {
    this.clearGrabSettle();
    const settle = { lift: hangDrop };
    this.releaseLift = hangDrop;
    this.sprite.y = this.poseY + this.releaseLift;
    this.releaseTween = this.scene.tweens.add({
      targets: settle,
      lift: 0,
      duration: Player.RELEASE_SETTLE_MS,
      ease: 'Quad.easeOut',
      onUpdate: () => {
        this.releaseLift = settle.lift;
      },
      onComplete: () => {
        this.releaseLift = 0;
        this.releaseTween = null;
      },
    });
  }

  /** 中断松手过渡（传送/重生）：直接回正，避免残留下沉量 */
  private clearGrabSettle(): void {
    this.releaseTween?.remove();
    this.releaseTween = null;
    this.releaseLift = 0;
  }

  /** 松手甩出：按藤蔓当前摆速的切向速度 + 向上助力 */
  releaseVine(): void {
    const vine = this.attachedVine;
    if (!vine) {
      return;
    }
    const velocity = vine.releaseVelocity();
    this.attachedVine = null;
    vine.startCooldown(500);
    this.exitGrabVisual();
    this.body.enable = true;
    this.body.setAllowGravity(true);
    // 横版游戏手感保底：只要面朝右侧（目标礁石方向）或切向为正，保证足够的向前冲量与向上浮力
    const forwardVx = (this.facing > 0 || velocity.vx > 0) ? Math.max(velocity.vx, 260) : velocity.vx;
    const upwardVy = Math.min(velocity.vy, -240);
    this.body.setVelocity(forwardVx, upwardVy);
    this.airJumpsLeft = 1; // 松手后恢复二段跳能力，允许空中微调落点
    // 甩出是一段完整的抛物线（先升后落），走起跳取帧序列而不是“从边缘走落”
    this.airFromJump = true;
    this.facing = forwardVx >= 0 ? 1 : -1;
    this.displayedFacing = this.facing;
    this.view.scaleX = this.facing;
    this.view.setRotation(0);
    this.wasOnGround = false;
    this.prevFallSpeed = 0;
    this.coyoteTimer = 0;
    Effects.dust(this.scene, vine.handX, vine.handY + 10, 4, 14);
  }

  /** 抓藤状态：读键驱动摆荡/爬升，空格甩出 */
  private updateVineGrab(delta: number): void {
    const vine = this.attachedVine;
    if (!vine) {
      return;
    }
    const dirX =
      (this.isDown('D') || this.isDown('RIGHT') ? 1 : 0) -
      (this.isDown('A') || this.isDown('LEFT') ? 1 : 0) || this.touchMove;
    const climb =
      (this.isDown('W') || this.isDown('UP') ? 1 : 0) -
      (this.isDown('S') || this.isDown('DOWN') ? 1 : 0);
    vine.update(delta, { dirX, climb });

    // 花心钉在花环上：容器原点=握点，身体绕手掌/花摆动（旋转 −θ 头朝锚点）
    this.view.setPosition(vine.handX, vine.handY);
    this.view.setRotation(-vine.angle);
    if (dirX !== 0) {
      this.facing = dirX > 0 ? 1 : -1;
      this.displayedFacing = this.facing;
      this.view.scaleX = this.facing;
    }

    // 攀爬不再切帧：队友交付的抓取图只有「上伸→抓住→悬挂稳定」一个序列，
    // 悬挂摆动由 niannian-grab-hang 循环接管（climb 仍驱动绳长变化）

    // 松手甩出：键盘空格/W/↑ 或触摸跳跃键（update() 在挂藤时提前返回，
    // 触摸队列只能在这里消费——否则手机抓上花环就再也松不开）
    if (
      this.justPressed('SPACE') ||
      this.justPressed('W') ||
      this.justPressed('UP') ||
      this.touchJumpQueued
    ) {
      this.touchJumpQueued = false;
      this.releaseVine();
    }
  }

  /** 死亡重生：传送回重生点并清状态；钥匙等进度由场景字段保留 */
  teleportTo(x: number, y: number): void {
    this.attachedVine = null;
    this.frozen = false;
    this.airFromJump = false;
    this.clearGrabSettle();
    this.body.enable = true;
    this.body.setAllowGravity(true);
    this.body.setGravityY(0);
    this.view.setScale(this.facing, 1);
    this.view.setRotation(0);
    this.view.setPosition(x, y);
    this.body.reset(x, y);
    this.lastGroundY = y + this.opts.height / 2;
    this.currentAnim = '';
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.wasOnGround = true;
    this.prevFallSpeed = 0;
    this.squashing = false;
    this.stepTimer = 0;
  }

  private squash(scaleX: number, scaleY: number): void {
    this.squashing = true;
    this.view.setScale(this.facing * scaleX, scaleY);
    this.retargetSquashTween();
  }

  /** 把正在跑的压扁 tween 重新指向当前朝向（换向时必须调用，否则朝向会被旧目标写回） */
  private retargetSquashTween(): void {
    // 只销毁上一个压扁还原 tween。不能用 killTweensOf(view)：那会连带杀掉场景挂在
    // view 上的重生淡入淡出——落地压扁的时机正好落在传送复活后的淡入窗口内，alpha 会
    // 停在补间最后写入的值（实测 0.91 / 0.59），表现为角色永久变透明，直到下一次死亡才恢复。
    // 诊断脚本：tools/probe-player-alpha.mjs；根因记录：decisions/2026-10-03-player-alpha-tween-isolation.md。
    this.squashTween?.destroy();
    this.squashTween = this.scene.tweens.add({
      targets: this.view,
      scaleX: this.facing,
      scaleY: 1,
      duration: 150,
      ease: 'Quad.easeOut',
      onComplete: () => {
        this.squashing = false;
      },
    });
  }

  /** 状态 → 动画：地面循环动画用滞回+最小停留防抖；空中姿势低通滤波防跳帧；
   *  接触阴影随离地高度淡化缩放（贴地实、越高越淡越小） */
  private animate(delta: number, onGround: boolean): void {
    const feet = this.view.y + this.opts.height / 2;
    if (onGround) {
      this.lastGroundY = feet;
    }
    if (this.opts.showGroundShadow) {
      const heightRatio = Phaser.Math.Clamp((feet - this.lastGroundY) / 150, 0, 1);
      this.shadow.setAlpha(Phaser.Math.Linear(0.3, 0.05, heightRatio));
      this.shadow.setScale(Phaser.Math.Linear(1, 0.62, heightRatio), 1);
    }
    const speedRatio =
      this.opts.speed === 0 ? 0 : Math.min(1, Math.abs(this.body.velocity.x) / this.opts.speed);

    if (!onGround) {
      if (this.sprite.anims.isPlaying) {
        this.sprite.anims.stop();
      }
      this.currentAnim = '';
      // 按垂直速度取跳图帧：只走 4-11（蹬地→上升→顶点→下落→伸脚），
      // 跳图的 0-3 是蹲地预备、12 之后是触地恢复，在空中播放会读作"摆着蹲姿飞"。
      // 从边缘走落（vy 从 0 起）与起跳走两套取帧，两者共用同一个跳跃序列
      const vy = this.body.velocity.y;
      const frame = this.airFromJump ? Player.airFrame(vy) : Player.dropFrame(vy);
      this.setPose(Player.JUMP_SHEET, frame, JUMP_SCALE, GROUND_SOLE);
      this.stepTimer = 0;
    } else if (speedRatio > 0.08 || this.scene.time.now < this.runHoldUntil) {
      // 地面奔跑：年年 16 帧跑步循环，帧率随移速微调减少滑步。
      // 换向时 vx 必须穿过 0（约半帧低于阈值）：这段保持期内不切动画，避免循环重启
      if (speedRatio > 0.08) this.runHoldUntil = this.scene.time.now + Player.RUN_HOLD_MS;
      this.playAnim(Player.RUN_ANIM);
      // 奔跑逐帧的脚底在 140-153 之间（f4/f10/f11 是腾空腿收起的帧），但头顶恒在 y=9，
      // 说明美术是按“身体不动、腿动”画的：逐帧对齐会把身体顶得上下抽动，
      // 所以整条 run 只用一条脚底线，读作脚在动而不是人在蹦。
      this.setPose(Player.RUN_SHEET, null, SPRITE_SCALE, GROUND_SOLE);
      const rate = Phaser.Math.Clamp(speedRatio * 1.15, 0.8, 1.35);
      if (this.sprite.anims.isPlaying) {
        this.sprite.anims.timeScale = rate;
      }
      this.stepTimer -= delta * rate;
      if (this.stepTimer <= 0) {
        this.stepTimer = Player.STEP_INTERVAL_MS;
        this.opts.sfx?.step();
      }
    } else {
      // 地面静止：跳图第 0 帧是干净的静立姿（双臂垂下、双脚落地），不会像跑图跨步帧那样像"卡住"；
      // 脚底按它自己的 146 对齐，再叠一层呼吸，否则切换过来会悬空 4.8px 且完全静止
      if (this.sprite.anims.isPlaying) {
        this.sprite.anims.stop();
      }
      this.currentAnim = 'idle';
      this.setPose(Player.IDLE_SHEET, Player.IDLE_FRAME, JUMP_SCALE, IDLE_SOLE);
      this.applyIdleBreath();
      this.stepTimer = 0;
    }

    // 下落纵向伸展（压扁 tween 进行中不覆盖；2026-09-24 上限 0.1→0.05：原幅度像被拽长）
    if (!onGround && !this.squashing) {
      const targetY = 1 + Math.min(0.05, Math.max(0, this.body.velocity.y - 150) / 5500);
      this.view.scaleY += (targetY - this.view.scaleY) * Math.min(1, delta * 0.01);
    }
    // 兜底收敛 1（任何状态都做）：view 上已经没有 tween 在跑时，说明压扁已经结束。
    // `squashing` 是个手写标志，tween 被 kill（抓鸥/冻结/重生/换向）时它不会自己复位，
    // 一卡住就会同时坏两件事：拉伸分支永远不跑 + 缩放永远回不到 1（实测卡在 1.02/0.97）。
    // 所以用「view 上真的还有没有 tween」当唯一真相，让标志自愈。
    if (!this.scene.tweens.isTweening(this.view)) {
      this.squashing = false;
      if (this.view.scaleX !== this.facing) this.view.scaleX = this.facing;
    }
    // 兜底收敛 2：站在地上且没有压扁动画时，纵向缩放收向 1
    if (onGround && !this.squashing && this.view.scaleY !== 1) {
      this.view.scaleY += (1 - this.view.scaleY) * Math.min(1, delta * 0.02);
      if (Math.abs(this.view.scaleY - 1) < 0.002) this.view.scaleY = 1;
    }

    // 前倾：地面跑动时身体向移动方向倾约 3–4°，起步浅、全速深；空中/抓藤回正
    //（挂在 view 上而非 sprite；抓藤时由绳角接管旋转。2026-09-24 自 5.7° 收敛：
    // 叠加跑步帧自带的姿态倾斜后目测 ~10°+，读作"扑出去"）
    if (!this.attachedVine) {
      const leanTarget = onGround ? this.facing * speedRatio * 0.06 : 0;
      this.view.rotation += (leanTarget - this.view.rotation) * Math.min(1, delta * 0.008);
    }
  }

  /** 播放地面循环动画：同一 key 在播时早返回（必须先 stop，见下面的注释） */
  private playAnim(key: string): void {
    if (!this.scene.anims.exists(key)) {
      return;
    }
    if (this.currentAnim === key && this.sprite.anims.isPlaying) {
      return;
    }
    this.currentAnim = key;
    // 必须先 stop：sprite.play(key, true)（ignoreIfPlaying）在已有循环动画在播时会被
    // 整段忽略，而 currentAnim 已写成新 key → 之后永远早返回，角色就卡在抓取帧上原地
    // 滑行（“怎么是静态的不动了”）
    this.sprite.anims.stop();
    this.sprite.play(key);
  }

  private isDown(name: string): boolean {
    return this.keys[name]?.isDown ?? false;
  }

  private justPressed(name: string): boolean {
    const key = this.keys[name];
    return key ? Phaser.Input.Keyboard.JustDown(key) : false;
  }

  private justReleased(name: string): boolean {
    const key = this.keys[name];
    return key ? Phaser.Input.Keyboard.JustUp(key) : false;
  }
}
