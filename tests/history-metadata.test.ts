import { test, expect } from "bun:test";
import { EditHistory } from "../web/history";
import { metadataRows } from "../web/metadata";
test("history restores crops, branches after undo and returns immutable snapshots", () => {
  const initial = { crop: "", width: "", flip: false }, history = new EditHistory(initial, 3);
  initial.width = "mutation";
  expect(history.current.width).toBe("");
  history.record({ crop: "1", width: "200", flip: false }); history.record({ crop: "1", width: "400", flip: true });
  expect(history.undo()).toEqual({ crop: "1", width: "200", flip: false });
  expect(history.redo().flip).toBe(true); history.undo(); history.record({ crop: ".8", width: "320", flip: false });
  expect(history.canRedo).toBe(false); history.undo(); expect(history.undo().crop).toBe("");
  history.reset(initial); expect(history.canUndo).toBe(false);
});
test("history prunes old states by count and memory without losing current edits", () => {
  const history = new EditHistory("a", 3, 28); history.record("bb"); history.record("cccc"); history.record("ddddd");
  expect(history.current).toBe("ddddd"); expect(history.undo()).toBe("cccc"); expect(history.canUndo).toBe(false);
});
test("metadata descriptions include camera, orientation, ICC and GPS but exclude raw payloads", () => {
  const rows = metadataRows({ exif: { Make: { description: "Camera" }, Orientation: { description: "Rotate 90 CW" }, MakerNote: { description: "binary" } }, icc: { ProfileDescription: { description: "sRGB" } }, gps: { Latitude: 41.5, Longitude: -87.5 }, Thumbnail: { data: "pixels" }, xmp: { _raw: "<xml>" } });
  expect(rows.map(row => row.value)).toEqual(["Camera", "Rotate 90 CW", "sRGB", "41.5", "-87.5"]);
  expect(metadataRows({ exif: { Comment: { description: "x".repeat(1000) } } })[0]?.value.length).toBe(500);
});
