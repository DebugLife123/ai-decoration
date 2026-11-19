import { readAuthSession } from './authSession';

/**
 * Remembers the generation the user is currently running so the workspace can
 * resume it after a reload or a route change.
 *
 * The record is scoped per account (anonymous users keep their own slot) and is
 * intentionally tiny: the AI gateway job and the backend task row stay the
 * source of truth, this only answers "where was I?".
 */
const STORAGE_PREFIX = 'decoration-active-generation';

/** Matches the 30 minute wait budget used by the AI job poller. */
export const ACTIVE_GENERATION_MAX_AGE_MS = 30 * 60 * 1000;

export type ActiveGenerationMode = 'api' | 'local';

export interface ActiveGeneration {
  taskId: string;
  projectId: string;
  mode: ActiveGenerationMode;
  style: string;
  source: 'cad' | 'floorplan';
  startedAt: string;
  stage?: string;
  progress?: number;
  message?: string;
  completedRooms?: number;
  totalRooms?: number;
  updatedAt: number;
}

function storageKey(): string {
  const session = readAuthSession();
  return session ? `${STORAGE_PREFIX}:account:${encodeURIComponent(session.user.id)}` : STORAGE_PREFIX;
}

function isActiveGeneration(value: unknown): value is ActiveGeneration {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.taskId === 'string'
    && record.taskId.length > 0
    && typeof record.projectId === 'string'
    && (record.mode === 'api' || record.mode === 'local');
}

export function readActiveGeneration(): ActiveGeneration | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(storageKey());
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isActiveGeneration(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeActiveGeneration(record: Omit<ActiveGeneration, 'updatedAt'> & { updatedAt?: number }): void {
  if (typeof window === 'undefined') return;
  try {
    const next: ActiveGeneration = { ...record, updatedAt: record.updatedAt ?? Date.now() };
    window.localStorage.setItem(storageKey(), JSON.stringify(next));
  } catch {
    // Storage full or disabled: resume is a convenience, never block generation.
  }
}

/** Merges progress updates into the record that is already stored. */
export function patchActiveGeneration(patch: Partial<ActiveGeneration>): void {
  const current = readActiveGeneration();
  if (!current) return;
  writeActiveGeneration({ ...current, ...patch, updatedAt: Date.now() });
}

/** Clears the pointer, optionally only when it still belongs to the given task. */
export function clearActiveGeneration(taskId?: string): void {
  if (typeof window === 'undefined') return;
  try {
    if (taskId) {
      const current = readActiveGeneration();
      if (current && current.taskId !== taskId) return;
    }
    window.localStorage.removeItem(storageKey());
  } catch {
    // Ignore: nothing to clean up when storage is unavailable.
  }
}

export function isActiveGenerationFresh(record: ActiveGeneration, maxAgeMs = ACTIVE_GENERATION_MAX_AGE_MS): boolean {
  return Date.now() - record.updatedAt <= maxAgeMs;
}
