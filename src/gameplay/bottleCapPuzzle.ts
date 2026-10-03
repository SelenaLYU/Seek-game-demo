export const GOODS = [
  { name: '牛奶', mark: '奶牛', color: 0xc4c9af },
  { name: '橘子汽水', mark: '橘子', color: 0xd4a564 },
  { name: '葡萄汽水', mark: '葡萄', color: 0xa497b5 },
  { name: '饼干', mark: '麦穗', color: 0xc5b185 },
  { name: '干脆面', mark: '面条', color: 0xc28d72 },
  { name: '蛋卷', mark: '鸡蛋', color: 0xd2bd8f },
  { name: '奶糖', mark: '白兔', color: 0xc1baaf },
  { name: '泡泡糖', mark: '气球', color: 0xb28f9a },
  { name: '酸梅糖', mark: '梅子', color: 0x9fa881 },
];
export const FIXED = [4];
export const CLUES = ['只有中间的干脆面不能换位置。', '最上层只放饮料，最下层只放糖。', '饼干紧挨干脆面的左边。', '牛奶在饼干正上方。', '橘子汽水在葡萄汽水左边。', '奶糖与牛奶在同一列。', '酸梅糖在泡泡糖右边。'];
// The player must discover an Euler trail: every connection is used once.
// There are two valid endpoints, but no prescribed start or answer line.
export const CAP_EDGES = [[0,1],[0,2],[1,2],[1,3],[2,4],[3,4],[3,5],[5,6],[6,3],[4,7],[7,8],[8,4]] as const;
export const CAP_POINTS = [[480,188],[374,264],[573,256],[366,369],[575,367],[231,304],[222,403],[725,306],[748,405]] as const;
export function fitsClues(a: number[]): boolean {
  if (a.length !== 9 || new Set(a).size !== 9 || a.some(n => !Number.isInteger(n) || n < 0 || n > 8)) return false;
  return a[4] === 4 && a.slice(0, 3).every(n => n < 3) && a.slice(6).every(n => n >= 6)
    && a.indexOf(1) < a.indexOf(2) && a.indexOf(3) + 1 === a.indexOf(4)
    && a.indexOf(0) + 3 === a.indexOf(3) && a.indexOf(6) % 3 === a.indexOf(0) % 3
    && a.indexOf(8) > a.indexOf(7);
}
export class BottleCapPuzzle {
  shelf = [5, 8, 7, 2, 4, 6, 1, 0, 3];
  phase: 'shelf' | 'trace' | 'done' = 'shelf';
  path: number[] = [];
  used = new Set<number>();
  drawing = false;
  swap(a: number, b: number): boolean {
    if (this.phase !== 'shelf' || ![a, b].every(i => Number.isInteger(i) && i >= 0 && i < 9) || [a, b].some(i => FIXED.includes(i))) return false;
    [this.shelf[a], this.shelf[b]] = [this.shelf[b], this.shelf[a]]; return true;
  }
  checkShelf(): boolean {
    if (this.phase !== 'shelf' || !fitsClues(this.shelf)) return false;
    this.phase = 'trace'; return true;
  }
  beginTrace(node: number): boolean {
    if (this.phase !== 'trace' || !CAP_POINTS[node]) return false;
    this.cancelTrace(); this.path = [node]; this.drawing = true; return true;
  }
  visit(node: number): boolean {
    if (!this.drawing || node === this.path.at(-1) || !CAP_POINTS[node]) return false;
    const current = this.path.at(-1)!;
    const edge = CAP_EDGES.findIndex(([a,b]) => (a === current && b === node) || (b === current && a === node));
    if (edge < 0 || this.used.has(edge)) return false;
    this.used.add(edge); this.path.push(node); return true;
  }
  endTrace(): boolean {
    const success = this.drawing && this.used.size === CAP_EDGES.length;
    this.cancelTrace();
    if (success) this.phase = 'done';
    return success;
  }
  cancelTrace(): void { this.drawing = false; this.path = []; this.used.clear(); }
}
