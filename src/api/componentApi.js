import { parseJsonResponse } from './projectApi.js';

const API_ROOT = '/api';

function toBackendComponent(part) {
  const material = part.material ?? {};
  return {
    id: part.id,
    name: part.name ?? part.id,
    meshName: part.objectName ?? part.meshName ?? part.id,
    materialName: material.name ?? material.type ?? '',
    editable: part.editable !== false,
    originalSnapshot: {
      color: material.color ?? '',
      visible: part.visible !== false
    }
  };
}

export async function saveComponentRegistry(projectId, parts, { modelId } = {}) {
  const response = await fetch(`${API_ROOT}/projects/${encodeURIComponent(projectId)}/components`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      modelId,
      components: parts.map(toBackendComponent)
    })
  });

  return parseJsonResponse(response, 'Component registry save failed.');
}
