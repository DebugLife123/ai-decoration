import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { loadNotifications } from '../services/notifications';
import { useAppStore } from '../stores/appStore';

let ownerId = '';
let unreadCount = 0;
let refreshPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emitChange() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function updateOwner(accountId: string) {
  if (ownerId === accountId) return;
  ownerId = accountId;
  unreadCount = 0;
  refreshPromise = null;
  emitChange();
}

export function setAdminUnreadNotificationCount(nextCount: number) {
  const normalized = Math.max(0, Math.trunc(nextCount));
  if (unreadCount === normalized) return;
  unreadCount = normalized;
  emitChange();
}

export function refreshAdminUnreadNotificationCount(accountId: string) {
  updateOwner(accountId);
  if (!accountId) return Promise.resolve();
  if (refreshPromise) return refreshPromise;

  const requestedOwnerId = accountId;
  const request = loadNotifications()
    .then((items) => {
      if (ownerId === requestedOwnerId) {
        setAdminUnreadNotificationCount(items.filter((item) => !item.read).length);
      }
    })
    .finally(() => {
      if (refreshPromise === request) refreshPromise = null;
    });
  refreshPromise = request;
  return request;
}

export function useAdminNotificationCount() {
  const accountId = useAppStore((state) => state.authSession?.user.id || '');
  const getSnapshot = useCallback(() => ownerId === accountId ? unreadCount : 0, [accountId]);
  const count = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    void refreshAdminUnreadNotificationCount(accountId).catch(() => undefined);
    const refreshOnFocus = () => { void refreshAdminUnreadNotificationCount(accountId).catch(() => undefined); };
    window.addEventListener('focus', refreshOnFocus);
    return () => window.removeEventListener('focus', refreshOnFocus);
  }, [accountId]);

  return count;
}
