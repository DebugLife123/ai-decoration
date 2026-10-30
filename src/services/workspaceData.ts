import { localWorkspaceDataAdapter } from './localDataAdapter';
import type { WorkspaceDataAdapter } from './dataContracts';

// Replace this binding with the API adapter when the backend contract is available.
export const workspaceDataAdapter: WorkspaceDataAdapter = localWorkspaceDataAdapter;
