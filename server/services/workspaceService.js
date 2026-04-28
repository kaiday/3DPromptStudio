import { createDefaultWorkspace, mergeWorkspacePatch, normalizeWorkspace } from '../schemas/workspaceSchema.js';

const workspacesByProjectId = new Map();

export function getWorkspace(projectId) {
  if (!projectId) {
    throw new Error('projectId is required.');
  }

  if (!workspacesByProjectId.has(projectId)) {
    workspacesByProjectId.set(projectId, createDefaultWorkspace(projectId));
  }

  return workspacesByProjectId.get(projectId);
}

export function saveWorkspace(workspace) {
  const normalized = normalizeWorkspace(workspace);
  workspacesByProjectId.set(normalized.projectId, normalized);
  return normalized;
}

export function updateWorkspace(projectId, patch) {
  const currentWorkspace = getWorkspace(projectId);
  const updatedWorkspace = mergeWorkspacePatch(currentWorkspace, patch);
  workspacesByProjectId.set(projectId, updatedWorkspace);
  return updatedWorkspace;
}

export function clearWorkspaces() {
  workspacesByProjectId.clear();
}
