export const WORKSPACE_TOOLS = Object.freeze(['mouse', 'annotation', 'line', 'cut', 'zoom']);
export const RIGHT_PANEL_MODES = Object.freeze(['config', 'prompt']);
export const MAX_HISTORY_ITEMS = 50;

const DEFAULT_CAMERA_POSITION = [3, 2.2, 4];
const DEFAULT_CAMERA_TARGET = [0, 0.8, 0];

function isFiniteNumber(value) {
  return Number.isFinite(value);
}

function normalizeVector(value, fallback, fieldName) {
  if (value === undefined) return [...fallback];

  if (!Array.isArray(value) || value.length !== 3 || !value.every(isFiniteNumber)) {
    throw new Error(`${fieldName} must be an array of three finite numbers.`);
  }

  return [...value];
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

function normalizeViewport(value = {}) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('viewport must be an object.');
  }

  const zoom = value.zoom ?? 1;
  if (!isFiniteNumber(zoom) || zoom <= 0) {
    throw new Error('viewport.zoom must be a positive number.');
  }

  return {
    cameraPosition: normalizeVector(value.cameraPosition, DEFAULT_CAMERA_POSITION, 'viewport.cameraPosition'),
    cameraTarget: normalizeVector(value.cameraTarget, DEFAULT_CAMERA_TARGET, 'viewport.cameraTarget'),
    zoom,
    visibleHelpers: {
      grid: value.visibleHelpers?.grid ?? true,
      ground: value.visibleHelpers?.ground ?? true,
      annotations: value.visibleHelpers?.annotations ?? true
    }
  };
}

function normalizeOperation(operation, index) {
  if (!operation || typeof operation !== 'object' || Array.isArray(operation)) {
    throw new Error(`operations[${index}] must be an object.`);
  }

  const opType = normalizeString(operation.op, null, `operations[${index}].op`);
  if (!opType) {
    throw new Error(`operations[${index}].op is required.`);
  }

  return {
    op: opType,
    targetId: normalizeString(operation.targetId, null, `operations[${index}].targetId`),
    payload: operation.payload && typeof operation.payload === 'object' ? { ...operation.payload } : {},
    timestamp: normalizeString(operation.timestamp, new Date().toISOString(), `operations[${index}].timestamp`)
  };
}

function normalizeList(value, fieldName) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error(`${fieldName} must be an array.`);
  return value;
}

function normalizeHistory(input = {}) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('history must be an object.');
  }

  const past = normalizeList(input.past, 'history.past').slice(-MAX_HISTORY_ITEMS);
  const future = normalizeList(input.future, 'history.future').slice(-MAX_HISTORY_ITEMS);

  return { past, future };
}

export function createDefaultWorkspace(projectId, overrides = {}) {
  if (!projectId) {
    throw new Error('projectId is required to create a workspace.');
  }

  return normalizeWorkspace({
    workspaceId: overrides.workspaceId ?? `workspace_${projectId}`,
    projectId,
    modelId: overrides.modelId ?? null,
    currentVariantId: overrides.currentVariantId ?? null,
    selectedTool: overrides.selectedTool ?? 'mouse',
    selectedPartId: overrides.selectedPartId ?? null,
    rightPanelMode: overrides.rightPanelMode ?? 'config',
    viewport: overrides.viewport ?? {},
    scene: overrides.scene ?? { components: [] },
    lastOperations: overrides.lastOperations ?? [],
    promptHistory: overrides.promptHistory ?? [],
    variantHistory: overrides.variantHistory ?? [],
    history: overrides.history ?? { past: [], future: [] },
    hasUnsavedOperations: overrides.hasUnsavedOperations ?? false,
    updatedAt: overrides.updatedAt ?? new Date().toISOString()
  });
}

export function normalizeWorkspace(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('workspace payload must be an object.');
  }

  const projectId = normalizeString(input.projectId, null, 'projectId');
  if (!projectId) throw new Error('projectId is required.');

  return {
    workspaceId: normalizeString(input.workspaceId, `workspace_${projectId}`, 'workspaceId'),
    projectId,
    modelId: normalizeString(input.modelId, null, 'modelId'),
    currentVariantId: normalizeString(input.currentVariantId, null, 'currentVariantId'),
    selectedTool: normalizeEnum(input.selectedTool, 'mouse', WORKSPACE_TOOLS, 'selectedTool'),
    selectedPartId: normalizeString(input.selectedPartId, null, 'selectedPartId'),
    rightPanelMode: normalizeEnum(input.rightPanelMode, 'config', RIGHT_PANEL_MODES, 'rightPanelMode'),
    viewport: normalizeViewport(input.viewport),
    scene: input.scene && typeof input.scene === 'object' && !Array.isArray(input.scene)
      ? { components: Array.isArray(input.scene.components) ? input.scene.components : [] }
      : { components: [] },
    lastOperations: normalizeList(input.lastOperations, 'lastOperations')
      .map((operation, index) => normalizeOperation(operation, index))
      .slice(-25),
    promptHistory: normalizeList(input.promptHistory, 'promptHistory')
      .map((entry, index) => ({
        id: normalizeString(entry?.id, `prompt_${index + 1}`, `promptHistory[${index}].id`),
        prompt: normalizeString(entry?.prompt, '', `promptHistory[${index}].prompt`),
        createdAt: normalizeString(entry?.createdAt, new Date().toISOString(), `promptHistory[${index}].createdAt`)
      }))
      .slice(-MAX_HISTORY_ITEMS),
    variantHistory: normalizeList(input.variantHistory, 'variantHistory')
      .map((entry, index) => ({
        id: normalizeString(entry?.id, `variant_${index + 1}`, `variantHistory[${index}].id`),
        label: normalizeString(entry?.label, 'Variant', `variantHistory[${index}].label`),
        createdAt: normalizeString(entry?.createdAt, new Date().toISOString(), `variantHistory[${index}].createdAt`)
      }))
      .slice(-MAX_HISTORY_ITEMS),
    history: normalizeHistory(input.history),
    hasUnsavedOperations: Boolean(input.hasUnsavedOperations),
    updatedAt: normalizeString(input.updatedAt, new Date().toISOString(), 'updatedAt')
  };
}

export function mergeWorkspacePatch(currentWorkspace, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new Error('workspace patch must be an object.');
  }

  return normalizeWorkspace({
    ...currentWorkspace,
    ...patch,
    projectId: currentWorkspace.projectId,
    workspaceId: currentWorkspace.workspaceId,
    viewport: {
      ...currentWorkspace.viewport,
      ...(patch.viewport ?? {}),
      visibleHelpers: {
        ...currentWorkspace.viewport.visibleHelpers,
        ...(patch.viewport?.visibleHelpers ?? {})
      }
    },
    scene: patch.scene ?? currentWorkspace.scene,
    lastOperations: patch.lastOperations ?? currentWorkspace.lastOperations,
    promptHistory: patch.promptHistory ?? currentWorkspace.promptHistory,
    variantHistory: patch.variantHistory ?? currentWorkspace.variantHistory,
    history: patch.history ?? currentWorkspace.history,
    updatedAt: new Date().toISOString()
  });
}
