/** Fast QR detection for the check-in scanner (2026-10-07).
 *
 * Prefers the browser's own BarcodeDetector (Chrome on Android/Mac, Safari 17+;
 * on Apple devices it's backed by the OS Vision framework), otherwise falls
 * back to ZXing-C++ compiled to WebAssembly: both find a code anywhere in the
 * frame, tilted, rotated, near or far, in a few milliseconds. The fallback's
 * .wasm is served from /public so scanning works offline at a venue. */
export type QrHit = { rawValue: string; cornerPoints: { x: number; y: number }[] };
export type QrDetector = { detect(source: HTMLVideoElement): Promise<QrHit[]>; kind: "native" | "wasm" };

let cached: Promise<QrDetector> | null = null;

type NativeCtor = {
  new (opts: { formats: string[] }): { detect(src: HTMLVideoElement): Promise<QrHit[]> };
  getSupportedFormats(): Promise<string[]>;
};

export function getQrDetector(): Promise<QrDetector> {
  if (cached) return cached;
  cached = (async () => {
    const Native = (globalThis as unknown as { BarcodeDetector?: NativeCtor }).BarcodeDetector;
    if (Native) {
      try {
        if ((await Native.getSupportedFormats()).includes("qr_code")) {
          const d = new Native({ formats: ["qr_code"] });
          return { kind: "native" as const, detect: (src: HTMLVideoElement) => d.detect(src) };
        }
      } catch {
        /* fall through to the WebAssembly decoder */
      }
    }
    const mod = await import("barcode-detector/ponyfill");
    mod.prepareZXingModule({
      overrides: { locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? "/zxing_reader.wasm" : prefix + path) },
      fireImmediately: true,
    });
    const d = new mod.BarcodeDetector({ formats: ["qr_code"] });
    return { kind: "wasm" as const, detect: (src: HTMLVideoElement) => d.detect(src) as Promise<QrHit[]> };
  })();
  cached.catch(() => {
    cached = null;
  });
  return cached;
}
