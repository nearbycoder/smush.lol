import { expect, test } from "bun:test";
import { ConversionQueue, MAX_QUEUE_BYTES } from "../web/queue";
import { createArchive } from "../web/archive";
import { unzipSync, strFromU8 } from "fflate";

const file = (name = "photo.png") => new File(["image"], name, { type: "image/png" });
const result = (name = "photo.webp") => ({ blob: new Blob([name]), filename: name });

test("queue is sequential and captures settings before asynchronous work", async () => {
  const seen: string[] = [];
  let active = 0;
  let peak = 0;
  const queue = new ConversionQueue(async (file, fields) => {
    peak = Math.max(peak, ++active);
    await Bun.sleep(2);
    seen.push(`${file.name}:${fields.quality}`);
    active--;
    return result();
  });
  queue.add([file("a.png"), file("b.png")]);
  const fields = { quality: "75" };
  const run = queue.start(fields);
  fields.quality = "10";
  await run;
  expect(peak).toBe(1);
  expect(seen).toEqual(["a.png:75", "b.png:75"]);
  expect(queue.jobs.map(job => job.status)).toEqual(["done", "done"]);
});

test("failed jobs do not block other images and can be retried", async () => {
  let fail = true;
  const queue = new ConversionQueue(async file => {
    if (file.name === "a.png" && fail) throw new Error("Try again");
    return result();
  });
  queue.add([file("a.png"), file("b.png")]);
  await queue.start({});
  expect(queue.jobs.map(job => job.status)).toEqual(["error", "done"]);
  fail = false;
  await queue.retry(queue.jobs[0]!.id);
  expect(queue.jobs[0]!.status).toBe("done");
});

test("cancel and clear discard late results even if the processor ignores abort", async () => {
  let resolve!: (value: ReturnType<typeof result>) => void;
  let signal!: AbortSignal;
  const queue = new ConversionQueue(async (_file, _fields, received) => {
    signal = received;
    return new Promise(done => { resolve = done; });
  });
  queue.add([file(), file()]);
  const run = queue.start({});
  const first = queue.jobs[0]!;
  queue.cancelAll();
  expect(signal.aborted).toBe(true);
  expect(queue.jobs.map(job => job.status)).toEqual(["cancelled", "cancelled"]);
  queue.clear();
  resolve(result());
  await run;
  expect(first.result).toBeUndefined();
  expect(queue.jobs).toEqual([]);
});

test("queue enforces count and memory budgets without partially adding a batch", () => {
  const queue = new ConversionQueue(async () => result());
  expect(() => queue.add(Array.from({ length: 51 }, () => file()))).toThrow("50 exports");
  const large = file();
  Object.defineProperty(large, "size", { value: MAX_QUEUE_BYTES + 1 });
  expect(() => queue.add([large])).toThrow("150 MB");
  expect(queue.jobs).toEqual([]);
});

test("ZIP preserves every duplicate filename and prevents path traversal", async () => {
  const archive = await createArchive([
    { filename: "same.webp", blob: new Blob(["one"]) },
    { filename: "SAME.webp", blob: new Blob(["two"]) },
    { filename: "../private.webp", blob: new Blob(["three"]) },
  ]);
  const files = unzipSync(new Uint8Array(await archive.arrayBuffer()));
  expect(Object.keys(files)).toEqual(["same.webp", "SAME-2.webp", "__private.webp"]);
  expect(Object.values(files).map(bytes => strFromU8(bytes))).toEqual(["one", "two", "three"]);
});

test("queue ordering is stable, restorable, and locked while processing", async () => {
 let release!: () => void; const seen: string[] = [];
 const queue = new ConversionQueue(async f => {seen.push(f.name);await new Promise<void>(r=>{release=r;});return result();});
 queue.add([file("photo10.png"),file("photo2.png"),file("photo1.png")]);
 expect(queue.sort("name-asc")).toBe(true);expect(queue.jobs.map(j=>j.file.name)).toEqual(["photo1.png","photo2.png","photo10.png"]);
 expect(queue.move(queue.jobs[0]!.id,-1)).toBe(false);
 expect(queue.move(queue.jobs[0]!.id,1)).toBe(true);
 expect(queue.jobs[0]!.file.name).toBe("photo2.png");
 queue.sort("added");expect(queue.jobs[0]!.file.name).toBe("photo10.png");
 const running=queue.start({});expect(queue.sort("name-desc")).toBe(false);expect(queue.move(queue.jobs[0]!.id,1)).toBe(false);
 queue.cancelAll();release();await running;expect(queue.canReorder).toBe(true);expect(seen).toEqual(["photo10.png"]);
});
