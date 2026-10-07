import Phaser from 'phaser';
import { completeChapter, wasLastChapterSavePersistent } from '../island/Progress';
import { bilingual, installIslandEnglishStyle } from '../ui/IslandEnglish';

/** Three.js owns its own canvas while this Phaser scene is active. */
export default class IslandScene extends Phaser.Scene {
  constructor() { super('island'); }

  create(data: { completedChapter?: number } = {}): void {
    const completedChapter = Number.isInteger(data.completedChapter)
      && (data.completedChapter ?? 0) >= 1 && (data.completedChapter ?? 0) <= 6
      ? data.completedChapter
      : undefined;
    const didComplete = Boolean(completedChapter && completeChapter(completedChapter));
    const justCompleted = didComplete ? completedChapter : undefined;
    const completionSaved = !didComplete || wasLastChapterSavePersistent();
    let alive = true;
    let dispose: (() => void) | undefined;
    const canvas = this.game.canvas;
    const previousVisibility = canvas.style.visibility;
    const keyboard = this.input.keyboard;
    const previousKeyboard = keyboard?.enabled;
    if (keyboard) keyboard.enabled = false;
    const message = document.createElement('div');
    message.style.cssText = 'position:fixed;inset:0;z-index:1000;display:grid;place-content:center;background:#e5e8e6;color:#263a37;font:18px sans-serif;gap:20px;text-align:center';
    installIslandEnglishStyle();
    const label = document.createElement('p');
    label.innerHTML = bilingual('正在准备记忆之岛…', 'Preparing Memory Island…');
    const back = document.createElement('button');
    back.textContent = 'Back to Home';
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
        completionSaved,
        onHome: () => this.scene.start('menu'),
        onChapter: chapter => {
          if (chapter === 1) this.scene.start('forest');
          else if (chapter === 2) this.scene.start('chapter2');
          else if (chapter === 3) this.scene.start('chapter3-preview');
        },
      });
      canvas.style.visibility = 'hidden';
      message.remove();
    }).catch(error => {
      if (!alive) return;
      console.error(error);
      label.innerHTML = bilingual(
        'The 3D scene could not start. Please check WebGL support and try again from the home screen.',
        'The 3D scene could not start. Check that your browser supports WebGL, or go back and try again.',
      );
    });
  }
}
