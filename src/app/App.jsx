import { useEffect, useMemo, useState } from 'react';
import { submitPrompt } from '../api/promptApi.js';
import { fetchWorkspace, patchWorkspace, redoWorkspace, undoWorkspace } from '../api/projectApi.js';
import { ErrorBanner } from '../components/ErrorBanner.jsx';
import { LoadingOverlay } from '../components/LoadingOverlay.jsx';
import { PartInspector } from '../components/PartInspector.jsx';
import { PromptComposer } from '../components/PromptComposer.jsx';
import { PromptHistory } from '../components/PromptHistory.jsx';
import { SceneViewport } from '../components/SceneViewport.jsx';
import { VariantHistory } from '../components/VariantHistory.jsx';
import { useHistoryStore } from '../state/historyStore.js';
import { useSceneStore } from '../state/sceneStore.js';
import { useSelectionStore } from '../state/selectionStore.js';

const PROJECT_ID = 'default-project';
const TOOL_OPTIONS = ['mouse', 'annotation', 'line', 'cut', 'zoom'];

export default function App() {
  const sceneStore = useSceneStore();
  const selectionStore = useSelectionStore();
  const historyStore = useHistoryStore(sceneStore.workspace);
  const [isLoading, setIsLoading] = useState(true);
  const [isPrompting, setIsPrompting] = useState(false);
  const [error, setError] = useState('');
  const [activeRightPanel, setActiveRightPanel] = useState('config');

  useEffect(() => {
    async function loadWorkspace() {
      try {
        const payload = await fetchWorkspace(PROJECT_ID);
        sceneStore.setWorkspace(payload.workspace);
        selectionStore.setSelectedPartId(payload.workspace.selectedPartId ?? null);
        setActiveRightPanel(payload.workspace.rightPanelMode ?? 'config');
      } catch (loadError) {
        setError(loadError.message);
      } finally {
        setIsLoading(false);
      }
    }

    loadWorkspace();
  }, []);

  const selectedPart = useMemo(
    () => sceneStore.scene.components.find((part) => part.id === selectionStore.selectedPartId) ?? null,
    [sceneStore.scene.components, selectionStore.selectedPartId]
  );

  async function persistWorkspacePatch(patch) {
    const payload = await patchWorkspace(PROJECT_ID, patch);
    sceneStore.setWorkspace(payload.workspace);
    if (patch.selectedPartId !== undefined) {
      selectionStore.setSelectedPartId(patch.selectedPartId);
    }
  }

  async function handlePartSelect(partId) {
    try {
      setError('');
      await persistWorkspacePatch({ selectedPartId: partId });
    } catch (saveError) {
      setError(saveError.message);
    }
  }

  async function handleToolChange(tool) {
    try {
      setError('');
      await persistWorkspacePatch({ selectedTool: tool });
    } catch (saveError) {
      setError(saveError.message);
    }
  }

  async function handlePanelModeChange(mode) {
    try {
      setError('');
      setActiveRightPanel(mode);
      await persistWorkspacePatch({ rightPanelMode: mode });
    } catch (saveError) {
      setError(saveError.message);
    }
  }

  async function handlePromptSubmit(prompt) {
    try {
      setError('');
      setIsPrompting(true);
      const payload = await submitPrompt(PROJECT_ID, prompt);
      sceneStore.setWorkspace(payload.workspace);
    } catch (promptError) {
      setError(promptError.message);
    } finally {
      setIsPrompting(false);
    }
  }

  async function handleUndo() {
    try {
      setError('');
      const payload = await undoWorkspace(PROJECT_ID);
      sceneStore.setWorkspace(payload.workspace);
    } catch (undoError) {
      setError(undoError.message);
    }
  }

  async function handleRedo() {
    try {
      setError('');
      const payload = await redoWorkspace(PROJECT_ID);
      sceneStore.setWorkspace(payload.workspace);
    } catch (redoError) {
      setError(redoError.message);
    }
  }

  if (isLoading) {
    return <LoadingOverlay message="Loading workspace..." />;
  }

  return (
    <main style={{ display: 'grid', gridTemplateColumns: '260px 1fr 320px', gap: 12, padding: 12 }}>
      <aside style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
        <h2>Parts</h2>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
          {sceneStore.scene.components.map((part) => (
            <li key={part.id}>
              <button
                type="button"
                onClick={() => handlePartSelect(part.id)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 10px',
                  borderRadius: 6,
                  border: part.id === selectionStore.selectedPartId ? '2px solid #2563eb' : '1px solid #d1d5db'
                }}
              >
                {part.name}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section style={{ display: 'grid', gap: 12 }}>
        <ErrorBanner message={error} />
        {isPrompting ? <LoadingOverlay message="Generating edit operations..." /> : null}
        <SceneViewport
          scene={sceneStore.scene}
          viewport={sceneStore.viewport}
          selectedPartId={selectionStore.selectedPartId}
          onSelectPart={handlePartSelect}
        />
        <footer style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 10 }}>
          <h3>Tools</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {TOOL_OPTIONS.map((tool) => (
              <button
                key={tool}
                type="button"
                onClick={() => handleToolChange(tool)}
                style={{
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: sceneStore.workspace?.selectedTool === tool ? '2px solid #2563eb' : '1px solid #d1d5db'
                }}
              >
                {tool}
              </button>
            ))}
            <button type="button" onClick={handleUndo} disabled={!historyStore.canUndo}>
              Undo
            </button>
            <button type="button" onClick={handleRedo} disabled={!historyStore.canRedo}>
              Redo
            </button>
          </div>
        </footer>
      </section>

      <aside style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => handlePanelModeChange('config')} disabled={activeRightPanel === 'config'}>
            Config
          </button>
          <button type="button" onClick={() => handlePanelModeChange('prompt')} disabled={activeRightPanel === 'prompt'}>
            Prompt
          </button>
        </div>
        {activeRightPanel === 'prompt' ? (
          <>
            <PromptComposer onSubmit={handlePromptSubmit} disabled={isPrompting} />
            <PromptHistory prompts={historyStore.promptHistory} />
            <VariantHistory variants={historyStore.variantHistory} />
          </>
        ) : (
          <PartInspector selectedPart={selectedPart} />
        )}
      </aside>
    </main>
  );
}
