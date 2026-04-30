import { useCallback, useMemo, useReducer } from 'react';

const ACTIVE_STATUSES = new Set(['queued', 'running']);
const COMPLETE_STATUSES = new Set(['succeeded', 'failed', 'canceled']);

const initialGenerationState = {
  jobsById: {},
  activeJobIds: [],
  recentJobIds: [],
  messagesByJobId: {},
  placeholdersByJobId: {}
};

function uniqueIds(ids) {
  return Array.from(new Set(ids.filter(Boolean)));
}

function moveIdToFront(ids, id) {
  return uniqueIds([id, ...ids.filter((currentId) => currentId !== id)]);
}

function removeId(ids, id) {
  return ids.filter((currentId) => currentId !== id);
}

function getJobId(jobOrId) {
  return typeof jobOrId === 'string' ? jobOrId : jobOrId?.id ?? jobOrId?.jobId ?? jobOrId?.job_id ?? null;
}

function getEventJobId(event, fallbackJobId) {
  return event?.jobId ?? event?.job_id ?? event?.payload?.jobId ?? event?.payload?.job_id ?? fallbackJobId ?? null;
}

function getEventStatus(event) {
  const eventType = event?.type ?? event?.payload?.type;
  if (eventType === 'npc_pending') return 'queued';
  if (eventType === 'npc_progress') return 'running';
  if (eventType === 'npc_ready') return 'succeeded';
  if (eventType === 'npc_failed') return 'failed';
  if (eventType === 'npc_deleted') return 'canceled';
  if (eventType === 'job_started' || eventType === 'job_progress') return 'running';
  if (eventType === 'job_succeeded') return 'succeeded';
  if (eventType === 'job_failed') return 'failed';
  if (eventType === 'job_canceled') return 'canceled';
  return event?.status ?? event?.payload?.status ?? null;
}

function normalizeError(error) {
  if (!error) return 'Generation failed.';
  if (typeof error === 'string') return error;
  return error.message ?? String(error);
}

function createPlaceholder(job) {
  const id = getJobId(job);
  if (!id) return null;
  const placementPosition = job?.placement?.position;
  return {
    id: `placeholder_${id}`,
    jobId: id,
    label: job?.prompt ? `Generating: ${job.prompt}` : 'Generating scene',
    status: job?.status ?? 'queued',
    ...(Array.isArray(placementPosition) ? { position: placementPosition } : {}),
    createdAt: job?.createdAt ?? job?.created_at ?? new Date().toISOString()
  };
}

function applyJobStatusLists(state, jobId, status) {
  if (ACTIVE_STATUSES.has(status)) {
    return {
      activeJobIds: moveIdToFront(state.activeJobIds, jobId),
      recentJobIds: removeId(state.recentJobIds, jobId)
    };
  }

  if (COMPLETE_STATUSES.has(status)) {
    return {
      activeJobIds: removeId(state.activeJobIds, jobId),
      recentJobIds: moveIdToFront(state.recentJobIds, jobId)
    };
  }

  return {
    activeJobIds: state.activeJobIds,
    recentJobIds: state.recentJobIds
  };
}

function upsertJob(state, jobId, patch) {
  const previousJob = state.jobsById[jobId] ?? {};
  const now = new Date().toISOString();
  const nextJob = {
    ...previousJob,
    id: jobId,
    updatedAt: now,
    ...patch
  };
  const lists = applyJobStatusLists(state, jobId, nextJob.status);
  const existingPlaceholder = state.placeholdersByJobId[jobId];
  let placeholdersByJobId = state.placeholdersByJobId;

  if (ACTIVE_STATUSES.has(nextJob.status)) {
    const nextPlaceholder =
      existingPlaceholder && existingPlaceholder.status === nextJob.status
        ? existingPlaceholder
        : { ...(existingPlaceholder ?? createPlaceholder(nextJob)), status: nextJob.status };

    if (nextPlaceholder !== existingPlaceholder) {
      placeholdersByJobId = {
        ...state.placeholdersByJobId,
        [jobId]: nextPlaceholder
      };
    }
  } else if (existingPlaceholder) {
    const { [jobId]: removedPlaceholder, ...remainingPlaceholders } = state.placeholdersByJobId;
    placeholdersByJobId = remainingPlaceholders;
  }

  return {
    ...state,
    jobsById: {
      ...state.jobsById,
      [jobId]: nextJob
    },
    activeJobIds: lists.activeJobIds,
    recentJobIds: lists.recentJobIds,
    placeholdersByJobId
  };
}

function appendEventToState(state, jobId, event) {
  if (!jobId) return state;
  const status = getEventStatus(event);
  const modelUrl = event?.payload?.modelUrl ?? event?.payload?.model_url ?? event?.payload?.glbUrl ?? event?.payload?.glb_url;
  const metadataUrl = event?.payload?.metadataUrl ?? event?.payload?.metadata_url;
  const previewUrl = event?.payload?.previewUrl ?? event?.payload?.preview_url;
  const animationCount = event?.payload?.animationCount ?? event?.payload?.animation_count;
  const patch = {
    ...(status ? { status } : {}),
    ...(Number.isFinite(event?.progress) ? { progress: event.progress } : {}),
    ...(Number.isFinite(event?.payload?.progress) ? { progress: event.payload.progress } : {}),
    ...(modelUrl !== undefined ? { modelUrl } : {}),
    ...(metadataUrl !== undefined ? { metadataUrl } : {}),
    ...(previewUrl !== undefined ? { previewUrl } : {}),
    ...(Number.isFinite(animationCount) ? { animationCount } : {})
  };
  const nextState = Object.keys(patch).length ? upsertJob(state, jobId, patch) : state;

  return {
    ...nextState,
    messagesByJobId: {
      ...nextState.messagesByJobId,
      [jobId]: [...(nextState.messagesByJobId[jobId] ?? []), event]
    }
  };
}

function generationReducer(state, action) {
  switch (action.type) {
    case 'addJob': {
      const jobId = getJobId(action.job);
      if (!jobId) return state;
      return upsertJob(state, jobId, {
        ...action.job,
        status: action.job.status ?? 'queued'
      });
    }
    case 'updateJob': {
      if (!action.jobId) return state;
      return upsertJob(state, action.jobId, action.patch ?? {});
    }
    case 'appendEvent': {
      return appendEventToState(state, getEventJobId(action.event, action.jobId), action.event);
    }
    case 'removeJob': {
      if (!action.jobId) return state;
      const { [action.jobId]: removedJob, ...jobsById } = state.jobsById;
      const { [action.jobId]: removedMessages, ...messagesByJobId } = state.messagesByJobId;
      const { [action.jobId]: removedPlaceholder, ...placeholdersByJobId } = state.placeholdersByJobId;
      return {
        ...state,
        jobsById,
        activeJobIds: removeId(state.activeJobIds, action.jobId),
        recentJobIds: removeId(state.recentJobIds, action.jobId),
        messagesByJobId,
        placeholdersByJobId
      };
    }
    case 'clearCompleted': {
      const completedJobIds = state.recentJobIds.filter((jobId) => COMPLETE_STATUSES.has(state.jobsById[jobId]?.status));
      const completedSet = new Set(completedJobIds);
      return {
        ...state,
        recentJobIds: state.recentJobIds.filter((jobId) => !completedSet.has(jobId)),
        messagesByJobId: Object.fromEntries(Object.entries(state.messagesByJobId).filter(([jobId]) => !completedSet.has(jobId))),
        placeholdersByJobId: Object.fromEntries(Object.entries(state.placeholdersByJobId).filter(([jobId]) => !completedSet.has(jobId)))
      };
    }
    default:
      return state;
  }
}

export function useGenerationStore() {
  const [state, dispatch] = useReducer(generationReducer, initialGenerationState);

  const addJob = useCallback((job) => dispatch({ type: 'addJob', job }), []);
  const updateJob = useCallback((jobId, patch) => dispatch({ type: 'updateJob', jobId, patch }), []);
  const appendEvent = useCallback((jobId, event) => dispatch({ type: 'appendEvent', jobId, event }), []);
  const markRunning = useCallback((jobId) => updateJob(jobId, { status: 'running' }), [updateJob]);
  const markSucceeded = useCallback((jobId, payload = {}) => updateJob(jobId, { status: 'succeeded', progress: 100, ...payload }), [updateJob]);
  const markFailed = useCallback((jobId, error) => updateJob(jobId, { status: 'failed', error: normalizeError(error) }), [updateJob]);
  const markCanceled = useCallback((jobId) => updateJob(jobId, { status: 'canceled' }), [updateJob]);
  const removeJob = useCallback((jobId) => dispatch({ type: 'removeJob', jobId }), []);
  const clearCompleted = useCallback(() => dispatch({ type: 'clearCompleted' }), []);

  const activeJobs = useMemo(
    () => state.activeJobIds.map((jobId) => state.jobsById[jobId]).filter(Boolean),
    [state.activeJobIds, state.jobsById]
  );
  const recentJobs = useMemo(
    () => state.recentJobIds.map((jobId) => state.jobsById[jobId]).filter(Boolean),
    [state.recentJobIds, state.jobsById]
  );
  const placeholders = useMemo(() => Object.values(state.placeholdersByJobId), [state.placeholdersByJobId]);

  return {
    ...state,
    activeJobs,
    recentJobs,
    placeholders,
    addJob,
    updateJob,
    appendEvent,
    markRunning,
    markSucceeded,
    markFailed,
    markCanceled,
    removeJob,
    clearCompleted
  };
}

export { initialGenerationState };
