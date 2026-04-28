export function LoadingOverlay({ message = 'Loading...' }) {
  return (
    <div style={{ padding: 10, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8 }}>
      {message}
    </div>
  );
}
