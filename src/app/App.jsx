import { useCallback, useEffect, useRef, useMemo, useState } from 'react';
import { saveComponentRegistry } from '../api/componentApi.js';
import { submitEditOperations } from '../api/editOperationsApi.js';
import { cancelGenerationJob, createGenerationJob } from '../api/generationApi.js';
import { subscribeToGenerationJob } from '../api/generationEvents.js';
import { createMockGenerationJob, isMockGenerationEnabled, subscribeToMockGenerationJob } from '../api/generationMock.js';
import { fetchComponentInteractions, saveComponentInteractions } from '../api/interactionsApi.js';
import { uploadModel } from '../api/modelApi.js';
import { submitPrompt } from '../api/promptApi.js';
import { fetchWorkspace, patchWorkspace, redoWorkspace, undoWorkspace } from '../api/projectApi.js';
import { ErrorBanner } from '../components/ErrorBanner.jsx';
import { GenerationQueue } from '../components/GenerationQueue.jsx';
import { LoadingOverlay } from '../components/LoadingOverlay.jsx';
import { PartInspector } from '../components/PartInspector.jsx';
import { PromptComposer } from '../components/PromptComposer.jsx';
import { PromptHistory } from '../components/PromptHistory.jsx';
import { SceneViewport } from '../components/SceneViewport.jsx';
import { VariantHistory } from '../components/VariantHistory.jsx';
import { useHistoryStore } from '../state/historyStore.js';
import { useGenerationStore } from '../state/generationStore.js';
import { useSceneStore } from '../state/sceneStore.js';
import { useSelectionStore } from '../state/selectionStore.js';
import { mergePartRegistries } from '../three/partRegistry.js';
import '../styles/theme.css';

const PROJECT_ID = 'default-project';
const TOOL_OPTIONS = [
  { id: 'mouse', label: 'Select', shortcut: 'V', icon: 'select' },
  { id: 'annotation', label: 'Annotate', shortcut: 'A', icon: 'annotate' },
  { id: 'line', label: 'Line', shortcut: 'L', icon: 'line' },
  { id: 'cut', label: 'Cut', shortcut: 'C', icon: 'cut' },
  { id: 'zoom-in', label: 'Zoom in', shortcut: '+', icon: 'zoomIn' },
  { id: 'zoom-out', label: 'Zoom out', shortcut: '-', icon: 'zoomOut' }
];
const WORKSPACE_MODES = new Set(['edit', 'maker', 'play']);

function getInitialTheme() {
  if (typeof window === 'undefined') return 'dark';
  return window.localStorage.getItem('3dpromptstudio-theme') ?? 'dark';
}

function getStoredBoolean(key, fallback) {
  if (typeof window === 'undefined') return fallback;
  const storedValue = window.localStorage.getItem(key);
  if (storedValue === null) return fallback;
  return storedValue === 'true';
}

function normalizeTool(tool) {
  if (tool === 'zoom') return 'zoom-in';
  return TOOL_OPTIONS.some((option) => option.id === tool) ? tool : 'mouse';
}

function toBackendTool(tool) {
  const normalizedTool = normalizeTool(tool);
  if (normalizedTool === 'zoom-in' || normalizedTool === 'zoom-out') return 'zoom';
  return normalizedTool;
}

function normalizeWorkspaceMode(mode) {
  return WORKSPACE_MODES.has(mode) ? mode : 'edit';
}

function isTypingTarget(target) {
  const tagName = target?.tagName?.toLowerCase();
  return target?.isContentEditable || tagName === 'input' || tagName === 'textarea' || tagName === 'select';
}

function getWorkspaceName(workspace) {
  return workspace?.name ?? workspace?.projectName ?? workspace?.title ?? 'Workspace';
}

function getModelFileName(workspace) {
  return (
    workspace?.model?.originalFilename ??
    workspace?.model?.filename ??
    workspace?.modelName ??
    workspace?.scene?.modelName ??
    'No model loaded'
  );
}

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getImportStatusLabel(status, meshCount) {
  if (status === 'loading') return 'Loading';
  if (status === 'ready') return `${meshCount} meshes`;
  if (status === 'error') return 'Failed';
  return 'Local';
}

function getPartDepth(part) {
  if (Number.isFinite(part.depth)) return part.depth;
  if (Number.isFinite(part.level)) return part.level;
  if (part.parentId || part.parent_id) return 1;
  return 0;
}

function getPartKind(part) {
  return part.type ?? part.kind ?? part.nodeType ?? 'mesh';
}

function isPartEditable(part) {
  if (typeof part.editable === 'boolean') return part.editable;
  if (Array.isArray(part.allowedEdits)) return part.allowedEdits.length > 0;
  return true;
}

function isPartVisible(part) {
  return part.visible !== false;
}

function getSceneObjectDefaults(tool) {
  if (tool === 'line') return { type: 'guide_line', name: 'Guide line', color: '#c68a2d' };
  if (tool === 'cut') return { type: 'cut_plane', name: 'Cut plane', color: '#ff3b30' };
  return { type: 'annotation', name: 'Annotation', color: '#0a84ff' };
}

function getOperationTypeForSceneObject(sceneObject) {
  if (sceneObject.type === 'guide_line') return 'draw_guide_line';
  if (sceneObject.type === 'cut_plane') return 'propose_cut_plane';
  return 'annotate_part';
}

function createSceneObjectOperation(sceneObject) {
  const basePayload = {
    objectId: sceneObject.id,
    label: sceneObject.name,
    targetPartId: sceneObject.attachedTo,
    anchor: sceneObject.position,
    normal: sceneObject.normal,
    color: sceneObject.material?.color ?? null
  };

  return {
    type: getOperationTypeForSceneObject(sceneObject),
    payload: {
      ...basePayload,
      ...(sceneObject.endPosition ? { endPoint: sceneObject.endPosition } : {}),
      ...(Number.isFinite(sceneObject.size) ? { size: sceneObject.size } : {})
    }
  };
}

function createPartPatchOperation(part, patch) {
  if (patch.name !== undefined) {
    return {
      type: part?.source === 'scene-object' ? 'rename_scene_object' : 'rename_part',
      payload: {
        targetId: part?.id,
        previousName: part?.name ?? null,
        name: patch.name
      }
    };
  }

  if (patch.visible !== undefined) {
    return {
      type: part?.source === 'scene-object' ? 'set_scene_object_visibility' : 'set_part_visibility',
      payload: {
        targetId: part?.id,
        visible: patch.visible
      }
    };
  }

  if (patch.material?.color) {
    return {
      type: part?.source === 'scene-object' ? 'set_scene_object_material' : 'change_material',
      payload: {
        targetId: part?.id,
        material: {
          color: patch.material.color
        }
      }
    };
  }

  if (Array.isArray(patch.position)) {
    return {
      type: 'setPosition',
      target: { componentId: part?.id },
      payload: {
        position: patch.position,
        mode: 'absolute'
      }
    };
  }

  if (Array.isArray(patch.rotation)) {
    return {
      type: 'setRotation',
      target: { componentId: part?.id },
      payload: {
        rotation: patch.rotation,
        unit: 'radians',
        mode: 'absolute'
      }
    };
  }

  if (Array.isArray(patch.scale)) {
    return {
      type: 'setScale',
      target: { componentId: part?.id },
      payload: {
        scale: patch.scale,
        mode: 'absolute'
      }
    };
  }

  return {
    type: 'patch_part',
    payload: {
      targetId: part?.id,
      patch
    }
  };
}

function createPartPatchLabel(part, partId, patch) {
  const name = part?.name ?? partId;
  if (patch.visible !== undefined) return `${patch.visible ? 'Show' : 'Hide'} ${name}`;
  if (patch.name !== undefined) return `Rename ${name}`;
  if (patch.position !== undefined) return `Move ${name}`;
  if (patch.rotation !== undefined) return `Rotate ${name}`;
  if (patch.scale !== undefined) return `Scale ${name}`;
  if (patch.material?.color) return `Change color: ${name}`;
  return `Edit ${name}`;
}

function createOperationRecord(operation, label) {
  const now = new Date();
  return {
    id: `op-${now.getTime()}`,
    status: 'queued',
    createdAt: now.toISOString(),
    label,
    ...operation
  };
}

function isCreationPrompt(prompt) {
  const normalizedPrompt = prompt.trim().toLowerCase();
  return (
    /^(create|spawn|generate|build|design)\b/.test(normalizedPrompt) ||
    /^make\s+(a|an|new)\b/.test(normalizedPrompt) ||
    /^add\s+(a|an|new)\b/.test(normalizedPrompt)
  );
}

function createGenerationPayload(prompt, workspace, selectedComponentId, source = 'prompt') {
  return {
    prompt,
    source,
    sceneId: workspace?.workspaceId ?? PROJECT_ID,
    selectedComponentId,
    placement: {
      position: [0, 0, 0]
    }
  };
}

function getGeneratedModelUrl(payload = {}) {
  return payload.modelUrl ?? payload.model_url ?? payload.fileUrl ?? payload.file_url ?? payload.assetUrl ?? payload.asset_url ?? null;
}

function getGeneratedAssetId(payload = {}) {
  return payload.assetId ?? payload.asset_id ?? payload.modelId ?? payload.model_id ?? null;
}

function getGeneratedMetadataParts(payload = {}) {
  return payload.parts ?? payload.metadata?.parts ?? payload.sceneMetadata?.parts ?? [];
}

function createGeneratedModelFromEvent(job, event) {
  const payload = event?.payload ?? {};
  const modelUrl = getGeneratedModelUrl(payload);
  const assetId = getGeneratedAssetId(payload);
  if (!modelUrl && !assetId) return null;

  const url = modelUrl ?? `/api/assets/${encodeURIComponent(assetId)}`;
  const filename = payload.filename ?? payload.fileName ?? payload.originalFilename ?? `generated-${job.id}.glb`;
  return {
    id: assetId ?? job.id,
    url,
    fileUrl: url,
    originalFilename: filename,
    filename,
    mimeType: payload.mimeType ?? payload.contentType ?? 'model/gltf-binary',
    size: payload.size ?? payload.sizeBytes ?? null,
    importedAt: new Date().toISOString(),
    generatedAt: new Date().toISOString(),
    source: 'generation',
    generationJobId: job.id,
    isObjectUrl: false,
    parts: getGeneratedMetadataParts(payload),
    metadata: {
      ...(payload.metadata ?? {}),
      prompt: payload.metadata?.prompt ?? job.prompt,
      jobId: payload.metadata?.jobId ?? job.id,
      assetId: payload.metadata?.assetId ?? assetId,
      parts: getGeneratedMetadataParts(payload)
    }
  };
}

function isGeneratedPart(part) {
  const metadata = part?.generatedMetadata ?? part?.generationMetadata ?? part?.metadata ?? {};
  return Boolean(
    part?.source === 'generated' ||
      part?.source === 'generated-asset' ||
      part?.kind === 'generated' ||
      part?.type === 'generated' ||
      part?.assetId ||
      part?.generationJobId ||
      part?.generationStatus ||
      part?.modelUrl ||
      part?.glbUrl ||
      part?.glb_url ||
      metadata.generated === true ||
      metadata.assetId ||
      metadata.jobId ||
      metadata.prompt
  );
}

function TopBar({
  theme,
  workspace,
  importedModel,
  importedModelState,
  queuedOperationCount,
  onThemeToggle,
  onSampleModelLoad,
  onModelImport,
  onClearImportedModel,
  onDiscardQueuedOperations
}) {
  const modelInputRef = useRef(null);
  const workspaceName = getWorkspaceName(workspace);
  const modelFileName = getModelFileName(workspace);
  const importedModelMeta = importedModel ? `${importedModel.originalFilename} ${formatFileSize(importedModel.size)}` : '';
  const importStatusLabel = getImportStatusLabel(importedModelState.status, importedModelState.meshCount);

  function handleModelFileChange(event) {
    const [file] = event.target.files ?? [];
    if (file) onModelImport(file);
    event.target.value = '';
  }

  return (
    <header className="workspace-topbar">
      <div className="brand-row">
        <div className="brand-mark">3D</div>
        <div className="brand-copy">
          <div className="brand-title">3DPromptStudio</div>
          <div className="brand-subtitle">{workspaceName}</div>
        </div>
      </div>
      <div className="topbar-actions">
        <div className="chip chip-status" title={modelFileName}>
          <span className="status-dot" />
          {modelFileName}
        </div>
        {queuedOperationCount > 0 ? (
          <div className="chip chip-warning" title={`${queuedOperationCount} queued edits not submitted yet`}>
            {queuedOperationCount} queued
            <button type="button" className="chip-action" onClick={onDiscardQueuedOperations}>
              Discard
            </button>
          </div>
        ) : null}
        {importedModel ? (
          <div className={`chip chip-imported chip-imported-${importedModelState.status}`} title={importedModelMeta}>
            {importStatusLabel}
            <button type="button" className="chip-close" aria-label="Clear imported model" onClick={onClearImportedModel}>
              x
            </button>
          </div>
        ) : null}
        <button type="button" className="chip theme-chip" onClick={onThemeToggle}>
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
        <div className="topbar-divider" />
        <input
          ref={modelInputRef}
          type="file"
          accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
          hidden
          onChange={handleModelFileChange}
        />
        <button type="button" className="chip" onClick={() => modelInputRef.current?.click()}>
          Import
        </button>
        <button type="button" className="chip" onClick={onSampleModelLoad}>
          Sample
        </button>
        <button type="button" className="chip">
          Preview
        </button>
        <button type="button" className="chip chip-primary">
          Export
        </button>
      </div>
    </header>
  );
}

function PanelToggleIcon({ direction }) {
  return <span className={`panel-toggle-icon panel-toggle-icon-${direction}`} aria-hidden="true" />;
}

function ToolIcon({ name }) {
  const iconPaths = {
    select: (
      <>
        <path d="M5 3l8 14 1.5-5.5L20 10 5 3z" />
        <path d="M13.5 12.5 17 16" />
      </>
    ),
    annotate: (
      <>
        <circle cx="11" cy="11" r="6" />
        <path d="M15.5 15.5 20 20" />
        <path d="M8.5 11h5" />
      </>
    ),
    line: (
      <>
        <path d="M5 16 19 8" />
        <circle cx="5" cy="16" r="1.7" />
        <circle cx="19" cy="8" r="1.7" />
      </>
    ),
    cut: (
      <>
        <path d="m5 5 14 14" />
        <path d="M19 5 5 19" />
        <circle cx="7" cy="7" r="1.8" />
        <circle cx="17" cy="7" r="1.8" />
      </>
    ),
    zoomIn: (
      <>
        <circle cx="10.5" cy="10.5" r="6" />
        <path d="M15 15 20 20" />
        <path d="M10.5 7.5v6" />
        <path d="M7.5 10.5h6" />
      </>
    ),
    zoomOut: (
      <>
        <circle cx="10.5" cy="10.5" r="6" />
        <path d="M15 15 20 20" />
        <path d="M7.5 10.5h6" />
      </>
    ),
    undo: (
      <>
        <path d="M9 8H4V3" />
        <path d="M4.8 8A8 8 0 1 1 7 17.5" />
      </>
    ),
    redo: (
      <>
        <path d="M15 8h5V3" />
        <path d="M19.2 8A8 8 0 1 0 17 17.5" />
      </>
    )
  };

  return (
    <svg className="tool-svg" viewBox="0 0 24 24" aria-hidden="true">
      {iconPaths[name]}
    </svg>
  );
}

function ComponentsPanel({ parts, selectedPartId, emptyMessage = 'No components detected yet.', onPartSelect, onCollapse }) {
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLowerCase();
  const filteredParts = normalizedQuery
    ? parts.filter((part) => `${part.name} ${part.id} ${getPartKind(part)}`.toLowerCase().includes(normalizedQuery))
    : parts;

  return (
    <aside className="workspace-panel workspace-panel-left">
      <div className="panel-header">
        <h2 className="panel-title">Components</h2>
        <div className="panel-header-actions">
          <button type="button" className="quiet-button">
            Add
          </button>
          <button type="button" className="panel-icon-button" aria-label="Hide components panel" title="Hide panel" onClick={onCollapse}>
            <PanelToggleIcon direction="left" />
          </button>
        </div>
      </div>
      <div className="panel-body">
        <label className="search-field">
          <span>Search</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="components"
            aria-label="Search components"
          />
        </label>
        {parts.length === 0 ? (
          <div className="empty-state">{emptyMessage}</div>
        ) : filteredParts.length === 0 ? (
          <div className="empty-state">No components match this search.</div>
        ) : (
          <ul className="part-list">
            {filteredParts.map((part) => (
              <li key={part.id}>
                <button
                  type="button"
                  onClick={() => onPartSelect(part.id)}
                  className={`part-button ${part.id === selectedPartId ? 'part-button-active' : ''}`}
                  style={{ '--part-depth': getPartDepth(part) }}
                >
                  <span className="part-icon" />
                  <span className="part-main">
                    <span className="part-name">{part.name}</span>
                    <span className="part-meta">{getPartKind(part)}</span>
                  </span>
                  <span className="part-badges" aria-hidden="true">
                    <span className={`visibility-dot ${isPartVisible(part) ? 'visibility-dot-on' : ''}`} />
                    <span className="part-lock">{isPartEditable(part) ? 'Edit' : 'Lock'}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

function FloatingToolbar({ selectedTool, canUndo, canRedo, onToolChange, onUndo, onRedo }) {
  const activeTool = normalizeTool(selectedTool);

  return (
    <footer className="floating-toolbar" role="toolbar" aria-label="Workspace tools">
      {TOOL_OPTIONS.map((tool) => (
        <button
          key={tool.id}
          type="button"
          aria-label={tool.label}
          aria-pressed={activeTool === tool.id}
          title={`${tool.label} (${tool.shortcut})`}
          onClick={() => onToolChange(tool.id)}
          className={`tool-button ${activeTool === tool.id ? 'tool-button-active' : ''}`}
        >
          <ToolIcon name={tool.icon} />
        </button>
      ))}
      <span className="toolbar-separator" aria-hidden="true" />
      <button type="button" className="tool-button" aria-label="Undo" title="Undo" onClick={onUndo} disabled={!canUndo}>
        <ToolIcon name="undo" />
      </button>
      <button type="button" className="tool-button" aria-label="Redo" title="Redo" onClick={onRedo} disabled={!canRedo}>
        <ToolIcon name="redo" />
      </button>
    </footer>
  );
}

function InspectorPanel({
  activeRightPanel,
  selectedPart,
  generatedInteractions,
  generatedInteractionsSaving,
  generatedInteractionsError,
  editHistory,
  operationQueue,
  operationPayload,
  operationSubmitState,
  submissionHistory,
  promptHistory,
  variantHistory,
  generationActiveJobs,
  generationRecentJobs,
  generationMessagesByJobId,
  isPrompting,
  onPanelModeChange,
  onPartChange,
  onPartRemove,
  onGeneratedInteractionsChange,
  onGeneratedInteractionsSave,
  onGeneratedAssetDelete,
  onGeneratedAssetHide,
  onClearSubmitted,
  onOperationSubmit,
  onPromptSubmit,
  onGenerationCancel,
  onGenerationClearCompleted,
  onCollapse
}) {
  return (
    <aside className="workspace-panel workspace-panel-right">
      <div className="panel-header">
        <h2 className="panel-title">Inspector</h2>
        <button type="button" className="panel-icon-button" aria-label="Hide inspector panel" title="Hide panel" onClick={onCollapse}>
          <PanelToggleIcon direction="right" />
        </button>
      </div>
      <div className="panel-body">
        <div className="panel-tabs" role="tablist" aria-label="Inspector mode">
          <button
            type="button"
            role="tab"
            aria-selected={activeRightPanel === 'config'}
            onClick={() => onPanelModeChange('config')}
            className={`panel-tab ${activeRightPanel === 'config' ? 'panel-tab-active' : ''}`}
          >
            Configure
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeRightPanel === 'prompt'}
            onClick={() => onPanelModeChange('prompt')}
            className={`panel-tab ${activeRightPanel === 'prompt' ? 'panel-tab-active' : ''}`}
          >
            Prompt
          </button>
        </div>
        {activeRightPanel === 'prompt' ? (
          <>
            <PromptComposer onSubmit={onPromptSubmit} disabled={isPrompting} />
            <GenerationQueue
              activeJobs={generationActiveJobs}
              recentJobs={generationRecentJobs}
              messagesByJobId={generationMessagesByJobId}
              onCancelJob={onGenerationCancel}
              onClearCompleted={onGenerationClearCompleted}
            />
            <PromptHistory prompts={promptHistory} />
            <VariantHistory variants={variantHistory} />
          </>
        ) : (
          <>
            <PartInspector
              selectedPart={selectedPart}
              generatedInteractions={generatedInteractions}
              generatedInteractionsSaving={generatedInteractionsSaving}
              generatedInteractionsError={generatedInteractionsError}
              onPartChange={onPartChange}
              onPartRemove={onPartRemove}
              onGeneratedInteractionsChange={onGeneratedInteractionsChange}
              onGeneratedInteractionsSave={onGeneratedInteractionsSave}
              onGeneratedAssetDelete={onGeneratedAssetDelete}
              onGeneratedAssetHide={onGeneratedAssetHide}
            />
            <EditOperationHistory operations={editHistory} />
            <OperationPayloadPreview
              operations={operationQueue}
              payload={operationPayload}
              submitState={operationSubmitState}
              submissionHistory={submissionHistory}
              onClearSubmitted={onClearSubmitted}
              onSubmit={onOperationSubmit}
            />
          </>
        )}
      </div>
    </aside>
  );
}

function OperationPayloadPreview({ operations, payload, submitState, submissionHistory, onClearSubmitted, onSubmit }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const operationCount = operations.length;
  const queuedCount = operations.filter((operation) => operation.status === 'queued').length;
  const submittedCount = operations.filter((operation) => operation.status === 'submitted').length;
  const previewOperations = operations.filter((operation) => operation.status === 'queued').slice(-3).reverse();
  const submittedOperations = operations.filter((operation) => operation.status === 'submitted').slice(-3).reverse();
  const latestSubmission = submissionHistory.at(-1) ?? null;
  const isSubmitting = submitState.status === 'submitting';
  const canSubmit = queuedCount > 0 && !isSubmitting;

  return (
    <section className="inspector-section">
      <div className="section-heading">
        <h3>Backend Queue</h3>
        <span>{queuedCount} queued</span>
      </div>
      {operationCount === 0 ? (
        <div className="empty-state">No backend operations queued yet.</div>
      ) : (
        <>
          {queuedCount > 0 ? (
            <ul className="operation-list">
              {previewOperations.map((operation) => (
                <li key={operation.id}>
                  <strong>{operation.type}</strong>
                  <span>{operation.status}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <button type="button" className="quiet-button quiet-button-primary" onClick={onSubmit} disabled={!canSubmit}>
            {isSubmitting ? 'Submitting...' : 'Submit edits'}
          </button>
          {submitState.status === 'submitted' ? (
            <div className="status-pill status-pill-success">Accepted {submitState.operationCount} operations</div>
          ) : null}
          {submitState.status === 'error' ? (
            <div className="status-pill status-pill-error">{submitState.message}</div>
          ) : null}
          {latestSubmission ? (
            <div className="submission-card">
              <span>Latest submission</span>
              <strong>{latestSubmission.id}</strong>
              <small>
                {latestSubmission.operationCount} operations | {new Date(latestSubmission.acceptedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </small>
            </div>
          ) : null}
          {submittedCount > 0 ? (
            <div className="submitted-batch">
              <div className="section-heading">
                <h3>Submitted</h3>
                <span>{submittedCount} sent</span>
              </div>
              <ul className="operation-list operation-list-submitted">
                {submittedOperations.map((operation) => (
                  <li key={operation.id}>
                    <strong>{operation.type}</strong>
                    <span>submitted</span>
                  </li>
                ))}
              </ul>
              <button type="button" className="quiet-button" onClick={onClearSubmitted}>
                Clear submitted
              </button>
            </div>
          ) : null}
          <button type="button" className="quiet-button" onClick={() => setIsExpanded((current) => !current)}>
            {isExpanded ? 'Hide payload' : 'Show payload'}
          </button>
          {isExpanded ? <pre className="payload-preview">{JSON.stringify(payload, null, 2)}</pre> : null}
        </>
      )}
    </section>
  );
}

function EditOperationHistory({ operations }) {
  return (
    <section className="inspector-section">
      <div className="section-heading">
        <h3>Local Edits</h3>
      </div>
      {operations.length === 0 ? (
        <div className="empty-state">No local edits yet.</div>
      ) : (
        <ul className="history-list">
          {operations
            .slice()
            .reverse()
            .map((operation) => (
              <li key={operation.id} className="history-item history-item-variant">
                <strong>{operation.label}</strong>
                <span>{operation.time}</span>
              </li>
            ))}
        </ul>
      )}
    </section>
  );
}

export default function App() {
  const sceneStore = useSceneStore();
  const selectionStore = useSelectionStore();
  const historyStore = useHistoryStore(sceneStore.workspace);
  const generationStore = useGenerationStore();
  const generationUnsubscribersRef = useRef(new Map());
  const [theme, setTheme] = useState(getInitialTheme);
  const [isLoading, setIsLoading] = useState(true);
  const [isPrompting, setIsPrompting] = useState(false);
  const [error, setError] = useState('');
  const [activeRightPanel, setActiveRightPanel] = useState('config');
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(() => getStoredBoolean('3dpromptstudio-left-panel-open', true));
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(() => getStoredBoolean('3dpromptstudio-right-panel-open', true));
  const [runtimeParts, setRuntimeParts] = useState([]);
  const [localModel, setLocalModel] = useState(null);
  const [importedModelState, setImportedModelState] = useState({ status: 'idle', meshCount: 0 });
  const [partOverrides, setPartOverrides] = useState({});
  const [sceneObjects, setSceneObjects] = useState([]);
  const [editHistory, setEditHistory] = useState([]);
  const [operationQueue, setOperationQueue] = useState([]);
  const [operationSubmitState, setOperationSubmitState] = useState({ status: 'idle', message: '' });
  const [submissionHistory, setSubmissionHistory] = useState([]);
  const [generatedInteractionsByComponentId, setGeneratedInteractionsByComponentId] = useState({});
  const [generatedInteractionState, setGeneratedInteractionState] = useState({
    loadingComponentId: null,
    savingComponentId: null,
    errorComponentId: null,
    error: ''
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('3dpromptstudio-theme', theme);
    }
  }, [theme]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('3dpromptstudio-left-panel-open', String(isLeftPanelOpen));
    }
  }, [isLeftPanelOpen]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('3dpromptstudio-right-panel-open', String(isRightPanelOpen));
    }
  }, [isRightPanelOpen]);

  useEffect(
    () => () => {
      if (localModel?.isObjectUrl) URL.revokeObjectURL(localModel.url);
    },
    [localModel]
  );

  useEffect(
    () => () => {
      generationUnsubscribersRef.current.forEach((unsubscribe) => unsubscribe());
      generationUnsubscribersRef.current.clear();
    },
    []
  );

  useEffect(() => {
    async function loadWorkspace() {
      try {
        const payload = await fetchWorkspace(PROJECT_ID);
        sceneStore.setWorkspace(payload.workspace);
        selectionStore.setSelectedPartId(payload.workspace.selectedPartId ?? null);
        setActiveRightPanel(payload.workspace.rightPanelMode ?? 'config');
      } catch (loadError) {
        setError(loadError.message);
      } finally {
        setIsLoading(false);
      }
    }

    loadWorkspace();
  }, []);

  const displayParts = useMemo(
    () => {
      const applyOverrides = (parts) =>
        parts.map((part) => {
          const generatedPatch =
            localModel?.source === 'generation'
              ? {
                  source: part.source ?? 'generated',
                  generationJobId: part.generationJobId ?? localModel.generationJobId,
                  modelUrl: part.modelUrl ?? localModel.fileUrl ?? localModel.url,
                  assetId: part.assetId ?? localModel.id,
                  generatedMetadata: {
                    ...(localModel.metadata ?? {}),
                    ...(part.generatedMetadata ?? {}),
                    generated: true,
                    prompt: part.generatedMetadata?.prompt ?? localModel.metadata?.prompt,
                    jobId: part.generatedMetadata?.jobId ?? localModel.generationJobId,
                    assetId: part.generatedMetadata?.assetId ?? localModel.id
                  }
                }
              : {};
          const override = partOverrides[part.id];
          return override
            ? {
                ...part,
                ...generatedPatch,
                ...override,
                material: {
                  ...(part.material ?? {}),
                  ...(override.material ?? {})
                }
              }
            : {
                ...part,
                ...generatedPatch
              };
        });

      if (localModel) {
        return applyOverrides(mergePartRegistries(sceneStore.scene.metadata?.parts, localModel.parts, runtimeParts, sceneObjects));
      }

      return applyOverrides(
        mergePartRegistries(
          sceneStore.scene.components,
          sceneStore.scene.metadata?.parts,
          sceneStore.workspace?.model?.parts,
          runtimeParts,
          sceneObjects
        )
      );
    },
    [
      localModel,
      partOverrides,
      runtimeParts,
      sceneObjects,
      sceneStore.scene.components,
      sceneStore.scene.metadata?.parts,
      sceneStore.workspace?.model?.parts
    ]
  );

  const displayScene = useMemo(
    () => ({
      ...sceneStore.scene,
      components: displayParts
    }),
    [displayParts, sceneStore.scene]
  );

  const activeWorkspace = useMemo(
    () => {
      if (!sceneStore.workspace) return sceneStore.workspace;
      const workspaceMode = normalizeWorkspaceMode(sceneStore.workspace.workspaceMode);
      return localModel
        ? { ...sceneStore.workspace, workspaceMode, model: localModel }
        : { ...sceneStore.workspace, workspaceMode };
    },
    [localModel, sceneStore.workspace]
  );

  const operationPayload = useMemo(
    () => ({
      schemaVersion: '3dpromptstudio.editOperations.v1',
      projectId: PROJECT_ID,
      workspaceId: activeWorkspace?.workspaceId ?? PROJECT_ID,
      model: {
        fileName: getModelFileName(activeWorkspace),
        source: localModel ? 'local-import' : 'workspace'
      },
      operations: operationQueue.map(({ id, type, status, createdAt, payload }) => ({
        id,
        type,
        status,
        createdAt,
        payload
      }))
    }),
    [activeWorkspace, localModel, operationQueue]
  );
  const queuedOperationCount = useMemo(
    () => operationQueue.filter((operation) => operation.status === 'queued').length,
    [operationQueue]
  );

  const selectedPart = useMemo(
    () => displayParts.find((part) => part.id === selectionStore.selectedPartId) ?? null,
    [displayParts, selectionStore.selectedPartId]
  );
  const selectedPartIsGenerated = isGeneratedPart(selectedPart);
  const selectedGeneratedInteractions = selectedPart ? (generatedInteractionsByComponentId[selectedPart.id] ?? []) : [];

  useEffect(() => {
    if (!selectedPart?.id || !selectedPartIsGenerated) return;
    if (generatedInteractionsByComponentId[selectedPart.id]) return;

    let isCurrent = true;
    setGeneratedInteractionState((current) => ({
      ...current,
      loadingComponentId: selectedPart.id,
      errorComponentId: null,
      error: ''
    }));

    fetchComponentInteractions(PROJECT_ID, selectedPart.id)
      .then((payload) => {
        if (!isCurrent) return;
        setGeneratedInteractionsByComponentId((current) => ({
          ...current,
          [selectedPart.id]: payload.interactions ?? []
        }));
        setGeneratedInteractionState((current) => ({
          ...current,
          loadingComponentId: current.loadingComponentId === selectedPart.id ? null : current.loadingComponentId
        }));
      })
      .catch((loadError) => {
        if (!isCurrent) return;
        setGeneratedInteractionState((current) => ({
          ...current,
          loadingComponentId: current.loadingComponentId === selectedPart.id ? null : current.loadingComponentId,
          errorComponentId: selectedPart.id,
          error: loadError.message
        }));
      });

    return () => {
      isCurrent = false;
    };
  }, [generatedInteractionsByComponentId, selectedPart, selectedPartIsGenerated]);

  useEffect(() => {
    if (!selectionStore.selectedPartId && displayParts.length > 0) {
      selectionStore.setSelectedPartId(displayParts[0].id);
    }
  }, [displayParts, selectionStore]);

  const handlePartRegistryChange = useCallback(
    (parts) => {
      setRuntimeParts(parts);
      if (localModel) {
        setImportedModelState((current) => ({
          ...current,
          meshCount: parts.length
        }));
        if (parts.length > 0) {
          saveComponentRegistry(PROJECT_ID, parts, { modelId: localModel.id ?? localModel.filename ?? null }).catch((registryError) => {
            setError(registryError.message);
          });
        }
      }
      if (
        localModel &&
        parts.length > 0 &&
        !parts.some((part) => part.id === selectionStore.selectedPartId) &&
        !sceneObjects.some((part) => part.id === selectionStore.selectedPartId)
      ) {
        selectionStore.setSelectedPartId(parts[0].id);
      }
    },
    [localModel, sceneObjects, selectionStore]
  );

  const handleModelStatusChange = useCallback(
    (status) => {
      setImportedModelState((current) => ({
        ...current,
        status
      }));
    },
    []
  );

  const activeModel = localModel ?? sceneStore.workspace?.model;

  const resetLocalEditState = useCallback(() => {
    setRuntimeParts([]);
    selectionStore.setSelectedPartId(null);
    setPartOverrides({});
    setSceneObjects([]);
    setEditHistory([]);
    setOperationQueue([]);
    setOperationSubmitState({ status: 'idle', message: '' });
    setSubmissionHistory([]);
  }, [selectionStore]);

  const confirmModelReplacement = useCallback(
    (actionLabel) => {
      if (queuedOperationCount === 0) return true;
      return window.confirm(
        `${actionLabel} will discard ${queuedOperationCount} queued edits that have not been submitted. Continue?`
      );
    },
    [queuedOperationCount]
  );

  const handleSampleModelLoad = useCallback(() => {
    if (!confirmModelReplacement('Loading the sample model')) return;

    setLocalModel((previousModel) => {
      if (previousModel?.isObjectUrl) URL.revokeObjectURL(previousModel.url);
      return {
        url: `/samples/sample-chair.gltf?sample=${Date.now()}`,
        originalFilename: 'sample-chair.gltf',
        filename: 'sample-chair.gltf',
        mimeType: 'model/gltf+json',
        size: 15205,
        importedAt: new Date().toISOString(),
        isObjectUrl: false,
        isSample: true
      };
    });
    setImportedModelState({ status: 'loading', meshCount: 0 });
    resetLocalEditState();
  }, [confirmModelReplacement, resetLocalEditState]);

  const handleModelImport = useCallback(async (file) => {
    if (!confirmModelReplacement('Importing a new model')) return;

    const url = URL.createObjectURL(file);
    const importedAt = new Date().toISOString();
    setLocalModel((previousModel) => {
      if (previousModel?.isObjectUrl) URL.revokeObjectURL(previousModel.url);
      return {
        url,
        originalFilename: file.name,
        filename: file.name,
        mimeType: file.type || 'model/gltf-binary',
        size: file.size,
        importedAt,
        isObjectUrl: true
      };
    });
    setRuntimeParts([]);
    setImportedModelState({ status: 'loading', meshCount: 0 });
    resetLocalEditState();

    if (!file.name.toLowerCase().endsWith('.glb')) return;

    try {
      setError('');
      const payload = await uploadModel(PROJECT_ID, file, { title: file.name });
      const model = payload.model;
      setLocalModel((previousModel) => {
        if (previousModel?.isObjectUrl) URL.revokeObjectURL(previousModel.url);
        return {
          ...model,
          url: model.fileUrl,
          filename: model.originalFilename,
          mimeType: model.contentType,
          size: model.sizeBytes,
          importedAt: model.createdAt ?? importedAt,
          isObjectUrl: false
        };
      });
      setImportedModelState((current) => ({ ...current, status: 'loading' }));
    } catch (uploadError) {
      setError(uploadError.message);
    }
  }, [confirmModelReplacement, resetLocalEditState]);

  const handleClearImportedModel = useCallback(() => {
    if (!confirmModelReplacement('Clearing the imported model')) return;

    setLocalModel((previousModel) => {
      if (previousModel?.isObjectUrl) URL.revokeObjectURL(previousModel.url);
      return null;
    });
    setRuntimeParts([]);
    setImportedModelState({ status: 'idle', meshCount: 0 });
    resetLocalEditState();
    selectionStore.setSelectedPartId(sceneStore.workspace?.selectedPartId ?? null);
  }, [confirmModelReplacement, resetLocalEditState, sceneStore.workspace?.selectedPartId, selectionStore]);

  const handleCreateSceneObject = useCallback(
    (tool, hit) => {
      const defaults = getSceneObjectDefaults(tool);
      const nextIndex = sceneObjects.filter((item) => item.type === defaults.type).length + 1;
      const normal = hit.normal ?? [0, 1, 0];
      const point = hit.point ?? [0, 0, 0];
      const endPosition =
        tool === 'line'
          ? hit.endPoint ?? [
              point[0] + (normal[0] || 0.35) * 0.72,
              point[1] + (normal[1] || 0.18) * 0.72,
              point[2] + (normal[2] || 0.35) * 0.72
            ]
          : null;
      const sceneObject = {
        id: `${defaults.type}-${Date.now()}`,
        name: `${defaults.name} ${nextIndex}`,
        type: defaults.type,
        depth: 0,
        editable: true,
        visible: true,
        source: 'scene-object',
        attachedTo: hit.partId ?? null,
        position: point,
        normal,
        ...(endPosition ? { endPosition } : {}),
        ...(Number.isFinite(hit.size) ? { size: hit.size } : {}),
        material: {
          type: 'standard',
          color: defaults.color
        }
      };

      setSceneObjects((current) => [...current, sceneObject]);
      selectionStore.setSelectedPartId(sceneObject.id);
      setEditHistory((current) => [
        ...current,
        {
          id: `edit-${Date.now()}`,
          partId: sceneObject.id,
          label: `Create ${sceneObject.name}`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
      setOperationQueue((current) => [
        ...current,
        createOperationRecord(createSceneObjectOperation(sceneObject), `Create ${sceneObject.name}`)
      ]);
      setOperationSubmitState({ status: 'idle', message: '' });
    },
    [sceneObjects, selectionStore]
  );

  const handlePartChange = useCallback(
    (partId, patch) => {
      const part = displayParts.find((item) => item.id === partId);
      const label = createPartPatchLabel(part, partId, patch);

      setPartOverrides((current) => ({
        ...current,
        [partId]: {
          ...(current[partId] ?? {}),
          ...patch,
          material: patch.material
            ? {
                ...(current[partId]?.material ?? {}),
                ...patch.material
              }
            : current[partId]?.material
        }
      }));
      setEditHistory((current) => [
        ...current,
        {
          id: `edit-${Date.now()}`,
          partId,
          patch,
          label,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
      setOperationQueue((current) => [
        ...current,
        createOperationRecord(createPartPatchOperation(part, patch), label)
      ]);
      setOperationSubmitState({ status: 'idle', message: '' });
    },
    [displayParts]
  );

  const handleGeneratedInteractionsChange = useCallback(
    (interactions) => {
      if (!selectedPart?.id) return;
      setGeneratedInteractionsByComponentId((current) => ({
        ...current,
        [selectedPart.id]: interactions
      }));
      setGeneratedInteractionState((current) => ({
        ...current,
        errorComponentId: null,
        error: ''
      }));
    },
    [selectedPart?.id]
  );

  const handleGeneratedInteractionsSave = useCallback(async () => {
    if (!selectedPart?.id) return;
    const interactions = generatedInteractionsByComponentId[selectedPart.id] ?? [];
    try {
      setGeneratedInteractionState((current) => ({
        ...current,
        savingComponentId: selectedPart.id,
        errorComponentId: null,
        error: ''
      }));
      const payload = await saveComponentInteractions(PROJECT_ID, selectedPart.id, { interactions });
      setGeneratedInteractionsByComponentId((current) => ({
        ...current,
        [selectedPart.id]: payload.interactions ?? []
      }));
      setGeneratedInteractionState((current) => ({
        ...current,
        savingComponentId: current.savingComponentId === selectedPart.id ? null : current.savingComponentId
      }));
    } catch (saveError) {
      setGeneratedInteractionState((current) => ({
        ...current,
        savingComponentId: current.savingComponentId === selectedPart.id ? null : current.savingComponentId,
        errorComponentId: selectedPart.id,
        error: saveError.message
      }));
    }
  }, [generatedInteractionsByComponentId, selectedPart?.id]);

  const handleGeneratedAssetDelete = useCallback(
    (partId) => {
      const part = displayParts.find((item) => item.id === partId);
      if (!isGeneratedPart(part)) return;

      if (localModel?.source === 'generation') {
        handleClearImportedModel();
        return;
      }

      handlePartChange(partId, { visible: false });
    },
    [displayParts, handleClearImportedModel, handlePartChange, localModel?.source]
  );

  const handleRemoveSceneObject = useCallback(
    (partId) => {
      const part = displayParts.find((item) => item.id === partId);
      if (part?.source !== 'scene-object') return;

      setSceneObjects((current) => current.filter((item) => item.id !== partId));
      setPartOverrides((current) => {
        const next = { ...current };
        delete next[partId];
        return next;
      });
      setEditHistory((current) => [
        ...current,
        {
          id: `edit-${Date.now()}`,
          partId,
          label: `Remove ${part.name}`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
      setOperationQueue((current) => [
        ...current,
        createOperationRecord(
          {
            type: 'remove_scene_object',
            payload: {
              objectId: part.id,
              objectType: part.type,
              targetPartId: part.attachedTo ?? null
            }
          },
          `Remove ${part.name}`
        )
      ]);
      setOperationSubmitState({ status: 'idle', message: '' });

      const nextSelection = displayParts.find((item) => item.id !== partId && item.source !== 'scene-object') ?? displayParts.find((item) => item.id !== partId);
      selectionStore.setSelectedPartId(nextSelection?.id ?? null);
    },
    [displayParts, selectionStore]
  );

  const handleOperationSubmit = useCallback(async () => {
    const queuedOperations = operationQueue.filter((operation) => operation.status === 'queued');
    if (queuedOperations.length === 0) return;

    const payload = {
      ...operationPayload,
      operations: operationPayload.operations.filter((operation) => queuedOperations.some((queued) => queued.id === operation.id))
    };

    try {
      setError('');
      setOperationSubmitState({ status: 'submitting', message: '' });
      const response = await submitEditOperations(PROJECT_ID, payload);
      if (response.workspace) {
        sceneStore.setWorkspace(response.workspace);
      }
      const submittedIds = new Set(response.submission.operations);
      setOperationQueue((current) =>
        current.map((operation) =>
          submittedIds.has(operation.id)
            ? {
                ...operation,
                status: 'submitted',
                submittedAt: response.submission.acceptedAt,
                submissionId: response.submission.id
              }
            : operation
        )
      );
      setOperationSubmitState({
        status: 'submitted',
        message: `Accepted ${response.submission.operationCount} operations.`,
        submissionId: response.submission.id,
        operationCount: response.submission.operationCount
      });
      setSubmissionHistory((current) => [...current, response.submission]);
    } catch (submitError) {
      setOperationSubmitState({ status: 'error', message: submitError.message });
    }
  }, [operationPayload, operationQueue, sceneStore]);

  const handleClearSubmitted = useCallback(() => {
    setOperationQueue((current) => current.filter((operation) => operation.status !== 'submitted'));
    setSubmissionHistory([]);
    setOperationSubmitState({ status: 'idle', message: '' });
  }, []);

  const handleDiscardQueuedOperations = useCallback(() => {
    if (queuedOperationCount === 0) return;
    const shouldDiscard = window.confirm(
      `Discard ${queuedOperationCount} queued edits? This clears unsent local edit operations and scene edit markers.`
    );
    if (!shouldDiscard) return;

    setOperationQueue((current) => current.filter((operation) => operation.status !== 'queued'));
    setPartOverrides({});
    setSceneObjects([]);
    setEditHistory([]);
    setOperationSubmitState({ status: 'idle', message: '' });
  }, [queuedOperationCount]);

  async function persistWorkspacePatch(patch) {
    const payload = await patchWorkspace(PROJECT_ID, patch);
    sceneStore.setWorkspace(payload.workspace);
    if (patch.selectedPartId !== undefined) {
      selectionStore.setSelectedPartId(patch.selectedPartId);
    }
  }

  async function handlePartSelect(partId) {
    try {
      setError('');
      await persistWorkspacePatch({ selectedPartId: partId });
    } catch (saveError) {
      setError(saveError.message);
    }
  }

  async function handleToolChange(tool) {
    try {
      setError('');
      await persistWorkspacePatch({ selectedTool: toBackendTool(tool) });
    } catch (saveError) {
      setError(saveError.message);
    }
  }

  async function handleWorkspaceModeChange(mode) {
    try {
      setError('');
      await persistWorkspacePatch({ workspaceMode: normalizeWorkspaceMode(mode) });
    } catch (saveError) {
      setError(saveError.message);
    }
  }

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || isTypingTarget(event.target)) return;

      const key = event.key.toLowerCase();
      const shortcutTool =
        key === 'v'
          ? 'mouse'
          : key === 'a'
            ? 'annotation'
            : key === 'l'
              ? 'line'
              : key === 'c'
                ? 'cut'
                : key === '+' || key === '='
                  ? 'zoom-in'
                  : key === '-' || key === '_'
                    ? 'zoom-out'
                    : null;

      if (!shortcutTool) return;
      event.preventDefault();
      handleToolChange(shortcutTool);
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  async function handlePanelModeChange(mode) {
    try {
      setError('');
      setActiveRightPanel(mode);
      await persistWorkspacePatch({ rightPanelMode: mode });
    } catch (saveError) {
      setError(saveError.message);
    }
  }

  function subscribeToGenerationUpdates(job, provider) {
    if (!job?.id || generationUnsubscribersRef.current.has(job.id)) return;

    const handlers = {
      onEvent: (event) => {
        generationStore.appendEvent(job.id, event);
        const status = event?.payload?.status;
        const eventType = event?.type ?? event?.payload?.type;
        if (status === 'succeeded' || eventType === 'job_succeeded') {
          const generatedModel = createGeneratedModelFromEvent(job, event);
          if (generatedModel) {
            setLocalModel((previousModel) => {
              if (previousModel?.isObjectUrl) URL.revokeObjectURL(previousModel.url);
              return generatedModel;
            });
            setRuntimeParts([]);
            setImportedModelState({ status: 'loading', meshCount: 0 });
            selectionStore.setSelectedPartId(null);
          }
        }
        if (['succeeded', 'failed', 'canceled'].includes(status) || ['job_succeeded', 'job_failed', 'job_canceled'].includes(eventType)) {
          const unsubscribe = generationUnsubscribersRef.current.get(job.id);
          if (unsubscribe) {
            unsubscribe();
            generationUnsubscribersRef.current.delete(job.id);
          }
        }
      },
      onError: (streamError) => {
        generationStore.markFailed(job.id, streamError);
        const unsubscribe = generationUnsubscribersRef.current.get(job.id);
        if (unsubscribe) {
          unsubscribe();
          generationUnsubscribersRef.current.delete(job.id);
        }
      }
    };

    const unsubscribe =
      provider === 'mock'
        ? subscribeToMockGenerationJob(job, handlers)
        : subscribeToGenerationJob(PROJECT_ID, job.id, handlers);
    generationUnsubscribersRef.current.set(job.id, unsubscribe);
  }

  async function startGenerationJob(prompt, source = 'prompt') {
    const generationPayload = createGenerationPayload(prompt, sceneStore.workspace, selectionStore.selectedPartId, source);
    let jobPayload;
    try {
      jobPayload = await createGenerationJob(PROJECT_ID, generationPayload);
    } catch (generationError) {
      if (!isMockGenerationEnabled()) throw generationError;
      jobPayload = createMockGenerationJob(PROJECT_ID, generationPayload);
    }

    const job = jobPayload.job;
    generationStore.addJob(job);
    subscribeToGenerationUpdates(job, job.provider);
    return job;
  }

  async function handlePromptSubmit(prompt) {
    try {
      setError('');
      setIsPrompting(true);
      if (isCreationPrompt(prompt)) {
        await startGenerationJob(prompt, 'direct_creation_prompt');
        return;
      }

      const payload = await submitPrompt(PROJECT_ID, prompt, {
        mode: 'apply',
        sceneId: sceneStore.workspace?.workspaceId ?? PROJECT_ID,
        selectedComponentId: selectionStore.selectedPartId,
        baseRevisionId: sceneStore.workspace?.currentVariantId ?? null
      });
      if (payload.requiresGeneration) {
        await startGenerationJob(prompt, 'prompt_interpreter');
      }
      if (payload.workspace) {
        sceneStore.setWorkspace(payload.workspace);
      }
    } catch (promptError) {
      setError(promptError.message);
    } finally {
      setIsPrompting(false);
    }
  }

  async function handleGenerationCancel(jobId) {
    const unsubscribe = generationUnsubscribersRef.current.get(jobId);
    if (unsubscribe) {
      unsubscribe();
      generationUnsubscribersRef.current.delete(jobId);
    }

    try {
      const job = generationStore.jobsById[jobId];
      if (job?.provider !== 'mock') {
        const payload = await cancelGenerationJob(PROJECT_ID, jobId);
        if (payload.job) {
          generationStore.updateJob(jobId, payload.job);
          return;
        }
      }
      generationStore.markCanceled(jobId);
    } catch (cancelError) {
      setError(cancelError.message);
      generationStore.markFailed(jobId, cancelError);
    }
  }

  async function handleUndo() {
    try {
      setError('');
      const payload = await undoWorkspace(PROJECT_ID);
      sceneStore.setWorkspace(payload.workspace);
    } catch (undoError) {
      setError(undoError.message);
    }
  }

  async function handleRedo() {
    try {
      setError('');
      const payload = await redoWorkspace(PROJECT_ID);
      sceneStore.setWorkspace(payload.workspace);
    } catch (redoError) {
      setError(redoError.message);
    }
  }

  if (isLoading) {
    return <LoadingOverlay message="Loading workspace..." />;
  }

  return (
    <main className="app-shell" data-theme={theme}>
      <TopBar
        theme={theme}
        workspace={activeWorkspace}
        importedModel={localModel}
        importedModelState={importedModelState}
        queuedOperationCount={queuedOperationCount}
        onThemeToggle={() => setTheme((currentTheme) => (currentTheme === 'dark' ? 'light' : 'dark'))}
        onSampleModelLoad={handleSampleModelLoad}
        onModelImport={handleModelImport}
        onClearImportedModel={handleClearImportedModel}
        onDiscardQueuedOperations={handleDiscardQueuedOperations}
      />

      <div
        className={`workspace-layout ${!isLeftPanelOpen ? 'workspace-layout-left-collapsed' : ''} ${
          !isRightPanelOpen ? 'workspace-layout-right-collapsed' : ''
        }`}
      >
        {isLeftPanelOpen ? (
          <ComponentsPanel
            parts={displayParts}
            selectedPartId={selectionStore.selectedPartId}
            emptyMessage={
              localModel
                ? importedModelState.status === 'error'
                  ? 'The imported model could not be loaded. Clear it and try another GLB or GLTF file.'
                  : 'No imported mesh components detected yet. The model may still be loading.'
                : 'No components detected yet.'
            }
            onPartSelect={handlePartSelect}
            onCollapse={() => setIsLeftPanelOpen(false)}
          />
        ) : (
          <button
            type="button"
            className="panel-restore-button panel-restore-button-left"
            aria-label="Show components panel"
            title="Show components"
            onClick={() => setIsLeftPanelOpen(true)}
          >
            <PanelToggleIcon direction="right" />
          </button>
        )}

        <section className="main-column">
          <ErrorBanner message={error} />
          {isPrompting ? <LoadingOverlay message="Generating edit operations..." /> : null}
          <SceneViewport
            scene={displayScene}
            model={activeModel}
            viewport={sceneStore.viewport}
            selectedPartId={selectionStore.selectedPartId}
            selectedTool={normalizeTool(sceneStore.workspace?.selectedTool)}
            sceneObjects={sceneObjects}
            pendingPlaceholders={generationStore.placeholders}
            partOverrides={partOverrides}
            onSelectPart={handlePartSelect}
            onCreateSceneObject={handleCreateSceneObject}
            onModelStatusChange={handleModelStatusChange}
            onPartRegistryChange={handlePartRegistryChange}
          />
          <FloatingToolbar
            selectedTool={sceneStore.workspace?.selectedTool}
            canUndo={historyStore.canUndo}
            canRedo={historyStore.canRedo}
            onToolChange={handleToolChange}
            onUndo={handleUndo}
            onRedo={handleRedo}
          />
        </section>

        {isRightPanelOpen ? (
          <InspectorPanel
            activeRightPanel={activeRightPanel}
            selectedPart={selectedPart}
            generatedInteractions={selectedGeneratedInteractions}
            generatedInteractionsSaving={
              generatedInteractionState.loadingComponentId === selectedPart?.id ||
              generatedInteractionState.savingComponentId === selectedPart?.id
            }
            generatedInteractionsError={
              selectedPartIsGenerated && generatedInteractionState.errorComponentId === selectedPart?.id
                ? generatedInteractionState.error
                : ''
            }
            editHistory={editHistory}
            operationQueue={operationQueue}
            operationPayload={operationPayload}
            operationSubmitState={operationSubmitState}
            submissionHistory={submissionHistory}
            promptHistory={historyStore.promptHistory}
            variantHistory={historyStore.variantHistory}
            generationActiveJobs={generationStore.activeJobs}
            generationRecentJobs={generationStore.recentJobs}
            generationMessagesByJobId={generationStore.messagesByJobId}
            isPrompting={isPrompting}
            onPanelModeChange={handlePanelModeChange}
            onPartChange={handlePartChange}
            onPartRemove={handleRemoveSceneObject}
            onGeneratedInteractionsChange={handleGeneratedInteractionsChange}
            onGeneratedInteractionsSave={handleGeneratedInteractionsSave}
            onGeneratedAssetDelete={handleGeneratedAssetDelete}
            onGeneratedAssetHide={(partId) => handlePartChange(partId, { visible: false })}
            onClearSubmitted={handleClearSubmitted}
            onOperationSubmit={handleOperationSubmit}
            onPromptSubmit={handlePromptSubmit}
            onGenerationCancel={handleGenerationCancel}
            onGenerationClearCompleted={generationStore.clearCompleted}
            onCollapse={() => setIsRightPanelOpen(false)}
          />
        ) : (
          <button
            type="button"
            className="panel-restore-button panel-restore-button-right"
            aria-label="Show inspector panel"
            title="Show inspector"
            onClick={() => setIsRightPanelOpen(true)}
          >
            <PanelToggleIcon direction="left" />
          </button>
        )}
      </div>
    </main>
  );
}
