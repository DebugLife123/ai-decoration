import { apiRequest } from './authSession';

export type NotificationType = 'CERTIFICATION' | 'CERTIFICATION_PAYMENT' | 'QUOTE_EXPIRING' | 'INQUIRY' | 'ADMIN_REVIEW' | 'ADMIN_PAYMENT' | 'ADMIN_SUBSCRIPTION' | 'MATERIAL_REVIEW';

export interface AppNotification {
  key: string;
  type: NotificationType;
  title: string;
  message: string;
  link: string;
  createdAt: string | null;
  read: boolean;
}

export function loadNotifications() {
  return apiRequest<AppNotification[]>('/api/v1/notifications');
}

export function markNotificationRead(key: string) {
  return apiRequest<void>(`/api/v1/notifications/${encodeURIComponent(key)}/read`, { method: 'PATCH' });
}

export function markAllNotificationsRead() {
  return apiRequest<void>('/api/v1/notifications/read-all', { method: 'POST' });
}
