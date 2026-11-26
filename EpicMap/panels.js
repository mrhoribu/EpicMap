'use strict';
(() => {
  const panels = [
    {id:'left', hide:'hideLeft', show:'showLeft', key:'b', className:'left-hidden'},
    {id:'minimapWrap', hide:'hideMinimap', show:'showMinimap', key:'m', className:'minimap-hidden'}
  ];
  for (const config of panels) {
    const panel = document.getElementById(config.id);
    const hide = document.getElementById(config.hide);
    const show = document.getElementById(config.show);
    const storageKey = 'epicmap.hidden.' + config.id;
    function setHidden(hidden, remember = true) {
      const moveFocus = panel.contains(document.activeElement) || document.activeElement === show;
      panel.hidden = hidden;
      show.hidden = !hidden;
      hide.setAttribute('aria-expanded', String(!hidden));
      show.setAttribute('aria-expanded', String(!hidden));
      document.body.classList.toggle(config.className, hidden);
      if (moveFocus) (hidden ? show : hide).focus({preventScroll:true});
      if (remember) { try { window.EpicPrefs.setItem(storageKey, String(hidden)); } catch (_) {} }
    }
    let saved = false;
    try { saved = window.EpicPrefs.getItem(storageKey) === 'true'; } catch (_) {}
    setHidden(saved, false);
    hide.addEventListener('click', () => setHidden(true));
    show.addEventListener('click', () => setHidden(false));
    addEventListener('keydown', event => {
      if (event.defaultPrevented || event.repeat || event.ctrlKey || event.altKey || event.metaKey ||
          /^(INPUT|SELECT|TEXTAREA)$/.test(event.target.tagName) || event.target.isContentEditable ||
          document.querySelector('dialog[open]')) return;
      if (event.key.toLowerCase() === config.key) { event.preventDefault(); setHidden(!panel.hidden); }
    });
  }
})();
