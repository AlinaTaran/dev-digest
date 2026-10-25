import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TimeoutError } from '../../platform/resilience.js';
import { InflightRegistry } from './inflight.js';

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe('InflightRegistry', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('joins a concurrent start: fn runs once and both waiters get the same value', async () => {
    const reg = new InflightRegistry<string, string>(1000);
    const d = deferred<string>();
    const fn = vi.fn(() => d.promise);
    const a = reg.start('pr', fn);
    const b = reg.start('pr', fn);
    expect([a.joined, b.joined]).toEqual([false, true]);
    d.resolve('x');
    await expect(Promise.all([reg.wait(a), reg.wait(b)])).resolves.toEqual(['x', 'x']);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('keeps the key after a waiter times out; a new start joins; settling frees the key', async () => {
    const reg = new InflightRegistry<string, string>(1000);
    const d = deferred<string>();
    const fn = vi.fn(() => d.promise);
    const first = reg.start('pr', fn);
    const waited = reg.wait(first);
    const assertion = expect(waited).rejects.toBeInstanceOf(TimeoutError);
    await vi.advanceTimersByTimeAsync(1001);
    await assertion;
    expect(reg.has('pr')).toBe(true);

    const joiner = reg.start('pr', fn);
    expect(joiner.joined).toBe(true);
    // Past the deadline a joiner answers immediately.
    const late = expect(reg.wait(joiner)).rejects.toBeInstanceOf(TimeoutError);
    await vi.advanceTimersByTimeAsync(5);
    await late;
    expect(fn).toHaveBeenCalledTimes(1);

    const settled = vi.fn();
    reg.start('pr', fn, settled); // joined: callback is not attached
    d.resolve('late');
    await vi.advanceTimersByTimeAsync(0);
    expect(reg.has('pr')).toBe(false);

    const again = reg.start('pr', () => Promise.resolve('fresh'));
    expect(again.joined).toBe(false);
    await expect(reg.wait(again)).resolves.toBe('fresh');
  });

  it('reports the outcome and whether it settled past the deadline', async () => {
    const reg = new InflightRegistry<string, string>(100);
    const d = deferred<string>();
    const onSettled = vi.fn();
    reg.start('pr', () => d.promise, onSettled);
    await vi.advanceTimersByTimeAsync(500);
    d.resolve('x');
    await vi.advanceTimersByTimeAsync(0);
    expect(onSettled).toHaveBeenCalledWith('ok', true);
  });
});
