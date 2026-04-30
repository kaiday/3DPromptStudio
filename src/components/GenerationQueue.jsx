import { GenerationProgressItem } from './GenerationProgressItem.jsx';

function getJobId(job) {
  return job?.id ?? job?.jobId ?? job?.job_id ?? null;
}

function hasCompletedJobs(jobs) {
  return jobs.some((job) => ['succeeded', 'failed', 'canceled'].includes(job?.status));
}

export function GenerationQueue({
  activeJobs = [],
  recentJobs = [],
  messagesByJobId = {},
  onCancelJob,
  onClearCompleted
}) {
  const hasJobs = activeJobs.length > 0 || recentJobs.length > 0;
  const canClearCompleted = hasCompletedJobs(recentJobs);

  return (
    <section className="inspector-section generation-queue">
      <div className="section-heading">
        <h3>Generation</h3>
        {canClearCompleted ? (
          <button type="button" className="quiet-button generation-clear-button" onClick={onClearCompleted}>
            Clear
          </button>
        ) : null}
      </div>

      {!hasJobs ? (
        <div className="empty-state">No generation jobs.</div>
      ) : (
        <>
          {activeJobs.length > 0 ? (
            <div className="generation-group">
              <span className="generation-group-label">Active</span>
              <ul className="generation-list">
                {activeJobs.map((job) => {
                  const jobId = getJobId(job);
                  return (
                    <GenerationProgressItem
                      key={jobId}
                      job={job}
                      messages={messagesByJobId[jobId] ?? []}
                      onCancelJob={onCancelJob}
                    />
                  );
                })}
              </ul>
            </div>
          ) : null}

          {recentJobs.length > 0 ? (
            <div className="generation-group">
              <span className="generation-group-label">Recent</span>
              <ul className="generation-list">
                {recentJobs.map((job) => {
                  const jobId = getJobId(job);
                  return (
                    <GenerationProgressItem
                      key={jobId}
                      job={job}
                      messages={messagesByJobId[jobId] ?? []}
                      onCancelJob={onCancelJob}
                    />
                  );
                })}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
