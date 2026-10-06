/** Sample under the center and heel of the character's small footprint. */
export function characterGroundHeight(x: number, z: number, walkableHeight: (x: number, z: number) => number): number {
  return Math.max(walkableHeight(x, z), walkableHeight(x, z - 0.08));
}
