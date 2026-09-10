import { expect, test } from "bun:test";

async function readHead(page: string) {
  const meta = new Map<string, string[]>();
  const images: Record<string, string>[] = [];
  let canonical = "";
  let title = "";
  let structuredData = "";
  await new HTMLRewriter()
    .on("head meta", {
      element(element) {
        const key = element.getAttribute("property") ?? element.getAttribute("name");
        const value = element.getAttribute("content") ?? "";
        if (!key) return;
        meta.set(key, [...(meta.get(key) ?? []), value]);
        if (key === "og:image") images.push({ url: value });
        else if (key.startsWith("og:image:")) images.at(-1)![key.slice(9)] = value;
      },
    })
    .on('head link[rel="canonical"]', { element(element) { canonical = element.getAttribute("href") ?? ""; } })
    .on("head title", { text(chunk) { title += chunk.text; } })
    .on('head script[type="application/ld+json"]', { text(chunk) { structuredData += chunk.text; } })
    .transform(new Response(Bun.file(`web/${page}.html`)))
    .text();
  return { meta, images, canonical, title, structuredData };
}

for (const [page, url] of [["index", "https://smush.lol/"], ["docs", "https://smush.lol/docs"]] as const) {
  test(`${page} exposes complete social cards without running JavaScript`, async () => {
    const { meta, images, canonical, title } = await readHead(page);
    expect(canonical).toBe(url);
    expect(meta.get("og:url")).toEqual([url]);
    expect(meta.get("og:type")).toEqual(["website"]);
    expect(meta.get("og:site_name")).toEqual(["smush.lol"]);
    expect(meta.get("og:title")).toEqual([title]);
    expect(meta.get("twitter:title")).toEqual([title]);
    expect(meta.get("description")?.[0]?.length).toBeGreaterThan(50);
    expect(meta.get("description")![0]!.length).toBeLessThanOrEqual(125);
    expect(meta.get("og:description")).toEqual(meta.get("description"));
    expect(meta.get("twitter:description")).toEqual(meta.get("description"));
    expect(meta.get("twitter:card")).toEqual(["summary_large_image"]);
    expect(images).toHaveLength(1);
    expect(meta.get("twitter:image")).toEqual([images[0]!.url!]);
    expect(meta.get("twitter:image:alt")).toEqual([images[0]!.alt!]);
    // Social cards must stay within the preview inspector's size and ratio limits.
    for (const image of images) {
      const imageUrl = new URL(image.url!);
      expect(imageUrl.origin).toBe("https://smush.lol");
      expect(imageUrl.pathname).toStartWith("/social/");
      const file = Bun.file(`web${imageUrl.pathname}`);
      expect(await file.exists()).toBe(true);
      expect(file.size).toBeLessThan(1_000_000);
      expect(image.type).toBe("image/jpeg");
      expect(image.alt!.length).toBeGreaterThan(20);
      expect(await new Bun.Image(await file.arrayBuffer()).metadata()).toMatchObject({
        width: Number(image.width), height: Number(image.height), format: "jpeg",
      });
    }
    expect(Number(images[0]!.width)).toBe(1200);
    expect(Number(images[0]!.height)).toBe(630);
  });
}

test("app structured data describes the product and all supplied product images", async () => {
  const { meta, images, structuredData } = await readHead("index");
  const app = JSON.parse(structuredData);
  expect(app).toMatchObject({
    "@context": "https://schema.org", "@type": "WebApplication",
    name: "smush.lol", url: "https://smush.lol/", description: meta.get("description")![0],
    image: images[0]!.url,
  });
  expect(app.screenshot).toHaveLength(3);
  for (const screenshot of app.screenshot) {
    const url = new URL(screenshot);
    expect(url.origin).toBe("https://smush.lol");
    expect(url.pathname).toStartWith("/social/");
    expect(await Bun.file(`web${url.pathname}`).exists()).toBe(true);
  }
  expect(app.featureList).toContain("Optional browser-only processing");
});
