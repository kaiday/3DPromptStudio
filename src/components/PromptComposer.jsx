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
    <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 8 }}>
      <textarea
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        placeholder="Describe your model changes..."
        rows={4}
        disabled={disabled}
      />
      <button type="submit" disabled={disabled || !prompt.trim()}>
        Run Prompt
      </button>
    </form>
  );
}
