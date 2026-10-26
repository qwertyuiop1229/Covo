// Early, local-only viewport coordination. Never infer a window's size from screen.height.
(function () {
  if (window.covoViewport) return;
  const root = document.documentElement;
  const standalone = Boolean(navigator.standalone || matchMedia('(display-mode: standalone)').matches);
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  const tablet = /iPad/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  root.classList.toggle('covo-ios-standalone', ios && standalone);
  root.classList.toggle('covo-ios-phone', ios && standalone && !tablet);
  root.classList.toggle('covo-ios-tablet', ios && standalone && tablet);
  let frame = 0, probe, settleTimers = [];
  const editing = () => document.activeElement?.matches('textarea,input:not([type=checkbox]):not([type=radio]),[contenteditable=true]');
  function cancelSettle() { settleTimers.forEach(clearTimeout); settleTimers = []; }
  function settleAfterKeyboard() {
    cancelSettle();
    if (!ios || !standalone) return;
    // Only restore the document viewport; never move the chat's independent scroller.
    for (const delay of [80, 250, 500]) settleTimers.push(setTimeout(() => {
      if (editing() || document.hidden || (window.visualViewport?.scale ?? 1) !== 1) return;
      if (window.scrollX || window.scrollY || document.scrollingElement?.scrollTop) window.scrollTo(0, 0);
      schedule();
    }, delay));
  }
  function snapshot() {
    if (!probe && document.body) {
      probe = document.createElement('div');
      probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
      probe.setAttribute('aria-hidden', 'true'); document.body.append(probe);
    }
    const css = probe ? getComputedStyle(probe) : null;
    const vv = window.visualViewport;
    const box = document.querySelector('.container')?.getBoundingClientRect();
    return { standalone, ios, innerWidth, innerHeight, clientHeight: root.clientHeight,
      screenWidth: screen.width, screenHeight: screen.height, pixelRatio: devicePixelRatio,
      statusBarStyle: document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.content || null,
      visualHeight: vv?.height ?? null, visualOffsetTop: vv?.offsetTop ?? null, scale: vv?.scale ?? 1,
      safeTop: css ? parseFloat(css.paddingTop) : null, safeBottom: css ? parseFloat(css.paddingBottom) : null,
      shellTop: box?.top ?? null, shellBottom: box?.bottom ?? null,
      bodyTop: document.body?.getBoundingClientRect().top ?? null, bodyBottom: document.body?.getBoundingClientRect().bottom ?? null,
      rootScrollTop: document.scrollingElement?.scrollTop ?? 0,
      rootBackground: getComputedStyle(root).backgroundColor,
      topSurface: root.style.getPropertyValue('--covo-shell-background'),
      canvasSurface: root.style.getPropertyValue('--covo-canvas-background'),
      safeAreaLayout: 'integrated', deviceLayout: tablet ? 'tablet' : 'phone',
      userPanelShadow: document.getElementById('userPanel') ? getComputedStyle(document.getElementById('userPanel')).boxShadow : null,
      keyboard: root.classList.contains('covo-keyboard-open') };
  }
  function update() {
    frame = 0;
    const vv = window.visualViewport;
    const keyboard = ios && vv && vv.scale === 1 && editing() && innerHeight - vv.height > 120;
    root.classList.toggle('covo-keyboard-open', Boolean(keyboard));
    if (keyboard) {
      root.style.setProperty('--covo-keyboard-height', `${Math.round(vv.height)}px`);
      root.style.setProperty('--covo-keyboard-top', `${Math.max(0, Math.round(vv.offsetTop))}px`);
    } else {
      root.style.removeProperty('--covo-keyboard-height'); root.style.removeProperty('--covo-keyboard-top');
    }
    if (ios && standalone && document.body?.classList.contains('discord-ui-mode')) {
      const nav = document.getElementById('discordServerNav');
      const navColor = nav && getComputedStyle(nav).backgroundColor;
      const color = navColor && navColor !== 'rgba(0, 0, 0, 0)' && navColor !== 'transparent' ? navColor :
        document.body.classList.contains('discord-dark-theme') ? '#1e1f22' : document.body.classList.contains('dark-server-theme') ? '#0b0f19' : '#e2e8f0';
      root.style.setProperty('--covo-shell-background', color);
      // The exposed layout viewport (behind the keyboard / home indicator)
      // continues the active panel, while the top safe area continues the rail.
      const composer = document.getElementById('messageInputArea');
      const typingMessage = composer?.contains(document.activeElement);
      const ids = typingMessage ? ['messageInputArea','chatArea'] :
        ['chatArea','discordDmHomeView','discordDiscoverView','sidebar'];
      let canvas = document.body.classList.contains('discord-dark-theme') ? '#313338' :
        document.body.classList.contains('dark-server-theme') ? '#1a202c' : '#ffffff';
      for (const id of ids) {
        const element = document.getElementById(id);
        if (!element?.getClientRects().length) continue;
        const box=element.getBoundingClientRect();
        if (box.width<=0 || box.height<=0 || box.right<=0 || box.left>=innerWidth || box.bottom<=0 || box.top>=innerHeight) continue;
        const style = getComputedStyle(element);
        if (style.visibility === 'hidden' || style.backgroundColor === 'transparent' || style.backgroundColor === 'rgba(0, 0, 0, 0)') continue;
        canvas = style.backgroundColor; break;
      }
      root.style.setProperty('--covo-canvas-background', canvas);
      const theme = document.querySelector('meta[name="theme-color"]');
      if (theme && theme.content !== color && !document.getElementById('appLoadingSplash')) theme.content = color;
    }
    if (ios && standalone && document.getElementById('appLoadingSplash')) {
      const theme = document.querySelector('meta[name="theme-color"]'); if (theme) theme.content = '#232b38';
    }
  }
  const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
  for (const event of ['resize', 'pageshow', 'orientationchange']) window.addEventListener(event, schedule);
  for (const event of ['focusin', 'focusout', 'visibilitychange', 'DOMContentLoaded']) document.addEventListener(event, schedule);
  document.addEventListener('focusout', settleAfterKeyboard);
  document.addEventListener('transitionend', event => {
    if (event.propertyName === 'background-color' && ['discordServerNav','messageInputArea','chatArea','sidebar','discordDmHomeView','discordDiscoverView'].includes(event.target?.id)) schedule();
  });
  document.addEventListener('focusin', cancelSettle);
  window.addEventListener('pagehide', cancelSettle);
  const watchTheme = () => { if (document.body) new MutationObserver(schedule).observe(document.body, { attributes: true, attributeFilter: ['class'], childList: true }); };
  if (document.body) watchTheme(); else document.addEventListener('DOMContentLoaded', watchTheme, { once: true });
  window.visualViewport?.addEventListener('resize', schedule);
  window.visualViewport?.addEventListener('scroll', schedule);
  window.covoViewport = { snapshot, refresh: schedule };
  schedule();
})();
