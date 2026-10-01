import Phaser from 'phaser';
import { completeChapter } from '../island/Progress';

/** Three.js owns its own canvas while this Phaser scene is active. */
export default class IslandScene extends Phaser.Scene {
  constructor() { super('island'); }

  create(data: { completedChapter?: number } = {}): void {
    const completedChapter = Number.isInteger(data.completedChapter)
      && (data.completedChapter ?? 0) >= 1 && (data.completedChapter ?? 0) <= 6
      ? data.completedChapter
      : undefined;
    const justCompleted = completedChapter && completeChapter(completedChapter)
      ? completedChapter
      : undefined;
    let alive = true;
    let dispose: (() => void) | undefined;
    const canvas = this.game.canvas;
    const previousVisibility = canvas.style.visibility;
    const keyboard = this.input.keyboard;
    const previousKeyboard = keyboard?.enabled;
    if (keyboard) keyboard.enabled = false;
    const message = document.createElement('div');
    message.style.cssText = 'position:fixed;inset:0;z-index:1000;display:grid;place-content:center;background:#e5e8e6;color:#263a37;font:18px sans-serif;gap:20px;text-align:center';
    const label = document.createElement('p');
    label.textContent = '正在准备记忆之岛…';
    const back = document.createElement('button');
    back.textContent = '返回首页';
    back.onclick = () => this.scene.start('menu');
    message.append(label, back);
    document.body.append(message);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      alive = false;
      dispose?.();
      message.remove();
      canvas.style.visibility = previousVisibility;
      if (keyboard && previousKeyboard !== undefined) keyboard.enabled = previousKeyboard;
    });
    void import('../island/MemoryIsland').then(({ mountMemoryIsland }) => {
      if (!alive) return;
      dispose = mountMemoryIsland({
        justCompleted,
        onHome: () => this.scene.start('menu'),
        onChapter: chapter => {
          if (chapter === 1) this.scene.start('forest');
          else if (chapter === 2) this.scene.start('chapter2');
        },
      });
      canvas.style.visibility = 'hidden';
      message.remove();
    }).catch(error => {
      if (!alive) return;
      console.error(error);
      label.textContent = '3D场景未能启动，请确认浏览器支持 WebGL，或返回首页重试。';
    });
  }
}
