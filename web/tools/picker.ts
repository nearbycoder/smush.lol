import { sourceCanvas, paragraph, type ImageTool } from "./shared";
export function pixelColor(data: ArrayLike<number>) { return { hex: "#" + Array.from(data).slice(0, 4).map(n => n.toString(16).padStart(2, "0")).join(""), rgba: `rgba(${data[0]}, ${data[1]}, ${data[2]}, ${((data[3] ?? 255) / 255).toFixed(3)})` }; }
export const pickerTool: ImageTool = {
  title: "Pixel color picker", description: "Click a pixel or enter its coordinates. HEX includes alpha; coordinates refer to the displayed raster, capped at 12,000px per side.", controls: "",
  async run({ file, signal, output }) {
    const canvas = await sourceCanvas(file, 12000); if (signal.aborted) { canvas.width = canvas.height = 0; return; }
    canvas.style.cursor = "crosshair"; canvas.setAttribute("aria-label", "Click to sample a pixel; coordinate fields provide keyboard access");
    const row = document.createElement("div"); row.className = "watermark-measures tool-content";
    const inputs = [canvas.width, canvas.height].map((max, i) => { const label = document.createElement("label"), input = document.createElement("input"); label.textContent = i ? "Y coordinate" : "X coordinate"; input.type = "number"; input.min = "0"; input.max = String(max - 1); input.value = "0"; label.append(input); row.append(label); return input; });
    output.append(row, canvas); const status = paragraph(output, ""); status.setAttribute("aria-live", "polite"); let color = "";
    function sample() { const [x, y] = inputs.map(input => Number(input.value)); if (![x, y].every(Number.isInteger) || x! < 0 || y! < 0 || x! >= canvas.width || y! >= canvas.height) { status.textContent = "Choose coordinates inside the image."; return; } const result = pixelColor(canvas.getContext("2d")!.getImageData(x!, y!, 1, 1).data); color = result.hex; status.textContent = `${x}, ${y}: ${result.hex} · ${result.rgba}`; }
    inputs.forEach(input => input.addEventListener("input", sample));
    canvas.onclick = event => { const bounds = canvas.getBoundingClientRect(); inputs[0]!.value = String(Math.min(canvas.width - 1, Math.floor((event.clientX - bounds.left) / bounds.width * canvas.width))); inputs[1]!.value = String(Math.min(canvas.height - 1, Math.floor((event.clientY - bounds.top) / bounds.height * canvas.height))); sample(); };
    const copy = document.createElement("button"); copy.className = "creative-action"; copy.textContent = "Copy HEX color"; copy.onclick = () => { void navigator.clipboard.writeText(color).then(() => { status.textContent += " · Copied"; }, () => { status.textContent += " · Clipboard unavailable; select the color text to copy."; }); }; output.append(copy); sample();
  },
};
