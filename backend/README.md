# 3DPromptStudio Python Backend

FastAPI backend for the 3DPromptStudio API.

This is the active backend. The repository's `server/` folder is legacy JavaScript prototype/reference code only.

## Run Locally

From this `backend/` folder:

```bash
python3 -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8018
```

Health check:

```bash
curl http://127.0.0.1:8018/api/health
```

Expected response:

```json
{"status":"ok"}
```

## Model Upload MVP

```bash
curl -F "file=@cat_wearing_hat.glb;type=model/gltf-binary" \
  -F "source=upload" \
  http://127.0.0.1:8018/api/projects/demo/models/upload
```

The upload response includes `fileUrl` and `metadataUrl` values that the frontend can use to load the GLB and inspect backend metadata.

## Generation Jobs MVP

The generation API preserves the NervOrg-style pending/progress/success/failure flow. The default provider is `fake`, which completes immediately and emits persisted progress events without requiring Blender.

Create a generation job:

```bash
curl -X POST http://127.0.0.1:8018/api/projects/demo/generation/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "spawn an old wizard",
    "placement": {
      "position": [0, 0, 0],
      "rotation": [0, 0, 0],
      "scale": 1
    },
    "style": "low-poly educational",
    "mode": "asset",
    "metadata": {
      "role": "npc",
      "dialogue": ["Hello, traveler."]
    }
  }'
```

List jobs for a project:

```bash
curl http://127.0.0.1:8018/api/projects/demo/generation/jobs
```

Read one job:

```bash
curl http://127.0.0.1:8018/api/projects/demo/generation/jobs/gen_abc123
```

Read persisted job events:

```bash
curl http://127.0.0.1:8018/api/projects/demo/generation/jobs/gen_abc123/events
```

Cancel a queued or running job:

```bash
curl -X DELETE http://127.0.0.1:8018/api/projects/demo/generation/jobs/gen_abc123
```

Current event delivery is JSON polling through the `/events` endpoint. The event records use these types:

- `job_queued`
- `job_started`
- `job_progress`
- `job_succeeded`
- `job_failed`
- `job_canceled`

Provider settings:

```env
GENERATION_PROVIDER=fake
GENERATION_FAKE_DELAY_SECONDS=2
GENERATION_EVENT_POLL_SECONDS=0.5
GENERATION_JOB_TIMEOUT_SECONDS=900
```

`openai_blender` and `hosted_blender` are reserved provider names. In this MVP branch they fail clearly and persist a `job_failed` event instead of attempting Blender generation.

## Main API Surfaces

- Workspace state: `/api/projects/{project_id}/workspace`
- GLB upload and metadata: `/api/projects/{project_id}/models/upload`, `/api/models/{model_id}/file`
- Component registry/config: `/api/projects/{project_id}/components`
- Annotations, line markup, and cut guides: `/api/projects/{project_id}/annotations`
- Safe edit operations: `/api/projects/{project_id}/operations`
- Prompt interpretation: `/api/projects/{project_id}/prompt`
- Generation jobs: `/api/projects/{project_id}/generation/jobs`
- Export intent: `/api/projects/{project_id}/export`

## Tests

```bash
python3 -m pytest
```
