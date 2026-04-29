export function LoadingOverlay({ message = 'Loading...' }) {
  return <div className="status-banner status-banner-loading">{message}</div>;
}
