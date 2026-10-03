import { expect, test } from "bun:test";
import { readToolboxPreferences, recordToolUse, toggleFavorite } from "../web/toolbox-preferences";
test("tool preferences recover from malformed or outdated storage", () => {
  for (const raw of [null, "invalid", "null", "42", '"value"']) expect(readToolboxPreferences(raw, ["a"])).toEqual({ favorites: [], recent: [] });
  expect(readToolboxPreferences('{"favorites":["a","a","unknown",42],"recent":["b","unknown"]}', ["a", "b"])).toEqual({ favorites: ["a"], recent: ["b"] });
});
test("favorites toggle without changing recency and recent tools deduplicate to eight", () => {
  const empty = { favorites: [], recent: ["a"] };
  expect(toggleFavorite(toggleFavorite(empty, "b"), "b")).toEqual(empty);
  let state = toggleFavorite(empty, "b");
  for (let i = 0; i < 10; i++) state = recordToolUse(state, String(i));
  expect(state.recent).toEqual(["9", "8", "7", "6", "5", "4", "3", "2"]);
  expect(recordToolUse(state, "5").recent).toEqual(["5", "9", "8", "7", "6", "4", "3", "2"]);
  expect(state.favorites).toEqual(["b"]);
});
