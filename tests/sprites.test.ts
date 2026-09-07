import { test, expect } from "bun:test";
import { spriteLayout } from "../web/tools/sprites";
test("sprite frames fit their padded sheet and honor image count",()=>{const s=spriteLayout(3,2,32,2);expect(s.width).toBe(70);expect(s.height).toBe(70);expect(s.frames[2]).toEqual({x:2,y:36,width:32,height:32});expect(()=>spriteLayout(50,1,1024,2)).toThrow("too large");});
