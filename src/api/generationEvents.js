import { parseJsonResponse } from './projectApi.js';

const API_ROOT = '/api';
const TERMINAL_EVENT_TYPES = new Set(['job_succeeded', 'job_failed', 'job_canceled']);

const DEFAULT_EVENT_TYPES = [
  'job_queued',
  'job_started',
  'job_progress',
  'job_succeeded',
  'job_failed',
  'job_canceled'
];

function generationEventsUrl(projectId, jobId) {
  return `${API_ROOT}/projects/${encodeURIComponent(projectId)}/generation/jobs/${encodeURIComponent(jobId)}/events`;
}

function parseSsePayload(event) {
  if (!event?.data) return {};
  try {
    return JSON.parse(event.data);
  } catch {
    return {
      type: event.type,
      message: event.data
    };
  }
}

function normalizeGenerationEvent(record, fallbackType) {
  const payload = record?.payload ?? {};
  return {
    id: record?.id ?? payload.id ?? null,
    type: record?.type ?? payload.type ?? fallbackType ?? 'message',
    jobId: record?.jobId ?? record?.job_id ?? payload.jobId ?? payload.job_id ?? null,
    message: record?.message ?? payload.message ?? '',
    payload,
    receivedAt: record?.createdAt ?? record?.created_at ?? new Date().toISOString()
  };
}

function normalizeSseEvent(event, fallbackType) {
  const payload = parseSsePayload(event);
  return normalizeGenerationEvent(
    {
      id: payload.id,
      type: payload.type ?? fallbackType ?? event?.type,
      jobId: payload.jobId ?? payload.job_id,
      message: payload.message,
      payload,
      createdAt: payload.createdAt ?? payload.created_at
    },
    fallbackType
  );
}

function isTerminalGenerationEvent(event) {
  return TERMINAL_EVENT_TYPES.has(event?.type ?? event?.payload?.type);
}

async function fetchGenerationEvents(projectId, jobId) {
  const response = await fetch(generationEventsUrl(projectId, jobId));
  const payload = await parseJsonResponse(response, 'Generation events fetch failed.');
  if (Array.isArray(payload?.events)) return payload.events;
  if (Array.isArray(payload)) return payload;
  return [];
}

function subscribeWithPolling(projectId, jobId, handlers = {}) {
  const intervalMs = handlers.intervalMs ?? 1200;
  const seenEventIds = new Set();
  let timerId = null;
  let closed = false;
  let inFlight = false;

  async function poll() {
    if (closed || inFlight) return;
    inFlight = true;
    try {
      const records = await fetchGenerationEvents(projectId, jobId);
      for (const record of records) {
        const event = normalizeGenerationEvent(record);
        const eventKey = event.id ?? `${event.type}:${event.receivedAt}:${event.message}`;
        if (seenEventIds.has(eventKey)) continue;
        seenEventIds.add(eventKey);
        handlers.onEvent?.(event);
        if (isTerminalGenerationEvent(event)) {
          closed = true;
          break;
        }
      }
    } catch (error) {
      handlers.onError?.(error);
      closed = true;
    } finally {
      inFlight = false;
      if (!closed) {
        timerId = window.setTimeout(poll, intervalMs);
      }
    }
  }

  poll();

  return () => {
    closed = true;
    if (timerId !== null) window.clearTimeout(timerId);
  };
}

function subscribeWithSse(projectId, jobId, handlers = {}) {
  if (typeof EventSource === 'undefined') {
    handlers.onError?.(new Error('EventSource is not available in this browser.'));
    return () => {};
  }

  const source = new EventSource(generationEventsUrl(projectId, jobId));
  const eventTypes = handlers.eventTypes ?? DEFAULT_EVENT_TYPES;

  function closeIfTerminal(event) {
    if (isTerminalGenerationEvent(event)) source.close();
  }

  function handleEvent(event) {
    const normalizedEvent = normalizeSseEvent(event, event.type);
    handlers.onEvent?.(normalizedEvent);
    closeIfTerminal(normalizedEvent);
  }

  function handleError(event) {
    if (source.readyState === EventSource.CLOSED) {
      handlers.onError?.(event instanceof Error ? event : new Error('Generation event stream closed.'));
    }
  }

  source.addEventListener('message', handleEvent);
  source.addEventListener('error', handleError);
  eventTypes.forEach((eventType) => source.addEventListener(eventType, handleEvent));

  return () => {
    source.removeEventListener('message', handleEvent);
    source.removeEventListener('error', handleError);
    eventTypes.forEach((eventType) => source.removeEventListener(eventType, handleEvent));
    source.close();
  };
}

export function subscribeToGenerationJob(projectId, jobId, handlers = {}) {
  if (handlers.transport === 'sse') {
    return subscribeWithSse(projectId, jobId, handlers);
  }
  return subscribeWithPolling(projectId, jobId, handlers);
}

export { DEFAULT_EVENT_TYPES, TERMINAL_EVENT_TYPES };
