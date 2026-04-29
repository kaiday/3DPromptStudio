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

## Main API Surfaces

- Workspace state: `/api/projects/{project_id}/workspace`
- GLB upload and metadata: `/api/projects/{project_id}/models/upload`, `/api/models/{model_id}/file`
- Component registry/config: `/api/projects/{project_id}/components`
- Annotations, line markup, and cut guides: `/api/projects/{project_id}/annotations`
- Safe edit operations: `/api/projects/{project_id}/operations`
- Prompt interpretation: `/api/projects/{project_id}/prompt`
- Export intent: `/api/projects/{project_id}/export`

## Tests

```bash
python3 -m pytest
```
