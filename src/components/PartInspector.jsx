import { GeneratedAssetInspector } from './GeneratedAssetInspector.jsx';

function getGeneratedMetadata(part) {
  return part?.generatedMetadata ?? part?.generationMetadata ?? part?.metadata ?? {};
}

function isGeneratedPart(part) {
  if (!part) return false;
  const metadata = getGeneratedMetadata(part);
  return Boolean(
    part.source === 'generated' ||
      part.source === 'generated-asset' ||
      part.kind === 'generated' ||
      part.type === 'generated' ||
      part.assetId ||
      part.generationJobId ||
      part.generationStatus ||
      part.modelUrl ||
      part.glbUrl ||
      part.glb_url ||
      metadata.generated === true ||
      metadata.assetId ||
      metadata.jobId ||
      metadata.prompt
  );
}

export function PartInspector({
  selectedPart,
  onPartChange,
  onPartRemove,
  generatedInteractions = [],
  onGeneratedInteractionsChange,
  onGeneratedInteractionsSave,
  generatedInteractionsSaving = false,
  generatedInteractionsError = '',
  generatedInspectorReadOnly = false,
  onGeneratedAssetDelete,
  onGeneratedAssetHide
}) {
  const material = selectedPart?.material ?? {};
  const color = material.color ?? '#cccccc';
  const materialType = material.type ?? 'standard';
  const isVisible = selectedPart?.visible !== false;
  const isEditable = selectedPart?.editable !== false;
  const position = Array.isArray(selectedPart?.position) ? selectedPart.position : null;
  const endPosition = Array.isArray(selectedPart?.endPosition) ? selectedPart.endPosition : null;
  const isSceneObject = selectedPart?.source === 'scene-object';

  function formatVector(vector) {
    return vector.map((value) => Number(value).toFixed(2)).join(', ');
  }

  if (isGeneratedPart(selectedPart)) {
    return (
      <GeneratedAssetInspector
        asset={selectedPart}
        interactions={generatedInteractions}
        onAssetChange={onPartChange}
        onInteractionsChange={onGeneratedInteractionsChange}
        onSaveInteractions={onGeneratedInteractionsSave}
        onDelete={onGeneratedAssetDelete ?? onPartRemove}
        onHide={onGeneratedAssetHide ?? ((partId) => onPartChange?.(partId, { visible: false }))}
        readOnly={generatedInspectorReadOnly}
        savingInteractions={generatedInteractionsSaving}
        interactionError={generatedInteractionsError}
      />
    );
  }

  return (
    <section className="inspector-stack">
      {!selectedPart ? (
        <div className="empty-state">Select a component to inspect its properties.</div>
      ) : (
        <>
          <header className="inspector-hero">
            <span className="inspector-swatch" style={{ '--swatch-color': color }} />
            <span className="inspector-heading">
              <span className="inspector-label">Selected component</span>
              <strong>{selectedPart.name}</strong>
            </span>
          </header>

          <section className="inspector-section">
            <div className="section-heading">
              <h3>Properties</h3>
            </div>
            <label className="control-row control-row-input">
              <span>Label</span>
              <input
                type="text"
                value={selectedPart.name}
                disabled={!isEditable}
                aria-label={`Rename ${selectedPart.name}`}
                onChange={(event) => onPartChange(selectedPart.id, { name: event.target.value })}
              />
            </label>
            <dl className="property-list">
              <div>
                <dt>Component ID</dt>
                <dd>{selectedPart.id}</dd>
              </div>
              <div>
                <dt>Type</dt>
                <dd>{selectedPart.type ?? selectedPart.kind ?? 'mesh'}</dd>
              </div>
              <div>
                <dt>State</dt>
                <dd>{isEditable ? 'Editable' : 'Locked'}</dd>
              </div>
              {selectedPart.attachedTo ? (
                <div>
                  <dt>Attached to</dt>
                  <dd>{selectedPart.attachedTo}</dd>
                </div>
              ) : null}
            </dl>
          </section>

          {isSceneObject ? (
            <section className="inspector-section">
              <div className="section-heading">
                <h3>Scene Object</h3>
              </div>
              <dl className="property-list">
                {position ? (
                  <div>
                    <dt>Anchor</dt>
                    <dd>{formatVector(position)}</dd>
                  </div>
                ) : null}
                {endPosition ? (
                  <div>
                    <dt>End point</dt>
                    <dd>{formatVector(endPosition)}</dd>
                  </div>
                ) : null}
              </dl>
            </section>
          ) : null}

          <section className="inspector-section">
            <div className="section-heading">
              <h3>Appearance</h3>
            </div>
            <div className="control-row">
              <span>Visible</span>
              <button
                type="button"
                className={`switch-control ${isVisible ? 'switch-control-on' : ''}`}
                aria-label={`${isVisible ? 'Hide' : 'Show'} ${selectedPart.name}`}
                aria-pressed={isVisible}
                disabled={!isEditable}
                onClick={() => onPartChange(selectedPart.id, { visible: !isVisible })}
              />
            </div>
            <div className="control-row">
              <span>Material</span>
              <strong>{materialType}</strong>
            </div>
            <div className="control-row">
              <span>Color</span>
              <span className="color-value">
                <span className="mini-swatch" style={{ '--swatch-color': color }} />
                <input
                  type="color"
                  value={color}
                  aria-label={`Change ${selectedPart.name} color`}
                  disabled={!isEditable}
                  onChange={(event) =>
                    onPartChange(selectedPart.id, {
                      material: {
                        ...material,
                        color: event.target.value
                      }
                    })
                  }
                />
                <span>{color}</span>
              </span>
            </div>
          </section>

          {isSceneObject ? (
            <section className="inspector-section inspector-section-danger">
              <div className="section-heading">
                <h3>Object Management</h3>
              </div>
              <button
                type="button"
                className="danger-button"
                onClick={() => onPartRemove(selectedPart.id)}
              >
                Remove object
              </button>
            </section>
          ) : null}
        </>
      )}
    </section>
  );
}
