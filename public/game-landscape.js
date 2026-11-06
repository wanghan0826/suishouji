(() => {
  function bind(button, render) {
    const landscape = matchMedia('(orientation: landscape)');
    const fullscreen = () => document.fullscreenElement || document.webkitFullscreenElement;
    let owned = false;
    let pending = false;
    let manual = false;
    let revision = 0;

    function paint() {
      const active = owned && !!fullscreen();
      button.setAttribute('aria-pressed',String(active));
      button.setAttribute('aria-label',active ? '退出全屏' : '横屏全屏');
      render({active, needsRotation:manual && !landscape.matches});
    }

    function unlock() {
      try { screen.orientation?.unlock?.(); } catch {}
    }

    function exit() {
      revision++;
      manual = false;
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
      if (fullscreen()) { manual = true; paint(); return; }
      const id = revision;
      const root = document.documentElement;
      const request = root.requestFullscreen || root.webkitRequestFullscreen;
      pending = true;
      try {
        if (!request) throw Error();
        await request.call(root,{navigationUI:'hide'});
        owned = fullscreen() === root;
        if (id !== revision) { exit(); return; }
        if (!owned || !screen.orientation?.lock) throw Error();
        await screen.orientation.lock('landscape');
        if (id === revision) manual = false;
      } catch {
        if (id === revision) manual = true;
      } finally {
        pending = false;
        paint();
      }
    });

    function changed() {
      if (owned && !fullscreen()) {
        owned = false;
        unlock();
        manual = false;
        revision++;
      }
      paint();
    }
    document.addEventListener('fullscreenchange',changed);
    document.addEventListener('webkitfullscreenchange',changed);
    landscape.addEventListener('change',paint);
    paint();
    return exit;
  }
  window.SJLandscape = {bind};
})();
