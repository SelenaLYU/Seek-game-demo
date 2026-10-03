import Phaser from 'phaser';
import { logicalWorldViewportWidth, BASE_HEIGHT, BASE_WIDTH } from '../systems/Resolution';

/** 右上角 DOM 音乐开关的 id（与 MusicToggleUI 的 ROOT_ID 对齐，见下方 layout 注释） */
const MUSIC_TOGGLE_DOM_ID = 'seek-music-toggle';

/**
 * scrollFactor 0 层的屏幕补偿量。
 *
 * 相机 zoom 同样作用于 sf0 对象：渲染位置 = camOrigin + zoom * (p - camOrigin)，
 * 于是整层的 p=0 被推到 camOrigin*(1 - 1/zoom)——dpr>1 或非 16:9 视口下这一偏移
 * 轻易上百像素，表现就是整个 HUD 跑到屏幕外。把 sf0 容器平移这个量之后：
 * 逻辑坐标 0 落在屏幕 0，且 1 逻辑单位 = zoom 个缓冲像素（与场景世界单位一致），
 * 因此 HUD 用 logicalWorldViewportWidth() 排布即可横向铺满画布。
 *
 * 森林的 statusText / 触屏键 / 帮助弹窗同属 sf0 层，需要同一补偿。
 */
export function screenSpaceOrigin(scene: Phaser.Scene): { x: number; y: number } {
  const cam = scene.cameras.main;
  const originX = cam.width * cam.originX;
  const originY = cam.height * cam.originY;
  return {
    x: originX * (1 - 1 / Math.max(cam.zoomX, 1e-6)),
    y: originY * (1 - 1 / Math.max(cam.zoomY, 1e-6)),
  };
}

export interface GameHudConfig {
  scene: Phaser.Scene;
  title: string;
  stageKey: 'forest' | 'room';
  initialScore?: number;
  initialLives?: number;
  initialObjective?: string;
  onPause?: () => void;
  onRestart?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  onPrev?: () => void;
  prevLabel?: string;
  onHelp?: () => void;
  onHome?: () => void;
  /** 只显示操作按钮，隐藏标题、生命、积分、进度与目标。 */
  minimal?: boolean;
}

export interface GameHudHandle {
  setScore: (score: number) => void;
  setLives: (lives: number) => void;
  setProgressPercent: (percent: number, text?: string) => void;
  setObjective: (text: string) => void;
  /** 弹窗（暂停/通关）是否打开：场景据此暂停物理，避免弹窗后角色继续掉进海里 */
  isModalOpen: () => boolean;
  showPauseModal: (options?: { onResume?: () => void; onRestart?: () => void; onHome?: () => void }) => void;
  showLevelClearedModal: (options: {
    title: string;
    description: string;
    score?: number;
    nextLabel: string;
    onNext: () => void;
    onStay?: () => void;
    onRestart?: () => void;
    onHome?: () => void;
  }) => void;
  destroy: () => void;
}

export function createGameHud(config: GameHudConfig): GameHudHandle {
  const { scene, title, initialScore = 0, initialLives = 3, initialObjective = '' } = config;

  let score = initialScore;
  let lives = initialLives;
  let progressPercent = 0;
  let progressLabel = '';
  let objective = initialObjective;
  let activeModal: Phaser.GameObjects.Container | null = null;
  /** 弹窗面板（不含遮罩）：resize 时跟着补偿量重新定位 */
  let activeModalPanel: Phaser.GameObjects.Container | null = null;
  /** 竖屏窄视口降级：生命徽标换成短格式（❤️×3/3），给目标条腾出宽度 */
  let compactHearts = false;

  const root = scene.add.container(0, 0).setScrollFactor(0).setDepth(250);

  // --- 左侧：章节名称与生命值 ---
  const leftGroup = scene.add.container(24, 20);

  const titleBadge = scene.add.text(0, 0, title, {
    fontFamily: 'sans-serif',
    fontSize: '15px',
    color: '#fff5d8',
    backgroundColor: '#162e27e8',
    padding: { x: 10, y: 6 },
  });

  const livesBadge = scene.add.text(0, 32, getHearts(lives), {
    fontFamily: 'sans-serif',
    fontSize: '13px',
    color: '#ff7b7b',
    backgroundColor: '#1b1b1bcc',
    padding: { x: 8, y: 4 },
  });

  leftGroup.add([titleBadge, livesBadge]);

  // --- 中间：积分牌与关卡进度条 ---
  const centerGroup = scene.add.container(BASE_WIDTH / 2, 20);

  const scoreText = scene.add.text(0, 0, `🏆 积分: ${formatNumber(score)}`, {
    fontFamily: 'sans-serif',
    fontSize: '14px',
    color: '#ffefc6',
    backgroundColor: '#352912e8',
    padding: { x: 12, y: 5 },
  }).setOrigin(0.5, 0);

  // 进度条（窄屏降级时换成短版）
  const BAR_W_FULL = 160;
  const BAR_W_COMPACT = 108;
  const barH = 8;
  let barW = BAR_W_FULL;
  const barBg = scene.add.rectangle(0, 34, barW, barH, 0x1a2622, 0.9)
    .setStrokeStyle(1, 0x8ea89a, 0.6)
    .setOrigin(0.5);

  const barFill = scene.add.rectangle(-barW / 2, 34, 0, barH, 0x76cfa4, 1)
    .setOrigin(0, 0.5);

  const barText = scene.add.text(0, 48, '本关进度 0%', {
    fontFamily: 'sans-serif',
    fontSize: '10px',
    color: '#bed5c7',
  }).setOrigin(0.5, 0);

  centerGroup.add([scoreText, barBg, barFill, barText]);

  // --- 右侧：目标与操作按钮集群 ---
  const rightGroup = scene.add.container(BASE_WIDTH - 24, 20);

  const objectiveText = scene.add.text(0, 0, objective, {
    fontFamily: 'sans-serif',
    fontSize: '13px',
    color: '#fff6dd',
    backgroundColor: '#18342ee6',
    padding: { x: 11, y: 6 },
  }).setOrigin(1, 0);

  // 按钮条
  const btnRow = scene.add.container(0, 32);
  /** 按钮条最左端的 x（含按钮自身宽度），供窄屏重叠检测算占用宽度 */
  let rowLeftX = 0;

  const makeBtn = (x: number, label: string, bg: string, hoverBg: string, onClick: () => void) => {
    const btn = scene.add.text(x, 0, label, {
      fontFamily: 'sans-serif',
      fontSize: '12px',
      color: '#fff3d2',
      backgroundColor: bg,
      padding: { x: 8, y: 4 },
    }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
    btn.on('pointerover', () => btn.setBackgroundColor(hoverBg));
    btn.on('pointerout', () => btn.setBackgroundColor(bg));
    btn.on('pointerdown', onClick);
    rowLeftX = Math.min(rowLeftX, x - btn.width);
    return btn;
  };

  let curX = 0;

  if (config.onNext) {
    const nextBtn = makeBtn(curX, config.nextLabel ?? '下一步 →', '#255a49', '#38836a', config.onNext);
    btnRow.add(nextBtn);
    curX -= (nextBtn.width + 6);
  }

  if (config.onPrev) {
    const prevBtn = makeBtn(curX, config.prevLabel ?? '← 上一步', '#243431', '#39534e', config.onPrev);
    btnRow.add(prevBtn);
    curX -= (prevBtn.width + 6);
  }

  if (config.onHelp) {
    const helpBtn = makeBtn(curX, '? 指南', '#374521', '#546b33', config.onHelp);
    btnRow.add(helpBtn);
    curX -= (helpBtn.width + 6);
  }

  const pauseBtn = makeBtn(curX, '⏸ 暂停', '#1f3833', '#2d544c', () => {
    showPauseModal();
  });
  btnRow.add(pauseBtn);

  rightGroup.add([objectiveText, btnRow]);
  root.add([leftGroup, centerGroup, rightGroup]);

  /** 进度条宽度切换（窄屏降级用） */
  const applyBarWidth = (w: number) => {
    barW = w;
    barBg.setSize(w, barH);
    barFill.setX(-w / 2);
    barFill.setSize((w * progressPercent) / 100, barH);
  };

  /** 目标条宽度上限（HUD 没有 wordWrap，文案过长会顶到中栏与音乐开关）：超宽逐级缩字号 */
  const fitObjective = (maxWidth: number, minSize = 10) => {
    let size = 13;
    objectiveText.setFontSize(size);
    while (size > minSize && objectiveText.width > maxWidth) {
      size -= 1;
      objectiveText.setFontSize(size);
    }
  };

  /**
   * 右上角是 DOM 音乐开关（MusicToggleUI，贴 canvas 右上角、永远压在 canvas 之上），
   * 它不在 Phaser 布局里，没法用坐标对齐；只能量一次它的实际位置、换算成逻辑坐标，
   * 只在它真的压在右侧簇（目标条/按钮行）上时把右侧簇整体左移让位。
   * 它以后若挪到别处（比如 CSS 从 top:14px 改到 92px），量不到交叠就完全不动。
   */
  const musicToggleReserve = (vpW: number): number => {
    if (typeof document === 'undefined') return 0;
    const toggle = document.getElementById(MUSIC_TOGGLE_DOM_ID);
    const canvas = scene.game.canvas as HTMLCanvasElement | undefined;
    if (!toggle || !canvas) return 0;
    const box = toggle.getBoundingClientRect();
    const view = canvas.getBoundingClientRect();
    if (view.width <= 0) return 0;
    const perLogical = view.width / vpW; // 1 逻辑单位 = 多少 CSS 像素
    const top = (box.top - view.top) / perLogical;
    const bottom = (box.bottom - view.top) / perLogical;
    const left = (box.left - view.left) / perLogical;
    // 右侧簇纵向占位：目标条 20..48 + 按钮行 52..70（这里放宽到 80）
    if (bottom <= 20 || top >= 80) return 0;
    const overlap = vpW - 24 - left + 6; // 右侧簇右缘让到开关左缘左侧 6px
    return Phaser.Math.Clamp(overlap, 0, vpW * 0.4); // 最多让出 40% 视口，避免把整行挤垮
  };

  // 自适应多分辨率排版（含 sf0 补偿与窄屏降级）
  const updateLayout = () => {
    const vpW = logicalWorldViewportWidth(scene);
    const off = screenSpaceOrigin(scene);
    // 整层补偿：不补的话 dpr>1 / 非 16:9 视口下 HUD 会整体偏出屏幕
    root.setPosition(off.x, off.y);

    // 每次 resize 都从基准态重算，避免反复改窗口时降级层层累积
    titleBadge.setVisible(true);
    compactHearts = false;
    renderLives();
    titleBadge.setY(0);
    livesBadge.setY(32);
    leftGroup.setPosition(24, 20);
    centerGroup.setPosition(vpW / 2, 20);
    rightGroup.setScale(1);
    btnRow.setY(32);
    applyBarWidth(BAR_W_FULL);
    const rightX = vpW - 24 - musicToggleReserve(vpW);
    rightGroup.setPosition(rightX, 20);
    fitObjective(Math.max(120, Math.min(300, vpW * 0.42)));
    leftGroup.setVisible(!config.minimal);
    centerGroup.setVisible(!config.minimal);
    objectiveText.setVisible(!config.minimal);

    // 精简模式只保留右上角按钮。跳过旧 HUD 的三栏避让逻辑，否则隐藏的标题、积分仍会
    // 参与宽度计算，把暂停/指南错误地下沉或缩小。
    if (config.minimal) {
      btnRow.setY(0);
      activeModalPanel?.setPosition(off.x + vpW / 2, off.y + BASE_HEIGHT / 2);
      return;
    }

    // 三簇横向排布：排不下时逐级降级（窄屏/横屏小窗）
    const spans = () => {
      const leftEnd = (titleBadge.visible ? Math.max(titleBadge.width, livesBadge.width) : livesBadge.width) + 24;
      const centerHalf = Math.max(scoreText.width, barW) / 2;
      const rightStart = rightX - Math.max(objectiveText.width, -rowLeftX) * rightGroup.scaleX;
      return { leftEnd, centerStart: vpW / 2 - centerHalf, centerEnd: vpW / 2 + centerHalf, rightStart };
    };
    /** 三簇是否还能排在一条线上（近似：用各簇实际占用宽度比对） */
    const fitsOneRow = () => {
      const s = spans();
      return s.leftEnd <= s.centerStart - 2 && s.centerEnd <= s.rightStart - 2 && s.leftEnd <= s.rightStart - 2;
    };
    if (!fitsOneRow()) {
      // 一级：章节标题与长进度条在窄屏属冗余，先让位；生命徽标上顶到第一行
      titleBadge.setVisible(false);
      livesBadge.setY(0);
      applyBarWidth(BAR_W_COMPACT);
    }
    if (!fitsOneRow()) {
      // 二级：进度簇下沉到第二行，与左右簇竖直分开
      centerGroup.setY(84);
    }
    if (!fitsOneRow()) {
      // 三级：右侧簇整体缩小（目标条与按钮同缩，点击区一并缩小）
      rightGroup.setScale(0.86);
      if (!fitsOneRow()) rightGroup.setScale(0.78);
    }
    if (!fitsOneRow()) {
      // 四级：竖屏手机（逻辑宽 ≈ 280）一行无论如何挤不下，拆三行：
      // 第一行 生命 + 目标条，第二行 按钮，第三行 进度
      compactHearts = true; // 三颗心加分数太宽，换短格式
      renderLives();
      btnRow.setY(36); // 按钮自占第二行
      centerGroup.setY(104); // 进度自占第三行
      // 按钮行右对齐，按锚点到屏幕左缘的可用宽度缩放
      rightGroup.setScale(Math.min(1, (rightX - 8) / Math.max(-rowLeftX, 1)));
      // 目标条与生命徽标同处第一行：按两者之间的可用宽度缩字（下限 8px）
      const firstRowWidth = (rightX - 8 - (livesBadge.width + 24) - 12) / rightGroup.scaleX;
      fitObjective(Math.max(80, firstRowWidth), 8);
    }

    // 弹窗已打开时同步跟手（遮罩固定在 0,0 不动，仍铺满屏幕）
    activeModalPanel?.setPosition(off.x + vpW / 2, off.y + BASE_HEIGHT / 2);
  };
  updateLayout();
  scene.scale.on(Phaser.Scale.Events.RESIZE, updateLayout);

  function getHearts(count: number): string {
    const safeCount = Math.max(0, Math.min(3, count));
    return '❤️ '.repeat(safeCount) + '🖤 '.repeat(3 - safeCount) + `(${safeCount}/3)`;
  }

  /** 窄视口短格式：竖屏下三颗心加分数会把目标条挤出屏幕 */
  function getHeartsCompact(count: number): string {
    return `❤️×${Math.max(0, Math.min(3, count))}/3`;
  }

  function renderLives(): void {
    livesBadge.setText(compactHearts ? getHeartsCompact(lives) : getHearts(lives));
  }

  function formatNumber(n: number): string {
    return n.toLocaleString();
  }

  function setScore(newScore: number): void {
    const next = Math.max(0, newScore);
    if (next === score) return;
    score = next;
    scoreText.setText(`🏆 积分: ${formatNumber(score)}`);
  }

  function setLives(newLives: number): void {
    const next = Math.max(0, Math.min(3, newLives));
    if (next === lives) return;
    lives = next;
    renderLives();
  }

  function setProgressPercent(percent: number, text?: string): void {
    const nextPercent = Phaser.Math.Clamp(percent, 0, 100);
    const nextLabel = text ?? `本关进度 ${Math.round(nextPercent)}%`;
    if (nextPercent === progressPercent && nextLabel === progressLabel) return;
    progressPercent = nextPercent;
    barFill.setSize((barW * progressPercent) / 100, barH);
    progressLabel = nextLabel;
    barText.setText(progressLabel);
  }

  function setObjective(text: string): void {
    if (text === objective) return;
    objective = text;
    objectiveText.setText(text);
    // 文案变长后重新收进可用宽度（否则会顶到中栏/右上角音乐开关）
    fitObjective(Math.max(120, Math.min(300, logicalWorldViewportWidth(scene) * 0.42)));
  }

  /** 关闭当前弹窗（含面板引用）；遮罩固定在 0,0，不随补偿量移动 */
  function closeModal(): void {
    activeModal?.destroy();
    activeModal = null;
    activeModalPanel = null;
  }

  function showPauseModal(options?: { onResume?: () => void; onRestart?: () => void; onHome?: () => void }): void {
    closeModal();
    const vpW = logicalWorldViewportWidth(scene);
    const off = screenSpaceOrigin(scene);
    const modal = scene.add.container(0, 0).setScrollFactor(0).setDepth(320);
    activeModal = modal;

    const mask = scene.add.rectangle(0, 0, 3000, 1000, 0x050e0b, 0.82)
      .setOrigin(0).setInteractive();
    modal.add(mask);

    // 面板要带上 sf0 补偿量，否则会跑到屏幕左上角外（遮罩只盖屏幕，不跟着补）
    const panel = scene.add.container(off.x + vpW / 2, off.y + BASE_HEIGHT / 2);
    activeModalPanel = panel;
    const panelBg = scene.add.rectangle(0, 0, 420, 310, 0x142b23, 0.98)
      .setStrokeStyle(2, 0xe0c98f, 0.9);

    const modalTitle = scene.add.text(0, -112, '— 游戏暂停 —', {
      fontFamily: 'sans-serif', fontSize: '20px', color: '#fff5d8',
    }).setOrigin(0.5);

    const createModalBtn = (y: number, text: string, bg: string, hoverBg: string, action: () => void) => {
      const b = scene.add.text(0, y, text, {
        fontFamily: 'sans-serif', fontSize: '14px', color: '#fff6e4',
        backgroundColor: bg, padding: { x: 20, y: 9 },
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      b.on('pointerover', () => b.setBackgroundColor(hoverBg));
      b.on('pointerout', () => b.setBackgroundColor(bg));
      b.on('pointerdown', action);
      return b;
    };

    const resumeBtn = createModalBtn(-50, '【 继续游戏 】', '#265444', '#387962', () => {
      closeModal();
      options?.onResume?.();
    });

    const restartBtn = createModalBtn(8, '【 重新开始本关 】', '#324736', '#49674f', () => {
      closeModal();
      if (options?.onRestart) options.onRestart();
      else config.onRestart?.();
    });

    const homeBtn = createModalBtn(66, '【 保存并返回主菜单 】', '#2d3330', '#414a45', () => {
      closeModal();
      if (options?.onHome) options.onHome();
      else if (config.onHome) config.onHome();
      else scene.scene.start('menu');
    });

    panel.add([panelBg, modalTitle, resumeBtn, restartBtn, homeBtn]);
    modal.add(panel);
  }

  function showLevelClearedModal(options: {
    title: string;
    description: string;
    score?: number;
    nextLabel: string;
    onNext: () => void;
    onStay?: () => void;
    onRestart?: () => void;
    onHome?: () => void;
  }): void {
    closeModal();
    const vpW = logicalWorldViewportWidth(scene);
    const off = screenSpaceOrigin(scene);
    const modal = scene.add.container(0, 0).setScrollFactor(0).setDepth(330);
    activeModal = modal;

    const mask = scene.add.rectangle(0, 0, 3000, 1000, 0x06110d, 0.85)
      .setOrigin(0).setInteractive();
    modal.add(mask);

    const panel = scene.add.container(off.x + vpW / 2, off.y + BASE_HEIGHT / 2);
    activeModalPanel = panel;
    const panelBg = scene.add.rectangle(0, 0, 480, 340, 0x142b23, 0.98)
      .setStrokeStyle(2, 0xf0d88e, 0.95);

    const modalTitle = scene.add.text(0, -125, options.title, {
      fontFamily: 'sans-serif', fontSize: '20px', color: '#fff8e2',
    }).setOrigin(0.5);

    const banner = scene.add.text(0, -82, '⭐⭐⭐ 阶段评价 · 优秀 ⭐⭐⭐', {
      fontFamily: 'sans-serif', fontSize: '13px', color: '#f7d881',
    }).setOrigin(0.5);

    const desc = scene.add.text(0, -32, options.description, {
      fontFamily: 'sans-serif', fontSize: '14px', color: '#d8e7dc', lineSpacing: 5, align: 'center',
    }).setOrigin(0.5);

    const curScore = options.score ?? score;
    const scoreLine = scene.add.text(0, 22, `本阶段累计积分: ${formatNumber(curScore)}`, {
      fontFamily: 'sans-serif', fontSize: '14px', color: '#ffe9b2',
      backgroundColor: '#352c16e8', padding: { x: 12, y: 5 },
    }).setOrigin(0.5);

    const nextBtn = scene.add.text(0, 75, `【 ${options.nextLabel} 】`, {
      fontFamily: 'sans-serif', fontSize: '15px', color: '#fff9e7',
      backgroundColor: '#265444', padding: { x: 22, y: 10 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    nextBtn.on('pointerover', () => nextBtn.setBackgroundColor('#387962'));
    nextBtn.on('pointerout', () => nextBtn.setBackgroundColor('#265444'));
    nextBtn.on('pointerdown', () => {
      closeModal();
      options.onNext();
    });

    const subRow = scene.add.container(0, 130);
    const stayBtn = scene.add.text(-80, 0, '← 留在场景探索', {
      fontFamily: 'sans-serif', fontSize: '12px', color: '#b9ccbf',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    stayBtn.on('pointerover', () => stayBtn.setColor('#ffffff'));
    stayBtn.on('pointerout', () => stayBtn.setColor('#b9ccbf'));
    stayBtn.on('pointerdown', () => {
      closeModal();
      options.onStay?.();
    });

    const homeBtn = scene.add.text(80, 0, '⌂ 返回主菜单', {
      fontFamily: 'sans-serif', fontSize: '12px', color: '#b9ccbf',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    homeBtn.on('pointerover', () => homeBtn.setColor('#ffffff'));
    homeBtn.on('pointerout', () => homeBtn.setColor('#b9ccbf'));
    homeBtn.on('pointerdown', () => {
      closeModal();
      if (options.onHome) options.onHome();
      else scene.scene.start('menu');
    });

    subRow.add([stayBtn, homeBtn]);
    panel.add([panelBg, modalTitle, banner, desc, scoreLine, nextBtn, subRow]);
    modal.add(panel);
  }

  function destroy(): void {
    scene.scale.off(Phaser.Scale.Events.RESIZE, updateLayout);
    closeModal();
    root.destroy();
  }

  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, destroy);

  return {
    setScore,
    setLives,
    setProgressPercent,
    setObjective,
    isModalOpen: () => activeModal !== null,
    showPauseModal,
    showLevelClearedModal,
    destroy,
  };
}
