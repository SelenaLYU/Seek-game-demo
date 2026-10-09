import Phaser from 'phaser';
import { applyHDCamera, BASE_HEIGHT, BASE_WIDTH, bufferScaleOf } from '../systems/Resolution';
import {
  loadChapterOneRoomProgress,
  hasSavedProgress,
  clearSavedProgress,
  type ChapterOneRoomProgress,
} from '../gameplay/ChapterOneRoomProgress';
import menuBackgroundUrl from '../../assets/ui/menu-main-v1.png?url';
import { resolveImageUrl } from '../assets';
import { completedChapters } from '../island/Progress';
import { isMusicAudible, onMusicAudibleChange, setBackgroundMusicEnabled } from '../MenuRoomMusic';

/**
 * 封面图（menu-main-v1.png）里画死了中文按钮，代码只叠透明热区。
 * 这里补一层英文：**不动机位、不覆盖中文**，在每块底板内、中文正下方叠一行小字。
 *
 * `y` 是点击热区中心，必须与 create() 里的 createMenuHitArea 一一对应。
 * `labelY` 是英文的落点 —— **这是量出来的，不是估的**：
 * 扫 menu-main-v1.webp 的像素得到每块底板和中文的实际边界，取「中文下沿 ↔ 底板下沿」
 * 这条空带的中点。四块底板高度并不完全一致（39 / 38.4 / 38.4 / 38.9），
 * 所以不能用一个统一的偏移量：用 +12.4 会让「玩法说明」的 y 降部压到底板下边框。
 *
 * 空带只有 ~12px，8px 字号 + 10px 行高已经基本占满（上下各剩 ~1px）。
 * **再想宽松就只能重导封面图、把底板做高**，靠调字号/位置已经无解。
 */
const MENU_LABELS: ReadonlyArray<{ y: number; labelY: number; en: string }> = [
  { y: 292, labelY: 304.6, en: 'New Game' },
  { y: 341, labelY: 353.4, en: 'Continue' },
  { y: 390, labelY: 402.5, en: 'Stage Select' },
  { y: 440, labelY: 451.3, en: 'How to Play' },
];

/**
 * 右上角音乐胶囊。封面图里画死了「♪ 音乐：开」，代码只叠透明热区；
 * 点一下要让**这几个字本身**变成「关」，而不是在旁边另起一行提示。
 * 所以先用胶囊底色盖掉画死的那几个字，再用自己的文本接管开/关。
 *
 * 几何同样是扫 menu-main-v1.webp 像素量出来的（逻辑坐标）：
 *   胶囊 864.7–944.4 × 15.8–49.8；♪ 图标 875–884.2；文字 893.4–932.5 × 25.3–33.9。
 * COVER 左右各留 ~4px 余量盖住原字，同时不碰 ♪（右缘 884.2）和胶囊边框（内缘 ~943）。
 * 底色 0x473b32 是采样得到的 —— 胶囊内部填充很均匀（±2），所以平涂看不出来。
 *
 * `chip` 是整块胶囊（含边框和 ♪）的占位。**正常情况下用不到它** —— 只在
 * 「cover 把顶部裁掉、画死的胶囊会被切」时才拿来重画一个贴住可视区顶边的胶囊，
 * 详见 create() 里 syncMusicChip 的注释。
 */
const MUSIC_LABEL = {
  anchorX: 913,
  anchorY: 29.6,
  cover: { x: 888, y: 22, width: 50, height: 16 },
  fill: 0x473b32,
  chip: { x: 864.7, y: 15.8, width: 79.7, height: 34, radius: 9, stroke: 0xd9c9a6 },
} as const;

/**
 * DOM 覆盖层（玩法说明 / 快速选择）此刻是否开着。
 *
 * 为什么要专门问这一句：Phaser 3 的 `mouseup` 是挂在 **window** 上的，
 * 一次落在覆盖层上的点击同样会被场景里的热区收到 —— 详见 createMenuHitArea 的注释。
 */
function overlayOpen(): boolean {
  return !!document.querySelector('.seek-menu-guide');
}

/** 统一水彩风格游戏主菜单：包含新游戏、继续游戏(读档)、关卡选择、重置存档 */
export default class MenuScene extends Phaser.Scene {
  private savedProgress!: ChapterOneRoomProgress;
  private hasSave = false;
  private guide?: HTMLDivElement;
  /** 快速选择同样是 DOM 覆盖层，跟 guide 一样必须自己收掉 */
  private stageSelect?: HTMLDivElement;

  constructor() {
    super('menu');
  }

  preload(): void {
    // 封面 2.4MB 的 PNG 走 WebP 管线（真源保留，运行时优先同名 webp）。
    if (!this.textures.exists('menu-main-v1')) this.load.image('menu-main-v1', resolveImageUrl(menuBackgroundUrl));
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
    //
    // 注意 `overlayOpen()` 那道闸：Phaser 3 把 `mouseup` 挂在 **window** 上
    // （为了处理在画布外松手的情况），所以一次落在 DOM 覆盖层上的点击，
    // **照样会被这里的热区收到**。实测两个后果：
    //   1. 点快速选择面板底部的「关闭返回」（y≈437，正落在「玩法说明」热区 420–460 内）
    //      → mouseup 先把玩法说明打开，随后 click 才关掉快速选择，屏幕上只剩玩法说明；
    //   2. 点面板中间那些阶段行，会误触 New Game / Continue 的热区直接跳场景。
    // 覆盖层是在 `click` 里才移除的，而 Phaser 处理的是更早的 `mouseup`，
    // 所以「此刻 DOM 上有没有覆盖层」这个判断是可靠的，不需要任何延时。
    const createMenuHitArea = (y: number, enabled: boolean, onClick: () => void) => {
      const hit = this.add.zone(BASE_WIDTH / 2, y, 205, 40).setDepth(20);
      if (enabled) {
        hit.setInteractive({ useHandCursor: true });
        hit.on('pointerup', () => {
          if (overlayOpen()) return;
          onClick();
        });
      }
    };

    // 英文标签：叠在底板内、中文正下方。depth 低于热区，不挡点击。
    for (const label of MENU_LABELS) {
      this.add.text(BASE_WIDTH / 2, label.labelY, label.en, {
        fontFamily: 'Georgia, "Times New Roman", serif',
        fontSize: '8px',
        color: '#e6d5b0',
      })
        .setOrigin(0.5)
        .setLetterSpacing(0.5)
        .setAlpha(.85)
        .setShadow(0, 1, '#120f0a', 1.5, false, true)
        // 同上：不设 resolution 会被相机 zoom 放大成糊字
        .setResolution(Math.max(2, bufferScaleOf(this)))
        .setDepth(10);
    }

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

    // 右上角音乐开关：封面图上的「♪ 音乐：开」是画死的，先盖掉那几个字，
    // 再用自己的文本接管 —— 点击时**这一行字本身**在 Music On / Music Off 之间切。
    //
    // 文案按「**现在有没有在响**」显示，而不是按玩家偏好（isBackgroundMusicEnabled）。
    // 浏览器自动播放策略会拦掉「打开页面就出声」，此时偏好是「开」但一点声音都没有；
    // 显示 Off 反而诚实，而且玩家看到 Off 就会去点一下 —— 那一下正好完成音频解锁。
    // 「盖掉画死的那几个字」的填充块。没被裁时靠它 + 封面自带的 ♪ 和边框。
    const textCover = this.add.graphics()
      .fillStyle(MUSIC_LABEL.fill)
      .fillRect(MUSIC_LABEL.cover.x, MUSIC_LABEL.cover.y, MUSIC_LABEL.cover.width, MUSIC_LABEL.cover.height)
      .setDepth(9);

    // cover 模式（zoom = max(h/540, w/960)）在比 16:9 宽的窗口上会把**上下裁掉**，
    // 裁多少随窗口比例变化：16:9 是 0，1600×800 约 30，1920×940 约 35，1366×640 约 45。
    // 而画死的胶囊在 y 15.8–49.8 —— 整块躺在被裁的带子里，实测 2:1 窗口下
    // 「Music On」只剩下半截（就是「被网页截掉了一半」）。
    //
    // 胶囊底下压着墙面和天空的交界（水彩画），没法用平涂盖掉再整体挪位。
    // 所以做法是：**只在被裁时**重画一个整胶囊（板子 + ♪ + 文字），贴着**可视区顶边**放；
    // 没被裁时一个字都不画，封面原样不动。判定用 cam.worldView.y（可视区顶边在世界里的 y），
    // 窗口比例一变就重算，所以任何窗口下都看得见。
    const chip = MUSIC_LABEL.chip;
    const chipPlate = this.add.graphics().setDepth(11).setVisible(false);
    chipPlate.fillStyle(MUSIC_LABEL.fill, 1);
    chipPlate.fillRoundedRect(0, 0, chip.width, chip.height, chip.radius);
    chipPlate.lineStyle(1.1, chip.stroke, 0.85);
    chipPlate.strokeRoundedRect(0.55, 0.55, chip.width - 1.1, chip.height - 1.1, chip.radius);

    const musicLabel = this.add.text(MUSIC_LABEL.anchorX, MUSIC_LABEL.anchorY, '', {
      fontFamily: 'Georgia, "Times New Roman", serif',
      fontSize: '10px',
      color: '#f7ead4',
    })
      .setOrigin(0.5)
      .setLetterSpacing(0.3)
      // 不设 resolution 的话文本纹理按 1x 生成、再被相机 zoom 放大 → 发糊。
      // 项目里其它场景（RoomScene / ChapterTwoRoomScene）都是这个写法。
      .setResolution(Math.max(2, bufferScaleOf(this)))
      .setDepth(12);

    // 音乐热区（比胶囊大一圈）。被裁时得跟着胶囊一起下移，否则会点到看不见的地方。
    const musicHit = this.add.zone(902, 34, 126, 52).setDepth(20).setInteractive({ useHandCursor: true });

    let chipShifted = false;
    const syncMusicLabel = () => {
      const state = isMusicAudible() ? 'Music On' : 'Music Off';
      // 自绘板子连封面自带的 ♪ 一起盖住了，所以下移时要自己补一个音符。
      musicLabel.setText(chipShifted ? `♫ ${state}` : state);
    };
    /**
     * 把开关摆到「看得见的那块区域」的右上角。
     *
     * 为什么需要这个：`cover` 模式（zoom = max(h/540, w/960)）会把画面裁到只剩可视区，
     * 而封面画死的胶囊贴在 960×540 的右上角（x 864.7–944.4，y 15.8–49.8），**两个方向都会被裁**：
     *   - 比 16:9 **宽**（浏览器最大化最常见）→ 上下裁。1600×800 裁掉顶部 30、1920×940 裁 35、
     *     1366×640 裁 45。胶囊整块躺在这条带子里，实测 2:1 下「Music On」只剩半截。
     *   - 比 16:9 **窄** → 左右裁。1024×768 可视世界只剩 x 120–840，胶囊**完全看不见**（0/79.7）。
     * 两种情况用户都会遇到，所以横竖都要处理。
     *
     * 封面是水彩画、胶囊底下压着墙面和天空的交界，没法平涂盖掉再挪位，
     * 所以策略是：**封面上的胶囊完整可见时完全不干预**（16:9 下与设计稿逐像素一致）；
     * 一旦被裁，就用代码重画一个整胶囊（板子 + ♪ + 文字）贴到可视区右上角。
     *
     * 贴边还是留边距：被裁掉的那一侧要**贴住可视区边缘**，否则画死胶囊露出来的残片会从
     * 重画板子旁边探出来；没被裁的那一侧沿用封面原本的 ~15px 边距。
     */
    const syncMusicChip = () => {
      // 注意不能用 cam.worldView —— 那个矩形只在相机 preRender() 里重算，
      // create() 和 RESIZE 回调里读到的还是上一帧的旧值（实测恒为 0，于是永远判定「没被裁」）。
      // 按定义自己算：相机竖向视野 = cam.height / zoom，横向 = cam.width / zoom，都以画面中心为基准。
      const cam = this.cameras.main;
      const viewW = cam.width / cam.zoom;
      const viewH = cam.height / cam.zoom;
      const left = BASE_WIDTH / 2 - viewW / 2;
      const right = BASE_WIDTH / 2 + viewW / 2;
      const top = BASE_HEIGHT / 2 - viewH / 2;
      const bottom = BASE_HEIGHT / 2 + viewH / 2;

      const bakedFullyVisible =
        left <= chip.x && chip.x + chip.width <= right &&
        top <= chip.y && chip.y + chip.height <= bottom;
      chipShifted = !bakedFullyVisible;

      if (chipShifted) {
        // 画死胶囊有没有残片落在可视区里（横竖分别判断，决定那一侧贴边还是留边距）
        const remnantX = Math.max(chip.x, left) < Math.min(chip.x + chip.width, right);
        const remnantY = Math.max(chip.y, top) < Math.min(chip.y + chip.height, bottom);
        const rightMargin = BASE_WIDTH - (chip.x + chip.width);   // 封面原本的右边距 15.6
        const x = remnantX
          ? Math.max(left, Math.min(chip.x, right - chip.width))
          : Math.max(left, Math.min(chip.x, right - rightMargin - chip.width));
        const y = remnantY ? Math.max(chip.y, top) : Math.max(chip.y, top + chip.y);
        chipPlate.setPosition(x, y);
        musicLabel.setPosition(x + chip.width / 2, y + chip.height / 2);
        musicHit.setPosition(x + chip.width / 2, y + chip.height / 2);
      } else {
        musicLabel.setPosition(MUSIC_LABEL.anchorX, MUSIC_LABEL.anchorY);
        musicHit.setPosition(902, 34);
      }
      chipPlate.setVisible(chipShifted);
      textCover.setVisible(!chipShifted);
      syncMusicLabel();
    };
    syncMusicChip();
    this.scale.on(Phaser.Scale.Events.RESIZE, syncMusicChip);
    // 玩家在别处点一下同样能解锁音乐，文案要跟着变，否则会「明明在放却写着 Off」。
    const unsubscribeMusicLabel = onMusicAudibleChange(syncMusicLabel);

    // 「这一次点击**之前**音乐到底有没有在响」。
    //
    // 为什么要专门记这个：玩家第一次与页面交互时，MenuRoomMusic 的解锁监听
    // （挂在 document 的捕获阶段）会先跑，把被自动播放策略拦住的音乐播起来。
    // 如果热区这时再看 `isMusicAudible()`，拿到的已经是「刚被解锁、正在响」，
    // 取反就会立刻把它关掉 —— 表现就是**点一下反而没声音**。
    // 所以判断依据必须是点击前的状态。window 的捕获阶段先于 document 捕获阶段，
    // 这里拿到的一定是点击前的值。
    let musicWasAudible = false;
    const recordMusicAudible = () => { musicWasAudible = isMusicAudible(); };
    window.addEventListener('pointerdown', recordMusicAudible, true);

    musicHit.on('pointerdown', () => {
      // 覆盖层开着时不要动音乐：点模糊背景关闭面板那一下的落点可能压在这个热区上。
      if (overlayOpen()) return;
      // 按「刚才有没有在响」决定：响着 → 关；没响 → 开。
      // 页面刚打开（音乐被拦、没响）时点一下是「开」，而不是把设置翻成关。
      setBackgroundMusicEnabled(!musicWasAudible);
      syncMusicLabel();
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
      window.removeEventListener('pointerdown', recordMusicAudible, true);
      this.scale.off(Phaser.Scale.Events.RESIZE, syncMusicChip);
      unsubscribeMusicLabel();
      this.guide?.remove();
      this.guide = undefined;
      // 快速选择也是 DOM 覆盖层，不收掉会跟着进下一个场景。
      this.stageSelect?.remove();
      this.stageSelect = undefined;
    });
  }

  /**
   * “How to Play” 与 “Stage Select” 共用同一套覆盖层样式。
   * 所以 CSS 只注入一次。差异全部收在 `.seek-menu-guide--select` 里：
   * 面板更宽（多了右侧说明列）、列表行本身可点。
   */
  private ensureMenuOverlayStyle(): void {
    const styleId = 'seek-menu-guide-style';
    if (document.getElementById(styleId)) return;
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
        box-shadow:0 22px 70px rgba(0,0,0,.48),inset 0 1px rgba(255,255,255,.08);
        max-height:calc(100vh - 36px); overflow:auto; }
      .seek-menu-guide h2 { margin:0 0 24px; text-align:center; font:500 25px/1.2 Georgia,"STSong",serif;
        letter-spacing:.18em; color:#fff0cf; }
      .seek-menu-guide ul { margin:0; padding:0; list-style:none; display:grid; gap:15px; }
      .seek-menu-guide li { padding:11px 14px; border-bottom:1px solid rgba(238,218,179,.16);
        color:rgba(249,237,211,.9); font-size:15px; line-height:1.65; }
      .seek-menu-guide strong { display:inline-block; min-width:130px; padding-right:6px; color:#e9c98f; font-weight:600; }
      .seek-menu-guide__close { display:block; margin:27px auto 0; min-width:150px; padding:10px 22px;
        border:1px solid rgba(244,222,181,.62); border-radius:7px; color:#f8eaca;
        background:rgba(86,96,88,.42); font:16px/1.2 Georgia,"STSong",serif; letter-spacing:.15em; cursor:pointer; }
      .seek-menu-guide__close:hover { background:rgba(104,125,116,.6); }

      /* 快速选择：同一套外观，只是每行是一颗可点的按钮。
         面板宽度**故意不覆盖** —— 保持与玩法说明一模一样。
         （注意 width 是 content-box，520 的内容宽 + 左右 46 内边距 + 1 边框 = 614 实际外宽。）
         行内容宽 = 520 - 左右 14 = 492，留给标签列 170 + 间距 14，说明列还有 308px，
         最长的一条「错落礁石、飞鸥摆荡、限时滚浪、门楣钥匙」约 247px，放得下不折行。 */
      .seek-menu-guide--select ul { gap:0; }
      /* li 在这里只当行容器，内边距与下边框交给里面的按钮，避免与玩法说明的行样式叠加。 */
      .seek-menu-guide--select li { padding:0; border-bottom:0; }
      .seek-menu-guide__row { display:block;
        width:100%; padding:11px 14px; border:0; border-bottom:1px solid rgba(238,218,179,.16);
        background:transparent; color:rgba(249,237,211,.9);
        font:inherit; font-size:15px; line-height:1.65; text-align:left; cursor:pointer;
        transition:background .16s; }
      .seek-menu-guide__row:hover { background:rgba(104,125,116,.3); }
      .seek-menu-guide__row strong { display:block; min-width:0; padding-right:0; }
      /* 说明列不再单独调字号/颜色 —— 直接沿用玩法说明正文的 15px 暖白，
         这样两块面板的排版语言完全一致，只差「标签 + 说明」这个两列结构。 */
      .seek-menu-guide__row span { display:block; min-width:0; }
    `;
    document.head.append(style);
  }

  private openHowToPlay(): void {
    if (this.guide) return;
    this.ensureMenuOverlayStyle();

    const root = document.createElement('div');
    root.className = 'seek-menu-guide';
    root.innerHTML = `
      <div class="seek-menu-guide__blur" data-close></div>
      <section class="seek-menu-guide__panel" aria-label="How to Play">
        <h2>How to Play</h2>
        <ul>
          <li><strong>Move</strong>A / D or the arrow keys to walk, Space to jump.</li>
          <li><strong>Look for Clues</strong>Click objects in the scene and watch for hints.</li>
          <li><strong>Solve Puzzles</strong>Drag, rotate, or trace objects to restore the memory.</li>
          <li><strong>Collect Memories</strong>Recover memory fragments to unlock new rooms.</li>
        </ul>
        <button class="seek-menu-guide__close" type="button" data-close>Back</button>
      </section>`;
    const close = () => { root.remove(); if (this.guide === root) this.guide = undefined; };
    root.querySelectorAll<HTMLElement>('[data-close]').forEach(element => element.addEventListener('click', close));
    document.body.append(root);
    this.guide = root;
  }

  /**
   * 关卡与阶段快速选择：直达任意游玩阶段。
   *
   * 外观与「玩法说明」**完全一致** —— 同一个 `.seek-menu-guide` 覆盖层（模糊底 + 渐变板 +
   * 衬线标题 + 带下边框的列表行 + 同一颗返回按钮），只加 `--select` 修饰类把面板放宽、
   * 让每行可点。原来这里是 Phaser 容器拼的绿色方板，和玩法说明是两套视觉。
   *
   * 改成 DOM 还有个附带好处：文字是浏览器渲染的，天然锐利，
   * 不受 Phaser 文本纹理被相机 zoom 放大发糊的影响。
   */
  private openStageSelectModal(): void {
    if (this.stageSelect) return;
    this.ensureMenuOverlayStyle();

    const stages: Array<{ label: string; sceneKey: string; desc: string }> = [
      { label: 'Prologue · Story', sceneKey: 'intro', desc: 'Hospital montage and the opening of the memory journey' },
      { label: 'Chapter 1 · Seaside Run', sceneKey: 'forest', desc: 'Scattered reefs, swinging gulls, timed surf, and a key above the door' },
      { label: 'Chapter 1 · Memory Room', sceneKey: 'room', desc: 'Photo puzzle, radio tuning, and a three-stroke light-and-shadow boat' },
      { label: 'Chapter Hub · Memory Island', sceneKey: 'island', desc: 'A procedural 3D island where the memory districts light up' },
      { label: 'Chapter 3 · Office Escape', sceneKey: 'chapter3', desc: 'Playable greybox: rush hour, a paper storm, folder flight and a rope descent' },
    ];

    const root = document.createElement('div');
    root.className = 'seek-menu-guide seek-menu-guide--select';
    root.innerHTML = `
      <div class="seek-menu-guide__blur" data-close></div>
      <section class="seek-menu-guide__panel" aria-label="Stage Select">
        <h2>Stage Select</h2>
        <ul>
          ${stages.map(st => `
            <li><button class="seek-menu-guide__row" type="button" data-scene="${st.sceneKey}">
              <strong>${st.label}</strong><span>${st.desc}</span>
            </button></li>`).join('')}
        </ul>
        <button class="seek-menu-guide__close" type="button" data-close>Back</button>
      </section>`;

    const close = () => {
      root.remove();
      if (this.stageSelect === root) this.stageSelect = undefined;
    };
    root.querySelectorAll<HTMLElement>('[data-close]')
      .forEach(element => element.addEventListener('click', close));
    root.querySelectorAll<HTMLElement>('[data-scene]').forEach(element => {
      element.addEventListener('click', () => {
        const sceneKey = element.dataset.scene!;
        // 先收掉覆盖层：scene.start 会触发 SHUTDOWN，但显式关闭更稳妥。
        close();
        this.scene.start(sceneKey);
      });
    });
    document.body.append(root);
    this.stageSelect = root;
  }
}

