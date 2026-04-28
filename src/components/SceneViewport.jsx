function formatVector(vector = []) {
  return vector.map((value) => Number(value).toFixed(2)).join(', ');
}

export function SceneViewport({ scene, viewport, selectedPartId, onSelectPart }) {
  return (
    <section style={{ border: '1px solid #ccc', borderRadius: 8, padding: 12, minHeight: 320 }}>
      <h2>3D Viewport</h2>
      <p>
        Camera: [{formatVector(viewport.cameraPosition)}], target [{formatVector(viewport.cameraTarget)}], zoom{' '}
        {viewport.zoom}
      </p>

      {scene.components.length === 0 ? (
        <p>No scene components available.</p>
      ) : (
        <ul style={{ display: 'grid', gap: 8, padding: 0, listStyle: 'none' }}>
          {scene.components.map((component) => (
            <li
              key={component.id}
              style={{
                border: component.id === selectedPartId ? '2px solid #2563eb' : '1px solid #ccc',
                borderRadius: 8,
                padding: 10,
                cursor: 'pointer'
              }}
              onClick={() => onSelectPart(component.id)}
            >
              <strong>{component.name}</strong> ({component.id}) - {component.visible ? 'visible' : 'hidden'}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
