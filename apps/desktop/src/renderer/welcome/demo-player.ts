export const script = [
  ['enter', 900], ['select', 800], ['chip', 300], ['type-question', 1400],
  ['send', 300], ['thinking', 600], ['answer', 2000], ['cite', 1400],
  ['press', 100], ['jump', 600], ['highlight', 1900], ['reset', 900],
] as const;
export type DemoStep = typeof script[number][0];
export class DemoPlayer {
  private index = 0;
  private loops = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private remaining: number = script[0][1];
  private started = 0;
  private running = false;
  constructor(private emit: (step: DemoStep) => void) { emit('enter'); }
  setPlaying(playing: boolean) {
    if (playing === this.running || this.loops >= 3) return;
    this.running = playing;
    if (!playing) {
      clearTimeout(this.timer); this.timer = undefined;
      this.remaining = Math.max(0, this.remaining - (Date.now() - this.started));
    } else this.schedule();
  }
  private schedule() {
    this.started = Date.now();
    this.timer = setTimeout(() => {
      this.index++;
      if (this.index === script.length) { this.index = 0; this.loops++; }
      if (this.loops === 3) { this.running = false; this.emit('highlight'); return; }
      this.emit(script[this.index]![0]);
      this.remaining = script[this.index]![1]; this.schedule();
    }, this.remaining);
  }
  replay() {
    const playing = this.running; this.dispose(); this.index = 0; this.loops = 0;
    this.remaining = script[0][1]; this.emit('enter'); this.setPlaying(playing);
  }
  finish() { this.dispose(); this.emit('highlight'); }
  dispose() { clearTimeout(this.timer); this.timer = undefined; this.running = false; }
}
