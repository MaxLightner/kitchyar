/**
 * Populate deferred 3D equipment while keeping the previous complete scene
 * visible. The caller commits its replacement only after onComplete fires.
 */
export function drainDeferredSceneJobs(
  jobs: Array<() => void>,
  schedule: (task: () => void, delayMs: number) => void,
  canContinue: () => boolean,
  onComplete: () => void,
  onError: (error: unknown) => void,
  onProgress?: () => void,
): void {
  const step = () => {
    if (!canContinue()) return;
    const job = jobs.shift();
    if (!job) { onComplete(); return; }
    try { job(); } catch (error) { onError(error); }
    onProgress?.();
    if (!canContinue()) return;
    if (jobs.length) schedule(step, 40);
    else onComplete();
  };
  schedule(step, 0);
}
