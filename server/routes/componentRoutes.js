import { getComponent, getComponentRegistry, saveComponentRegistry } from '../services/modelMetadataService.js';

const CONFIG_FIELD_BY_PERMISSION = Object.freeze({
  colour: { operation: 'setColor', field: 'color', valueType: 'hexColor', label: 'Colour' },
  material: { operation: 'setMaterial', field: 'type', valueType: 'string', label: 'Material' },
  visibility: { operation: 'setVisibility', field: 'visible', valueType: 'boolean', label: 'Visibility' },
  position: { operation: 'setPosition', field: 'position', valueType: 'vector3', label: 'Position' },
  scale: { operation: 'setScale', field: 'scale', valueType: 'vector3', label: 'Scale' },
  rotation: { operation: 'setRotation', field: 'rotation', valueType: 'vector3', label: 'Rotation' }
});

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
  const collectionMatch = pathname.match(/^\/api\/projects\/([^/]+)\/components$/);
  if (collectionMatch) {
    return { projectId: decodeURIComponent(collectionMatch[1]), partId: null, action: null };
  }

  const configMatch = pathname.match(/^\/api\/projects\/([^/]+)\/components\/([^/]+)\/config$/);
  if (configMatch) {
    return {
      projectId: decodeURIComponent(configMatch[1]),
      partId: decodeURIComponent(configMatch[2]),
      action: 'config'
    };
  }

  return null;
}

function buildComponentConfig(projectId, partId) {
  const component = getComponent(projectId, partId);
  if (!component) {
    throw new Error(`Unknown component: ${partId}.`);
  }

  return {
    projectId,
    partId: component.id,
    component: {
      id: component.id,
      name: component.name,
      meshName: component.meshName,
      materialName: component.materialName,
      originalSnapshot: component.originalSnapshot
    },
    editable: component.editable,
    editableFields: component.allowedOperations
      .map((operation) => CONFIG_FIELD_BY_PERMISSION[operation])
      .filter(Boolean),
    allowedOperations: component.allowedOperations,
    transformBounds: component.transformBounds
  };
}

export async function handleComponentRoute(request, response, { projectId, partId, action }) {
  try {
    if (request.method === 'GET' && action === 'config') {
      sendJson(response, 200, { config: buildComponentConfig(projectId, partId) });
      return true;
    }

    if (request.method === 'GET' && !action) {
      sendJson(response, 200, { registry: getComponentRegistry(projectId) });
      return true;
    }

    if (request.method === 'PUT' && !action) {
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
