import { parseJsonResponse } from './projectApi.js';

const API_ROOT = '/api';

function getTargetId(operation) {
  return (
    operation.target?.componentId ??
    operation.target?.partId ??
    operation.payload?.targetId ??
    operation.payload?.objectId ??
    operation.payload?.targetPartId ??
    null
  );
}

function normalizeOperation(operation) {
  const targetId = getTargetId(operation);
  const material = operation.payload?.material ?? {};
  const color = material.color ?? operation.payload?.color ?? operation.payload?.value;

  if (operation.type === 'change_material' || operation.type === 'set_scene_object_material' || operation.type === 'setColor') {
    if (!targetId || !color) return null;
    return {
      type: 'setColor',
      target: { componentId: targetId },
      payload: { color },
      source: { kind: 'manual', agent: 'frontend' }
    };
  }

  if (operation.type === 'set_part_visibility' || operation.type === 'set_scene_object_visibility' || operation.type === 'setVisibility') {
    if (!targetId || typeof operation.payload?.visible !== 'boolean') return null;
    return {
      type: 'setVisibility',
      target: { componentId: targetId },
      payload: { visible: operation.payload.visible },
      source: { kind: 'manual', agent: 'frontend' }
    };
  }

  if (operation.type === 'setMaterial') {
    if (!targetId || Object.keys(material).length === 0) return null;
    return {
      type: 'setMaterial',
      target: { componentId: targetId },
      payload: material,
      source: { kind: 'manual', agent: 'frontend' }
    };
  }

  return null;
}

function createSubmission(projectId, submittedOperations, backendPayload) {
  const acceptedAt = new Date().toISOString();
  return {
    id: backendPayload.revisionId ?? `submission-${Date.now()}`,
    projectId,
    acceptedAt,
    operationCount: submittedOperations.length,
    operations: submittedOperations.map((operation) => operation.id)
  };
}

export async function submitEditOperations(projectId, payload) {
  const queuedOperations = Array.isArray(payload.operations) ? payload.operations : [];
  const operations = queuedOperations.map(normalizeOperation);

  if (operations.some((operation) => operation === null)) {
    throw new Error('Some queued edits are annotations or unsupported local scene edits. Submit color/material/visibility edits through the Python operations API first.');
  }

  const response = await fetch(`${API_ROOT}/projects/${encodeURIComponent(projectId)}/operations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      sceneId: payload.workspaceId ?? projectId,
      mode: 'apply',
      operations
    })
  });
  const responsePayload = await parseJsonResponse(response, 'Edit operation submit failed.');
  return {
    ...responsePayload,
    submission: createSubmission(projectId, queuedOperations, responsePayload)
  };
}
