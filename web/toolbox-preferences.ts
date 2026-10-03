export interface ToolboxPreferences { favorites: string[]; recent: string[] }
export const toolboxPreferencesKey = "smush-toolbox-preferences-v1";
export function readToolboxPreferences(raw: string | null, keys: string[]): ToolboxPreferences {
  const allowed = new Set(keys);
  const clean = (values: unknown, max: number) => Array.isArray(values) ? [...new Set(values.filter((v): v is string => typeof v === "string" && allowed.has(v)))].slice(0, max) : [];
  try {
    const parsed = JSON.parse(raw ?? "{}");
    return { favorites: clean(parsed?.favorites, keys.length), recent: clean(parsed?.recent, 8) };
  } catch { return { favorites: [], recent: [] }; }
}
export function recordToolUse(preferences: ToolboxPreferences, key: string): ToolboxPreferences {
  return { ...preferences, recent: [key, ...preferences.recent.filter(value => value !== key)].slice(0, 8) };
}
export function toggleFavorite(preferences: ToolboxPreferences, key: string): ToolboxPreferences {
  return { ...preferences, favorites: preferences.favorites.includes(key) ? preferences.favorites.filter(value => value !== key) : [...preferences.favorites, key] };
}
