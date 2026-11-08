export interface OutgoingNotification {
  userId: string;
  teamId: string;
  type: string;
  message: string;
  relatedId?: string;
}

export interface NotificationPort {
  send(n: OutgoingNotification): Promise<void> | void;
}
