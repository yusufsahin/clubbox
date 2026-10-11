type TimerHandle = { id: number; due: number; fn: () => void; interval: number | null };

/** Deterministic clock for presence / backoff scenarios. */
export class FakeClock {
  nowMs = Date.parse('2026-10-11T12:00:00.000Z');
  private nextId = 1;
  private timers: TimerHandle[] = [];

  now(): number {
    return this.nowMs;
  }

  setTimeout(fn: () => void, ms: number): number {
    const id = this.nextId++;
    this.timers.push({ id, due: this.nowMs + ms, fn, interval: null });
    return id;
  }

  setInterval(fn: () => void, ms: number): number {
    const id = this.nextId++;
    this.timers.push({ id, due: this.nowMs + ms, fn, interval: ms });
    return id;
  }

  clearTimeout(id: number): void {
    this.timers = this.timers.filter((timer) => timer.id !== id);
  }

  clearInterval(id: number): void {
    this.clearTimeout(id);
  }

  advance(ms: number): void {
    const target = this.nowMs + ms;
    while (true) {
      const due = this.timers
        .filter((timer) => timer.due <= target)
        .sort((a, b) => a.due - b.due);
      if (due.length === 0) break;
      const next = due[0];
      this.nowMs = next.due;
      if (next.interval == null) {
        this.timers = this.timers.filter((timer) => timer.id !== next.id);
        next.fn();
      } else {
        next.due = this.nowMs + next.interval;
        next.fn();
      }
    }
    this.nowMs = target;
  }
}
