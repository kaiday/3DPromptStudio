import { useEffect, useMemo, useState } from 'react';

const FALLBACK_LINES = ['Hello. I am ready to talk.'];

export function DialoguePanel({ speakerName = 'Generated entity', lines = FALLBACK_LINES, onClose }) {
  const dialogueLines = useMemo(
    () => (Array.isArray(lines) ? lines.map((line) => String(line).trim()).filter(Boolean) : FALLBACK_LINES),
    [lines]
  );
  const safeLines = dialogueLines.length ? dialogueLines : FALLBACK_LINES;
  const [lineIndex, setLineIndex] = useState(0);
  const currentLine = safeLines[Math.min(lineIndex, safeLines.length - 1)];

  useEffect(() => {
    setLineIndex(0);
  }, [speakerName, safeLines]);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.defaultPrevented) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose?.();
        return;
      }
      if (event.key === 'e' || event.key === 'E' || event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        setLineIndex((current) => {
          if (current >= safeLines.length - 1) {
            onClose?.();
            return current;
          }
          return current + 1;
        });
      }
    }

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose, safeLines.length]);

  function handleAdvance() {
    setLineIndex((current) => {
      if (current >= safeLines.length - 1) {
        onClose?.();
        return current;
      }
      return current + 1;
    });
  }

  return (
    <section className="dialogue-panel" aria-live="polite" aria-label={`Dialogue with ${speakerName}`}>
      <div className="dialogue-panel-speaker">{speakerName}</div>
      <button type="button" className="dialogue-panel-close" aria-label="Close dialogue" onClick={onClose}>
        x
      </button>
      <button type="button" className="dialogue-panel-body" onClick={handleAdvance}>
        <span>{currentLine}</span>
      </button>
      <div className="dialogue-panel-progress">
        {lineIndex + 1} / {safeLines.length}
      </div>
    </section>
  );
}
