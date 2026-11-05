import { localWorkspaceDataAdapter } from './localDataAdapter';
import { businessApiConfig, businessDataAdapter } from './businessData';
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
  loadMaterials: () => businessDataAdapter.loadMaterials(),
};

function activeWorkspaceAdapter(): WorkspaceDataAdapter {
  const session = readAuthSession();
  return businessApiConfig.enabled && (Boolean(session) || Boolean(currentAccessToken()))
    ? projectApiAdapter
    : localWorkspaceDataAdapter;
}

export const workspaceDataAdapter: WorkspaceDataAdapter = {
  loadProjects: () => activeWorkspaceAdapter().loadProjects(),
  saveProjects: (projects) => activeWorkspaceAdapter().saveProjects(projects),
  saveProject: (project) => activeWorkspaceAdapter().saveProject!(project),
  deleteProject: (id) => activeWorkspaceAdapter().deleteProject!(id),
  loadMaterials: () => businessDataAdapter.loadMaterials(),
};
