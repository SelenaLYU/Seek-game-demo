import Phaser from 'phaser';
import { showAlbumUI, type AlbumHandle } from '../ui/AlbumUI';
import { completedChapters } from '../island/Progress';
import openingVideoUrl from '../../assets/animation/opening.mp4?url';

/** 原文件直接播放，不受游戏相机或高清缓冲倍率影响。 */
export default class IntroScene extends Phaser.Scene {
  constructor() { super('intro'); }

  create(): void {
    const root = document.createElement('div');
    root.style.cssText = 'position:fixed;inset:0;z-index:2000;background:#100f0d;display:flex;align-items:center;justify-content:center';
    const video = document.createElement('video');
    video.src = openingVideoUrl;
    video.playsInline = true;
    video.preload = 'auto';
    video.style.cssText = 'display:block;object-fit:contain';
    const sizeVideo = () => {
      const width = video.videoWidth || 760;
      const height = video.videoHeight || 420;
      // 按完整视口等比例适配；按钮覆盖在画面上，不占用视频空间。
      const scale = Math.max(0.01, Math.min(innerWidth / width, innerHeight / height));
      video.style.width = width * scale + 'px';
      video.style.height = height * scale + 'px';
    };
    video.addEventListener('loadedmetadata', sizeVideo);
    window.addEventListener('resize', sizeVideo);
    sizeVideo();
    root.append(video);
    const button = (label: string, position: string, action: () => void) => {
      const element = document.createElement('button');
      element.type = 'button';
      element.textContent = label;
      element.style.cssText = 'position:absolute;' + position + ';padding:10px 18px;border:1px solid rgba(233,213,173,.45);border-radius:6px;background:rgba(66,59,47,.55);color:#f5e8cc;font:15px/1.4 Georgia,"STSong","Microsoft YaHei",serif;letter-spacing:2px;cursor:pointer;backdrop-filter:blur(8px)';
      element.addEventListener('click', action);
      root.append(element);
      return element;
    };
    let leaving = false;
    const proceed = () => {
      if (leaving) return;
      leaving = true;
      this.scene.start('loading');
    };
    let album: AlbumHandle | undefined;
    button('← 返回菜单', 'left:24px;top:22px', () => this.scene.start('menu'));
    button('相册', 'left:24px;bottom:24px', () => {
      if (album) return;
      video.pause();
      album = showAlbumUI({ completed: completedChapters(), onClose: () => {
        album = undefined;
        void video.play().catch(() => { play.hidden = false; });
      } });
    });
    button('跳过动画 →', 'right:24px;bottom:24px', proceed);
    const play = button('播放动画', 'left:50%;top:50%;transform:translate(-50%,-50%)', () => {
      void video.play().then(() => { play.hidden = true; }).catch(() => { play.hidden = false; });
    });
    play.hidden = true;
    video.addEventListener('ended', proceed);
    document.body.append(root);
    void video.play().catch(() => { play.hidden = false; });
    this.input.keyboard?.once('keydown-SPACE', proceed);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      video.pause();
      video.removeAttribute('src');
      video.load();
      root.remove();
      album?.close();
      window.removeEventListener('resize', sizeVideo);
      this.input.keyboard?.off('keydown-SPACE', proceed);
    });
  }
}
