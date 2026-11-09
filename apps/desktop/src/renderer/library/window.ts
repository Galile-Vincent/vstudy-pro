export function virtualWindow(
  offsets: number[], columns: number, count: number,
  top: number, viewport: number,
) {
  const clamped = Math.max(0, Math.min(top, Math.max(0, offsets.at(-1)! - viewport)));
  const lane = offsets.findIndex(offset => offset > clamped);
  const first = lane < 0 ? Math.max(0, offsets.length - 2) : Math.max(0, lane - 1);
  const last = offsets.findIndex(offset => offset > clamped + viewport);
  return {
    start: Math.max(0, first - 2) * columns,
    end: Math.min(count, (last < 0 ? offsets.length - 1 : last + 3) * columns),
  };
}
