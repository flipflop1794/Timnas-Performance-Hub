import type { Clock } from "../ports/clock.js";

export class SystemClock implements Clock {
  nowISO(): string {
    return new Date().toISOString();
  }
}
