import { test, expect } from "bun:test";
import { alphaBounds } from "../web/trim-geometry";
import { savedSettings } from "../web/settings";
test("alpha trimming keeps exact inclusive bounds, threshold and bounded padding",()=>{
 const pixels = new Uint8ClampedArray(6*6*4); for (const [x,y,a] of [[2,2,255],[3,3,255],[0,0,1]]) pixels[(y!*6+x!)*4+3]=a!;
 expect(alphaBounds(pixels,6,6,1)).toEqual({x:2,y:2,width:2,height:2});
 expect(alphaBounds(pixels,6,6,1,1)).toEqual({x:1,y:1,width:4,height:4});
 expect(alphaBounds(pixels,6,6,1,512)).toEqual({x:0,y:0,width:6,height:6});
 expect(()=>alphaBounds(new Uint8ClampedArray(4),1,1)).toThrow("No pixels");
 expect(savedSettings({trimTransparent:"true",trimThreshold:"10",trimPadding:"2"},true).fields.trimPadding).toBe("2");
});
