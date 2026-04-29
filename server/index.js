import { createServer } from 'node:http';
import { handleAnnotationRoute, matchAnnotationRoute } from './routes/annotationRoutes.js';
import { handleComponentRoute, matchComponentRoute } from './routes/componentRoutes.js';
import { handleOperationRoute, matchOperationRoute } from './routes/operationRoutes.js';
import { handlePromptRoute, matchPromptRoute } from './routes/promptRoutes.js';
import { handleWorkspaceRoute, matchWorkspaceRoute } from './routes/workspaceRoutes.js';

const DEFAULT_PORT = 3001;

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

export async function handleRequest(request, response) {
  const url = new URL(request.url, `http://${request.headers.host ?? 'localhost'}`);

  if (url.pathname === '/api/health') {
    sendJson(response, 200, { status: 'ok' });
    return;
  }

  const workspaceRoute = matchWorkspaceRoute(url.pathname);
  if (workspaceRoute) {
    await handleWorkspaceRoute(request, response, workspaceRoute);
    return;
  }

  const componentRoute = matchComponentRoute(url.pathname);
  if (componentRoute) {
    await handleComponentRoute(request, response, componentRoute);
    return;
  }

  const annotationRoute = matchAnnotationRoute(url.pathname);
  if (annotationRoute) {
    await handleAnnotationRoute(request, response, annotationRoute, url.searchParams);
    return;
  }

  const operationRoute = matchOperationRoute(url.pathname);
  if (operationRoute) {
    await handleOperationRoute(request, response, operationRoute);
    return;
  }

  const promptRoute = matchPromptRoute(url.pathname);
  if (promptRoute) {
    await handlePromptRoute(request, response, promptRoute);
    return;
  }

  sendJson(response, 404, { error: 'Route not found.' });
}

export function createApiServer() {
  return createServer((request, response) => {
    handleRequest(request, response).catch((error) => {
      sendJson(response, 500, { error: error.message });
    });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  const server = createApiServer();

  server.listen(port, () => {
    console.log(`3DPromptStudio API listening on http://127.0.0.1:${port}`);
  });
}
