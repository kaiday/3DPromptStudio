const COLOR_WORDS = [
  'red',
  'green',
  'blue',
  'yellow',
  'black',
  'white',
  'orange',
  'purple',
  'gray'
];

function pickColor(prompt) {
  const lowered = prompt.toLowerCase();
  const matched = COLOR_WORDS.find((color) => lowered.includes(color));
  if (!matched) return null;
  const mapping = {
    red: '#ef4444',
    green: '#22c55e',
    blue: '#3b82f6',
    yellow: '#eab308',
    black: '#111827',
    white: '#f9fafb',
    orange: '#f97316',
    purple: '#a855f7',
    gray: '#6b7280'
  };
  return mapping[matched] ?? '#cccccc';
}

function normalizeText(value) {
  return String(value ?? '').toLowerCase();
}

function componentMatchesPrompt(component, prompt) {
  const loweredPrompt = normalizeText(prompt);
  const candidates = [component.id, component.name, component.meshName]
    .filter(Boolean)
    .map((value) => normalizeText(value).replace(/[-_]+/g, ' '));

  return candidates.some((candidate) => {
    if (!candidate) return false;
    if (loweredPrompt.includes(candidate)) return true;
    const singular = candidate.endsWith('s') ? candidate.slice(0, -1) : candidate;
    return singular.length > 2 && loweredPrompt.includes(singular);
  });
}

function getAvailableComponents(scene, promptContext) {
  const contextComponents = promptContext?.components ?? [];
  if (contextComponents.length) return contextComponents;
  return scene?.components ?? [];
}

function getAnnotatedTargetIds(promptContext) {
  return (promptContext?.annotations ?? [])
    .filter((annotation) => annotation.status === 'open' && annotation.partId)
    .map((annotation) => annotation.partId);
}

function resolveTargetIds(prompt, scene, promptContext) {
  const loweredPrompt = normalizeText(prompt);
  const components = getAvailableComponents(scene, promptContext);
  const componentIds = components.map((component) => component.id).filter(Boolean);

  const explicitMatches = components
    .filter((component) => componentMatchesPrompt(component, prompt))
    .map((component) => component.id);
  if (explicitMatches.length) {
    return Array.from(new Set(explicitMatches));
  }

  if (loweredPrompt.includes('annotated')) {
    const annotatedTargets = getAnnotatedTargetIds(promptContext);
    if (annotatedTargets.length) {
      return Array.from(new Set(annotatedTargets));
    }
  }

  if (
    promptContext?.selectedPartId &&
    (loweredPrompt.includes('this') || loweredPrompt.includes('selected') || loweredPrompt.includes('part'))
  ) {
    return [promptContext.selectedPartId];
  }

  if (promptContext?.selectedPartId) {
    return [promptContext.selectedPartId];
  }

  return componentIds.length ? [componentIds[0]] : [];
}

function createOperationForTarget(op, targetId, payload) {
  return {
    op,
    targetId,
    payload: { ...payload }
  };
}

export async function generateStructuredOperations({ prompt, scene, promptContext }) {
  if (!prompt || typeof prompt !== 'string') {
    throw new Error('prompt is required.');
  }

  const targetIds = resolveTargetIds(prompt, scene, promptContext);
  if (!targetIds.length) {
    throw new Error('No editable parts are available for this model.');
  }

  const operations = [];
  const color = pickColor(prompt);
  if (color) {
    operations.push(...targetIds.map((targetId) => createOperationForTarget('setColor', targetId, { color })));
  }

  if (prompt.toLowerCase().includes('hide')) {
    operations.push(...targetIds.map((targetId) => createOperationForTarget('setVisibility', targetId, { visible: false })));
  }

  if (prompt.toLowerCase().includes('show')) {
    operations.push(...targetIds.map((targetId) => createOperationForTarget('setVisibility', targetId, { visible: true })));
  }

  if (operations.length === 0) {
    operations.push(...targetIds.map((targetId) => createOperationForTarget('setMaterial', targetId, { type: 'standard' })));
  }

  return {
    operations,
    reasoning: promptContext?.annotations?.length
      ? 'Deterministic prompt parser generated safe operations with workspace, component, and annotation context.'
      : 'Deterministic prompt parser generated safe operations with workspace and component context.'
  };
}
