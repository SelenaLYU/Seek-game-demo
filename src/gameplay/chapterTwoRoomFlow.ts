export type RoomStage = 'growth' | 'growth-done' | 'homework' | 'homework-done' | 'magazine' | 'map' | 'shelf' | 'collection' | 'snack' | 'memory';
import { BottleCapPuzzle } from './bottleCapPuzzle.ts';
/** Optional observations never advance this sequence. */
export class ChapterTwoRoomFlow {
  stage: RoomStage = 'homework';
  readonly ages = new Set<number>();
  readonly puzzle = new BottleCapPuzzle();
  hasMap = false;
  get growthComplete(): boolean { return this.ages.size === 3; }
  observeAge(age: number): void {
    if (![5, 7, 12].includes(age)) return;
    this.ages.add(age);
  }
  closeGrowth(): void { /* Observing the marks does not gate or reset the homework. */ }
  answer(chickens: number, rabbits: number): boolean {
    if (this.stage !== 'homework' || chickens !== 23 || rabbits !== 12) return false;
    this.stage = 'homework-done'; return true;
  }
  closeHomework(): void { if (this.stage === 'homework-done') this.stage = 'magazine'; }
  discoverMap(): void {
    if (this.stage === 'magazine') { this.hasMap = true; this.stage = 'map'; }
  }
  enterShelf(): void { if (this.stage === 'map' && this.hasMap) this.stage = 'shelf'; }
  finishShelf(): void { if (this.stage === 'shelf' && this.puzzle.phase === 'done') this.stage = 'collection'; }
  viewCollection(): void { if (this.stage === 'collection') this.stage = 'snack'; }
  takeSnack(): boolean {
    if (this.stage !== 'snack' || !this.growthComplete) return false;
    this.stage = 'memory'; return true;
  }
}
