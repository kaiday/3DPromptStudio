import {
  isNervOrgGenerationEvent,
  nervOrgEventToGenerationEvent,
  nervOrgPendingToGenerationJob
} from './nervorgGenerationAdapter.js';

const NERVORG_GENERATION_EVENTS = ['npc_pending', 'npc_progress', 'npc_ready', 'npc_failed', 'npc_deleted'];

function noop() {}

function getEventJobId(event) {
  return event?.jobId ?? event?.job_id ?? event?.payload?.jobId ?? event?.payload?.job_id ?? null;
}

function requireBridgeDependency(value, label) {
  if (!value) {
    throw new Error(`NervOrg generation bridge requires ${label}.`);
  }
}

function subscribeToNervOrgEvents(wsClient, handleMessage) {
  if (typeof wsClient.on === 'function') {
    const unsubscribers = NERVORG_GENERATION_EVENTS.map((eventType) => wsClient.on(eventType, handleMessage)).filter(Boolean);
    if (unsubscribers.length > 0) {
      return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
    }
  }

  if (typeof wsClient.addEventListener === 'function') {
    const listener = (event) => {
      try {
        handleMessage(JSON.parse(event.data));
      } catch {
        handleMessage(event.data);
      }
    };
    wsClient.addEventListener('message', listener);
    return () => wsClient.removeEventListener('message', listener);
  }

  throw new Error('NervOrg generation bridge requires a wsClient with on() or addEventListener().');
}

export function createNervOrgGenerationBridge({
  wsClient,
  generationActions,
  enabled = false,
  onEvent = noop,
  onError = noop
} = {}) {
  let unsubscribe = null;

  function handleMessage(message) {
    if (!isNervOrgGenerationEvent(message)) return;

    if (message.type === 'npc_pending') {
      const job = nervOrgPendingToGenerationJob(message);
      if (job) generationActions.addJob(job);
    }

    const event = nervOrgEventToGenerationEvent(message);
    if (!event) return;

    generationActions.appendEvent(getEventJobId(event), event);
    onEvent(event, message);
  }

  function start() {
    if (!enabled || unsubscribe) return noop;

    requireBridgeDependency(wsClient, 'wsClient');
    requireBridgeDependency(generationActions?.addJob, 'generationActions.addJob');
    requireBridgeDependency(generationActions?.appendEvent, 'generationActions.appendEvent');

    try {
      unsubscribe = subscribeToNervOrgEvents(wsClient, handleMessage);
    } catch (error) {
      onError(error);
      throw error;
    }

    return stop;
  }

  function stop() {
    if (!unsubscribe) return;
    unsubscribe();
    unsubscribe = null;
  }

  return {
    start,
    stop,
    isRunning: () => Boolean(unsubscribe)
  };
}

export { NERVORG_GENERATION_EVENTS };
