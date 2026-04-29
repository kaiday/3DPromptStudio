export function ErrorBanner({ message }) {
  if (!message) return null;
  return <div className="status-banner status-banner-error">{message}</div>;
}
