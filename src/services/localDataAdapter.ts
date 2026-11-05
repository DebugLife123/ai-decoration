import type { MaterialRecord, Project, WorkspaceDataAdapter } from './dataContracts';
import { readAuthSession } from './authSession';

export const localDataKeys = {
  projects: 'decoration-projects-v1',
  materials: 'decoration-business-materials',
} as const;

function storageKeyForAccount(key: string): string {
  const session = readAuthSession();
  if (!session) return key;
  return `${key}:account:${encodeURIComponent(session.user.id)}`;
}

export function readLocalValue<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const value = window.localStorage.getItem(storageKeyForAccount(key));
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object');
}

function isProjectRecord(value: unknown): value is Project {
  return isRecord(value) && typeof value.id === 'string' && typeof value.name === 'string';
}

function isMaterialRecord(value: unknown): value is MaterialRecord {
  return isRecord(value) && typeof value.id === 'string' && typeof value.name === 'string';
}

export function writeLocalValue<T>(key: string, value: T) {
  try {
    window.localStorage.setItem(storageKeyForAccount(key), JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function loadProjects(): Project[] {
  const parsed = readLocalValue<unknown[]>(localDataKeys.projects, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isProjectRecord).map((item) => ({
    ...item,
    spaceType: typeof item.spaceType === 'string' ? item.spaceType : '未分类空间',
    style: item.style || 'modern',
    budget: typeof item.budget === 'number' && Number.isFinite(item.budget) ? item.budget : undefined,
    createdAt: item.createdAt || new Date().toISOString(),
    updatedAt: item.updatedAt || item.createdAt || new Date().toISOString(),
    status: ['draft', 'generating', 'completed', 'failed'].includes(item.status) ? item.status : 'draft',
    photoUrls: Array.isArray(item.photoUrls) ? item.photoUrls : [],
    versions: Array.isArray(item.versions) ? item.versions : [],
    tasks: Array.isArray(item.tasks) ? item.tasks : [],
    materialIds: Array.isArray(item.materialIds) ? item.materialIds : [],
  }));
}

export function loadMaterials(): MaterialRecord[] {
  const parsed = readLocalValue<unknown[]>(localDataKeys.materials, []);
  return Array.isArray(parsed) ? parsed.filter(isMaterialRecord) : [];
}

export function saveProjects(projects: Project[]) {
  return writeLocalValue(localDataKeys.projects, projects);
}

export const localWorkspaceDataAdapter: WorkspaceDataAdapter = {
  async loadProjects() {
    return loadProjects();
  },
  async saveProjects(projects) {
    return saveProjects(projects);
  },
  async saveProject(project) {
    const projects = loadProjects();
    const nextProjects = projects.some((item) => item.id === project.id)
      ? projects.map((item) => item.id === project.id ? project : item)
      : [project, ...projects];
    saveProjects(nextProjects);
  },
  async deleteProject(id) {
    saveProjects(loadProjects().filter((project) => project.id !== id));
  },
  async loadMaterials() {
    return loadMaterials();
  },
};
