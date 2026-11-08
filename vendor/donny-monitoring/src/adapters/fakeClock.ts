import type { Clock } from "../ports/clock.js";

/**
 * Jam palsu yang bisa dimajukan secara eksplisit. Dipakai di tes untuk
 * mensimulasikan banyak hari tanpa menunggu waktu sungguhan.
 */
export class FakeClock implements Clock {
  private current: Date;

  constructor(startISO: string) {
    this.current = new Date(startISO);
  }

  nowISO(): string {
    return this.current.toISOString();
  }

  advanceHours(hours: number): void {
    this.current = new Date(this.current.getTime() + hours * 3600_000);
  }

  advanceDays(days: number): void {
    this.advanceHours(days * 24);
  }

  setISO(iso: string): void {
    this.current = new Date(iso);
  }
}
