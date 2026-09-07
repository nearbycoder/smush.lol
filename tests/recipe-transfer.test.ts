import { test, expect } from "bun:test";
import { exportRecipes, importRecipes, MAX_RECIPE_FILE } from "../web/recipe-transfer";
import { savedSettings } from "../web/settings";
const recipe = { id:"original",name:"Night",settings:savedSettings({contrast:"140",duotone:"true",sourceUrl:"https://private.example/image"},true) };
test("recipe files round-trip edits, regenerate IDs and preserve colliding existing names",()=>{
 const raw = exportRecipes([recipe]); expect(raw).not.toContain("private.example");
 const next = importRecipes(raw,[recipe]); expect(next[0]).toBe(recipe); expect(next[1]!.name).toBe("Night (2)");expect(next[1]!.id).not.toBe(recipe.id);expect(next[1]!.settings.fields.contrast).toBe("140");
});
test("recipe import rejects invalid, oversized and over-capacity files atomically",()=>{
 const existing=[recipe];
 expect(()=>importRecipes('{bad',existing)).toThrow();
 expect(()=>importRecipes(JSON.stringify({version:2,recipes:[recipe]}),existing)).toThrow();
 expect(()=>importRecipes(JSON.stringify({version:1,recipes:[recipe,{...recipe,settings:{}}]}),existing)).toThrow("Nothing was imported");
 expect(existing).toHaveLength(1);
 expect(()=>importRecipes(' '.repeat(MAX_RECIPE_FILE+1),existing)).toThrow("256 KB");
 expect(()=>importRecipes(exportRecipes([recipe]),Array(20).fill(recipe))).toThrow("exceed 20");
});
