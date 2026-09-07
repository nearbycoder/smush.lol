import { test, expect } from "bun:test";
import { printSize } from "../web/tools/print";
test("print calculator converts units and measures resolution without inventing pixels", () => { expect(printSize(1800,1200,300,6,"in")).toMatchObject({ width:6,height:4,effectiveDpi:300,requiredWidth:1800,requiredHeight:1200 }); expect(printSize(1800,1200,300,15.24,"cm").effectiveDpi).toBeCloseTo(300); expect(() => printSize(1,1,0,1,"in")).toThrow(); });
