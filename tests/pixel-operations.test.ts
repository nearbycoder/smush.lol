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
