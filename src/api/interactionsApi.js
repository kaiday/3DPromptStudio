import { parseJsonResponse } from './projectApi.js';

const API_ROOT = '/api';

function interactionsPath(projectId, componentId) {
  return `/projects/${encodeURIComponent(projectId)}/components/${encodeURIComponent(componentId)}/interactions`;
}

function normalizeInteractionsPayload(payload) {
  if (Array.isArray(payload)) {
    return { interactions: payload };
  }
  return {
    interactions: Array.isArray(payload?.interactions) ? payload.interactions : []
  };
}

export async function fetchComponentInteractions(projectId, componentId) {
  const response = await fetch(`${API_ROOT}${interactionsPath(projectId, componentId)}`);
  return parseJsonResponse(response, 'Component interactions load failed.');
}

export async function saveComponentInteractions(projectId, componentId, payload) {
  const response = await fetch(`${API_ROOT}${interactionsPath(projectId, componentId)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(normalizeInteractionsPayload(payload))
  });
  return parseJsonResponse(response, 'Component interactions save failed.');
}

export async function deleteComponentInteraction(projectId, componentId, interactionId) {
  const response = await fetch(`${API_ROOT}${interactionsPath(projectId, componentId)}/${encodeURIComponent(interactionId)}`, {
    method: 'DELETE'
  });
  return parseJsonResponse(response, 'Component interaction delete failed.');
}
