const MOCK_PROGRESS_MESSAGES = [
  'Interpreting prompt and scene intent.',
  'Planning editable scene components.',
  'Preparing Blender assembly tasks.',
  'Validating export handoff metadata.',
  'Finalizing generated scene package.'
];

const DEFAULT_TIMINGS = {
  startedDelayMs: 350,
  progressIntervalMs: 700,
  succeededDelayMs: 500
};

function createMockJobId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `mock_generation_${crypto.randomUUID()}`;
  }
  return `mock_generation_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function normalizePrompt(payload) {
  return payload?.prompt ?? payload?.text ?? '';
}

function createMockEvent(type, jobId, patch = {}) {
  return {
    type,
    jobId,
    message: patch.message ?? '',
    payload: {
      type,
      jobId,
      ...patch
    },
    receivedAt: nowIso()
  };
}

export function isMockGenerationEnabled() {
  return Boolean(import.meta.env.DEV && import.meta.env.VITE_GENERATION_MOCK !== 'false');
}

export function createMockGenerationJob(projectId, payload = {}) {
  const now = nowIso();
  const job = {
    id: createMockJobId(),
    projectId,
    prompt: normalizePrompt(payload),
    status: 'queued',
    provider: 'mock',
    progress: 0,
    createdAt: now,
    updatedAt: now,
    modelUrl: null,
    metadataUrl: null,
    previewUrl: null,
    placement: payload.placement ?? { position: [0, 0, 0] }
  };
  return { job };
}

export function subscribeToMockGenerationJob(job, handlers = {}, options = {}) {
  if (!job?.id) {
    handlers.onError?.(new Error('Mock generation job requires an id.'));
    return () => {};
  }

  const timings = { ...DEFAULT_TIMINGS, ...options.timings };
  const progressMessages = options.progressMessages ?? MOCK_PROGRESS_MESSAGES;
  const timers = [];
  let closed = false;

  function schedule(delayMs, callback) {
    const timerId = window.setTimeout(() => {
      if (!closed) callback();
    }, delayMs);
    timers.push(timerId);
  }

  function emit(type, patch = {}) {
    handlers.onEvent?.(createMockEvent(type, job.id, patch));
  }

  schedule(timings.startedDelayMs, () => {
    emit('job_started', {
      status: 'running',
      progress: 5,
      message: 'Generation worker started.'
    });
  });

  progressMessages.forEach((message, index) => {
    schedule(timings.startedDelayMs + timings.progressIntervalMs * (index + 1), () => {
      emit('job_progress', {
        status: 'running',
        progress: Math.min(95, Math.round(((index + 1) / (progressMessages.length + 1)) * 100)),
        message
      });
    });
  });

  schedule(timings.startedDelayMs + timings.progressIntervalMs * (progressMessages.length + 1) + timings.succeededDelayMs, () => {
    emit('job_succeeded', {
      status: 'succeeded',
      progress: 100,
      message: 'Mock generation completed. Waiting for real model URL from backend.',
      modelUrl: null,
      metadataUrl: null,
      previewUrl: null
    });
  });

  return () => {
    closed = true;
    timers.forEach((timerId) => window.clearTimeout(timerId));
  };
}

export { MOCK_PROGRESS_MESSAGES };
