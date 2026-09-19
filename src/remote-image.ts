import * as dns from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { MAX_FILE_BYTES } from "./transform";

const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 10_000;

const blockedAddresses = new BlockList();
const globalIPv6 = new BlockList();
globalIPv6.addSubnet("2000::", 3, "ipv6");

for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blockedAddresses.addSubnet(network, prefix, "ipv4");
}

for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["100::", 64],
  ["2001:db8::", 32],
  ["2001::", 23], // Special-purpose and transition networks, including Teredo.
  ["2002::", 16], // 6to4 can encode private IPv4 destinations.
  ["3fff::", 20], // Documentation addresses.
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  blockedAddresses.addSubnet(network, prefix, "ipv6");
}

export class RemoteImageError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "RemoteImageError";
  }
}

function normalizedHostname(url: URL): string {
  return url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
}

export function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return blockedAddresses.check(address, "ipv4");
  if (family === 6) {
    // Reject mapped/compatible IPv4, NAT64 and other non-global ranges,
    // including alternate textual representations of the same address.
    return !globalIPv6.check(address, "ipv6") || blockedAddresses.check(address, "ipv6");
  }
  return true;
}

async function resolveRemoteUrl(value: string | URL, signal?: AbortSignal) {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new RemoteImageError("Enter a valid public image URL.", 400);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new RemoteImageError("The image URL must use HTTP or HTTPS.", 400);
  }
  if (url.username || url.password) {
    throw new RemoteImageError("Image URLs cannot include credentials.", 400);
  }
  if (url.port && url.port !== "80" && url.port !== "443") {
    throw new RemoteImageError("Image URLs must use a standard web port.", 400);
  }

  const hostname = normalizedHostname(url);
  const family = isIP(hostname);
  if (
    !hostname ||
    hostname === "localhost" ||
    (family === 0 && !hostname.includes(".")) ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".home.arpa")
  ) {
    throw new RemoteImageError("Private network image URLs are not allowed.", 403);
  }

  if (family !== 0) {
    if (isBlockedAddress(hostname)) {
      throw new RemoteImageError("Private network image URLs are not allowed.", 403);
    }
    return { url, addresses: [{ address: hostname, family }] };
  }

  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await abortable(dns.lookup(hostname, { all: true, verbatim: true }), signal);
  } catch {
    signal?.throwIfAborted();
    throw new RemoteImageError("The image host could not be found.", 502);
  }

  if (addresses.length === 0 || addresses.some(({ address }) => isBlockedAddress(address))) {
    throw new RemoteImageError("Private network image URLs are not allowed.", 403);
  }

  return { url, addresses };
}

export async function assertSafeRemoteUrl(value: string | URL): Promise<URL> {
  const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  try { return (await resolveRemoteUrl(value, signal)).url; }
  catch (error) {
    if (signal.aborted) throw new RemoteImageError("The image host took too long to respond.", 502);
    throw error;
  }
}

function abortable<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return operation;
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
    operation.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

async function fetchResolved(target: Awaited<ReturnType<typeof resolveRemoteUrl>>, signal: AbortSignal) {
  let lastError: unknown;
  for (const { address, family } of target.addresses) {
    signal.throwIfAborted();
    const connectionUrl = new URL(target.url);
    connectionUrl.hostname = family === 6 ? `[${address}]` : address;
    try {
      const options: BunFetchRequestInit = {
        headers: {
          Host: target.url.host,
          Accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8",
          "User-Agent": "smush.lol/1.0 image transformer",
        },
        // Dial the checked address while retaining HTTPS identity verification.
        tls: target.url.protocol === "https:" ? { serverName: normalizedHostname(target.url) } : undefined,
        // @ts-expect-error Bun 1.4.2 supports false; bun-types has not added it yet.
        proxy: false,
        redirect: "manual",
        signal,
      };
      return await fetch(connectionUrl, options);
    } catch (error) { lastError = error; }
  }
  throw lastError;
}

function filenameFromUrl(url: URL): string {
  const rawName = url.pathname.split("/").filter(Boolean).at(-1) ?? "remote-image";
  try {
    return decodeURIComponent(rawName).slice(0, 128) || "remote-image";
  } catch {
    return "remote-image";
  }
}

async function readLimitedBody(response: Response): Promise<Uint8Array> {
  if (!response.body) {
    throw new RemoteImageError("The image host returned an empty response.", 502);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_FILE_BYTES) {
        await reader.cancel();
        throw new RemoteImageError("The remote image must be 15 MB or smaller.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function fetchRemoteImage(source: string, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let target = await resolveRemoteUrl(source, controller.signal);
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
      const response = await fetchResolved(target, controller.signal);

      try {
        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get("location");
          if (!location || redirects === MAX_REDIRECTS) {
            throw new RemoteImageError("The image URL redirected too many times.", 502);
          }
          target = await resolveRemoteUrl(new URL(location, target.url), controller.signal);
          continue;
        }
        if (!response.ok) {
          throw new RemoteImageError(`The image host returned HTTP ${response.status}.`, 502);
        }
        const contentLength = Number(response.headers.get("content-length"));
        if (Number.isFinite(contentLength) && contentLength > MAX_FILE_BYTES) {
          throw new RemoteImageError("The remote image must be 15 MB or smaller.", 413);
        }
        const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
        if (contentType && !contentType.startsWith("image/") && contentType !== "application/octet-stream") {
          throw new RemoteImageError("The URL did not return an image.", 415);
        }
        return {
          bytes: await readLimitedBody(response),
          filename: filenameFromUrl(target.url),
          sourceUrl: target.url,
        };
      } finally {
        // Release unread bodies on redirects and rejected responses, too.
        await response.body?.cancel().catch(() => {});
      }
    }
    throw new RemoteImageError("The image URL redirected too many times.", 502);
  } catch (error) {
    if (error instanceof RemoteImageError) throw error;
    throw new RemoteImageError(
      controller.signal.aborted
        ? "The image host took too long to respond."
        : "The image could not be fetched from its host.",
      502,
    );
  } finally {
    clearTimeout(timeout);
  }
}
