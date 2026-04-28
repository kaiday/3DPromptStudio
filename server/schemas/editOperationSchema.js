export const ALLOWED_OPERATIONS = Object.freeze([
  'setColor',
  'setVisibility',
  'setMaterial',
  'setPosition',
  'setScale',
  'setRotation'
]);

const OPERATION_TO_COMPONENT_PERMISSION = Object.freeze({
  setColor: 'colour',
  setVisibility: 'visibility',
  setMaterial: 'material',
  setPosition: 'position',
  setScale: 'scale',
  setRotation: 'rotation'
});

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteNumber(value) {
  return Number.isFinite(value);
}

function validateVector(value, fieldName) {
  if (!Array.isArray(value) || value.length !== 3 || !value.every(isFiniteNumber)) {
    throw new Error(`${fieldName} must be an array of three finite numbers.`);
  }
  return [...value];
}

function assertVectorWithinBounds(vector, bounds, fieldName) {
  if (!bounds) return;
  const min = bounds.min ?? [];
  const max = bounds.max ?? [];
  vector.forEach((value, index) => {
    if (Number.isFinite(min[index]) && value < min[index]) {
      throw new Error(`${fieldName}[${index}] is below the allowed minimum.`);
    }
    if (Number.isFinite(max[index]) && value > max[index]) {
      throw new Error(`${fieldName}[${index}] is above the allowed maximum.`);
    }
  });
}

function validateHexColor(value) {
  if (typeof value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value)) {
    throw new Error('operation.payload.color must be a #RRGGBB hex colour.');
  }
  return value;
}

function validatePayload(operation, component) {
  switch (operation.op) {
    case 'setColor':
      return { color: validateHexColor(operation.payload.color) };
    case 'setVisibility':
      if (typeof operation.payload.visible !== 'boolean') {
        throw new Error('operation.payload.visible must be a boolean.');
      }
      return { visible: operation.payload.visible };
    case 'setMaterial':
      if (!operation.payload.type || typeof operation.payload.type !== 'string') {
        throw new Error('operation.payload.type must be a string.');
      }
      return { type: operation.payload.type };
    case 'setPosition': {
      const position = validateVector(operation.payload.position, 'operation.payload.position');
      assertVectorWithinBounds(position, component?.transformBounds?.position, 'operation.payload.position');
      return { position };
    }
    case 'setScale': {
      const scale = validateVector(operation.payload.scale, 'operation.payload.scale');
      assertVectorWithinBounds(scale, component?.transformBounds?.scale, 'operation.payload.scale');
      return { scale };
    }
    case 'setRotation': {
      const rotation = validateVector(operation.payload.rotation, 'operation.payload.rotation');
      assertVectorWithinBounds(rotation, component?.transformBounds?.rotation, 'operation.payload.rotation');
      return { rotation };
    }
    default:
      return { ...operation.payload };
  }
}

export function getComponentPermissionForOperation(operationType) {
  return OPERATION_TO_COMPONENT_PERMISSION[operationType] ?? null;
}

export function validateOperation(operation, knownPartIds = [], componentsById = new Map()) {
  if (!isObject(operation)) {
    throw new Error('Each operation must be an object.');
  }

  if (!ALLOWED_OPERATIONS.includes(operation.op)) {
    throw new Error(`Unsupported operation "${operation.op}".`);
  }

  if (!operation.targetId || typeof operation.targetId !== 'string') {
    throw new Error('operation.targetId is required.');
  }

  if (knownPartIds.length > 0 && !knownPartIds.includes(operation.targetId)) {
    throw new Error(`Unknown targetId "${operation.targetId}".`);
  }

  if (!isObject(operation.payload)) {
    throw new Error('operation.payload must be an object.');
  }

  const component = componentsById.get(operation.targetId);
  if (component) {
    if (component.editable === false) {
      throw new Error(`Component ${operation.targetId} is not editable.`);
    }

    const requiredPermission = getComponentPermissionForOperation(operation.op);
    if (requiredPermission && !component.allowedOperations?.includes(requiredPermission)) {
      throw new Error(`Component ${operation.targetId} does not allow ${requiredPermission} operations.`);
    }
  }

  return {
    op: operation.op,
    targetId: operation.targetId,
    payload: validatePayload(operation, component)
  };
}

export function validateOperations(operations, knownPartIds = [], components = []) {
  if (!Array.isArray(operations) || operations.length === 0) {
    throw new Error('operations must be a non-empty array.');
  }

  const componentsById = new Map(components.map((component) => [component.id, component]));
  return operations.map((operation) => validateOperation(operation, knownPartIds, componentsById));
}
