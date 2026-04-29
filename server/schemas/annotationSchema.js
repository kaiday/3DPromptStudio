export const ANNOTATION_TYPES = Object.freeze(['pin', 'region', 'freehand_note', 'text_note', 'cut_guide', 'line']);
export const ANNOTATION_TARGET_TYPES = Object.freeze(['model', 'component', 'surface_point']);
export const ANNOTATION_STATUSES = Object.freeze(['open', 'resolved', 'archived']);

function isFiniteNumber(value) {
  return Number.isFinite(value);
}

function normalizeString(value, fallback, fieldName) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string') throw new Error(`${fieldName} must be a string.`);
  return value;
}

function normalizeEnum(value, fallback, allowedValues, fieldName) {
  const normalized = normalizeString(value, fallback, fieldName);
  if (!allowedValues.includes(normalized)) {
    throw new Error(`${fieldName} must be one of: ${allowedValues.join(', ')}.`);
  }
  return normalized;
}

function normalizeVector(value, fallback, fieldName) {
  if (value === undefined || value === null) return fallback;
  if (!Array.isArray(value) || value.length !== 3 || !value.every(isFiniteNumber)) {
    throw new Error(`${fieldName} must be an array of three finite numbers.`);
  }
  return [...value];
}

function normalizeScreenPosition(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('screenPosition must be an object.');
  }
  if (!isFiniteNumber(value.x) || !isFiniteNumber(value.y)) {
    throw new Error('screenPosition.x and screenPosition.y must be finite numbers.');
  }

  return {
    x: value.x,
    y: value.y
  };
}

function normalizeScreenPoints(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error('screenPoints must be an array.');
  return value.map((point, index) => {
    try {
      return normalizeScreenPosition(point);
    } catch (error) {
      throw new Error(`screenPoints[${index}] ${error.message}`);
    }
  });
}

function normalizePoints(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error('points must be an array.');
  return value.map((point, index) => normalizeVector(point, null, `points[${index}]`));
}

function normalizeCutPlane(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('cutPlane must be an object.');
  }

  return {
    origin: normalizeVector(value.origin, [0, 0, 0], 'cutPlane.origin'),
    normal: normalizeVector(value.normal, [0, 1, 0], 'cutPlane.normal')
  };
}

function createAnnotationId() {
  return `anno_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeAnnotation(input, defaults = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('annotation payload must be an object.');
  }

  const now = new Date().toISOString();
  const projectId = normalizeString(defaults.projectId ?? input.projectId, null, 'projectId');
  if (!projectId) throw new Error('projectId is required.');

  const type = normalizeEnum(input.type, defaults.type ?? 'pin', ANNOTATION_TYPES, 'type');
  const targetType = normalizeEnum(input.targetType, defaults.targetType ?? (input.partId ? 'component' : 'model'), ANNOTATION_TARGET_TYPES, 'targetType');
  const position = normalizeVector(input.position, null, 'position');
  const screenPosition = normalizeScreenPosition(input.screenPosition);
  const points = normalizePoints(input.points);
  const screenPoints = normalizeScreenPoints(input.screenPoints);
  const cutPlane = normalizeCutPlane(input.cutPlane);

  if (targetType === 'component' && !normalizeString(input.partId, defaults.partId ?? null, 'partId')) {
    throw new Error('partId is required for component annotations.');
  }

  if (targetType === 'surface_point' && !position && !screenPosition) {
    throw new Error('surface_point annotations require position or screenPosition.');
  }

  if (type === 'line' && points.length < 2 && screenPoints.length < 2) {
    throw new Error('line annotations require at least two points or two screenPoints.');
  }

  if (type === 'cut_guide' && points.length < 2 && screenPoints.length < 2 && !cutPlane) {
    throw new Error('cut_guide annotations require at least two points, two screenPoints, or a cutPlane.');
  }

  return {
    id: normalizeString(input.id, defaults.id ?? createAnnotationId(), 'id'),
    projectId,
    variantId: normalizeString(input.variantId, defaults.variantId ?? null, 'variantId'),
    partId: normalizeString(input.partId, defaults.partId ?? null, 'partId'),
    type,
    targetType,
    position,
    normal: normalizeVector(input.normal, null, 'normal'),
    screenPosition,
    points,
    screenPoints,
    cutPlane,
    label: normalizeString(input.label, defaults.label ?? '', 'label'),
    note: normalizeString(input.note, defaults.note ?? '', 'note'),
    authorId: normalizeString(input.authorId, defaults.authorId ?? 'anonymous', 'authorId'),
    sessionId: normalizeString(input.sessionId, defaults.sessionId ?? null, 'sessionId'),
    status: normalizeEnum(input.status, defaults.status ?? 'open', ANNOTATION_STATUSES, 'status'),
    createdAt: normalizeString(input.createdAt, defaults.createdAt ?? now, 'createdAt'),
    updatedAt: normalizeString(input.updatedAt, now, 'updatedAt')
  };
}

export function mergeAnnotationPatch(currentAnnotation, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new Error('annotation patch must be an object.');
  }

  return normalizeAnnotation({
    ...currentAnnotation,
    ...patch,
    id: currentAnnotation.id,
    projectId: currentAnnotation.projectId,
    createdAt: currentAnnotation.createdAt,
    updatedAt: new Date().toISOString()
  });
}
