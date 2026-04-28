import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '.data');
const WORKSPACES_FILE = path.join(DATA_DIR, 'workspaces.json');

let hasBootstrapped = false;
const cache = {
  workspaces: {}
};

function toWorkspaceRecord(rawRecord) {
  return {
    id: rawRecord.id,
    projectId: rawRecord.projectId,
    modelId: rawRecord.modelId ?? null,
    currentVariantId: rawRecord.currentVariantId ?? null,
    selectedTool: rawRecord.selectedTool,
    selectedPartId: rawRecord.selectedPartId ?? null,
    rightPanelMode: rawRecord.rightPanelMode,
    workspaceStateJson: rawRecord.workspaceStateJson,
    hasUnsavedOperations: Boolean(rawRecord.hasUnsavedOperations),
    createdAt: rawRecord.createdAt,
    updatedAt: rawRecord.updatedAt
  };
}

async function flush() {
  await mkdir(DATA_DIR, { recursive: true });
  const serialized = JSON.stringify(cache, null, 2);
  await writeFile(WORKSPACES_FILE, serialized, 'utf-8');
}

async function bootstrap() {
  if (hasBootstrapped) return;
  hasBootstrapped = true;

  try {
    const content = await readFile(WORKSPACES_FILE, 'utf-8');
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === 'object' && parsed.workspaces && typeof parsed.workspaces === 'object') {
      cache.workspaces = parsed.workspaces;
    }
  } catch {
    await flush();
  }
}

export async function getWorkspaceRecord(projectId) {
  await bootstrap();
  const rawRecord = cache.workspaces[projectId];
  return rawRecord ? toWorkspaceRecord(rawRecord) : null;
}

export async function upsertWorkspaceRecord(record) {
  await bootstrap();
  cache.workspaces[record.projectId] = toWorkspaceRecord(record);
  await flush();
  return toWorkspaceRecord(cache.workspaces[record.projectId]);
}
