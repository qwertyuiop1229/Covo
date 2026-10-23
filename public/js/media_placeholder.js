// No thumbnail request, plaintext preview, canvas, or additional decoded image.
export function createMediaPlaceholder(element, dimensions = {}) {
  if (!['IMG', 'VIDEO'].includes(element.tagName)) return null;
  if (element._covoPlaceholder) { element._covoPlaceholder.start(); return element._covoPlaceholder; }
  const shell = document.createElement('div');
  shell.className = 'covo-media-shell'; shell.setAttribute('aria-label', '添付ファイルを読み込み中');
  const fit = (width, height) => {
    if (!(Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0)) return;
    const ratio = Math.max(32 / 250, Math.min(20, width / height));
    shell.style.width = Math.max(32, Math.min(width, 320, 250 * ratio)) + 'px';
    shell.style.aspectRatio = String(ratio);
  };
  fit(Number(dimensions.width), Number(dimensions.height));
  shell.append(element); element._covoShell = shell;
  const state = {
    node: shell,
    start() { shell.classList.add('is-loading'); shell.setAttribute('aria-busy', 'true'); },
    ready() {
      fit(element.naturalWidth || element.videoWidth, element.naturalHeight || element.videoHeight);
      shell.classList.remove('is-loading'); shell.removeAttribute('aria-busy'); shell.removeAttribute('aria-label');
    }
  };
  element._covoPlaceholder = state; state.start(); return state;
}
