import { describe, expect, spyOn, test } from "bun:test";
import * as dns from "node:dns/promises";
import {
  assertSafeRemoteUrl,
  fetchRemoteImage,
  isBlockedAddress,
  RemoteImageError,
} from "../src/remote-image";

describe("remote image safety", () => {
  test("recognizes private and public IP addresses", () => {
    expect(isBlockedAddress("127.0.0.1")).toBe(true);
    expect(isBlockedAddress("192.168.1.20")).toBe(true);
    expect(isBlockedAddress("::1")).toBe(true);
    expect(isBlockedAddress("8.8.8.8")).toBe(false);
    expect(isBlockedAddress("2001:4860:4860::8888")).toBe(false);
  });

  test("accepts public HTTP URLs and rejects unsafe sources", async () => {
    expect((await assertSafeRemoteUrl("https://8.8.8.8/image.png")).href).toBe("https://8.8.8.8/image.png");

    for (const source of [
      "file:///etc/passwd",
      "http://localhost/image.png",
      "http://10.0.0.8/image.png",
      "http://[::1]/image.png",
      "https://8.8.8.8:444/image.png",
      "https://user:password@8.8.8.8/image.png",
    ]) {
      await expect(assertSafeRemoteUrl(source)).rejects.toBeInstanceOf(RemoteImageError);
    }
  });

  test("revalidates redirect destinations", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(null, {
      headers: { Location: "http://127.0.0.1/private.png" },
      status: 302,
    })) as unknown as typeof fetch;

    try {
      await expect(fetchRemoteImage("https://8.8.8.8/image.png")).rejects.toMatchObject({ status: 403 });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("rejects oversized and non-image responses before decoding", async () => {
    const originalFetch = globalThis.fetch;

    try {
      globalThis.fetch = (async () => new Response(null, {
        headers: {
          "Content-Length": String(15 * 1024 * 1024 + 1),
          "Content-Type": "image/png",
        },
      })) as unknown as typeof fetch;
      await expect(fetchRemoteImage("https://8.8.8.8/large.png")).rejects.toMatchObject({ status: 413 });

      globalThis.fetch = (async () => new Response("not an image", {
        headers: { "Content-Type": "text/html" },
      })) as unknown as typeof fetch;
      await expect(fetchRemoteImage("https://8.8.8.8/page.html")).rejects.toMatchObject({ status: 415 });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("keeps the timeout active while reading a stalled image body", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: unknown, options?: RequestInit) => new Response(new ReadableStream({
    start(controller) {
      options?.signal?.addEventListener("abort", () => {
        controller.error(new DOMException("Aborted", "AbortError"));
      }, { once: true });
      controller.enqueue(new Uint8Array([1]));
    },
  }), { headers: { "Content-Type": "image/png" } })) as unknown as typeof fetch;
  try {
    await expect(fetchRemoteImage("https://8.8.8.8/slow.png", 20)).rejects.toMatchObject({
      status: 502, message: "The image host took too long to respond.",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("cancels rejected response bodies instead of downloading them", async () => {
  const originalFetch = globalThis.fetch;
  let cancelled = false;
  globalThis.fetch = (async () => new Response(new ReadableStream({
    cancel() { cancelled = true; },
  }), { headers: { "Content-Type": "text/html" } })) as unknown as typeof fetch;
  try {
    await expect(fetchRemoteImage("https://8.8.8.8/page")).rejects.toMatchObject({ status: 415 });
    expect(cancelled).toBe(true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("blocks alternate IP representations and IPv6 transition networks", async () => {
  for (const address of ["::ffff:127.0.0.1", "0:0:0:0:0:ffff:7f00:1", "::127.0.0.1", "64:ff9b::7f00:1", "2002:7f00:1::", "2001::1", "3fff::1", "fec0::1"]) {
    expect(isBlockedAddress(address)).toBe(true);
    await expect(assertSafeRemoteUrl(`https://[${address}]/image`)).rejects.toMatchObject({ status: 403 });
  }
  for (const host of ["2130706433", "0x7f000001", "127.1", "0177.0.0.1"]) {
    await expect(assertSafeRemoteUrl(`http://${host}/image`)).rejects.toMatchObject({ status: 403 });
  }
});

test("pins checked addresses and retains the original HTTPS identity across redirects", async () => {
  const lookup = spyOn(dns, "lookup").mockResolvedValue([{ address: "8.8.8.8", family: 4 }] as never);
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; options: BunFetchRequestInit }> = [];
  globalThis.fetch = (async (url: unknown, options: BunFetchRequestInit) => {
    calls.push({ url: String(url), options });
    if (calls.length === 1) return new Response(null, { status: 302, headers: { Location: "/final.png" } });
    return new Response(new Uint8Array([1]), { headers: { "Content-Type": "image/png" } });
  }) as typeof fetch;
  try {
    const result = await fetchRemoteImage("https://images.example/start.png");
    expect(calls.map(call => call.url)).toEqual(["https://8.8.8.8/start.png", "https://8.8.8.8/final.png"]);
    for (const call of calls) {
      expect(new Headers(call.options.headers).get("host")).toBe("images.example");
      expect(call.options.tls?.serverName).toBe("images.example");
      expect(call.options.proxy as unknown).toBe(false);
      expect(call.options.redirect).toBe("manual");
    }
    expect(lookup).toHaveBeenCalledTimes(2);
    expect(result.sourceUrl.href).toBe("https://images.example/final.png");
    expect(result.filename).toBe("final.png");
  } finally { lookup.mockRestore(); globalThis.fetch = originalFetch; }
});

test("rejects mixed DNS answers and rebinding at a redirect", async () => {
  const lookup = spyOn(dns, "lookup");
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => { calls++; return new Response(null, { status: 302, headers: { Location: "/again.png" } }); }) as unknown as typeof fetch;
  try {
    lookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }, { address: "127.0.0.1", family: 4 }] as never);
    await expect(fetchRemoteImage("https://images.example/a.png")).rejects.toMatchObject({ status: 403 });
    expect(calls).toBe(0);
    lookup.mockResolvedValueOnce([{ address: "8.8.8.8", family: 4 }] as never)
      .mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }] as never);
    await expect(fetchRemoteImage("https://images.example/a.png")).rejects.toMatchObject({ status: 403 });
    expect(calls).toBe(1);
  } finally { lookup.mockRestore(); globalThis.fetch = originalFetch; }
});

test("the remote request deadline also covers DNS lookup", async () => {
  const lookup = spyOn(dns, "lookup").mockImplementation(() => new Promise(() => {}) as never);
  try {
    await expect(fetchRemoteImage("https://slow.example/a.png", 20)).rejects.toMatchObject({ status: 502, message: "The image host took too long to respond." });
  } finally { lookup.mockRestore(); }
});

test("bounds a remote body even when Content-Length is absent", async () => {
  const originalFetch = globalThis.fetch;
  let cancelled = false;
  globalThis.fetch = (async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(15 * 1024 * 1024 + 1)); },
    cancel() { cancelled = true; },
  }), { headers: { "Content-Type": "image/png" } })) as unknown as typeof fetch;
  try {
    await expect(fetchRemoteImage("https://8.8.8.8/large.png")).rejects.toMatchObject({ status: 413 });
    expect(cancelled).toBe(true);
  } finally { globalThis.fetch = originalFetch; }
});
