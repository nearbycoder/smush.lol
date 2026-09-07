import { test, expect } from "bun:test";
import { borderBounds, cornerPixels } from "../web/finishing-settings";
import { savedSettings } from "../web/settings";
import { usesBrowser } from "../web/local-image";
test("borders expand dimensions, reject excessive canvases and persist in recipes",()=>{expect(borderBounds(100,60,10)).toEqual({width:120,height:80});expect(()=>borderBounds(12000,20,1)).toThrow();const fields=savedSettings({borderSize:"12",borderColor:"#123456",borderTransparent:"true"},true).fields;expect(fields.borderColor).toBe("#123456");expect(usesBrowser(null,fields)).toBe(true);});

test("rounded corners scale to the shorter side and survive recipe normalization",()=>{expect(cornerPixels(200,100,50)).toBe(50);expect(cornerPixels(20,80,25)).toBe(5);const fields=savedSettings({cornerRadius:"25"},true).fields;expect(fields.cornerRadius).toBe("25");expect(usesBrowser(null,fields)).toBe(true);expect(()=>savedSettings({cornerRadius:"51"},true)).toThrow();});
