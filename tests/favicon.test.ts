import { test, expect } from "bun:test";
import { ico, fitRect } from "../web/tools/pack-image";
test("ICO directory points to each PNG and preserves 256-size encoding", () => { const data=ico([{size:16,png:new Uint8Array([1,2])},{size:256,png:new Uint8Array([3])}]), v=new DataView(data.buffer); expect(v.getUint16(4,true)).toBe(2); expect(v.getUint32(18,true)).toBe(38); expect(v.getUint32(34,true)).toBe(40); expect(data[22]).toBe(0); expect(Array.from(data.slice(38))).toEqual([1,2,3]); });
test("fit and fill preserve ratio",()=>{expect(fitRect(200,100,100,100,false)).toEqual({x:0,y:25,width:100,height:50});expect(fitRect(200,100,100,100,true)).toEqual({x:-50,y:0,width:200,height:100});});
