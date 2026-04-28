# 3DPromptStudio

AI-customizable 3D product configurator for Blender assets.

3DPromptStudio imports GLB models exported from Blender, renders them in the browser with Three.js, and lets users customize approved model parts through UI controls or natural language prompts.

## Architecture Scaffold

This repository follows the architecture note in `Architecture_3DPromptStudio.md` from the Obsidian vault:

- `src/` - React frontend, Three.js rendering, app state, client API modules, and shared frontend schemas.
- `server/` - backend API, OpenAI prompt-to-operation service, validation, persistence, storage, and utilities.
- `server/db/` - database client, schema, and migrations.

The initial files are placeholders so implementation can proceed module by module without changing the planned structure.
