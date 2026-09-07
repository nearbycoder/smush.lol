import { test, expect } from "bun:test";
import { adjustPixels } from "../web/pixel-operations";
import { savedSettings } from "../web/settings";
const pixel = (values: number[], fields: Record<string,string>) => [...adjustPixels(new Uint8ClampedArray(values),1,1,fields)];
test("filters mix strength while preserving alpha and transparent pixels",()=>{
 expect(pixel([255,0,0,128],{colorFilter:"grayscale"})).toEqual([54,54,54,128]);
 expect(pixel([10,20,30,255],{colorFilter:"invert"})).toEqual([245,235,225,255]);
 expect(pixel([10,20,30,255],{colorFilter:"invert",filterAmount:"0"})).toEqual([10,20,30,255]);
 expect(pixel([10,20,30,0],{colorFilter:"sepia"})).toEqual([10,20,30,0]);
 expect(savedSettings({colorFilter:"sepia",filterAmount:"50"},true).fields.filterAmount).toBe("50");
 expect(()=>savedSettings({colorFilter:"bad"},true)).toThrow();
});
test("exposure and contrast have neutral defaults, clamp extremes and round-trip recipes",()=>{
 expect(pixel([64,128,240,128],{})).toEqual([64,128,240,128]);
 expect(pixel([64,128,240,128],{exposure:"1"})).toEqual([128,255,255,128]);
 expect(pixel([64,128,240,128],{contrast:"0"})).toEqual([128,128,128,128]);
 expect(pixel([64,128,240,128],{contrast:"200"})).toEqual([0,128,255,128]);
 expect(savedSettings({exposure:"-1.5",contrast:"120"},true).fields.exposure).toBe("-1.5");
 expect(()=>savedSettings({exposure:"4"},true)).toThrow();
});

test("sharpening enhances edges while preserving flat areas and transparency",()=>{
 const input = new Uint8ClampedArray([80,80,80,255,100,100,100,255,80,80,80,255]);
 expect([...adjustPixels(input,3,1,{sharpen:"100"})]).toEqual([60,60,60,255,140,140,140,255,60,60,60,255]);
 expect(pixel([100,100,100,128],{sharpen:"100"})).toEqual([100,100,100,128]);
 const edge = new Uint8ClampedArray([100,100,100,255,0,0,0,0]);
 expect([...adjustPixels(edge,2,1,{sharpen:"200"})]).toEqual([100,100,100,255,0,0,0,0]);
 expect(savedSettings({sharpen:"40"},true).fields.sharpen).toBe("40");
});

test("duotone maps luminance endpoints and mixes strength without changing alpha",()=>{
 const fields={duotone:"true",duotoneDark:"#0000ff",duotoneLight:"#ffff00"};
 expect(pixel([0,0,0,128],fields)).toEqual([0,0,255,128]);
 expect(pixel([255,255,255,255],fields)).toEqual([255,255,0,255]);
 expect(pixel([100,100,100,255],fields)).toEqual([100,100,155,255]);
 expect(pixel([100,100,100,255],{...fields,duotoneAmount:"0"})).toEqual([100,100,100,255]);
 expect(savedSettings(fields,true).fields.duotoneDark).toBe("#0000ff");
});
