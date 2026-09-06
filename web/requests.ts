/** Keeps only the newest operation eligible to update the editor. */
export class LatestRequest {
  private controller = new AbortController();

  start(): AbortSignal {
    this.controller.abort();
    this.controller = new AbortController();
    return this.controller.signal;
  }

  cancel(): void {
    this.controller.abort();
  }
}

export function responseDimensions(response: Response): { width: number; height: number } | null {
  const width = Number(response.headers.get("x-image-width"));
  const height = Number(response.headers.get("x-image-height"));
  return Number.isInteger(width) && width > 0 && Number.isInteger(height) && height > 0
    ? { width, height }
    : null;
}
