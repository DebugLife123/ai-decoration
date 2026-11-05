import { localWorkspaceDataAdapter } from './localDataAdapter';
import { businessApiConfig, businessDataAdapter } from './businessData';
import { loadCatalogMaterials } from './materialCatalog';
import { currentAccessToken, readAuthSession } from './authSession';
import type { Project, WorkspaceDataAdapter } from './dataContracts';

type ApiEnvelope<T> = { code: string; message: string; data: T; timestamp: string };

async function projectApiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${businessApiConfig.baseUrl}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${currentAccessToken()}`,
      ...init?.headers,
    },
  });
  if (response.status === 204) return undefined as T;
  const payload = await response.json() as ApiEnvelope<T>;
  if (!response.ok) throw new Error(payload.message || `项目请求失败（${response.status}）`);
  return payload.data;
}

const projectApiAdapter: WorkspaceDataAdapter = {
  async loadProjects() {
    return projectApiRequest<Project[]>('/api/v1/projects');
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
      body: JSON.stringify(project),
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
