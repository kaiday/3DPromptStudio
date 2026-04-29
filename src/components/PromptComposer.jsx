import { useState } from 'react';

export function PromptComposer({ onSubmit, disabled = false }) {
  const [prompt, setPrompt] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    const nextPrompt = prompt.trim();
    if (!nextPrompt) return;
    await onSubmit(nextPrompt);
    setPrompt('');
  }

  return (
    <form onSubmit={handleSubmit} className="prompt-composer">
      <label className="prompt-input-shell">
        <span>Describe edit</span>
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Make the selected cushion darker green and soften the edges."
          rows={5}
          disabled={disabled}
        />
      </label>
      <div className="prompt-actions">
        <span className="prompt-hint">Applies to the current selection.</span>
        <button type="submit" className="prompt-submit" disabled={disabled || !prompt.trim()}>
          Run
        </button>
      </div>
    </form>
  );
}
