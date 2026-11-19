import type { Project } from '../services/dataContracts';

export type ProjectStatus = Project['status'];

/**
 * A project's state is derived, never authored:
 * a live task wins, then finished versions, then the last failed attempt, then draft.
 *
 * The stored `status` column used to be written by the client at each step, so an
 * interrupted run left projects stuck in "generating" forever.
 */
export function deriveProjectStatus(
  project: Pick<Project, 'tasks' | 'versions'>,
  activeTaskId?: string | null,
): ProjectStatus {
  const tasks = project.tasks || [];
  const live = (activeTaskId ? tasks.find((task) => task.id === activeTaskId) : undefined)
    ?? tasks.find((task) => task.status === 'generating');
  if (live) return 'generating';
  if (project.versions?.length) return 'completed';
  const last = tasks[tasks.length - 1];
  if (last?.status === 'failed') return 'failed';
  return 'draft';
}
