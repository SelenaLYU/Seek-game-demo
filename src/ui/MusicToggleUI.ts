import Phaser from 'phaser';
import { isBackgroundMusicEnabled, setBackgroundMusicEnabled } from '../MusicSettings';

const STYLE_ID = 'seek-music-toggle-style';
const ROOT_ID = 'seek-music-toggle';

export function createMusicToggleUI(game: Phaser.Game): void {
  document.getElementById(ROOT_ID)?.remove();
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${ROOT_ID} {
        position: fixed; top: 14px; right: 14px; z-index: 2000;
        min-width: 92px; padding: 8px 12px;
        border: 1px solid rgba(239,220,174,.42); border-radius: 8px;
        color: #f5e8c8; background: rgba(17,25,21,.78);
        box-shadow: 0 3px 12px rgba(0,0,0,.22);
        font: 13px/1.2 Arial, "Microsoft YaHei", sans-serif;
        cursor: pointer; backdrop-filter: blur(5px);
      }
      #${ROOT_ID}:hover, #${ROOT_ID}:focus-visible {
        color: #fff5d8; border-color: rgba(255,239,196,.82); outline: none;
      }
      @media (max-width: 520px) {
        #${ROOT_ID} { top: 8px; right: 8px; min-width: 76px; padding: 7px 9px; }
      }
    `;
    document.head.append(style);
  }

  const button = document.createElement('button');
  button.id = ROOT_ID;
  button.type = 'button';

  const render = () => {
    const enabled = isBackgroundMusicEnabled();
    button.textContent = enabled ? '♫ 音乐：开' : '♫ 音乐：关';
    button.setAttribute('aria-label', enabled ? '关闭背景音乐' : '开启背景音乐');
    button.setAttribute('aria-pressed', String(enabled));
    button.title = enabled ? '关闭背景音乐' : '开启背景音乐';
  };

  button.addEventListener('click', () => {
    setBackgroundMusicEnabled(!isBackgroundMusicEnabled());
    render();
  });
  render();
  document.body.append(button);

  game.events.once(Phaser.Core.Events.DESTROY, () => {
    button.remove();
    document.getElementById(STYLE_ID)?.remove();
  });
}
