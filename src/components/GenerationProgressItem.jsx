const STATUS_LABELS = {
  queued: 'Queued',
  running: 'Running',
  succeeded: 'Done',
  failed: 'Failed',
  canceled: 'Canceled'
};

const ACTIVE_STATUSES = new Set(['queued', 'running']);

function getJobId(job) {
  return job?.id ?? job?.jobId ?? job?.job_id ?? null;
}

function getJobStatus(job) {
  return job?.status ?? 'queued';
}

function getJobTitle(job) {
  return job?.name ?? job?.sceneName ?? job?.prompt ?? 'Generation job';
}

function getJobTime(job) {
  const value = job?.updatedAt ?? job?.updated_at ?? job?.createdAt ?? job?.created_at;
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getLatestMessage(messages) {
  const latest = messages[messages.length - 1];
  return latest?.message ?? latest?.payload?.message ?? '';
}

function getErrorMessage(job, messages) {
  if (getJobStatus(job) !== 'failed') return '';
  const latestError = messages
    .slice()
    .reverse()
    .find((event) => event?.payload?.error || event?.payload?.detail || event?.error);
  return job?.error ?? latestError?.payload?.error ?? latestError?.payload?.detail ?? latestError?.error ?? 'Generation failed.';
}

function getProgress(job, messages) {
  if (Number.isFinite(job?.progress)) return Math.max(0, Math.min(100, job.progress));
  const latestProgress = messages
    .slice()
    .reverse()
    .find((event) => Number.isFinite(event?.payload?.progress) || Number.isFinite(event?.progress));
  return Math.max(0, Math.min(100, latestProgress?.payload?.progress ?? latestProgress?.progress ?? 0));
}

export function GenerationProgressItem({ job, messages = [], onCancelJob }) {
  const jobId = getJobId(job);
  const status = getJobStatus(job);
  const title = getJobTitle(job);
  const time = getJobTime(job);
  const progress = getProgress(job, messages);
  const latestMessage = getLatestMessage(messages);
  const errorMessage = getErrorMessage(job, messages);
  const canCancel = jobId && ACTIVE_STATUSES.has(status);

  return (
    <li className={`generation-item generation-item-${status}`}>
      <div className="generation-item-header">
        <div className="generation-item-title">
          <strong title={title}>{title}</strong>
          {time ? <span>{time}</span> : null}
        </div>
        <span className={`generation-status generation-status-${status}`}>{STATUS_LABELS[status] ?? status}</span>
      </div>

      {ACTIVE_STATUSES.has(status) ? (
        <div className="generation-progress-track" aria-label={`${progress}% complete`}>
          <span style={{ '--generation-progress': `${progress}%` }} />
        </div>
      ) : null}

      {latestMessage ? <p className="generation-message">{latestMessage}</p> : null}
      {errorMessage ? <p className="generation-error">{errorMessage}</p> : null}

      {messages.length > 1 ? (
        <ol className="generation-event-list">
          {messages.slice(-3).map((event, index) => (
            <li key={`${jobId ?? 'job'}-${event.receivedAt ?? event.type ?? index}-${index}`}>
              {event.message ?? event.payload?.message ?? event.type}
            </li>
          ))}
        </ol>
      ) : null}

      {canCancel ? (
        <button type="button" className="quiet-button generation-cancel-button" onClick={() => onCancelJob?.(jobId)}>
          Cancel
        </button>
      ) : null}
    </li>
  );
}
