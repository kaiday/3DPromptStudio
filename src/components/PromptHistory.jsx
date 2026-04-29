export function PromptHistory({ prompts = [] }) {
  return (
    <section className="inspector-section">
      <div className="section-heading">
        <h3>Prompt History</h3>
      </div>
      {prompts.length === 0 ? (
        <div className="empty-state">No prompts yet.</div>
      ) : (
        <ul className="history-list">
          {prompts
            .slice()
            .reverse()
            .map((entry) => (
              <li key={entry.id} className="history-item">
                <span>{new Date(entry.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                <p>{entry.prompt}</p>
              </li>
            ))}
        </ul>
      )}
    </section>
  );
}
