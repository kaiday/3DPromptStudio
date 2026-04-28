const API_ROOT = '/api';

export async function submitPrompt(projectId, prompt) {
  const response = await fetch(`${API_ROOT}/projects/${encodeURIComponent(projectId)}/prompt`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt })
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error ?? 'Prompt request failed.');
  }
  return payload;
}
