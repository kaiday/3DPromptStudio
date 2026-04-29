const API_ROOT = '/api';

export async function parseJsonResponse(response, fallbackMessage) {
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { detail: text };
  }
  if (!response.ok) {
    const message = payload.error?.message ?? payload.error ?? payload.detail ?? fallbackMessage ?? `Request failed (${response.status}).`;
    throw new Error(message);
  }
  return payload;
}

async function requestJson(path, options = {}) {
  const response = await fetch(`${API_ROOT}${path}`, {
    headers: { 'content-type': 'application/json', ...(options.headers ?? {}) },
    ...options
  });
  return parseJsonResponse(response);
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
