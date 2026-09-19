// Run on a fresh built app with agent-browser eval --stdin.
(async () => {
  const el = id => document.getElementById(id);
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const until = async (condition, message) => {
    const end = Date.now() + 30000;
    while (!condition()) { if (Date.now() > end) throw new Error(message + ': ' + el('toast').textContent); await new Promise(r => setTimeout(r, 30)); }
  };
  const violations = [], downloads = [];
  const report = event => violations.push(event.violatedDirective + ': ' + event.blockedURI);
  document.addEventListener('securitypolicyviolation', report);
  const originalClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (this.download) downloads.push({ name: this.download, bytes: fetch(this.href).then(r => r.arrayBuffer()) });
    else originalClick.call(this);
  };
  const load = file => {
    const transfer = new DataTransfer(); transfer.items.add(file);
    el('file-input').files = transfer.files; el('file-input').dispatchEvent(new Event('change', { bubbles: true }));
  };
  const convert = async format => {
    document.querySelector(`[name=format][value=${format}]`).click();
    el('smush-button').click(); await until(() => !el('smush-button').disabled, format + ' conversion timed out');
    assert(!el('result-bar').hidden, format + ' produced no result');
    const blob = await (await fetch(el('preview-image').src)).blob();
    assert(blob.type === `image/${format}`, format + ' has wrong content type');
    const bitmap = await createImageBitmap(blob); assert(bitmap.width > 0 && bitmap.height > 0, 'Invalid encoded image'); bitmap.close();
  };
  try {
    load(new File(['<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" onload="alert(1)"><rect width="16" height="16"/></svg>'], 'unsafe.svg', { type: 'image/svg+xml' }));
    await until(() => el('toast').textContent.includes('active content'), 'Active SVG was not rejected');
    load(new File(['<svg xmlns="http://www.w3.org/2000/svg" width="64" height="48"><rect width="64" height="48" fill="#ff8855"/></svg>'], 'safe.svg', { type: 'image/svg+xml' }));
    await until(() => !el('smush-button').disabled, 'Safe SVG failed to load');
    await convert('png');
    await convert('webp');
    await convert('avif');

    el('crop-open').click(); await until(() => el('crop-dialog').open, 'Crop did not open');
    el('crop-ratio-choice').value = '1'; el('crop-ratio-choice').dispatchEvent(new Event('input', { bubbles: true }));
    el('crop-apply').click(); await convert('png');
    assert(el('preview-image').naturalWidth === el('preview-image').naturalHeight, 'Crop was not applied');
    el('metadata-open').click(); await until(() => !el('metadata-status').textContent.startsWith('Reading'), 'Metadata stalled');
    el('metadata-source').value = 'result'; el('metadata-source').dispatchEvent(new Event('change', { bubbles: true }));
    await until(() => !el('metadata-download').disabled, 'Updated metadata parser failed');
    el('metadata-download').click(); el('metadata-close').click();
    const metadata = JSON.parse(new TextDecoder().decode(await downloads.at(-1).bytes));
    assert(metadata.some(row => row.name === 'Bytes'), 'Metadata export is invalid');

    el('collection-open').click(); el('collection-sheet').click();
    await until(() => !el('collection-download').disabled, 'Contact sheet failed');
    assert(!el('collection-preview').hidden, 'Contact sheet preview missing');
    document.querySelector('[name=collection-format][value=pdf]').click(); el('collection-pdf').click(); await until(() => !el('collection-download').disabled, 'PDF failed');
    el('collection-download').click();
    assert(new TextDecoder().decode((await downloads.at(-1).bytes).slice(0, 5)) === '%PDF-', 'Invalid PDF download');
    el('collection-close').click();

    el('queue-exports').click(); el('queue-start').click();
    await until(() => !el('queue-zip').disabled, 'Batch conversion failed');
    el('queue-zip').click(); await until(() => downloads.at(-1)?.name.endsWith('.zip'), 'ZIP download failed');
    const zip = new Uint8Array(await downloads.at(-1).bytes);
    assert(zip[0] === 0x50 && zip[1] === 0x4b, 'Invalid ZIP signature');
    assert(violations.length === 0, 'CSP blocked a feature: ' + violations.join(', '));
    return { status: 'passed', features: ['SVG rejection and safe conversion', 'PNG', 'WebP WASM', 'AVIF WASM', 'crop', 'metadata JSON', 'contact sheet', 'PDF', 'batch ZIP'], cspViolations: violations };
  } finally { HTMLAnchorElement.prototype.click = originalClick; document.removeEventListener('securitypolicyviolation', report); }
})()
