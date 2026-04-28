export function ErrorBanner({ message }) {
  if (!message) return null;
  return (
    <div style={{ padding: 10, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8 }}>
      {message}
    </div>
  );
}
