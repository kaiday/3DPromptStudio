import { getComponentRegistry, saveComponentRegistry } from '../services/modelMetadataService.js';

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

export function matchComponentRoute(pathname) {
  const match = pathname.match(/^\/api\/projects\/([^/]+)\/components$/);
  return match ? { projectId: decodeURIComponent(match[1]) } : null;
}

export async function handleComponentRoute(request, response, { projectId }) {
  try {
    if (request.method === 'GET') {
      sendJson(response, 200, { registry: getComponentRegistry(projectId) });
      return true;
    }

    if (request.method === 'PUT') {
      const payload = await parseJsonBody(request);
      sendJson(response, 200, { registry: saveComponentRegistry(projectId, payload) });
      return true;
    }

    sendJson(response, 405, { error: 'Method not allowed.' });
    return true;
  } catch (error) {
    sendJson(response, 400, { error: error.message });
    return true;
  }
}
