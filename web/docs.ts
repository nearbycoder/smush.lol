const toast = document.getElementById("docs-toast");
let toastTimer: number | undefined;

function showToast(message: string): void {
  if (!toast) return;
  if (toastTimer !== undefined) window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = window.setTimeout(() => {
    toast.hidden = true;
  }, 2400);
}

async function writeClipboard(value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const copyTarget = document.createElement("textarea");
    copyTarget.value = value;
    copyTarget.style.position = "fixed";
    copyTarget.style.opacity = "0";
    document.body.append(copyTarget);
    copyTarget.select();
    document.execCommand("copy");
    copyTarget.remove();
  }
}

document.querySelectorAll<HTMLButtonElement>("[data-copy-target], [data-copy-text]").forEach((button) => {
  button.addEventListener("click", async () => {
    const targetId = button.dataset.copyTarget;
    const target = targetId ? document.getElementById(targetId) : null;
    const value = button.dataset.copyText ?? target?.textContent?.trim();
    if (!value) return;

    await writeClipboard(value);
    const original = button.textContent;
    button.textContent = "Copied";
    showToast("Copied to clipboard.");
    window.setTimeout(() => {
      button.textContent = original;
    }, 1600);
  });
});
