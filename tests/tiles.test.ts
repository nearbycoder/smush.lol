import { test, expect } from "bun:test";
import { tileRects } from "../web/tools/tiles";
test("tile grid covers odd dimensions exactly without overlaps", () => { const tiles=tileRects(7,5,2,3); const pixels=new Set<string>(); for(const t of tiles)for(let y=t.y;y<t.y+t.height;y++)for(let x=t.x;x<t.x+t.width;x++){const key=`${x},${y}`;expect(pixels.has(key)).toBe(false);pixels.add(key);}expect(pixels.size).toBe(35);expect(()=>tileRects(1,1,2,2)).toThrow(); });
