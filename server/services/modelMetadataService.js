import {
  createDefaultComponentRegistry,
  normalizeAllowedOperation,
  normalizeComponentRegistry
} from '../schemas/modelMetadataSchema.js';

const registriesByProjectId = new Map();

export function getComponentRegistry(projectId) {
  if (!projectId) {
    throw new Error('projectId is required.');
  }

  if (!registriesByProjectId.has(projectId)) {
    registriesByProjectId.set(projectId, createDefaultComponentRegistry(projectId));
  }

  return registriesByProjectId.get(projectId);
}

export function saveComponentRegistry(projectId, registryPayload) {
  const registry = normalizeComponentRegistry({
    ...registryPayload,
    projectId,
    updatedAt: new Date().toISOString()
  });

  registriesByProjectId.set(projectId, registry);
  return registry;
}

export function getComponent(projectId, componentId) {
  return getComponentRegistry(projectId).components.find((component) => component.id === componentId) ?? null;
}

export function assertComponentAllowsOperation(projectId, componentId, operation) {
  const component = getComponent(projectId, componentId);
  if (!component) {
    throw new Error(`Unknown component: ${componentId}.`);
  }
  if (!component.editable) {
    throw new Error(`Component ${componentId} is not editable.`);
  }

  const normalizedOperation = normalizeAllowedOperation(operation);
  if (!component.allowedOperations.includes(normalizedOperation)) {
    throw new Error(`Component ${componentId} does not allow ${normalizedOperation} operations.`);
  }

  return component;
}

export function clearComponentRegistries() {
  registriesByProjectId.clear();
}
