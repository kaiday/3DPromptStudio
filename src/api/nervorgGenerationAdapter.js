const NERVORG_EVENT_TYPES = new Set([
  'world_state',
  'npc_pending',
  'npc_progress',
  'npc_ready',
  'npc_failed',
  'npc_updated',
  'npc_deleted'
]);

function getNpcId(message = {}) {
  return message.id ?? message.npc?.id ?? message.jobId ?? message.job_id ?? null;
}

function getNpcPrompt(message = {}) {
  return message.prompt ?? message.npc?.prompt ?? '';
}

function normalizeModelUrl(message = {}) {
  return message.modelUrl ?? message.model_url ?? message.glb_url ?? message.npc?.glb_url ?? null;
}

function normalizeAnimationCount(message = {}) {
  const value = message.animation_count ?? message.animationCount ?? message.npc?.animation_count ?? message.npc?.animationCount;
  return Number.isFinite(value) ? value : null;
}

function createPayload(message = {}) {
  const npc = message.npc ?? null;
  const modelUrl = normalizeModelUrl(message);
  const animationCount = normalizeAnimationCount(message);

  return {
    ...(npc ? { npc } : {}),
    ...(modelUrl ? { modelUrl, glbUrl: modelUrl } : {}),
    ...(animationCount !== null ? { animationCount, animation_count: animationCount } : {}),
    ...(message.error ? { error: message.error } : {}),
    ...(message.patch ? { patch: message.patch } : {})
  };
}

export function isNervOrgGenerationEvent(message = {}) {
  return NERVORG_EVENT_TYPES.has(message?.type);
}

export function nervOrgEventToGenerationEvent(message = {}) {
  const id = getNpcId(message);
  const now = new Date().toISOString();
  const payload = createPayload(message);

  switch (message.type) {
    case 'npc_pending':
      return {
        id: `${id}:pending`,
        type: 'job_queued',
        jobId: id,
        message: getNpcPrompt(message) ? `Queued: ${getNpcPrompt(message)}` : 'Generation queued',
        payload: {
          ...payload,
          prompt: getNpcPrompt(message),
          position: message.position,
          rotation: message.rotation
        },
        receivedAt: now
      };
    case 'npc_progress':
      return {
        id: `${id}:progress:${message.message ?? now}`,
        type: 'job_progress',
        jobId: id,
        message: message.message ?? 'Generating...',
        payload,
        receivedAt: now
      };
    case 'npc_ready':
      return {
        id: `${id}:ready`,
        type: 'job_succeeded',
        jobId: id,
        message: 'Generation completed',
        payload,
        receivedAt: now
      };
    case 'npc_failed':
      return {
        id: `${id}:failed`,
        type: 'job_failed',
        jobId: id,
        message: message.error ?? 'Generation failed',
        payload,
        receivedAt: now
      };
    case 'npc_deleted':
      return {
        id: `${id}:deleted`,
        type: 'job_canceled',
        jobId: id,
        message: 'Generated entity deleted',
        payload,
        receivedAt: now
      };
    default:
      return null;
  }
}

export function nervOrgPendingToGenerationJob(message = {}) {
  const id = getNpcId(message);
  if (!id) return null;

  return {
    id,
    status: 'queued',
    prompt: getNpcPrompt(message),
    placement: {
      position: message.position ?? [0, 0, 0],
      rotation: message.rotation ?? [0, 0, 0],
      scale: message.scale ?? 1
    },
    provider: 'nervorg_ws',
    createdAt: new Date().toISOString()
  };
}
