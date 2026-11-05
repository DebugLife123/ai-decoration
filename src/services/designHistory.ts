import type { DesignStyle } from '../stores/appStore';
import type { IdentifiedRoom, PlanSource } from './aiClient';

const DATABASE_NAME = 'jianyi-design-history';
const STORE_NAME = 'whole-home-projects';
const DATABASE_VERSION = 1;

export interface DesignHistoryRecord {
  id: string;
  name: string;
  createdAt: string;
  style: DesignStyle;
  source: PlanSource;
  floorPlan: string;
  analysis: string;
  rooms: IdentifiedRoom[];
  selectedRooms: string[];
  results: { name: string; imageUrl: string; review?: { status: 'pass' | 'check' | 'unverified'; note: string } }[];
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('无法打开本地方案记录库。'));
  });
}

export async function listDesignHistory() {
  const database = await openDatabase();
  return new Promise<DesignHistoryRecord[]>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve((request.result as DesignHistoryRecord[]).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    request.onerror = () => reject(request.error ?? new Error('读取方案记录失败。'));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error('读取方案记录失败。')); };
    transaction.onabort = () => { database.close(); reject(transaction.error ?? new Error('读取方案记录失败。')); };
  });
}

export async function saveDesignHistory(record: DesignHistoryRecord) {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(record);
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error('保存方案记录失败。')); };
    transaction.onabort = () => { database.close(); reject(transaction.error ?? new Error('保存方案记录失败。')); };
  });
}

export async function deleteDesignHistory(id: string) {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(id);
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error('删除方案记录失败。')); };
    transaction.onabort = () => { database.close(); reject(transaction.error ?? new Error('删除方案记录失败。')); };
  });
}
