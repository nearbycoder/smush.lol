import { describe, expect, test } from "bun:test";
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
