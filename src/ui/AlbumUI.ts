import { albumEntries, albumPhotoCount, ALBUM_SIZE } from '../story/Album';

export interface AlbumHandle {
  element: HTMLElement;
  close: () => void;
}

const STYLE_ID = 'seek-album-style';

function installStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .seek-album {
      position: fixed; inset: 0; z-index: 2147483200; display: grid; place-items: center;
      background: rgba(12, 19, 17, .88);
      font-family: Arial, "Microsoft YaHei", sans-serif; color: #f2ead6;
    }
    .seek-album * { box-sizing: border-box; }
    .seek-album__book {
      position: relative; width: min(1040px, 94vw); max-height: 92vh; overflow: auto;
      padding: 26px 30px 30px;
      border: 1px solid rgba(242, 234, 214, .22); border-radius: 14px;
      background: linear-gradient(160deg, rgba(48, 44, 37, .96), rgba(31, 36, 33, .98));
      box-shadow: 0 22px 60px rgba(0, 0, 0, .5);
    }
    .seek-album__head { display: flex; align-items: baseline; gap: 14px; margin-bottom: 20px; }
    .seek-album__title { margin: 0; font-family: Georgia, serif; font-size: 27px; letter-spacing: .16em; font-weight: 500; }
    .seek-album__count { font-size: 13px; color: #cbba95; }
    .seek-album__close {
      margin-left: auto; border: 1px solid rgba(242, 234, 214, .3); border-radius: 20px;
      background: rgba(20, 30, 27, .5); color: #f2ead6; padding: 8px 16px; font: inherit; font-size: 13px; cursor: pointer;
    }
    .seek-album__close:hover, .seek-album__close:focus-visible { background: #f2ead6; color: #26332e; outline: none; }
    .seek-album__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
    .seek-album__card {
      position: relative; border: 1px solid rgba(242, 234, 214, .18); border-radius: 10px;
      background: rgba(240, 232, 212, .06); padding: 13px 15px 15px; min-height: 158px;
      display: flex; flex-direction: column; gap: 6px;
    }
    .seek-album__card--locked { opacity: .5; border-style: dashed; }
    .seek-album__slot { font: 13px/1 Georgia, serif; letter-spacing: .18em; color: #d8c69f; }
    .seek-album__label { font-size: 16px; font-weight: 600; }
    .seek-album__memory { font-size: 13px; color: #cdbf9d; }
    .seek-album__photo {
      margin-top: auto; height: 62px; border-radius: 6px; border: 1px dashed rgba(242, 234, 214, .35);
      display: grid; place-items: center; font-size: 12px; color: #b9ab8c; text-align: center; line-height: 1.5;
    }
    .seek-album__note { margin: 18px 0 0; font-size: 12px; color: #a89b7f; line-height: 1.7; }
    @media (max-width: 820px) { .seek-album__grid { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 560px) { .seek-album__grid { grid-template-columns: 1fr; } .seek-album__book { padding: 18px; } }
  `;
  document.head.append(style);
}

/** 相册骨架：六格章节登记 + 获得状态。正式照片美术接入后只替换卡片内部。 */
export function showAlbumUI(options: { completed: readonly number[]; onClose?: () => void }): AlbumHandle {
  installStyle();
  const abort = new AbortController();
  const { signal } = abort;
  const root = document.createElement('div');
  root.className = 'seek-album';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', '相册');

  const entries = albumEntries(options.completed);
  const cards = entries.map(entry => {
    const card = document.createElement('article');
    card.className = `seek-album__card${entry.unlocked ? '' : ' seek-album__card--locked'}`;
    card.innerHTML = `
      <span class="seek-album__slot">${String(entry.chapter).padStart(2, '0')} / ${String(ALBUM_SIZE).padStart(2, '0')}</span>
      <span class="seek-album__label">${entry.unlocked ? entry.label : '尚未找回'}</span>
      <span class="seek-album__memory">${entry.unlocked ? `记忆物 · ${entry.memory}` : '完成这一段人生后回到这里'}</span>
      <span class="seek-album__photo">${entry.unlocked ? '照片待制作<br>（正式美术接入后替换）' : '&#8203;'}</span>`;
    return card;
  });

  const book = document.createElement('section');
  book.className = 'seek-album__book';
  const head = document.createElement('header');
  head.className = 'seek-album__head';
  head.innerHTML = `<h2 class="seek-album__title">相册</h2>
    <span class="seek-album__count">已收录 ${albumPhotoCount(options.completed)} / ${ALBUM_SIZE} 张</span>`;
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'seek-album__close';
  closeButton.textContent = '合上相册';
  head.append(closeButton);

  const grid = document.createElement('div');
  grid.className = 'seek-album__grid';
  grid.append(...cards);

  const note = document.createElement('p');
  note.className = 'seek-album__note';
  note.textContent = '相册骨架：章节登记与获得状态已接通，正式照片、序章入口和结局揭示待接入。';

  book.append(head, grid, note);
  root.append(book);

  const close = () => {
    if (!root.isConnected) return;
    abort.abort();
    root.remove();
    options.onClose?.();
  };
  closeButton.addEventListener('click', close, { signal });
  root.addEventListener('click', event => { if (event.target === root) close(); }, { signal });
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); close(); }
  }, { signal });

  document.body.append(root);
  closeButton.focus();
  return { element: root, close };
}
