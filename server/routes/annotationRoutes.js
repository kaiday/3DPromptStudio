import { createAnnotation, deleteAnnotation, listAnnotations, updateAnnotation } from '../services/annotationService.js';

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

export function matchAnnotationRoute(pathname) {
  const collectionMatch = pathname.match(/^\/api\/projects\/([^/]+)\/annotations$/);
  if (collectionMatch) {
    return { projectId: decodeURIComponent(collectionMatch[1]), annotationId: null };
  }

  const itemMatch = pathname.match(/^\/api\/projects\/([^/]+)\/annotations\/([^/]+)$/);
  if (itemMatch) {
    return {
      projectId: decodeURIComponent(itemMatch[1]),
      annotationId: decodeURIComponent(itemMatch[2])
    };
  }

  return null;
}

export async function handleAnnotationRoute(request, response, { projectId, annotationId }, searchParams = new URLSearchParams()) {
  try {
    if (!annotationId && request.method === 'GET') {
      sendJson(response, 200, {
        annotations: listAnnotations(projectId, {
          status: searchParams.get('status'),
          partId: searchParams.get('partId'),
          variantId: searchParams.get('variantId')
        })
      });
      return true;
    }

    if (!annotationId && request.method === 'POST') {
      const payload = await parseJsonBody(request);
      sendJson(response, 201, { annotation: createAnnotation(projectId, payload) });
      return true;
    }

    if (annotationId && request.method === 'PATCH') {
      const patch = await parseJsonBody(request);
      sendJson(response, 200, { annotation: updateAnnotation(projectId, annotationId, patch) });
      return true;
    }

    if (annotationId && request.method === 'DELETE') {
      sendJson(response, 200, { annotation: deleteAnnotation(projectId, annotationId) });
      return true;
    }

    sendJson(response, 405, { error: 'Method not allowed.' });
    return true;
  } catch (error) {
    sendJson(response, 400, { error: error.message });
    return true;
  }
}
