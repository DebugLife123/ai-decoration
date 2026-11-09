import { localWorkspaceDataAdapter } from './localDataAdapter';
import { businessApiConfig, businessDataAdapter } from './businessData';
import { loadCatalogMaterials } from './materialCatalog';
import { authApiBaseUrl, currentAccessToken, readAuthSession } from './authSession';
import type { Project, WorkspaceDataAdapter } from './dataContracts';

type ApiEnvelope<T> = { code: string; message: string; data: T; timestamp: string };
const canonicalAssetUrls = new Map<string, string>();

function canonicalAssetUrl(value: string): string {
  return canonicalAssetUrls.get(value) || value;
}

function canonicalizeProject(project: Project): Project {
  const stored = structuredClone(project);
  if (stored.floorPlanUrl) stored.floorPlanUrl = canonicalAssetUrl(stored.floorPlanUrl);
  if (stored.thumbnail) stored.thumbnail = canonicalAssetUrl(stored.thumbnail);
  for (const version of stored.versions) {
    version.coverImageUrl = canonicalAssetUrl(version.coverImageUrl);
    for (const image of version.images) image.imageUrl = canonicalAssetUrl(image.imageUrl);
  }
  return stored;
}

async function projectApiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', Authorization: `Bearer ${currentAccessToken()}`, ...init?.headers as Record<string, string> };
  if (!(init?.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${businessApiConfig.baseUrl}${path}`, {
    ...init,
    headers,
  });
  if (response.status === 204) return undefined as T;
  const payload = await response.json() as ApiEnvelope<T>;
  if (!response.ok) throw new Error(payload.message || `项目请求失败（${response.status}）`);
  return payload.data;
}

const projectApiAdapter: WorkspaceDataAdapter = {
  async loadProjects() {
    const projects = await projectApiRequest<Project[]>('/api/v1/projects');
    return Promise.all(projects.map(async (project) => {
      const materialize = async (url: string) => {
        if (!url.startsWith('/api/v1/projects/')) return url;
        const response = await fetch(`${businessApiConfig.baseUrl}${url}`, { headers: { Authorization: `Bearer ${currentAccessToken()}` } });
        if (!response.ok) throw new Error('项目图片无法读取，请重新登录后重试。');
        const objectUrl = URL.createObjectURL(await response.blob());
        canonicalAssetUrls.set(objectUrl, url);
        return objectUrl;
      };
      if (project.floorPlanUrl) project.floorPlanUrl = await materialize(project.floorPlanUrl);
      if (project.thumbnail) project.thumbnail = await materialize(project.thumbnail);
      for (const version of project.versions) {
        version.coverImageUrl = await materialize(version.coverImageUrl);
        for (const image of version.images) image.imageUrl = await materialize(image.imageUrl);
      }
      return project;
    }));
  },
  async saveProjects(projects) {
    await projectApiRequest<Project[]>('/api/v1/projects', {
      method: 'PUT',
      body: JSON.stringify({ projects }),
    });
    return true;
  },
  async saveProject(project) {
    await projectApiRequest<Project>(`/api/v1/projects/${project.id}`, {
      method: 'PUT',
      body: JSON.stringify(canonicalizeProject(project)),
    });
  },
  async deleteProject(id) {
    await projectApiRequest<void>(`/api/v1/projects/${id}`, { method: 'DELETE' });
  },
  loadMaterials: () => loadMaterialsForConsumer(),
};

function activeWorkspaceAdapter(): WorkspaceDataAdapter {
  const session = readAuthSession();
  return businessApiConfig.enabled && (Boolean(session) || Boolean(currentAccessToken()))
    ? projectApiAdapter
    : localWorkspaceDataAdapter;
}

function hasPlatformSession(): boolean {
  return Boolean(businessApiConfig.enabled && (readAuthSession() || currentAccessToken()));
}

/**
 * 消费端（含个人账号）读的是平台材料目录：已认证企业录入、未过期的报价。
 * 未登录或接口不可用时回退到企业适配器/本地草稿，保证页面不白屏。
 */
async function loadMaterialsForConsumer() {
  if (hasPlatformSession()) {
    try {
      return await loadCatalogMaterials();
    } catch {
      // 平台目录不可用时继续走下面的回退链路。
    }
  }
  return businessDataAdapter.loadMaterials();
}

export const workspaceDataAdapter: WorkspaceDataAdapter = {
  loadProjects: () => activeWorkspaceAdapter().loadProjects(),
  saveProjects: (projects) => activeWorkspaceAdapter().saveProjects(projects),
  saveProject: (project) => activeWorkspaceAdapter().saveProject!(project),
  deleteProject: (id) => activeWorkspaceAdapter().deleteProject!(id),
  loadMaterials: () => loadMaterialsForConsumer(),
};

export async function persistWorkspaceProject(project: Project): Promise<Project> {
  if (!businessApiConfig.enabled || !currentAccessToken()) {
    await localWorkspaceDataAdapter.saveProject!(project);
    return project;
  }
  const stored = canonicalizeProject(project);
  const pending: { target: (url: string) => void; value: string; name: string }[] = [];
  const queueUpload = (value: string, name: string, target: (url: string) => void) => {
    if (value.startsWith('data:')) pending.push({ value, name, target });
  };
  if (stored.floorPlanUrl) queueUpload(stored.floorPlanUrl, 'floor-plan.jpg', (url) => { stored.floorPlanUrl = url; });
  if (stored.thumbnail) queueUpload(stored.thumbnail, 'project-cover.jpg', (url) => { stored.thumbnail = url; });
  for (const version of stored.versions) {
    queueUpload(version.coverImageUrl, `version-${version.id}-cover.jpg`, (url) => { version.coverImageUrl = url; });
    version.images.forEach((image, index) => queueUpload(image.imageUrl, `version-${version.id}-room-${index + 1}.jpg`, (url) => { image.imageUrl = url; }));
  }
  if (pending.length) {
    const shell: Project = { ...stored, floorPlanUrl: undefined, thumbnail: undefined, versions: [] };
    await projectApiAdapter.saveProject!(shell);
  }
  const upload = async (value: string, name: string): Promise<string> => {
    if (!value.startsWith('data:')) return value;
    const response = await fetch(value);
    const blob = await response.blob();
    const form = new FormData();
    form.append('file', blob, name);
    const result = await projectApiRequest<{ id: string }>(`/api/v1/projects/${project.id}/assets`, {
      method: 'POST', headers: { Authorization: `Bearer ${currentAccessToken()}` }, body: form,
    });
    return `/api/v1/projects/${project.id}/assets/${result.id}/content`;
  };
  for (const item of pending) item.target(await upload(item.value, item.name));
  await projectApiAdapter.saveProject!(stored);
  return stored;
}

export function workspaceAssetUrl(url: string): string {
  if (!url.startsWith('/api/v1/projects/') || !currentAccessToken()) return url;
  return `${authApiBaseUrl}${url}`;
}
