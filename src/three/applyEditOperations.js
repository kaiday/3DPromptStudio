import { setMaterialColor } from './materialUtils.js';

const TRANSFORM_LIMIT = 5;
const SCALE_MIN = 0.05;
const SCALE_MAX = 5;
const OPERATION_EDIT_MAP = {
  set_material_color: 'color',
  set_visibility: 'visibility',
  set_scale: 'scale',
  set_position: 'position',
  set_rotation: 'rotation',
  reset_part: 'visibility'
};

function assertFiniteVector(values, field) {
  if (!Array.isArray(values) || values.length !== 3 || values.some((value) => !Number.isFinite(value))) {
    throw new Error(`${field} must be an array of three finite numbers.`);
  }
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function applyOperation(registry, operation) {
  if (operation.op === 'reset_all') {
    registry.resetAll();
    return;
  }

  const part = registry.getPart(operation.target);
  if (!part) {
    throw new Error(`Unknown editable part: ${operation.target}`);
  }

  const requiredEdit = OPERATION_EDIT_MAP[operation.op];
  if (requiredEdit && !part.allowedEdits.includes(requiredEdit)) {
    throw new Error(`Part ${operation.target} does not allow ${requiredEdit} edits.`);
  }

  if (operation.op === 'set_material_color') {
    setMaterialColor(part.mesh.material, operation.color);
    return;
  }

  if (operation.op === 'set_visibility') {
    part.mesh.visible = Boolean(operation.visible);
    return;
  }

  if (operation.op === 'set_scale') {
    assertFiniteVector(operation.scale, 'scale');
    part.mesh.scale.set(
      clamp(operation.scale[0], SCALE_MIN, SCALE_MAX),
      clamp(operation.scale[1], SCALE_MIN, SCALE_MAX),
      clamp(operation.scale[2], SCALE_MIN, SCALE_MAX)
    );
    return;
  }

  if (operation.op === 'set_position') {
    assertFiniteVector(operation.position, 'position');
    part.mesh.position.set(
      clamp(operation.position[0], -TRANSFORM_LIMIT, TRANSFORM_LIMIT),
      clamp(operation.position[1], -TRANSFORM_LIMIT, TRANSFORM_LIMIT),
      clamp(operation.position[2], -TRANSFORM_LIMIT, TRANSFORM_LIMIT)
    );
    return;
  }

  if (operation.op === 'set_rotation') {
    assertFiniteVector(operation.rotation, 'rotation');
    part.mesh.rotation.set(operation.rotation[0], operation.rotation[1], operation.rotation[2]);
    return;
  }

  if (operation.op === 'reset_part') {
    registry.resetPart(operation.target);
    return;
  }

  throw new Error(`Unsupported edit operation: ${operation.op}`);
}

export function applyEditOperations(registry, operations) {
  const applied = [];
  const failed = [];

  operations.forEach((operation) => {
    try {
      applyOperation(registry, operation);
      applied.push(operation);
    } catch (error) {
      failed.push({ operation, error: error.message });
    }
  });

  return {
    applied,
    failed,
    summary: `Applied ${applied.length} operation${applied.length === 1 ? '' : 's'}${failed.length ? `, ${failed.length} failed` : ''}.`
  };
}
