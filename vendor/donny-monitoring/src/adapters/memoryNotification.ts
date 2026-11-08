import type { NotificationPort, OutgoingNotification } from "../ports/notification.js";

/** Adapter notifikasi versi memori: menyimpan pesan terkirim agar bisa diperiksa di tes. */
export class MemoryNotificationPort implements NotificationPort {
  sent: OutgoingNotification[] = [];

  send(n: OutgoingNotification): void {
    this.sent.push(n);
  }
}
