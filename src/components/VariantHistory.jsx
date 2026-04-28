export function VariantHistory({ variants = [] }) {
  return (
    <section>
      <h3>Variant History</h3>
      {variants.length === 0 ? (
        <p>No variants yet.</p>
      ) : (
        <ul>
          {variants
            .slice()
            .reverse()
            .map((entry) => (
              <li key={entry.id}>
                <strong>{entry.label}</strong> ({new Date(entry.createdAt).toLocaleTimeString()})
              </li>
            ))}
        </ul>
      )}
    </section>
  );
}
