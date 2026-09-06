import { readSavedSettings, SETTINGS_KEY, type SavedSettings } from "./settings";
export const RECIPES_KEY = "smush.recipes.v1";
export const MAX_RECIPES = 20;
export interface Recipe { id: string; name: string; settings: SavedSettings }

export function readRecipes(value: string | null): Recipe[] {
  try {
    const data = JSON.parse(value ?? "null");
    if (data?.version !== 1 || !Array.isArray(data.recipes)) return [];
    const recipes: Recipe[] = [];
    for (const item of data.recipes.slice(0, MAX_RECIPES)) {
      const settings = readSavedSettings(JSON.stringify(item?.settings));
      if (!settings || typeof item?.id !== "string" || !item.id || item.id.length > 100 ||
          typeof item.name !== "string" || !item.name.trim() || item.name.length > 48 ||
          recipes.some(recipe => recipe.id === item.id || recipe.name.toLowerCase() === item.name.trim().toLowerCase())) continue;
      recipes.push({ id: item.id, name: item.name.trim(), settings });
    }
    return recipes;
  } catch { return []; }
}

export function saveRecipe(recipes: Recipe[], name: string, settings: SavedSettings): { recipes: Recipe[]; id: string } {
  name = name.trim();
  if (!name || name.length > 48) throw new Error("Give the recipe a name of 1–48 characters.");
  const existing = recipes.find(recipe => recipe.name.toLowerCase() === name.toLowerCase());
  if (!existing && recipes.length >= MAX_RECIPES) throw new Error("You have 20 recipes. Delete one before adding another.");
  const id = existing?.id ?? crypto.randomUUID();
  const next = { id, name, settings };
  return { id, recipes: existing ? recipes.map(recipe => recipe.id === id ? next : recipe) : [...recipes, next] };
}

export function writeRecipes(storage: Pick<Storage, "setItem">, recipes: Recipe[]): void {
  storage.setItem(RECIPES_KEY, JSON.stringify({ version: 1, recipes }));
}

export function loadRecipes(storage: Pick<Storage, "getItem" | "setItem" | "removeItem">): Recipe[] {
  const current = storage.getItem(RECIPES_KEY);
  if (current !== null) return readRecipes(current);
  const previous = readSavedSettings(storage.getItem(SETTINGS_KEY));
  if (!previous) return [];
  const recipes = [{ id: "legacy", name: "My saved settings", settings: previous }];
  // Keep the old data intact if migration cannot be persisted.
  writeRecipes(storage, recipes);
  storage.removeItem(SETTINGS_KEY);
  return recipes;
}
