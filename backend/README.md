# 3DPromptStudio Python Backend

FastAPI backend for the 3DPromptStudio API.

## Run Locally

From this `backend/` folder:

```bash
python3 -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Health check:

```bash
curl http://127.0.0.1:8000/api/health
```

Expected response:

```json
{"status":"ok"}
```

## Model Upload MVP

```bash
curl -F "file=@cat_wearing_hat.glb;type=model/gltf-binary" \
  -F "source=upload" \
  http://127.0.0.1:8000/api/projects/demo/models/upload
```

The upload response includes `fileUrl` and `metadataUrl` values that the frontend can use to load the GLB and inspect backend metadata.

## Tests

```bash
python3 -m pytest
```
