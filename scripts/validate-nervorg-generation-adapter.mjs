import assert from 'node:assert/strict';

import {
  nervOrgEventToGenerationEvent,
  nervOrgPendingToGenerationJob
} from '../src/api/nervorgGenerationAdapter.js';
import { createNervOrgGenerationBridge } from '../src/api/nervorgWsGenerationBridge.js';

const pending = {
  type: 'npc_pending',
  id: 'npc_test123',
  prompt: 'a friendly robot',
  position: [1, 0, 2],
  rotation: [0, 1.5, 0]
};

const progress = {
  type: 'npc_progress',
  id: 'npc_test123',
  message: 'GLB contains 2 animation clip(s)'
};

const ready = {
  type: 'npc_ready',
  npc: {
    id: 'npc_test123',
    prompt: 'a friendly robot',
    glb_url: '/assets/npc_test123.glb',
    animation_count: 2
  }
};

const failed = {
  type: 'npc_failed',
  id: 'npc_failed123',
  error: 'Blender MCP unavailable'
};

const deleted = {
  type: 'npc_deleted',
  id: 'npc_deleted123'
};

const pendingJob = nervOrgPendingToGenerationJob(pending);

assert.deepEqual(pendingJob, {
  id: 'npc_test123',
  status: 'queued',
  prompt: 'a friendly robot',
  placement: {
    position: [1, 0, 2],
    rotation: [0, 1.5, 0],
    scale: 1
  },
  provider: 'nervorg_ws',
  createdAt: pendingJob.createdAt
});

assert.equal(nervOrgEventToGenerationEvent(pending).type, 'job_queued');
assert.equal(nervOrgEventToGenerationEvent(progress).type, 'job_progress');
assert.equal(nervOrgEventToGenerationEvent(progress).message, 'GLB contains 2 animation clip(s)');
assert.equal(nervOrgEventToGenerationEvent(ready).type, 'job_succeeded');
assert.equal(nervOrgEventToGenerationEvent(ready).payload.modelUrl, '/assets/npc_test123.glb');
assert.equal(nervOrgEventToGenerationEvent(ready).payload.animationCount, 2);
assert.equal(nervOrgEventToGenerationEvent(failed).type, 'job_failed');
assert.equal(nervOrgEventToGenerationEvent(failed).message, 'Blender MCP unavailable');
assert.equal(nervOrgEventToGenerationEvent(deleted).type, 'job_canceled');

const listeners = new Map();
const addJobCalls = [];
const appendEventCalls = [];
const wsClient = {
  on(type, listener) {
    listeners.set(type, listener);
    return () => listeners.delete(type);
  }
};

const bridge = createNervOrgGenerationBridge({
  wsClient,
  generationActions: {
    addJob: (job) => addJobCalls.push(job),
    appendEvent: (jobId, event) => appendEventCalls.push({ jobId, event })
  },
  enabled: true
});

bridge.start();
assert.equal(bridge.isRunning(), true);
listeners.get('npc_pending')?.(pending);
listeners.get('npc_ready')?.(ready);
assert.equal(addJobCalls.length, 1);
assert.equal(addJobCalls[0].id, 'npc_test123');
assert.equal(appendEventCalls.length, 2);
assert.equal(appendEventCalls[1].event.type, 'job_succeeded');
bridge.stop();
assert.equal(bridge.isRunning(), false);

console.log('NervOrg generation adapter validation passed.');
