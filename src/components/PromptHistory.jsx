export function PromptHistory({ prompts = [] }) {
  return (
    <section>
      <h3>Prompt History</h3>
      {prompts.length === 0 ? (
        <p>No prompts yet.</p>
      ) : (
        <ul>
          {prompts
            .slice()
            .reverse()
            .map((entry) => (
              <li key={entry.id}>
                <strong>{new Date(entry.createdAt).toLocaleTimeString()}</strong> - {entry.prompt}
              </li>
            ))}
        </ul>
      )}
    </section>
  );
}
