/** Deterministic cubic flights use viewport coordinates and expanded text keep-out rectangles. */
export type Point = { x: number; y: number };
export type Rect = { left: number; top: number; right: number; bottom: number };
export type Flight = { points: [Point, Point, Point, Point]; size: number; opacity: number; delay: number; settle: boolean };
export type Direction = 'arc' | 'ribbon' | 'orbit';
export const duration = 7600;
export function bezier(points: Flight['points'], t: number): Point {
  const u = 1 - t;
  return {
    x: u ** 3 * points[0].x + 3 * u ** 2 * t * points[1].x + 3 * u * t ** 2 * points[2].x + t ** 3 * points[3].x,
    y: u ** 3 * points[0].y + 3 * u ** 2 * t * points[1].y + 3 * u * t ** 2 * points[2].y + t ** 3 * points[3].y,
  };
}
export function protectedPoint(point: Point, zones: Rect[], radius: number): boolean {
  return zones.some(zone => point.x > zone.left - radius && point.x < zone.right + radius && point.y > zone.top - radius && point.y < zone.bottom + radius);
}
export function flights(width: number, origin: Point, landing: Point, bottom: number, count: number, direction: Direction = 'arc'): Flight[] {
  return Array.from({ length: count }, (_, i) => {
    const side = i % 2 ? 1 : -1;
    const edge = side < 0 ? 18 + i * 6 : width - 18 - i * 6;
    const spread = direction === 'ribbon' ? .55 : direction === 'orbit' ? 1.25 : 1;
    const settle = i === 0;
    return {
      points: [origin, { x: origin.x + side * width * .48 * spread, y: origin.y - 135 }, { x: edge, y: bottom * (direction === 'orbit' ? 1.15 : .75) }, settle ? landing : { x: edge, y: bottom - i * 38 }],
      size: [23, 18, 27, 20][i % 4]!, opacity: [.64, .48, .56, .42][i % 4]!, delay: i * 290, settle,
    };
  });
}
export function frame(flight: Flight, elapsed: number, zones: Rect[]) {
  const t = Math.max(0, Math.min(1, (elapsed - flight.delay) / (duration - flight.delay - (flight.settle ? 1100 : 0))));
  const point = bezier(flight.points, t);
  const fade = Math.min(1, t * 9) * (flight.settle ? Math.min(1, (duration - elapsed) / 700) : Math.min(1, (1 - t) * 5));
  return { point, opacity: elapsed < flight.delay || protectedPoint(point, zones, flight.size * .8) ? 0 : Math.max(0, fade) * flight.opacity, angle: Math.sin(t * Math.PI * 2) * 12 };
}
