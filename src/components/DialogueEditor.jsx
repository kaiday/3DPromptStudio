export function DialogueEditor({
  lines = [],
  onChange,
  disabled = false,
  readOnly = false,
  title = 'Dialogue',
  emptyLabel = 'No dialogue lines yet.'
}) {
  const isLocked = disabled || readOnly;
  const normalizedLines = Array.isArray(lines) ? lines : [];

  function emitChange(nextLines) {
    if (isLocked || !onChange) return;
    onChange(nextLines);
  }

  function handleAddLine() {
    emitChange([...normalizedLines, '']);
  }

  function handleUpdateLine(index, value) {
    emitChange(normalizedLines.map((line, lineIndex) => (lineIndex === index ? value : line)));
  }

  function handleRemoveLine(index) {
    emitChange(normalizedLines.filter((_, lineIndex) => lineIndex !== index));
  }

  return (
    <section className="dialogue-editor">
      <div className="section-heading">
        <h3>{title}</h3>
        {!readOnly ? (
          <button type="button" className="quiet-button quiet-button-primary" disabled={disabled} onClick={handleAddLine}>
            Add line
          </button>
        ) : null}
      </div>

      {normalizedLines.length === 0 ? (
        <div className="empty-state">{emptyLabel}</div>
      ) : (
        <ol className="dialogue-line-list">
          {normalizedLines.map((line, index) => (
            <li key={`${index}-${line.slice(0, 18)}`} className="dialogue-line-row">
              <span className="dialogue-line-number">{index + 1}</span>
              <textarea
                value={line}
                rows={2}
                disabled={isLocked}
                aria-label={`Dialogue line ${index + 1}`}
                onChange={(event) => handleUpdateLine(index, event.target.value)}
              />
              {!readOnly ? (
                <button
                  type="button"
                  className="quiet-button"
                  disabled={disabled}
                  aria-label={`Remove dialogue line ${index + 1}`}
                  onClick={() => handleRemoveLine(index)}
                >
                  Remove
                </button>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
