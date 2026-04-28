import { getWorkspaceRecord, upsertWorkspaceRecord } from '../db/client.js';
import { mergeWorkspacePatch, normalizeWorkspace } from '../schemas/workspaceSchema.js';
import { applyEditOperations } from './editValidationService.js';
import { getComponentRegistry } from './modelMetadataService.js';

function nowIso() {
  return new Date().toISOString();
}

function createDefaultWorkspace(projectId) {
  return normalizeWorkspace({
    workspaceId: `workspace_${projectId}`,
    projectId,
    selectedTool: 'mouse',
    rightPanelMode: 'config',
    viewport: {},
    scene: {
      components: [
        {
          id: 'part_main',
          name: 'Main Body',
          visible: true,
          material: { color: '#cccccc', type: 'standard' },
          transform: {
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1]
          }
        }
      ]
    },
    lastOperations: [],
    promptHistory: [],
    variantHistory: [],
    history: { past: [], future: [] },
    hasUnsavedOperations: false,
    updatedAt: nowIso()
  });
}

function snapshotWorkspace(workspace) {
  return {
    scene: workspace.scene,
    selectedPartId: workspace.selectedPartId,
    selectedTool: workspace.selectedTool,
    rightPanelMode: workspace.rightPanelMode,
    currentVariantId: workspace.currentVariantId,
    lastOperations: workspace.lastOperations
  };
}

function toRecord(workspace, existingRecord) {
  return {
    id: workspace.workspaceId,
    projectId: workspace.projectId,
    modelId: workspace.modelId,
    currentVariantId: workspace.currentVariantId,
    selectedTool: workspace.selectedTool,
    selectedPartId: workspace.selectedPartId,
    rightPanelMode: workspace.rightPanelMode,
    workspaceStateJson: JSON.stringify(workspace),
    hasUnsavedOperations: workspace.hasUnsavedOperations,
    createdAt: existingRecord?.createdAt ?? workspace.updatedAt,
    updatedAt: workspace.updatedAt
  };
}

async function loadWorkspace(projectId) {
  const existingRecord = await getWorkspaceRecord(projectId);
  if (!existingRecord) {
    return createDefaultWorkspace(projectId);
  }

  try {
    return normalizeWorkspace(JSON.parse(existingRecord.workspaceStateJson));
  } catch {
    return createDefaultWorkspace(projectId);
  }
}

export async function getWorkspace(projectId) {
  if (!projectId) throw new Error('projectId is required.');
  const workspace = await loadWorkspace(projectId);
  const record = await getWorkspaceRecord(projectId);
  if (!record) {
    await upsertWorkspaceRecord(toRecord(workspace));
  }
  return workspace;
}

export async function saveWorkspace(workspace) {
  const normalized = normalizeWorkspace(workspace);
  const existingRecord = await getWorkspaceRecord(normalized.projectId);
  await upsertWorkspaceRecord(toRecord(normalized, existingRecord));
  return normalized;
}

export async function updateWorkspace(projectId, patch) {
  const currentWorkspace = await getWorkspace(projectId);
  const updatedWorkspace = mergeWorkspacePatch(currentWorkspace, patch);
  const withHistory = normalizeWorkspace({
    ...updatedWorkspace,
    history: {
      past: [...currentWorkspace.history.past, snapshotWorkspace(currentWorkspace)].slice(-50),
      future: []
    }
  });
  return saveWorkspace(withHistory);
}

export async function applyWorkspacePrompt(projectId, prompt, operations) {
  const currentWorkspace = await getWorkspace(projectId);
  const componentRegistry = getComponentRegistry(projectId);
  const updatedScene = applyEditOperations(currentWorkspace.scene, operations, {
    components: componentRegistry.components
  });
  const createdAt = nowIso();
  const variantId = `variant_${Date.now()}`;

  return saveWorkspace({
    ...currentWorkspace,
    scene: updatedScene,
    currentVariantId: variantId,
    lastOperations: operations.map((operation) => ({ ...operation, timestamp: createdAt })),
    hasUnsavedOperations: true,
    promptHistory: [
      ...currentWorkspace.promptHistory,
      { id: `prompt_${Date.now()}`, prompt, createdAt }
    ].slice(-50),
    variantHistory: [
      ...currentWorkspace.variantHistory,
      { id: variantId, label: `Variant ${currentWorkspace.variantHistory.length + 1}`, createdAt }
    ].slice(-50),
    history: {
      past: [...currentWorkspace.history.past, snapshotWorkspace(currentWorkspace)].slice(-50),
      future: []
    },
    updatedAt: createdAt
  });
}

export async function undoWorkspace(projectId) {
  const currentWorkspace = await getWorkspace(projectId);
  if (!currentWorkspace.history.past.length) {
    return currentWorkspace;
  }

  const previousSnapshot = currentWorkspace.history.past[currentWorkspace.history.past.length - 1];
  const nextWorkspace = normalizeWorkspace({
    ...currentWorkspace,
    ...previousSnapshot,
    history: {
      past: currentWorkspace.history.past.slice(0, -1),
      future: [...currentWorkspace.history.future, snapshotWorkspace(currentWorkspace)].slice(-50)
    },
    updatedAt: nowIso()
  });
  return saveWorkspace(nextWorkspace);
}

export async function redoWorkspace(projectId) {
  const currentWorkspace = await getWorkspace(projectId);
  if (!currentWorkspace.history.future.length) {
    return currentWorkspace;
  }

  const nextSnapshot = currentWorkspace.history.future[currentWorkspace.history.future.length - 1];
  const nextWorkspace = normalizeWorkspace({
    ...currentWorkspace,
    ...nextSnapshot,
    history: {
      past: [...currentWorkspace.history.past, snapshotWorkspace(currentWorkspace)].slice(-50),
      future: currentWorkspace.history.future.slice(0, -1)
    },
    updatedAt: nowIso()
  });
  return saveWorkspace(nextWorkspace);
}
