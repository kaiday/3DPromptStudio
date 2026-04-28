const API_ROOT = '/api';

async function requestJson(path, options = {}) {
  const response = await fetch(`${API_ROOT}${path}`, {
    headers: { 'content-type': 'application/json', ...(options.headers ?? {}) },
    ...options
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error ?? `Request failed (${response.status}).`);
  }
  return payload;
}

export async function fetchWorkspace(projectId) {
  return requestJson(`/projects/${encodeURIComponent(projectId)}/workspace`);
}

export async function patchWorkspace(projectId, patch) {
  return requestJson(`/projects/${encodeURIComponent(projectId)}/workspace`, {
    method: 'PATCH',
    body: JSON.stringify(patch)
  });
}

export async function undoWorkspace(projectId) {
  return requestJson(`/projects/${encodeURIComponent(projectId)}/workspace/undo`, { method: 'POST' });
}

export async function redoWorkspace(projectId) {
  return requestJson(`/projects/${encodeURIComponent(projectId)}/workspace/redo`, { method: 'POST' });
}
