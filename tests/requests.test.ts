import { expect, test } from "bun:test";
import { LatestRequest, responseDimensions } from "../web/requests";

test("replacing a request invalidates late results and cancels network work", () => {
  const requests = new LatestRequest();
  const first = requests.start();
  const second = requests.start();
  expect(first.aborted).toBe(true);
  expect(second.aborted).toBe(false);
  requests.cancel();
  expect(second.aborted).toBe(true);
  expect(requests.start().aborted).toBe(false);
});

test("uses valid metadata headers without decoding the preview", () => {
  expect(responseDimensions(new Response(null, { headers: {
    "X-Image-Width": "1400", "X-Image-Height": "900",
  } }))).toEqual({ width: 1400, height: 900 });
  for (const width of ["", "0", "-1", "NaN", "Infinity", "1.5"]) {
    expect(responseDimensions(new Response(null, { headers: {
      "X-Image-Width": width, "X-Image-Height": "900",
    } }))).toBeNull();
  }
  expect(responseDimensions(new Response())).toBeNull();
});
