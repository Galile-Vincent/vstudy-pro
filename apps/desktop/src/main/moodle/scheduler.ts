export class MoodleScheduler {
  private active = 0;
  private readonly queue: {priority:number;start:() => void}[] = [];
  constructor(private readonly concurrency = 6) {}
  run<T>(priority: number, work: (queueMs:number) => Promise<T>): Promise<T> {
    const queued = performance.now();
    return new Promise<T>((resolve,reject) => {
      this.queue.push({priority,start:() => {
        this.active++;
        void work(performance.now()-queued).then(resolve,reject).finally(() => {this.active--;this.drain();});
      }});
      this.queue.sort((a,b) => b.priority-a.priority);
      this.drain();
    });
  }
  private drain() {
    while (this.active < this.concurrency && this.queue.length) this.queue.shift()!.start();
  }
}
