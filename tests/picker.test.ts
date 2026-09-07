import { test, expect } from "bun:test";
import { pixelColor } from "../web/tools/picker";
test("pixel color retains alpha and zero-pads hex channels", () => { expect(pixelColor([255, 0, 16, 128])).toEqual({ hex: "#ff001080", rgba: "rgba(255, 0, 16, 0.502)" }); });
