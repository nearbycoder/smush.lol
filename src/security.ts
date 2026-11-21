export const PUBLIC_URL = new URL(process.env.SMUSH_PUBLIC_URL ?? "https://smush.lol").origin;

// The only remote browser requests are the opt-in background-removal model.
// Keep WASM encoders and model workers working without allowing inline scripts.
export const securityHeaders = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "connect-src 'self' blob: https://huggingface.co https://*.huggingface.co https://*.hf.co",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join("; "),
  "Cross-Origin-Opener-Policy": "same-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-Permitted-Cross-Domain-Policies": "none",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
};

export function isHttpsRequest(request: Request): boolean {
  const forwarded = request.headers.get("x-forwarded-proto")?.split(",", 1)[0]?.trim().toLowerCase();
  return forwarded === "https" || request.url.startsWith("https://");
}
