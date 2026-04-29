import { applyWorkspaceOperations } from '../services/workspaceService.js';

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

function parseJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';

    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error('Request body is too large.'));
        request.destroy();
      }
    });

    request.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Request body must be valid JSON.'));
      }
    });

    request.on('error', reject);
  });
}

export function matchOperationRoute(pathname) {
  const match = pathname.match(/^\/api\/projects\/([^/]+)\/operations$/);
  return match ? { projectId: decodeURIComponent(match[1]) } : null;
}

export async function handleOperationRoute(request, response, { projectId }) {
  try {
    if (request.method !== 'POST') {
      sendJson(response, 405, { error: 'Method not allowed.' });
      return true;
    }

    const payload = await parseJsonBody(request);
    const workspace = await applyWorkspaceOperations(projectId, payload.operations, {
      source: payload.source ?? 'config',
      label: payload.label
    });

    sendJson(response, 200, {
      workspace,
      operations: workspace.lastOperations
    });
    return true;
  } catch (error) {
    sendJson(response, 400, { error: error.message });
    return true;
  }
}
