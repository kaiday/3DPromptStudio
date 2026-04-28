export const COMPONENT_ALLOWED_OPERATIONS = Object.freeze([
  'colour',
  'material',
  'visibility',
  'scale',
  'position',
  'rotation',
  'annotation',
  'line',
  'cut_annotation'
]);

const DEFAULT_TRANSFORM_BOUNDS = Object.freeze({
  position: {
    min: [-5, -5, -5],
    max: [5, 5, 5]
  },
  scale: {
    min: [0.05, 0.05, 0.05],
    max: [5, 5, 5]
  },
  rotation: {
    min: [-Math.PI, -Math.PI, -Math.PI],
    max: [Math.PI, Math.PI, Math.PI]
  }
});

const DEFAULT_ORIGINAL_SNAPSHOT = Object.freeze({
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
  materialName: '',
  colour: '',
  visible: true
});

function isFiniteNumber(value) {
  return Number.isFinite(value);
}

function normalizeString(value, fallback, fieldName) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string') throw new Error(`${fieldName} must be a string.`);
  return value;
}

function normalizeBoolean(value, fallback) {
  return value === undefined || value === null ? fallback : Boolean(value);
}

function normalizeVector(value, fallback, fieldName) {
  if (value === undefined) return [...fallback];
  if (!Array.isArray(value) || value.length !== 3 || !value.every(isFiniteNumber)) {
    throw new Error(`${fieldName} must be an array of three finite numbers.`);
  }
  return [...value];
}

export function normalizeAllowedOperation(operation) {
  const normalized = operation === 'color' ? 'colour' : operation;
  if (!COMPONENT_ALLOWED_OPERATIONS.includes(normalized)) {
    throw new Error(`Unsupported component operation: ${operation}.`);
  }
  return normalized;
}

function normalizeAllowedOperations(operations) {
  const source = operations ?? COMPONENT_ALLOWED_OPERATIONS;
  if (!Array.isArray(source)) {
    throw new Error('allowedOperations must be an array.');
  }
  return Array.from(new Set(source.map(normalizeAllowedOperation)));
}

function normalizeTransformBounds(bounds = {}) {
  return {
    position: {
      min: normalizeVector(bounds.position?.min, DEFAULT_TRANSFORM_BOUNDS.position.min, 'transformBounds.position.min'),
      max: normalizeVector(bounds.position?.max, DEFAULT_TRANSFORM_BOUNDS.position.max, 'transformBounds.position.max')
    },
    scale: {
      min: normalizeVector(bounds.scale?.min, DEFAULT_TRANSFORM_BOUNDS.scale.min, 'transformBounds.scale.min'),
      max: normalizeVector(bounds.scale?.max, DEFAULT_TRANSFORM_BOUNDS.scale.max, 'transformBounds.scale.max')
    },
    rotation: {
      min: normalizeVector(bounds.rotation?.min, DEFAULT_TRANSFORM_BOUNDS.rotation.min, 'transformBounds.rotation.min'),
      max: normalizeVector(bounds.rotation?.max, DEFAULT_TRANSFORM_BOUNDS.rotation.max, 'transformBounds.rotation.max')
    }
  };
}

function normalizeOriginalSnapshot(snapshot = {}) {
  return {
    position: normalizeVector(snapshot.position, DEFAULT_ORIGINAL_SNAPSHOT.position, 'originalSnapshot.position'),
    rotation: normalizeVector(snapshot.rotation, DEFAULT_ORIGINAL_SNAPSHOT.rotation, 'originalSnapshot.rotation'),
    scale: normalizeVector(snapshot.scale, DEFAULT_ORIGINAL_SNAPSHOT.scale, 'originalSnapshot.scale'),
    materialName: normalizeString(snapshot.materialName, DEFAULT_ORIGINAL_SNAPSHOT.materialName, 'originalSnapshot.materialName'),
    colour: normalizeString(snapshot.colour ?? snapshot.color, DEFAULT_ORIGINAL_SNAPSHOT.colour, 'originalSnapshot.colour'),
    visible: normalizeBoolean(snapshot.visible, DEFAULT_ORIGINAL_SNAPSHOT.visible)
  };
}

function slugifyComponentId(value, fallback) {
  return (value || fallback)
    .trim()
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

export function normalizeComponent(component, index = 0) {
  if (!component || typeof component !== 'object' || Array.isArray(component)) {
    throw new Error('component must be an object.');
  }

  const meshName = normalizeString(component.meshName, '', 'meshName');
  const name = normalizeString(component.name, meshName || `Component ${index + 1}`, 'name');
  const id = normalizeString(component.id, slugifyComponentId(meshName || name, `component-${index + 1}`), 'id');

  return {
    id,
    meshName,
    name,
    materialName: normalizeString(component.materialName, '', 'materialName'),
    editable: normalizeBoolean(component.editable, true),
    allowedOperations: normalizeAllowedOperations(component.allowedOperations),
    transformBounds: normalizeTransformBounds(component.transformBounds),
    originalSnapshot: normalizeOriginalSnapshot(component.originalSnapshot)
  };
}

export function createDefaultComponentRegistry(projectId, overrides = {}) {
  return normalizeComponentRegistry({
    projectId,
    modelId: overrides.modelId ?? null,
    components: overrides.components ?? [],
    updatedAt: overrides.updatedAt ?? new Date().toISOString()
  });
}

export function normalizeComponentRegistry(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('component registry payload must be an object.');
  }

  const projectId = normalizeString(input.projectId, null, 'projectId');
  if (!projectId) throw new Error('projectId is required.');

  const components = input.components ?? [];
  if (!Array.isArray(components)) {
    throw new Error('components must be an array.');
  }

  return {
    projectId,
    modelId: normalizeString(input.modelId, null, 'modelId'),
    components: components.map(normalizeComponent),
    updatedAt: normalizeString(input.updatedAt, new Date().toISOString(), 'updatedAt')
  };
}
