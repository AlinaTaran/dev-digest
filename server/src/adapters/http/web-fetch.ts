import { lookup } from 'node:dns/promises';
import { isIP, BlockList } from 'node:net';
import type { WebFetchClient, WebFetchResult } from '@devdigest/shared';

/**
 * SSRF-guarded HTTP(S) fetch adapter for the Intent Layer's external plan/spec
 * URL fetching. Best-effort: NEVER throws — every failure/blocked case returns
 * `null` so callers can degrade gracefully.
 *
 * Guards implemented (see server/INSIGHTS.md if you touch this file):
 *  1. Scheme allowlist — only `http:`/`https:`.
 *  2. DNS resolution + IP-range block — every resolved address (via
 *     `dns.promises.lookup(host, { all: true })`) is checked against the
 *     loopback/private/reserved/link-local ranges below. This also covers
 *     literal-IP hosts (`dns.lookup` returns a literal IP immediately without
 *     querying a resolver) and DNS-rebinding-style hosts that resolve to a
 *     blocked address.
 *  3. Redirect safety — `fetch(..., { redirect: 'manual' })`; each hop's
 *     `Location` is re-validated through the SAME guard (scheme + DNS), capped
 *     at `MAX_REDIRECTS`. The platform fetch's automatic follower is never used,
 *     so a redirect can't sneak past the guard into a private IP.
 *  4. Size cap — the body is streamed and reading stops once `maxBytes` is
 *     exceeded; the response is marked `truncated` rather than buffered
 *     unbounded.
 *  5. Timeout — ONE `AbortSignal.timeout(timeoutMs)` deadline created before the
 *     redirect loop and reused for every hop, so total wall-clock is bounded by
 *     `timeoutMs` regardless of how many redirects are followed (a fresh signal
 *     per hop would let it grow to (hops+1)×timeoutMs).
 *  6. Disabled gate — when `enabled` is false (config `EXTERNAL_FETCH_ENABLED`),
 *     `fetch()` returns `null` immediately; zero network activity.
 */

const DEFAULT_MAX_BYTES = 64 * 1024;
const DEFAULT_TIMEOUT_MS = 5000;
const MAX_REDIRECTS = 3;

/**
 * SSRF IP-range block, built once from Node's built-in `net.BlockList` — NOT a
 * hand-rolled string/regex classifier. The prior hand-rolled `isBlockedIpv6`
 * string-parsed hex groups and FAILED OPEN (returned "not blocked") on any
 * form it couldn't parse, which let `::ffff:169.254.169.254` (normalized by
 * `new URL()` to hex `::ffff:a9fe:a9fe`, missed by a dotted-only regex) and
 * `::` / `::127.0.0.1` (empty first group → NaN) straight through to the
 * cloud-metadata IP and loopback respectively. `BlockList` parses IP
 * addresses/subnets itself (no regex of ours to get wrong), and every
 * classification below is wrapped in try/catch that BLOCKS on any error —
 * fail-closed, never fail-open.
 *
 * TWO separate `BlockList` instances on purpose (v4-only rules / v6-only
 * rules), NOT one shared list. Verified experimentally: a single `BlockList`
 * that has BOTH an IPv4 subnet (e.g. `10.0.0.0/8`, type `'ipv4'`) AND the
 * IPv4-mapped IPv6 subnet `::ffff:0:0/96` (type `'ipv6'`) makes
 * `check(anyIpv4Address, 'ipv4')` return `true` for EVERY IPv4 address,
 * including public ones — Node normalizes the IPv4 address to its
 * IPv4-mapped-IPv6 form for matching even when asked to check it as
 * `'ipv4'`, so it collides with the mapped-range rule. That's silent,
 * reproducible, and would fail-CLOSED-for-everything (not a security bug,
 * but it would break all external fetches) rather than fail-open, yet it's
 * still wrong — confirmed via a throwaway `node -e` before landing this.
 * Keeping IPv4 and IPv6 rules in separate lists, checked only with their own
 * matching family, avoids the collision entirely.
 */
function buildV4BlockList(): BlockList {
  const blocked = new BlockList();
  blocked.addSubnet('0.0.0.0', 8, 'ipv4');
  blocked.addSubnet('10.0.0.0', 8, 'ipv4');
  blocked.addSubnet('100.64.0.0', 10, 'ipv4');
  blocked.addSubnet('127.0.0.0', 8, 'ipv4');
  blocked.addSubnet('169.254.0.0', 16, 'ipv4');
  blocked.addSubnet('172.16.0.0', 12, 'ipv4');
  blocked.addSubnet('192.0.0.0', 24, 'ipv4');
  blocked.addSubnet('192.168.0.0', 16, 'ipv4');
  blocked.addSubnet('240.0.0.0', 4, 'ipv4');
  blocked.addAddress('255.255.255.255', 'ipv4');
  return blocked;
}

function buildV6BlockList(): BlockList {
  const blocked = new BlockList();
  blocked.addAddress('::1', 'ipv6'); // loopback
  blocked.addSubnet('fc00::', 7, 'ipv6'); // ULA
  blocked.addSubnet('fe80::', 10, 'ipv6'); // link-local
  blocked.addSubnet('::ffff:0:0', 96, 'ipv6'); // IPv4-mapped — block ALL mapped literals
  blocked.addSubnet('64:ff9b::', 96, 'ipv6'); // NAT64
  // Deprecated IPv4-COMPATIBLE form `::a.b.c.d` (RFC 4291 — distinct from the
  // `::ffff:a.b.c.d` IPv4-MAPPED form above, which has a non-zero `ffff`
  // group). `::/96` covers this whole deprecated block AND the unspecified
  // address `::` itself (`::` is `0:0:0:0:0:0:0:0`, inside `::/96`), so it
  // also closes the `::` bypass (empty-first-group case) directly.
  blocked.addSubnet('::', 96, 'ipv6');
  return blocked;
}

const BLOCK_LIST_V4 = buildV4BlockList();
const BLOCK_LIST_V6 = buildV6BlockList();

/** Fail-closed: any unparseable/unrecognized input, or any classification error, blocks. */
function isBlockedIp(ip: string): boolean {
  try {
    const family = isIP(ip);
    if (family === 4) return BLOCK_LIST_V4.check(ip, 'ipv4');
    if (family === 6) return BLOCK_LIST_V6.check(ip, 'ipv6');
    return true; // not a recognizable IP literal — fail closed
  } catch {
    return true; // classification blew up — fail closed, never fail open
  }
}

/** Resolve `hostname` and block if ANY address is loopback/private/reserved. Fails closed. */
async function isHostnameBlocked(hostname: string): Promise<boolean> {
  // `URL#hostname` keeps the [...] brackets around an IPv6 literal, but
  // `dns.lookup` requires the bare address form (`::1`, not `[::1]`) — passing
  // the bracketed form throws ENOTFOUND for every IPv6 literal, which would
  // fail-closed (block) even LEGITIMATE public IPv6 hosts, not just private
  // ones. Strip the brackets before resolving.
  const bareHost =
    hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
  try {
    const addresses = await lookup(bareHost, { all: true });
    if (addresses.length === 0) return true;
    return addresses.some((a) => isBlockedIp(a.address));
  } catch {
    return true;
  }
}

export interface HttpWebFetchClientOptions {
  /** Gate from `AppConfig.externalFetchEnabled` (config `EXTERNAL_FETCH_ENABLED`). */
  enabled: boolean;
}

export class HttpWebFetchClient implements WebFetchClient {
  constructor(private opts: HttpWebFetchClientOptions) {}

  async fetch(
    url: string,
    opts: { maxBytes?: number; timeoutMs?: number } = {},
  ): Promise<WebFetchResult | null> {
    if (!this.opts.enabled) return null;
    const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    try {
      // ONE deadline for the entire request (all redirect hops share it) — a
      // fresh `AbortSignal.timeout` per hop would let total wall-clock grow to
      // (hops+1)×timeoutMs instead of being bounded by timeoutMs.
      const deadline = AbortSignal.timeout(timeoutMs);
      let current = url;
      for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        let parsed: URL;
        try {
          parsed = new URL(current);
        } catch {
          console.debug(`[web-fetch] blocked: invalid URL "${current}"`);
          return null;
        }
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          console.debug(`[web-fetch] blocked: disallowed scheme "${parsed.protocol}" (${current})`);
          return null;
        }
        if (await isHostnameBlocked(parsed.hostname)) {
          console.debug(`[web-fetch] blocked: SSRF-guarded host "${parsed.hostname}"`);
          return null;
        }

        let res: Response;
        try {
          res = await fetch(parsed.toString(), {
            redirect: 'manual',
            signal: deadline,
          });
        } catch (err) {
          console.debug(`[web-fetch] request failed for ${current}: ${(err as Error).message}`);
          return null;
        }

        if (res.status >= 300 && res.status < 400) {
          const location = res.headers.get('location');
          if (!location || hop === MAX_REDIRECTS) {
            console.debug(`[web-fetch] blocked: redirect exhausted/invalid from ${current}`);
            return null;
          }
          current = new URL(location, parsed).toString();
          continue;
        }

        if (!res.ok) {
          console.debug(`[web-fetch] request to ${current} returned status ${res.status}`);
          return null;
        }

        return await this.readBody(res, parsed.toString(), maxBytes);
      }
      return null;
    } catch (err) {
      console.debug(`[web-fetch] unexpected failure for ${url}: ${(err as Error).message}`);
      return null;
    }
  }

  /** Stream the body, stopping once `maxBytes` is exceeded — never buffer unbounded. */
  private async readBody(
    res: Response,
    url: string,
    maxBytes: number,
  ): Promise<WebFetchResult | null> {
    const contentType = res.headers.get('content-type');
    if (!res.body) {
      const text = await res.text();
      return {
        url,
        contentType,
        text: text.slice(0, maxBytes),
        truncated: text.length > maxBytes,
      };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let text = '';
    let bytes = 0;
    let truncated = false;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        bytes += value.byteLength;
        if (bytes > maxBytes) {
          const allowed = Math.max(0, value.byteLength - (bytes - maxBytes));
          text += decoder.decode(value.subarray(0, allowed));
          truncated = true;
          break;
        }
        text += decoder.decode(value, { stream: true });
      }
    } catch (err) {
      console.debug(`[web-fetch] body read failed for ${url}: ${(err as Error).message}`);
      return null;
    } finally {
      reader.cancel().catch(() => {});
    }
    // Flush any trailing multi-byte UTF-8 sequence left pending by the streamed
    // `{ stream: true }` decodes above (the truncated path already flushed).
    if (!truncated) text += decoder.decode();
    return { url, contentType, text, truncated };
  }
}
