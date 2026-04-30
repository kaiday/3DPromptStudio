import { parseJsonResponse } from './projectApi.js';

const API_ROOT = '/api';

function projectGenerationPath(projectId, suffix = '') {
  return `/projects/${encodeURIComponent(projectId)}/generation/jobs${suffix}`;
}

function normalizeJobResponse(payload) {
  if (payload?.job) return payload;
  if (payload && typeof payload === 'object') return { job: payload };
  return { job: null };
}

function normalizeJobListResponse(payload) {
  if (Array.isArray(payload?.jobs)) return payload;
  if (Array.isArray(payload)) return { jobs: payload };
  return { jobs: [] };
}

export async function createGenerationJob(projectId, payload) {
  const response = await fetch(`${API_ROOT}${projectGenerationPath(projectId)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return normalizeJobResponse(await parseJsonResponse(response, 'Generation job creation failed.'));
}

export async function fetchGenerationJobs(projectId) {
  const response = await fetch(`${API_ROOT}${projectGenerationPath(projectId)}`);
  return normalizeJobListResponse(await parseJsonResponse(response, 'Generation job fetch failed.'));
}

export async function fetchGenerationJob(projectId, jobId) {
  const response = await fetch(`${API_ROOT}${projectGenerationPath(projectId, `/${encodeURIComponent(jobId)}`)}`);
  return normalizeJobResponse(await parseJsonResponse(response, 'Generation job fetch failed.'));
}

export async function cancelGenerationJob(projectId, jobId) {
  const response = await fetch(`${API_ROOT}${projectGenerationPath(projectId, `/${encodeURIComponent(jobId)}`)}`, {
    method: 'DELETE'
  });
  return normalizeJobResponse(await parseJsonResponse(response, 'Generation job cancel failed.'));
}
