import { test, expect } from "bun:test";
import { imageDifference } from "../web/tools/difference-math";
const bytes=(values:number[])=>new Uint8ClampedArray(values);
test("difference metrics ignore invisible RGB and report known channel errors",()=>{
 const identical=imageDifference(bytes([255,0,0,0]),bytes([0,255,255,0]),0,4);expect(identical.changedPixels).toBe(0);expect(identical.meanAbsoluteError).toBe(0);
 const diff=imageDifference(bytes([0,0,0,255]),bytes([10,20,30,255]),8,4);expect(diff.changedPixels).toBe(1);expect(diff.meanAbsoluteError).toBe(15);expect(diff.maxChannelDelta).toBe(30);expect([...diff.heat]).toEqual([240,0,0,255]);
 const atThreshold=imageDifference(bytes([0,0,0,255]),bytes([10,20,30,255]),30,1);expect(atThreshold.changedPixels).toBe(0);expect(atThreshold.meanAbsoluteError).toBe(15);
 expect(()=>imageDifference(bytes([0,0,0,255]),bytes([]),0,1)).toThrow();
});
test("difference metrics detect alpha-only changes independently of heatmap gain",()=>{
 const a=bytes([0,0,0,0]),b=bytes([0,0,0,255]);const low=imageDifference(a,b,0,1),high=imageDifference(a,b,0,16);
 expect(low.meanAbsoluteError).toBe(63.75);expect(low.changedPercent).toBe(100);expect(high.meanAbsoluteError).toBe(low.meanAbsoluteError);
});
