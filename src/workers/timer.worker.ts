/// <reference lib="webworker" />

/**
 * Wall-clock alarm for the Pomodoro timer. Browsers throttle timers in hidden tabs to as little as
 * once a minute; dedicated workers are not throttled that hard, so the "time's up" message arrives on time.
 * Messages in: { endAt: number } to arm, null to disarm. Message out: "done".
 */
let timer: ReturnType<typeof setTimeout> | null = null;

self.onmessage = (e: MessageEvent<{ endAt: number } | null>) => {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!e.data) return;
  const { endAt } = e.data;
  // Re-check in short hops so a suspended-then-resumed worker still fires close to endAt.
  const tick = () => {
    const left = endAt - Date.now();
    if (left <= 0) {
      timer = null;
      self.postMessage("done");
    } else {
      timer = setTimeout(tick, Math.min(left, 1000));
    }
  };
  tick();
};
