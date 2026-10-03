import Phaser from 'phaser';
import { showRoomText, type RoomTextHandle, type RoomTextOptions } from './RoomTextPanel';
import { resolveImageUrl } from '../assets';
import fishBasinUrl from '../../assets/environment/room-hermit-crab-aquarium-v1.png?url';

/** Call only after the photo sliding puzzle reports success. */
export function showPhotoMemoryText(scene: Phaser.Scene, completedPhotoUrl: string): RoomTextHandle {
  return showRoomText(scene, {
    title: '那天的照片',
    imageUrl: completedPhotoUrl,
    imageAlt: '童年海边家庭照片占位图',
    layout: 'photo',
    entries: [{
      text: '这是童年海边家庭照片的占位图，正式素材待制作。记忆中的她和爸爸妈妈一起在浅水里玩耍。',
    }],
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
