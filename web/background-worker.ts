import { pipeline, env, RawImage } from "@huggingface/transformers";
env.allowLocalModels = false;
env.backends.onnx.wasm!.numThreads = 1;
env.backends.onnx.wasm!.wasmPaths = "/models/runtime/";
self.onmessage = async (event: MessageEvent<{ pixels: ImageData }>) => {
  try {
    const segmenter = await pipeline("background-removal", "onnx-community/BEN2-ONNX", {
      revision: "7ec4df6", dtype: "fp16", device: "wasm",
      progress_callback: (progress) => { if (progress.status === "progress") self.postMessage({ progress: `Downloading background model: ${Math.round(progress.progress)}%` }); },
    });
    self.postMessage({ progress: "Removing background… This may take a minute." });
    const { pixels } = event.data;
    const result = await segmenter([new RawImage(pixels.data, pixels.width, pixels.height, 4)]);
    self.postMessage({ output: await result[0]!.toBlob() });
    await segmenter.dispose();
  } catch (error) { self.postMessage({ error: error instanceof Error ? error.message : "Background removal failed." }); }
};
