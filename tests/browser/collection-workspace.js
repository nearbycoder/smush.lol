// Run on a fresh built app with agent-browser eval --stdin.
(async () => {
  const el = id => document.getElementById(id);
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const tick = () => new Promise(resolve => setTimeout(resolve, 30));
  const until = async (condition, message) => { for (let i = 0; i < 300; i++) { if (condition()) return; await tick(); } throw new Error(message + ': ' + el('collection-status').textContent); };
  const input = (id, value) => { el(id).value = String(value); el(id).dispatchEvent(new Event('input', { bubbles: true })); };
  const change = (id, value) => { input(id, value); el(id).dispatchEvent(new Event('change', { bubbles: true })); };
  const chooseMode = value => document.querySelector(`[name="collection-format"][value="${value}"]`).click();
  const generate = async kind => { el(`collection-${kind}`).click(); await until(() => !el('collection-download').disabled, `${kind} did not finish`); await el('collection-preview').decode(); };
  const downloads = [], anchorClick = HTMLAnchorElement.prototype.click, createURL = URL.createObjectURL, revokeURL = URL.revokeObjectURL;
  const blobs = new Map(), downloadURLs = new Set();
  URL.createObjectURL = blob => { const url = createURL(blob); blobs.set(url, blob); return url; };
  URL.revokeObjectURL = url => { blobs.delete(url); revokeURL(url); };
  HTMLAnchorElement.prototype.click = function () { if (this.download) { downloads.push({ name: this.download, blob: blobs.get(this.href) }); downloadURLs.add(this.href); } else anchorClick.call(this); };
  try {
    el('collection-open').click();
    assert(el('collection-sheet').disabled && !el('collection-no-images').hidden, 'Empty collection needs a useful empty state');
    el('collection-close').click();
    const transfer = new DataTransfer();
    for (const [name, color] of [['coral.png', '#e48667'], ['sage.png', '#7e9967'], ['a-very-long-image-filename-that-must-not-push-the-dialog-outside-the-viewport.png', '#739eb3']]) {
      const canvas = document.createElement('canvas'); canvas.width = 240; canvas.height = 160;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = color; ctx.fillRect(0, 0, 240, 160);
      transfer.items.add(new File([await new Promise(resolve => canvas.toBlob(resolve))], name, { type: 'image/png' }));
    }
    el('queue-input').files = transfer.files; el('queue-input').dispatchEvent(new Event('change', { bubbles: true }));
    await until(() => el('queue-list').children.length === 3, 'Images did not reach queue');
    const existingURLs = new Set(blobs.keys());
    el('collection-open').click(); await tick();
    assert(el('collection-source').value === 'sources', 'Available originals should be selected when no exports exist');
    assert(el('collection-list').children.length === 3 && el('collection-list').querySelectorAll('img').length === 3, 'Collection should show each thumbnail');
    el('collection-list').children[1].querySelector('[aria-label^="Move up"]').click();
    assert(el('collection-list').firstElementChild.textContent.includes('sage.png'), 'Reordering failed');
    input('sheet-width', 600); change('sheet-columns', 2);
    await generate('sheet');
    assert(el('collection-preview').naturalWidth === 600 && el('collection-preview').naturalHeight > 600, 'Wrong contact sheet dimensions');
    assert(el('collection-sheet').hidden && !el('collection-download').hidden, 'Ready state needs one download action');
    el('collection-download').click();
    assert(downloads.at(-1).name === 'contact-sheet.png' && downloads.at(-1).blob.type === 'image/png', 'PNG download invalid');
    const bitmap = await createImageBitmap(downloads.at(-1).blob);
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height; const ctx = canvas.getContext('2d'); ctx.drawImage(bitmap, 0, 0); bitmap.close();
    const pixel = ctx.getImageData(150, 150, 1, 1).data;
    assert(pixel[0] === 126 && pixel[1] === 153 && pixel[2] === 103, 'Sheet ignored the reordered first image');
    input('sheet-width', 800); assert(el('collection-download').disabled && el('collection-preview').hidden, 'Changed settings left a stale export');
    chooseMode('pdf'); assert(el('sheet-settings').hidden && !el('pdf-settings').hidden, 'Export modes must show only their own settings');
    change('pdf-paper', 'letter'); el('pdf-landscape').click();
    await generate('pdf');
    assert(el('collection-preview').naturalWidth > el('collection-preview').naturalHeight, 'Landscape PDF preview is not landscape');
    assert(el('collection-preview-caption').textContent.includes('Page 1 of 3'), 'PDF preview must state which page it shows');
    el('collection-download').click();
    assert(downloads.at(-1).name.endsWith('.pdf') && (await downloads.at(-1).blob.text()).startsWith('%PDF-'), 'PDF download invalid');
    change('pdf-paper', 'image'); assert(el('pdf-landscape').disabled, 'Image-sized paper should disable irrelevant orientation');
    await generate('pdf');
    el('collection-list').firstElementChild.querySelector('[aria-label^="Remove"]').click();
    assert(el('collection-list').children.length === 2 && el('collection-download').disabled, 'Removing an image left a stale result');
    chooseMode('sheet'); el('collection-sheet').click(); el('collection-cancel').click();
    await until(() => el('collection-status').textContent.includes('cancelled'), 'Cancellation did not finish');
    assert(!el('collection-sheet').disabled && el('collection-download').disabled, 'Cancel left broken actions');
    el('collection-sheet').click(); el('collection-close').click(); el('collection-open').click(); await tick();
    assert(!el('collection-sheet').disabled && el('collection-preview').hidden, 'Closing during generation polluted a reopened dialog');
    assert(el('collection-dialog').scrollWidth <= el('collection-dialog').clientWidth, 'Collection overflows horizontally');
    assert(Array.from(el('collection-dialog').querySelectorAll('select')).every(select => select.hidden && select.dataset.customSelect), 'A native select remains visible');
    el('collection-close').click(); await tick();
    await until(() => Array.from(blobs.keys()).every(url => existingURLs.has(url) || downloadURLs.has(url)), 'Collection did not release its preview or thumbnails');
    return { status: 'passed', viewport: innerWidth, exports: downloads.map(item => item.name), checks: ['empty state', 'source fallback', 'thumbnail order', 'PNG pixels', 'PDF preview', 'mode switching', 'stale export invalidation', 'cancellation', 'close/reopen', 'URL cleanup'] };
  } finally { HTMLAnchorElement.prototype.click = anchorClick; URL.createObjectURL = createURL; URL.revokeObjectURL = revokeURL; }
})()
