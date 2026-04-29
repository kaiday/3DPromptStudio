import { parseJsonResponse } from './projectApi.js';

const API_ROOT = '/api';

export async function submitPrompt(projectId, prompt, options = {}) {
  const response = await fetch(`${API_ROOT}/projects/${encodeURIComponent(projectId)}/prompt`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      prompt,
      mode: options.mode ?? 'apply',
      sceneId: options.sceneId,
      selectedComponentId: options.selectedComponentId,
      baseRevisionId: options.baseRevisionId
    })
  });
  return parseJsonResponse(response, 'Prompt request failed.');
}
