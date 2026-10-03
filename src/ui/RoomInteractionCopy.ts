import Phaser from 'phaser';
import { showRoomText, type RoomTextHandle, type RoomTextOptions } from './RoomTextPanel';
import { resolveImageUrl } from '../assets';
import fishBasinUrl from '../../assets/environment/room-hermit-crab-aquarium-v1.png?url';

/** Call only after the photo puzzle reports success. */
export function showPhotoMemoryText(
  scene: Phaser.Scene,
  completedPhotoUrl: string,
  onClose?: () => void,
): RoomTextHandle {
  return showRoomText(scene, {
    title: '那天的照片',
    imageUrl: completedPhotoUrl,
    imageAlt: '童年海边的完整照片',
    layout: 'photo',
    entries: [{
      text: '那天是韩梅梅第一次见到大海。她有一点点害怕，却又舍不得移开眼睛。爸爸妈妈陪着她站在浅水里，海风把笑声吹得很远。',
    }],
    onClose,
  });
}

export function showFishBasinText(scene: Phaser.Scene): RoomTextHandle {
  return showRoomText(scene, {
    title: '寄居蟹鱼缸',
    imageUrl: resolveImageUrl(fishBasinUrl),
    imageAlt: '寄居蟹鱼缸',
    entries: [{ text: '小小的寄居蟹躲在壳里，安静地望着夜色。' }],
  });
}

/** Clock, radio and future inspect text use the same blur, object and right-side copy layout. */
export function showOtherRoomText(scene: Phaser.Scene, options: RoomTextOptions): RoomTextHandle {
  return showRoomText(scene, options);
}
