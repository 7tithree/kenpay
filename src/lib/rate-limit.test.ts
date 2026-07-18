import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { checkRateLimit, recordFailure, resetRateLimit } from "./rate-limit";

const WINDOW = 15 * 60 * 1000;
const MAX = 5;

// Module state is shared across tests; give each test its own key.
let key: string;
let n = 0;

beforeEach(() => {
  vi.useFakeTimers();
  key = `test-${n++}`;
});
afterEach(() => vi.useRealTimers());

describe("rate limiter", () => {
  it("allows attempts until the failure cap is reached", () => {
    for (let i = 0; i < MAX - 1; i++) recordFailure(key, WINDOW);
    expect(checkRateLimit(key, MAX).limited).toBe(false);
    recordFailure(key, WINDOW);
    expect(checkRateLimit(key, MAX).limited).toBe(true);
  });

  it("reports how long until the lockout ends", () => {
    for (let i = 0; i < MAX; i++) recordFailure(key, WINDOW);
    vi.advanceTimersByTime(5 * 60 * 1000);
    const { limited, retryAfterMs } = checkRateLimit(key, MAX);
    expect(limited).toBe(true);
    expect(retryAfterMs).toBe(10 * 60 * 1000);
  });

  it("expires the lockout after the window", () => {
    for (let i = 0; i < MAX; i++) recordFailure(key, WINDOW);
    vi.advanceTimersByTime(WINDOW + 1);
    expect(checkRateLimit(key, MAX).limited).toBe(false);
  });

  it("starts a fresh window on failure after expiry", () => {
    for (let i = 0; i < MAX; i++) recordFailure(key, WINDOW);
    vi.advanceTimersByTime(WINDOW + 1);
    recordFailure(key, WINDOW); // count restarts at 1, not 6
    expect(checkRateLimit(key, MAX).limited).toBe(false);
  });

  it("clears on reset (successful login)", () => {
    for (let i = 0; i < MAX; i++) recordFailure(key, WINDOW);
    resetRateLimit(key);
    expect(checkRateLimit(key, MAX).limited).toBe(false);
  });

  it("keeps keys independent", () => {
    for (let i = 0; i < MAX; i++) recordFailure(key, WINDOW);
    expect(checkRateLimit(`${key}-other`, MAX).limited).toBe(false);
  });
});
