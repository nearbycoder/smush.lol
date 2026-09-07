import { test, expect } from "bun:test";
import { histogram } from "../web/tools/histogram";
test("histogram measures visible pixels without counting transparency as black", () => { const h = histogram(new Uint8ClampedArray([0,0,0,255,255,255,255,255,0,0,0,0])); expect(h.pixels).toBe(2); expect(h.transparent).toBe(1); expect(h.mean).toBe(127.5); expect(h.bins[3]![0]).toBe(1); expect(h.bins[0]![255]).toBe(1); });
