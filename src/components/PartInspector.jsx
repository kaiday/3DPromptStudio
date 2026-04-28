export function PartInspector({ selectedPart }) {
  return (
    <section>
      <h3>Part Inspector</h3>
      {!selectedPart ? (
        <p>Select a part to inspect its properties.</p>
      ) : (
        <div>
          <p>
            <strong>Name:</strong> {selectedPart.name}
          </p>
          <p>
            <strong>Visible:</strong> {selectedPart.visible ? 'Yes' : 'No'}
          </p>
          <p>
            <strong>Material:</strong> {selectedPart.material?.type ?? 'standard'}
          </p>
          <p>
            <strong>Color:</strong> {selectedPart.material?.color ?? '#cccccc'}
          </p>
        </div>
      )}
    </section>
  );
}
