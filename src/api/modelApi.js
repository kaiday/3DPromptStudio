import { parseJsonResponse } from './projectApi.js';

const API_ROOT = '/api';

export async function uploadModel(projectId, file, { source = 'upload', title } = {}) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('source', source);
  if (title) formData.append('title', title);

  const response = await fetch(`${API_ROOT}/projects/${encodeURIComponent(projectId)}/models/upload`, {
    method: 'POST',
    body: formData
  });

  return parseJsonResponse(response, 'Model upload failed.');
}
