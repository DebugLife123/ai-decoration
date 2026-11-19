import type { DesignStyle } from '../stores/appStore';
import type { IdentifiedRoom, PlanSource } from './aiClient';
import type { RoomImageVersion } from '../components/RoomImageEditor';

const DATABASE_NAME = 'jianyi-design-history';
const STORE_NAME = 'whole-home-projects';
const RUNNING_STORE_NAME = 'running-generations';
const DATABASE_VERSION = 2;

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
  warning?: string;
  generationJobId?: string;
  results: { name: string; imageUrl: string; review?: { status: 'pass' | 'check' | 'unverified'; note: string }; versions?: RoomImageVersion[]; currentVersionId?: string }[];
}

/**
 * Snapshot of a run that has not finished yet. Local (no-account) sessions have no
 * backend task row, so this is the only way to resume after a reload without paying
 * for a second floor-plan recognition.
 */
export interface RunningGenerationSnapshot {
  id: string;
  taskId: string;
  projectId: string;
  style: DesignStyle;
  source: PlanSource;
  floorPlan: string;
  analysis: string;
  rooms: IdentifiedRoom[];
  selectedRooms: string[];
  stage: string;
  progress: number;
  message?: string;
  completedRooms: number;
  totalRooms: number;
  updatedAt: string;
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains(RUNNING_STORE_NAME)) {
        database.createObjectStore(RUNNING_STORE_NAME, { keyPath: 'id' });
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

/** Keeps local storage bounded: only the newest few unfinished runs are worth resuming. */
const RUNNING_SNAPSHOT_LIMIT = 3;

export async function saveRunningSnapshot(snapshot: RunningGenerationSnapshot) {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(RUNNING_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(RUNNING_STORE_NAME);
    store.put(snapshot);
    const request = store.getAll();
    request.onsuccess = () => {
      const records = (request.result as RunningGenerationSnapshot[])
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      for (const record of records.slice(RUNNING_SNAPSHOT_LIMIT)) store.delete(record.id);
    };
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error('保存生成快照失败。')); };
    transaction.onabort = () => { database.close(); reject(transaction.error ?? new Error('保存生成快照失败。')); };
  });
}

export async function loadRunningSnapshot(taskId: string) {
  const database = await openDatabase();
  return new Promise<RunningGenerationSnapshot | null>((resolve, reject) => {
    const transaction = database.transaction(RUNNING_STORE_NAME, 'readonly');
    const request = transaction.objectStore(RUNNING_STORE_NAME).get(taskId);
    request.onsuccess = () => resolve((request.result as RunningGenerationSnapshot | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error('读取生成快照失败。'));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error('读取生成快照失败。')); };
    transaction.onabort = () => { database.close(); reject(transaction.error ?? new Error('读取生成快照失败。')); };
  });
}

export async function clearRunningSnapshot(taskId: string) {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(RUNNING_STORE_NAME, 'readwrite');
    transaction.objectStore(RUNNING_STORE_NAME).delete(taskId);
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error('清除生成快照失败。')); };
    transaction.onabort = () => { database.close(); reject(transaction.error ?? new Error('清除生成快照失败。')); };
  });
}
