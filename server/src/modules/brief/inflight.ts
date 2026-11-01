import { withTimeout } from '../../platform/resilience.js';

export interface InflightEntry<V> {
  inner: Promise<V>;
  /** Epoch ms after which a waiter answers `timeout`. */
  deadline: number;
}

/**
 * Per-key single-flight registry. An entry is removed only when its INNER promise settles, never
 * when a waiter's timed wait gives up: provider calls cannot be aborted, so an abandoned call still
 * occupies the key and a new request joins it instead of starting a second call.
 */
export class InflightRegistry<K, V> {
  private entries = new Map<K, InflightEntry<V>>();

  constructor(
    private timeoutMs: number,
    private now: () => number = Date.now,
  ) {}

  has(key: K): boolean {
    return this.entries.has(key);
  }

  get(key: K): InflightEntry<V> | undefined {
    return this.entries.get(key);
  }

  /** Joins an existing entry (`fn` not called) or starts `fn` once. */
  start(
    key: K,
    fn: (deadline: number) => Promise<V>,
    onSettled?: (outcome: 'ok' | 'error', pastDeadline: boolean) => void,
  ): InflightEntry<V> & { joined: boolean } {
    const existing = this.entries.get(key);
    if (existing) return { ...existing, joined: true };
    const deadline = this.now() + this.timeoutMs;
    const inner = fn(deadline);
    const entry: InflightEntry<V> = { inner, deadline };
    this.entries.set(key, entry);
    const settle = (outcome: 'ok' | 'error'): void => {
      this.entries.delete(key);
      onSettled?.(outcome, this.now() > deadline);
    };
    inner.then(
      () => settle('ok'),
      () => settle('error'),
    );
    return { ...entry, joined: false };
  }

  /** Waits for the entry's result, but no longer than its deadline (rejects with TimeoutError). */
  wait(entry: InflightEntry<V>): Promise<V> {
    return withTimeout(entry.inner, Math.max(1, entry.deadline - this.now()));
  }
}
