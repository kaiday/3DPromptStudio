import { useCallback, useMemo, useState } from 'react';
import { SceneViewport } from '../components/SceneViewport.jsx';

function selectedPartLabel(parts, selectedPartId) {
  return parts.find((part) => part.id === selectedPartId)?.name ?? 'No part selected';
}

export function App() {
  const [modelFile, setModelFile] = useState(null);
  const [parts, setParts] = useState([]);
  const [selectedPartId, setSelectedPartId] = useState('');
  const [command, setCommand] = useState(null);
  const [status, setStatus] = useState('Upload a Blender-exported GLB file to start the no-env renderer demo.');

  const selectedLabel = useMemo(() => selectedPartLabel(parts, selectedPartId), [parts, selectedPartId]);

  function handleModelFile(event) {
    const file = event.target.files?.[0] ?? null;
    setModelFile(file);
    setParts([]);
    setSelectedPartId('');
    setStatus(file ? `Loading ${file.name}...` : 'Upload a Blender-exported GLB file to start.');
  }

  function sendOperation(operation) {
    setCommand({ id: crypto.randomUUID(), operation });
  }

  function requireSelection(operationFactory) {
    if (!selectedPartId) {
      setStatus('Select a detected mesh part before applying a test operation.');
      return;
    }

    sendOperation(operationFactory(selectedPartId));
  }

  const handleViewportError = useCallback((message) => {
    setStatus(message);
  }, []);

  const handleModelLoaded = useCallback((metadata) => {
    setParts(metadata.parts);
    setStatus(`Loaded ${metadata.parts.length} editable mesh part${metadata.parts.length === 1 ? '' : 's'}.`);
  }, []);

  const handleOperationResult = useCallback((result) => {
    setStatus(result.summary);
  }, []);

  return (
    <main className="appShell">
      <aside className="sidePanel">
        <header className="brandBlock">
          <h1>3DPromptStudio</h1>
          <p>No-env renderer demo for Blender GLB customization.</p>
        </header>

        <section className="panelSection">
          <h2>Model Upload</h2>
          <input className="fileInput" type="file" accept=".glb,.gltf,model/gltf-binary,model/gltf+json" onChange={handleModelFile} />
          <p className="statusText">Use a GLB exported from Blender with named mesh parts such as Seat, Legs, Cushion, or Backrest.</p>
        </section>

        <section className="panelSection">
          <h2>Detected Parts ({parts.length})</h2>
          <div className="partList">
            {parts.length === 0 ? (
              <p className="statusText">No model parts detected yet.</p>
            ) : (
              parts.map((part) => (
                <button
                  className={`partButton${part.id === selectedPartId ? ' isSelected' : ''}`}
                  key={part.id}
                  type="button"
                  onClick={() => setSelectedPartId(part.id)}
                >
                  <span>{part.name}</span>
                  <small>{part.materialName || 'material'}</small>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="panelSection">
          <h2>Test Operations</h2>
          <p className="statusText">Selected: {selectedLabel}</p>
          <div className="actionGrid">
            <button type="button" onClick={() => requireSelection((target) => ({ op: 'set_material_color', target, color: '#2563EB' }))}>
              Make Blue
            </button>
            <button type="button" onClick={() => requireSelection((target) => ({ op: 'set_visibility', target, visible: false }))}>
              Hide
            </button>
            <button type="button" onClick={() => requireSelection((target) => ({ op: 'set_visibility', target, visible: true }))}>
              Show
            </button>
            <button type="button" onClick={() => requireSelection((target) => ({ op: 'reset_part', target }))}>
              Reset Part
            </button>
          </div>
          <button className="wideButton" type="button" onClick={() => sendOperation({ op: 'reset_all' })}>
            Reset Full Model
          </button>
        </section>

        <section className="panelSection">
          <h2>Status</h2>
          <p className="statusText">{status}</p>
        </section>
      </aside>

      <section className="viewportShell">
        <SceneViewport
          command={command}
          modelFile={modelFile}
          onError={handleViewportError}
          onModelLoaded={handleModelLoaded}
          onOperationResult={handleOperationResult}
        />
        <div className="viewportOverlay">Orbit with mouse drag. Scroll to zoom. Right-click drag to pan.</div>
      </section>
    </main>
  );
}
