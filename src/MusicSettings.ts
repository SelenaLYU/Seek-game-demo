import Phaser from 'phaser';

const STORAGE_KEY = 'seek-background-music-enabled';
const activeMusic = new Set<Phaser.Sound.BaseSound>();
const temporarilyPausedMusic = new Set<Phaser.Sound.BaseSound>();

function readInitialState(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

let musicEnabled = readInitialState();

export function isBackgroundMusicEnabled(): boolean {
  return musicEnabled;
}

export function setBackgroundMusicEnabled(enabled: boolean): void {
  musicEnabled = enabled;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(enabled));
  } catch {
    // The in-memory preference still works when storage is unavailable.
  }

  for (const music of activeMusic) {
    if (!enabled && music.isPlaying) music.pause();
    if (enabled) resumeBackgroundMusicIfAllowed(music);
  }
}

function resumeBackgroundMusicIfAllowed(music: Phaser.Sound.BaseSound): void {
  if (!musicEnabled || temporarilyPausedMusic.has(music) || music.manager.locked) return;
  if (music.isPaused) music.resume();
  else if (!music.isPlaying) music.play();
}

export function registerBackgroundMusic(music: Phaser.Sound.BaseSound): () => void {
  activeMusic.add(music);
  if (!musicEnabled && music.isPlaying) music.pause();
  return () => {
    activeMusic.delete(music);
    temporarilyPausedMusic.delete(music);
  };
}

export function setBackgroundMusicTemporarilyPaused(
  music: Phaser.Sound.BaseSound,
  paused: boolean,
): void {
  if (paused) {
    temporarilyPausedMusic.add(music);
    if (music.isPlaying) music.pause();
  } else {
    temporarilyPausedMusic.delete(music);
    resumeBackgroundMusicIfAllowed(music);
  }
}
