# 3DPromptStudio

AI-customizable 3D product configurator for Blender assets.

3DPromptStudio imports GLB models exported from Blender, renders them in the browser with Three.js, and lets users customize approved model parts through UI controls or natural language prompts.

## Architecture Scaffold

This repository follows the architecture note in `Architecture_3DPromptStudio.md` from the Obsidian vault:

- `src/` - React frontend, Three.js rendering, app state, client API modules, and shared frontend schemas.
- `backend/` - active Python FastAPI backend, prompt-to-operation service, validation, SQLite persistence, GLB upload storage, annotations, operations, and export intent APIs.
- `server/` - legacy JavaScript prototype kept as behavior reference only. Do not add new backend features here.

The Python backend is the backend source of truth for new work. Run and test it from `backend/`.
