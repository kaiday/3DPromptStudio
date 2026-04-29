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

## Tests

```bash
python3 -m pytest
```

