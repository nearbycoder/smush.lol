import { expect, test } from "bun:test";
import { loadRecipes, readRecipes, saveRecipe, writeRecipes, RECIPES_KEY } from "../web/recipes";
import { savedSettings, SETTINGS_KEY } from "../web/settings";
import { exportVariants } from "../web/export-variants";
import { ConversionQueue } from "../web/queue";

function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}

test("legacy preferences migrate once without resurrecting deleted recipes", () => {
  const store = storage();
  store.setItem(SETTINGS_KEY, JSON.stringify(savedSettings({ quality: "65" }, true)));
  const recipes = loadRecipes(store);
  expect(recipes[0]?.settings.fields.quality).toBe("65");
  expect(store.getItem(SETTINGS_KEY)).toBeNull();
  expect(loadRecipes(store)).toEqual(recipes);
  writeRecipes(store, []);
  expect(loadRecipes(store)).toEqual([]);
});

test("migration retains old data when browser storage is blocked", () => {
  const store = storage();
  store.setItem(SETTINGS_KEY, JSON.stringify(savedSettings({}, true)));
  expect(() => loadRecipes({ ...store, setItem: () => { throw new Error("blocked"); } })).toThrow("blocked");
  expect(store.getItem(SETTINGS_KEY)).not.toBeNull();
});

test("recipes update by name, preserve other recipes, and enforce the limit", () => {
  const first = saveRecipe([], "Blog", savedSettings({ width: "800" }, true));
  const second = saveRecipe(first.recipes, "Product", savedSettings({ format: "png" }, true));
  const update = saveRecipe(second.recipes, " blog ", savedSettings({ width: "1200" }, true));
  expect(update.recipes.length).toBe(2);
  expect(update.id).toBe(first.id);
  expect(update.recipes[0]?.settings.fields.width).toBe("1200");
  expect(update.recipes[1]?.settings.fields.format).toBe("png");
  let recipes = update.recipes;
  for (let i = 2; i < 20; i++) recipes = saveRecipe(recipes, `Recipe ${i}`, savedSettings({}, true)).recipes;
  expect(() => saveRecipe(recipes, "One more", savedSettings({}, true))).toThrow("20 recipes");
  expect(() => saveRecipe([], " ", savedSettings({}, true))).toThrow("1–48");
});

test("recipe reader ignores corrupt records and does not retain arbitrary fields", () => {
  const store = storage();
  store.setItem(RECIPES_KEY, "broken");
  expect(loadRecipes(store)).toEqual([]);
  expect(readRecipes(JSON.stringify({ version: 1, recipes: [{ id: "bad", name: "Bad", settings: {} }] }))).toEqual([]);
});

test("multiple exports preserve edits, clear height constraints, and restrict quality targets", () => {
  const variants = exportVariants("320, 800, 320", ["webp", "png"], true,
    { width: "999", height: "333", fit: "fill", cropRatio: "1", targetKB: "50", quality: "75" });
  expect(variants.length).toBe(6);
  expect(variants[0]).toMatchObject({ label: "320w-webp", fields: { width: "320", height: "", fit: "inside", cropRatio: "1", targetKB: "50" } });
  expect(variants[1]!.fields).not.toHaveProperty("targetKB");
  expect(variants[4]!.fields.width).toBe("");
  for (const widths of ["320,", "0", "12001", "1.5", "foo"]) expect(() => exportVariants(widths, ["webp"], false, {})).toThrow();
  expect(() => exportVariants("", ["webp"], false, {})).toThrow();
});

test("variant queue entries receive descriptive download filenames", async () => {
  const queue = new ConversionQueue(async () => ({ blob: new Blob(["image"]), filename: "smushed-photo.webp" }));
  queue.addMany([{ file: new File(["source"], "photo.jpg"), fields: {}, label: "320w-webp" }]);
  await queue.start({});
  expect(queue.jobs[0]?.result?.filename).toBe("smushed-photo-320w-webp.webp");
});
