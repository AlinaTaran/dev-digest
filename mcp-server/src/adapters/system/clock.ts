import type { ClockPort } from '../../domain/ports';

export function createSystemClock(): ClockPort {
  return {
    now: () => Date.now(),
    sleep: (ms, signal) =>
      new Promise<void>((resolve) => {
        if (signal?.aborted) return resolve();
        const done = (): void => {
          clearTimeout(timer);
          signal?.removeEventListener('abort', done);
          resolve();
        };
        const timer = setTimeout(done, ms);
        signal?.addEventListener('abort', done, { once: true });
      }),
  };
}
