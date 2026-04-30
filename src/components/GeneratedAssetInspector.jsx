import { DialogueEditor } from './DialogueEditor.jsx';

const VECTOR_FIELDS = [
  { key: 'position', label: 'Position', fallback: [0, 0, 0], step: 0.1 },
  { key: 'rotation', label: 'Rotation', fallback: [0, 0, 0], step: 0.05 },
  { key: 'scale', label: 'Scale', fallback: [1, 1, 1], step: 0.05 }
];

function toVector(value, fallback) {
  if (Array.isArray(value) && value.length === 3) {
    return value.map((item, index) => {
      const number = Number(item);
      return Number.isFinite(number) ? number : fallback[index];
    });
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return [value, value, value];
  }
  return fallback;
}

function getGeneratedMetadata(asset) {
  return asset?.generatedMetadata ?? asset?.generationMetadata ?? asset?.metadata ?? {};
}

function getStatus(asset, metadata) {
  return asset?.generationStatus ?? asset?.status ?? metadata.status ?? (asset?.modelUrl || asset?.glbUrl ? 'ready' : 'metadata');
}

function getDialogueInteraction(interactions) {
  return interactions.find((interaction) => interaction.kind === 'dialogue') ?? null;
}

function getDialogueLines(interaction) {
  const lines = interaction?.payload?.lines;
  return Array.isArray(lines) ? lines : [];
}

export function GeneratedAssetInspector({
  asset,
  interactions = [],
  onAssetChange,
  onInteractionsChange,
  onSaveInteractions,
  onDelete,
  onHide,
  disabled = false,
  readOnly = false,
  savingInteractions = false,
  interactionError = ''
}) {
  if (!asset) {
    return <div className="empty-state">Select a generated asset to edit it.</div>;
  }

  const metadata = getGeneratedMetadata(asset);
  const isLocked = disabled || readOnly || asset.editable === false;
  const isDialogueLocked = isLocked || !onInteractionsChange;
  const dialogueInteraction = getDialogueInteraction(interactions);
  const dialogueLines = getDialogueLines(dialogueInteraction);
  const status = getStatus(asset, metadata);
  const prompt = metadata.prompt ?? asset.prompt ?? asset.sourcePrompt ?? '';
  const modelUrl = asset.modelUrl ?? asset.glbUrl ?? asset.glb_url ?? metadata.modelUrl ?? metadata.glbUrl ?? '';
  const assetId = asset.assetId ?? metadata.assetId ?? asset.id;

  function handleAssetPatch(patch) {
    if (isLocked || !onAssetChange) return;
    onAssetChange(asset.id, patch);
  }

  function handleDialogueChange(lines) {
    if (isDialogueLocked) return;
    const nextDialogue = {
      ...(dialogueInteraction ?? {}),
      kind: 'dialogue',
      label: dialogueInteraction?.label || `${asset.name ?? 'Generated asset'} dialogue`,
      payload: {
        ...(dialogueInteraction?.payload ?? {}),
        lines
      }
    };
    const withoutDialogue = interactions.filter((interaction) => interaction.kind !== 'dialogue');
    onInteractionsChange([...withoutDialogue, nextDialogue]);
  }

  function handleVectorChange(field, index, value) {
    const definition = VECTOR_FIELDS.find((item) => item.key === field);
    const currentVector = toVector(asset[field], definition.fallback);
    const nextValue = Number(value);
    if (!Number.isFinite(nextValue)) return;
    const nextVector = currentVector.map((item, vectorIndex) => (vectorIndex === index ? nextValue : item));
    handleAssetPatch({ [field]: nextVector });
  }

  return (
    <section className="inspector-stack generated-asset-inspector">
      <header className="inspector-hero">
        <span className="inspector-swatch generated-asset-swatch" />
        <span className="inspector-heading">
          <span className="inspector-label">Generated asset</span>
          <strong>{asset.name ?? asset.id}</strong>
        </span>
      </header>

      <section className="inspector-section">
        <div className="section-heading">
          <h3>Identity</h3>
        </div>
        <label className="control-row control-row-input">
          <span>Name</span>
          <input
            type="text"
            value={asset.name ?? ''}
            disabled={isLocked}
            aria-label={`Rename ${asset.name ?? asset.id}`}
            onChange={(event) => handleAssetPatch({ name: event.target.value })}
          />
        </label>
        <dl className="property-list">
          <div>
            <dt>Component ID</dt>
            <dd>{asset.id}</dd>
          </div>
          <div>
            <dt>Asset ID</dt>
            <dd>{assetId}</dd>
          </div>
          <div>
            <dt>Kind</dt>
            <dd>{asset.type ?? asset.kind ?? 'generated'}</dd>
          </div>
        </dl>
      </section>

      <section className="inspector-section">
        <div className="section-heading">
          <h3>Generation</h3>
          <span className="status-pill status-pill-success">{status}</span>
        </div>
        <dl className="property-list">
          {prompt ? (
            <div>
              <dt>Prompt</dt>
              <dd>{prompt}</dd>
            </div>
          ) : null}
          {modelUrl ? (
            <div>
              <dt>Model</dt>
              <dd>{modelUrl}</dd>
            </div>
          ) : null}
          <div>
            <dt>Dialogue lines</dt>
            <dd>{dialogueLines.length}</dd>
          </div>
        </dl>
      </section>

      <section className="inspector-section">
        <DialogueEditor
          lines={dialogueLines}
          disabled={isDialogueLocked || savingInteractions}
          readOnly={readOnly || !onInteractionsChange}
          onChange={handleDialogueChange}
        />
        {interactionError ? <div className="status-banner status-banner-error">{interactionError}</div> : null}
        {onSaveInteractions && !readOnly ? (
          <button type="button" className="quiet-button quiet-button-primary" disabled={isLocked || savingInteractions} onClick={onSaveInteractions}>
            {savingInteractions ? 'Saving...' : 'Save dialogue'}
          </button>
        ) : null}
      </section>

      <section className="inspector-section generated-transform-section">
        <div className="section-heading">
          <h3>Transform</h3>
        </div>
        {VECTOR_FIELDS.map((field) => {
          const vector = toVector(asset[field.key], field.fallback);
          return (
            <div key={field.key} className="vector-control">
              <span>{field.label}</span>
              <div className="vector-input-grid">
                {vector.map((value, index) => (
                  <label key={`${field.key}-${index}`}>
                    <span>{['X', 'Y', 'Z'][index]}</span>
                    <input
                      type="number"
                      value={value}
                      step={field.step}
                      disabled={isLocked}
                      aria-label={`${field.label} ${['X', 'Y', 'Z'][index]}`}
                      onChange={(event) => handleVectorChange(field.key, index, event.target.value)}
                    />
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </section>

      <section className="inspector-section inspector-section-danger">
        <div className="section-heading">
          <h3>Object Management</h3>
        </div>
        <div className="generated-action-row">
          {onHide ? (
            <button type="button" className="quiet-button" disabled={isLocked} onClick={() => onHide(asset.id)}>
              Hide
            </button>
          ) : null}
          {onDelete ? (
            <button type="button" className="danger-button" disabled={disabled || readOnly} onClick={() => onDelete(asset.id)}>
              Delete generated asset
            </button>
          ) : null}
        </div>
      </section>
    </section>
  );
}
