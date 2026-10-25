// Authentication and authenticated UI initialization are separate asynchronous phases.
export function createAuthTransition({ frame = requestAnimationFrame } = {}) {
  const overlay = document.getElementById('authTransitionOverlay');
  const form = document.getElementById('authContainer');
  const shell = document.querySelector('.container');
  let active = null, generation = 0, previousInert = false, previousShellInert = false;
  const controls = new Map();
  function show(uid = null) {
    if (!active) {
      active = { token: ++generation, uid }; previousInert = Boolean(form?.inert);
      previousShellInert = Boolean(shell?.inert); if (shell) shell.inert = true;
      window.covoAuthTransitionBusy = true;
      if (form) { form.inert = true; form.setAttribute('aria-busy', 'true'); }
      for (const control of form?.querySelectorAll('button,input') || []) { controls.set(control, control.disabled); control.disabled = true; }
      if (overlay) overlay.hidden = false;
    } else if (uid) active.uid = uid;
    return active.token;
  }
  function finish(token) {
    if (!active || (token !== undefined && token !== active.token)) return;
    active = null; generation++;
    window.covoAuthTransitionBusy = false;
    if (overlay) overlay.hidden = true;
    if (form) { form.inert = previousInert; form.removeAttribute('aria-busy'); }
    if (shell) shell.inert = previousShellInert;
    for (const [control, disabled] of controls) control.disabled = disabled;
    controls.clear();
  }
  return {
    begin() { return active ? null : show(); },
    initializing(uid) { show(uid); },
    ready(uid) {
      if (!active || active.uid !== uid) return;
      const token = active.token;
      // Keep the blocker through the frame that first paints the destination screen.
      frame(() => frame(() => finish(token)));
    },
    fail: finish,
    signedOut() { if (active?.uid) finish(); },
    get busy() { return Boolean(active); }
  };
}
