import Phaser from 'phaser';
import { fitCanvasDomOverlay } from './CanvasDomLayout';

export interface RoomInventoryItem {
  id: string;
  /** 没有图片时使用的简短占位字符。 */
  glyph: string;
  imageUrl?: string;
  iconUrl?: string;
  /** 从整张图片中裁出一个网格区域作为物品图标。 */
  imageCrop?: {
    column: number;
    row: number;
    columns: number;
    rows: number;
  };
  label: string;
}

export interface RoomInventoryUIOptions {
  maxSlots?: number;
  idleCollapseMs?: number;
  onItemSelected?: (item: RoomInventoryItem | null) => void;
}

export interface RoomInventoryUIHandle {
  addItem: (item: RoomInventoryItem) => void;
  removeItem: (id: string) => void;
  hasItem: (id: string) => boolean;
  getSelectedItem: () => RoomInventoryItem | null;
  clearSelection: () => void;
  setExpanded: (expanded: boolean) => void;
  destroy: () => void;
  element: HTMLDivElement;
}

const WIDTH = 960;
const HEIGHT = 540;
const STYLE_ID = 'seek-room-inventory-style';
const activeInventories = new WeakMap<Phaser.Scene, RoomInventoryUIHandle>();

function installStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .seek-room-inventory {
      position: fixed; width: 960px; height: 540px; z-index: 1120; overflow: hidden;
      transform-origin: top left; pointer-events: none; user-select: none;
      font-family: Arial, "Microsoft YaHei", sans-serif;
    }
    .seek-room-inventory * { box-sizing: border-box; }
    .seek-room-inventory__drawer {
      position: absolute; right: 14px; bottom: 14px; width: 330px; height: 56px;
      display: flex; align-items: stretch;
      transform: translateX(0); opacity: 1;
      transition: right 400ms cubic-bezier(.22,.82,.24,1),
                  transform 400ms cubic-bezier(.22,.82,.24,1),
                  opacity 220ms ease;
      pointer-events: auto;
    }
    .seek-room-inventory.is-empty .seek-room-inventory__drawer {
      opacity: 0; transform: translateX(0) translateY(12px); pointer-events: none;
    }
    .seek-room-inventory.is-collapsed .seek-room-inventory__drawer {
      right: 0;
      height: 34px;
      transform: translateX(calc(100% - 28px));
    }
    .seek-room-inventory.is-collapsed .seek-room-inventory__toggle { width: 28px; height: 34px; }
    .seek-room-inventory__shelf {
      width: 294px; height: 56px; padding: 5px 6px;
      display: flex; align-items: center; gap: 4px;
      border: 1px solid rgba(239,220,174,.22); border-left: 0;
      border-radius: 0 8px 8px 0;
      background: linear-gradient(180deg, rgba(33,39,34,.64), rgba(16,23,20,.72));
      -webkit-backdrop-filter: blur(5px); backdrop-filter: blur(5px);
      box-shadow: 0 5px 18px rgba(4,10,8,.20), inset 0 1px rgba(255,250,229,.06);
    }
    .seek-room-inventory__slot {
      position: relative; width: 67px; height: 46px; flex: none;
      display: flex; align-items: center; justify-content: center;
      border: 1px solid rgba(233,216,176,.18); border-radius: 5px;
      background: rgba(225,218,192,.035);
      box-shadow: inset 0 1px 5px rgba(0,0,0,.18);
      color: rgba(242,229,196,.26);
    }
    .seek-room-inventory__slot::after {
      content: ''; position: absolute; inset: 3px; border-radius: 3px;
      border: 1px dashed rgba(244,228,187,.055); pointer-events: none;
    }
    .seek-room-inventory__slot-number {
      position: absolute; top: 3px; left: 5px; font: 8px/1 Georgia, serif;
      color: rgba(238,222,186,.22);
    }
    .seek-room-inventory__item {
      position: absolute; inset: 2px; z-index: 1; border: 0; border-radius: 4px;
      display: flex; align-items: center; justify-content: center;
      overflow: hidden;
      padding: 1px; color: rgba(247,233,198,.88); cursor: pointer;
      background: linear-gradient(145deg, rgba(108,100,76,.38), rgba(55,61,50,.36));
      box-shadow: 0 2px 6px rgba(0,0,0,.14);
      transition: border-color 150ms ease, box-shadow 150ms ease, transform 150ms ease;
    }
    .seek-room-inventory__item:hover,
    .seek-room-inventory__item:focus-visible {
      outline: none; transform: translateY(-1px);
      box-shadow: 0 3px 13px rgba(0,0,0,.22), 0 0 0 1px rgba(242,214,150,.42);
    }
    .seek-room-inventory__item.is-selected {
      box-shadow: 0 2px 8px rgba(0,0,0,.20), 0 0 0 1px #d9bc79,
                  0 0 8px rgba(244,211,134,.22);
    }
    .seek-room-inventory__item.is-arriving {
      animation: seek-inventory-drop 620ms cubic-bezier(.19,.9,.26,1.18) both;
    }
    .seek-room-inventory__glyph {
      width: 100%; height: 100%; display: grid; place-items: center;
      border: 0; background: transparent; font: 700 22px/1 Georgia, serif;
      text-shadow: 0 1px 3px rgba(0,0,0,.45);
    }
    .seek-room-inventory__item-image {
      width: calc(100% - 2px); height: calc(100% - 2px); object-fit: contain; pointer-events: none;
      filter: drop-shadow(0 1px 3px rgba(0,0,0,.42));
    }
    .seek-room-inventory__item-image.is-cropped {
      position: absolute; max-width: none; max-height: none; object-fit: fill;
      filter: none;
    }
    .seek-room-inventory__label {
      display: none;
    }
    .seek-room-inventory__toggle {
      width: 36px; height: 56px; flex: none; border: 1px solid rgba(239,220,174,.22);
      border-radius: 8px 0 0 8px; color: rgba(243,223,173,.82); cursor: pointer;
      background: linear-gradient(180deg, rgba(62,68,55,.72), rgba(24,31,27,.78));
      box-shadow: -4px 5px 15px rgba(4,10,8,.17), inset 0 1px rgba(255,250,229,.06);
      font: 18px/1 Georgia, serif; transition: color 150ms ease, background 150ms ease;
    }
    .seek-room-inventory__toggle:hover,
    .seek-room-inventory__toggle:focus-visible {
      color: #fff4d6; background: linear-gradient(180deg, rgba(79,82,63,.97), rgba(29,38,32,.98));
      outline: none;
    }
    .seek-room-inventory__toggle span {
      display: inline-block; transform: rotate(180deg); transition: transform 300ms ease;
    }
    .seek-room-inventory.is-collapsed .seek-room-inventory__toggle span { transform: rotate(0deg); }
    @keyframes seek-inventory-drop {
      0% { opacity: 0; transform: translateY(-56px) scale(.82) rotate(-4deg); }
      64% { opacity: 1; transform: translateY(4px) scale(1.03) rotate(1deg); }
      100% { opacity: 1; transform: translateY(0) scale(1) rotate(0); }
    }
    @media (prefers-reduced-motion: reduce) {
      .seek-room-inventory__drawer, .seek-room-inventory__item,
      .seek-room-inventory__toggle span { transition-duration: 1ms !important; }
      .seek-room-inventory__item.is-arriving { animation-duration: 1ms !important; }
    }
  `;
  document.head.append(style);
}

export function createRoomInventoryUI(
  scene: Phaser.Scene,
  options: RoomInventoryUIOptions = {},
): RoomInventoryUIHandle {
  activeInventories.get(scene)?.destroy();
  installStyle();

  const maxSlots = Math.max(1, options.maxSlots ?? 4);
  const idleCollapseMs = Math.max(1000, options.idleCollapseMs ?? 4200);

  const root = document.createElement('div');
  root.className = 'seek-room-inventory is-empty';
  root.innerHTML = `
    <div class="seek-room-inventory__drawer">
      <button class="seek-room-inventory__toggle" type="button" aria-label="收起/展开物品栏"><span>›</span></button>
      <div class="seek-room-inventory__shelf"></div>
    </div>
  `;

  const drawer = root.querySelector<HTMLDivElement>('.seek-room-inventory__drawer')!;
  const toggle = root.querySelector<HTMLButtonElement>('.seek-room-inventory__toggle')!;
  const shelf = root.querySelector<HTMLDivElement>('.seek-room-inventory__shelf')!;

  const items: RoomInventoryItem[] = [];
  let selectedId: string | null = null;
  let collapseTimer: number | null = null;
  let destroyed = false;

  const clearCollapseTimer = () => {
    if (collapseTimer !== null) {
      window.clearTimeout(collapseTimer);
      collapseTimer = null;
    }
  };

  const scheduleCollapse = () => {
    clearCollapseTimer();
    collapseTimer = window.setTimeout(() => {
      setExpanded(false);
    }, idleCollapseMs);
  };

  const setExpanded = (expanded: boolean) => {
    root.classList.toggle('is-collapsed', !expanded);
    toggle.setAttribute('aria-expanded', String(expanded));
  };

  const selectItem = (id: string) => {
    selectedId = selectedId === id ? null : id;
    render();
    const current = items.find(item => item.id === selectedId) ?? null;
    options.onItemSelected?.(current);
    scheduleCollapse();
  };

  const render = (arrivingId?: string) => {
    shelf.innerHTML = '';
    for (let slotIndex = 0; slotIndex < maxSlots; slotIndex += 1) {
      const slot = document.createElement('div');
      slot.className = 'seek-room-inventory__slot';
      const slotNumber = document.createElement('span');
      slotNumber.className = 'seek-room-inventory__slot-number';
      slotNumber.textContent = String(slotIndex + 1);
      slot.append(slotNumber);
      shelf.append(slot);
    }

    const slots = shelf.querySelectorAll<HTMLDivElement>('.seek-room-inventory__slot');
    items.forEach((item, index) => {
      const slot = slots[index];
      if (!slot) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'seek-room-inventory__item';
      if (item.id === selectedId) button.classList.add('is-selected');
      if (item.id === arrivingId) button.classList.add('is-arriving');
      button.dataset.itemId = item.id;
      button.setAttribute('aria-label', item.label);
      const imgSrc = item.imageUrl || item.iconUrl;
      const icon = imgSrc
        ? Object.assign(document.createElement('img'), {
            className: 'seek-room-inventory__item-image',
            src: imgSrc,
            alt: '',
          })
        : Object.assign(document.createElement('span'), {
            className: 'seek-room-inventory__glyph',
            textContent: item.glyph,
          });
      if (icon instanceof HTMLImageElement && item.imageCrop) {
        const { column, row, columns, rows } = item.imageCrop;
        icon.classList.add('is-cropped');
        icon.style.width = `${columns * 100}%`;
        icon.style.height = `${rows * 100}%`;
        icon.style.left = `${-column * 100}%`;
        icon.style.top = `${-row * 100}%`;
      }
      icon.setAttribute('aria-hidden', 'true');
      const label = document.createElement('span');
      label.className = 'seek-room-inventory__label';
      label.textContent = item.label;
      button.append(icon, label);
      button.addEventListener('click', () => selectItem(item.id));
      slot.append(button);
      if (item.id === arrivingId) {
        window.setTimeout(() => button.classList.remove('is-arriving'), 700);
      }
    });
    root.classList.toggle('is-empty', items.length === 0);
  };

  const addItem = (item: RoomInventoryItem) => {
    if (destroyed) return;
    const existing = items.findIndex(entry => entry.id === item.id);
    if (existing >= 0) {
      items[existing] = item;
      render();
      setExpanded(true);
      scheduleCollapse();
      return;
    }
    if (items.length >= maxSlots) return;
    items.push(item);
    render(item.id);
    setExpanded(true);
    scheduleCollapse();
  };

  const removeItem = (id: string) => {
    if (destroyed) return;
    const index = items.findIndex(item => item.id === id);
    if (index < 0) return;
    items.splice(index, 1);
    if (selectedId === id) {
      selectedId = null;
      options.onItemSelected?.(null);
    }
    render();
    if (items.length === 0) clearCollapseTimer();
    else scheduleCollapse();
  };

  toggle.addEventListener('click', () => {
    setExpanded(root.classList.contains('is-collapsed'));
    if (!root.classList.contains('is-collapsed')) scheduleCollapse();
    else clearCollapseTimer();
  });

  drawer.addEventListener('pointerenter', () => clearCollapseTimer());
  drawer.addEventListener('pointerleave', () => {
    if (!root.classList.contains('is-collapsed')) scheduleCollapse();
  });

  const position = () => {
    fitCanvasDomOverlay(scene, root, WIDTH, HEIGHT, 'right');
  };

  const onShutdown = () => handle.destroy();

  document.body.append(root);
  position();
  render();
  setExpanded(true);
  scheduleCollapse();
  scene.scale.on(Phaser.Scale.Events.RESIZE, position);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, onShutdown);

  const handle: RoomInventoryUIHandle = {
    addItem,
    removeItem,
    hasItem: id => items.some(item => item.id === id),
    getSelectedItem: () => items.find(item => item.id === selectedId) ?? null,
    clearSelection: () => {
      selectedId = null;
      render();
      options.onItemSelected?.(null);
    },
    setExpanded,
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      clearCollapseTimer();
      scene.scale.off(Phaser.Scale.Events.RESIZE, position);
      scene.events.off(Phaser.Scenes.Events.SHUTDOWN, onShutdown);
      root.remove();
      activeInventories.delete(scene);
    },
    element: root,
  };

  activeInventories.set(scene, handle);
  return handle;
}
