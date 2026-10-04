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
      text: '爸爸妈妈第一次带5岁的韩梅梅见到了大海~',
    }],
    onClose,
  });
}

export function showFishBasinText(scene: Phaser.Scene): RoomTextHandle {
  return showRoomText(scene, {
    title: '寄居蟹鱼缸',
    imageUrl: resolveImageUrl(fishBasinUrl),
    imageAlt: '寄居蟹鱼缸',
    entries: [{ text: '这是韩梅梅那次从海边带回来的小寄居蟹。' }],
  });
}

/** Clock, radio and future inspect text use the same blur, object and right-side copy layout. */
export function showOtherRoomText(scene: Phaser.Scene, options: RoomTextOptions): RoomTextHandle {
  return showRoomText(scene, options);
}
