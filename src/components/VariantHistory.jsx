export function VariantHistory({ variants = [] }) {
  return (
    <section className="inspector-section">
      <div className="section-heading">
        <h3>Variants</h3>
      </div>
      {variants.length === 0 ? (
        <div className="empty-state">No variants yet.</div>
      ) : (
        <ul className="history-list">
          {variants
            .slice()
            .reverse()
            .map((entry) => (
              <li key={entry.id} className="history-item history-item-variant">
                <strong>{entry.label}</strong>
                <span>{new Date(entry.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </li>
            ))}
        </ul>
      )}
    </section>
  );
}
