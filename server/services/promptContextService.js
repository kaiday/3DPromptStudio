import { listAnnotations } from './annotationService.js';
import { getComponentRegistry } from './modelMetadataService.js';

const MAX_CONTEXT_COMPONENTS = 80;
const MAX_CONTEXT_ANNOTATIONS = 30;
const MAX_RECENT_ITEMS = 8;

function compactComponent(component) {
  return {
    id: component.id,
    name: component.name,
    meshName: component.meshName,
    materialName: component.materialName,
    editable: component.editable,
    allowedOperations: component.allowedOperations,
    transformBounds: component.transformBounds
  };
}

function compactSceneComponent(component) {
  return {
    id: component.id,
    name: component.name,
    visible: component.visible ?? true,
    material: {
      color: component.material?.color ?? null,
      type: component.material?.type ?? null
    },
    transform: {
      position: component.transform?.position ?? [0, 0, 0],
      rotation: component.transform?.rotation ?? [0, 0, 0],
      scale: component.transform?.scale ?? [1, 1, 1]
    }
  };
}

function compactAnnotation(annotation) {
  return {
    id: annotation.id,
    type: annotation.type,
    status: annotation.status,
    variantId: annotation.variantId,
    partId: annotation.partId,
    targetType: annotation.targetType,
    position: annotation.position,
    normal: annotation.normal,
    screenPosition: annotation.screenPosition,
    points: annotation.points,
    screenPoints: annotation.screenPoints,
    cutPlane: annotation.cutPlane,
    label: annotation.label,
    note: annotation.note,
    updatedAt: annotation.updatedAt
  };
}

function uniqueValues(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function getCurrentVariant(workspace) {
  const currentVariant = workspace.variantHistory.find((variant) => variant.id === workspace.currentVariantId);
  return {
    id: workspace.currentVariantId,
    label: currentVariant?.label ?? null,
    lastOperations: workspace.lastOperations.slice(-MAX_RECENT_ITEMS)
  };
}

export function buildPromptContext(workspace) {
  const registry = getComponentRegistry(workspace.projectId);
  const activeAnnotations = listAnnotations(workspace.projectId, { status: 'open' });
  const variantScopedAnnotations = activeAnnotations.filter((annotation) => {
    return !annotation.variantId || !workspace.currentVariantId || annotation.variantId === workspace.currentVariantId;
  });
  const components = registry.components.length
    ? registry.components.map(compactComponent)
    : workspace.scene.components.map((component) => ({
        id: component.id,
        name: component.name ?? component.id,
        meshName: component.name ?? component.id,
        materialName: component.material?.type ?? '',
        editable: true,
        allowedOperations: ['colour', 'material', 'visibility', 'scale', 'position', 'rotation'],
        transformBounds: null
      }));

  const selectedComponent = components.find((component) => component.id === workspace.selectedPartId) ?? null;
  const compactAnnotations = variantScopedAnnotations.slice(0, MAX_CONTEXT_ANNOTATIONS).map(compactAnnotation);
  const lineGuides = compactAnnotations.filter((annotation) => annotation.type === 'line');
  const cutGuides = compactAnnotations.filter((annotation) => annotation.type === 'cut_guide');

  return {
    projectId: workspace.projectId,
    workspaceId: workspace.workspaceId,
    modelId: workspace.modelId,
    selectedPartId: workspace.selectedPartId,
    selectedTool: workspace.selectedTool,
    rightPanelMode: workspace.rightPanelMode,
    viewport: workspace.viewport,
    currentVariant: getCurrentVariant(workspace),
    selectedComponent,
    components: components.slice(0, MAX_CONTEXT_COMPONENTS),
    sceneComponents: workspace.scene.components.slice(0, MAX_CONTEXT_COMPONENTS).map(compactSceneComponent),
    annotations: compactAnnotations,
    lineGuides,
    cutGuides,
    allowedOperations: uniqueValues(components.flatMap((component) => component.allowedOperations ?? [])),
    recentPrompts: workspace.promptHistory.slice(-MAX_RECENT_ITEMS).map((entry) => ({
      id: entry.id,
      prompt: entry.prompt,
      createdAt: entry.createdAt
    })),
    constraints: {
      noRawGeometry: true,
      destructiveCutsSupported: false,
      operationOutputOnly: true
    }
  };
}
