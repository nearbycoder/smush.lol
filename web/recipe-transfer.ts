import { readSavedSettings } from "./settings";
import { MAX_RECIPES, loadRecipes, writeRecipes, type Recipe } from "./recipes";
import { downloadBlob } from "./archive";
export const MAX_RECIPE_FILE = 256 * 1024;
export function exportRecipes(recipes: Recipe[]): string {
  if (!recipes.length) throw new Error("Save a recipe before exporting.");
  return JSON.stringify({ version: 1, recipes: recipes.map(recipe => ({ ...recipe, settings: readSavedSettings(JSON.stringify(recipe.settings)) })) }, null, 2);
}
export function importRecipes(raw: string, existing: Recipe[]): Recipe[] {
  if (new TextEncoder().encode(raw).byteLength > MAX_RECIPE_FILE) throw new Error("Recipe files must be under 256 KB.");
  let data: unknown;
  try { data = JSON.parse(raw); } catch { throw new Error("This is not valid recipe JSON."); }
  const parsed = data as { version?: unknown; recipes?: unknown } | null;
  if (parsed?.version !== 1 || !Array.isArray(parsed.recipes) || !parsed.recipes.length || parsed.recipes.length > MAX_RECIPES) throw new Error("Choose a version 1 recipe file containing 1–20 recipes.");
  if (existing.length + parsed.recipes.length > MAX_RECIPES) throw new Error("Import would exceed 20 recipes. Delete some saved recipes first; nothing was imported.");
  const next = [...existing];
  for (const item of parsed.recipes) {
    const settings = readSavedSettings(JSON.stringify(item?.settings));
    if (!settings || typeof item?.name !== "string" || !item.name.trim() || item.name.trim().length > 48) throw new Error("A recipe has an invalid name or settings. Nothing was imported.");
    const base = item.name.trim(); let name = base, n = 2;
    while (next.some(recipe => recipe.name.toLowerCase() === name.toLowerCase())) { const suffix = ` (${n++})`; name = base.slice(0, 48-suffix.length) + suffix; }
    next.push({ id: crypto.randomUUID(), name, settings });
  }
  return next;
}
export function mountRecipeTransfer(refresh: (id?: string) => void, notify: (message: string, error?: boolean) => void) {
  const input = document.querySelector<HTMLInputElement>("#recipe-import-file")!;
  document.querySelector("#recipe-export")!.addEventListener("click", () => {
    try { const recipes = loadRecipes(localStorage); downloadBlob(new Blob([exportRecipes(recipes)], { type: "application/json" }), "smush-recipes.json"); notify(`${recipes.length} recipes exported.`); }
    catch (error) { notify(error instanceof Error ? error.message : "Recipes could not be exported.", true); }
  });
  document.querySelector("#recipe-import")!.addEventListener("click", () => input.click());
  input.addEventListener("change", async () => {
    const file = input.files?.[0]; input.value = ""; if (!file) return;
    try {
      if (file.size > MAX_RECIPE_FILE) throw new Error("Recipe files must be under 256 KB.");
      const raw = await file.text(), existing = loadRecipes(localStorage), next = importRecipes(raw, existing);
      writeRecipes(localStorage, next); refresh(next.at(-1)?.id);
      notify(`${next.length-existing.length} recipes imported. Duplicate names were numbered; existing recipes were kept.`);
    } catch (error) { notify(error instanceof Error ? error.message : "Recipes could not be imported.", true); }
  });
}
