(() => {
  const rotated = matchMedia('(orientation:portrait) and (pointer:coarse)');
  const viewport = window.visualViewport;

  function fitKeyboard() {
    const focus = document.activeElement;
    const typing = focus?.matches('input:not([readonly]):not([type=checkbox]):not([type=radio]), textarea, [contenteditable=true]');
    const keyboard = rotated.matches && viewport && typing && viewport.scale === 1 && innerHeight - viewport.height > 75;
    const style = document.body.style;
    if (keyboard) {
      style.setProperty('--game-visible-height',Math.floor(viewport.height)+'px');
      style.setProperty('--game-visible-top',Math.floor(viewport.offsetTop)+'px');
    } else {
      style.removeProperty('--game-visible-height');
      style.removeProperty('--game-visible-top');
    }
  }

  viewport?.addEventListener('resize',fitKeyboard);
  viewport?.addEventListener('scroll',fitKeyboard);
  document.addEventListener('focusin',fitKeyboard);
  document.addEventListener('focusout',() => requestAnimationFrame(fitKeyboard));
  rotated.addEventListener('change',fitKeyboard);

  function bind(button, render) {
    const fullscreen = () => document.fullscreenElement || document.webkitFullscreenElement;
    let owned = false;
    let pending = false;
    let unavailable = false;
    let revision = 0;

    function paint() {
      const active = owned && !!fullscreen();
      button.setAttribute('aria-pressed',String(active));
      button.setAttribute('aria-label',active ? '退出全屏' : '进入全屏');
      render({active, unavailable});
    }

    function unlock() {
      try { screen.orientation?.unlock?.(); } catch {}
    }

    function exit() {
      revision++;
      unavailable = false;
      if (owned) {
        unlock();
        const leave = document.exitFullscreen || document.webkitExitFullscreen;
        if (fullscreen() && leave) {
          try { Promise.resolve(leave.call(document)).catch(() => {}); } catch {}
        }
      }
      owned = false;
      paint();
    }

    button.addEventListener('click',async () => {
      if (owned && fullscreen()) { exit(); return; }
      if (pending) return;
      if (fullscreen()) return;
      const id = revision;
      const root = document.documentElement;
      const request = root.requestFullscreen || root.webkitRequestFullscreen;
      pending = true;
      unavailable = false;
      try {
        if (!request) throw Error();
        await request.call(root,{navigationUI:'hide'});
        owned = fullscreen() === root;
        if (id !== revision) { exit(); return; }
        if (!owned) throw Error();
        try { await screen.orientation?.lock?.('landscape'); } catch {}
      } catch {
        if (id === revision) unavailable = true;
      } finally {
        pending = false;
        paint();
      }
    });

    function changed() {
      if (owned && !fullscreen()) {
        owned = false;
        unlock();
        unavailable = false;
        revision++;
      }
      paint();
    }
    document.addEventListener('fullscreenchange',changed);
    document.addEventListener('webkitfullscreenchange',changed);
    paint();
    return exit;
  }
  window.SJLandscape = {bind, isRotated:() => rotated.matches};
})();
