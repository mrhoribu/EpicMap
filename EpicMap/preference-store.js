'use strict';
window.EpicPrefs = (() => {
  const flag = 'epicmap.rememberPreferences';
  const keys = ['epicmap.preferences.v1','epicmap.hidden.left','epicmap.hidden.minimapWrap','epicmap.followCharacter','epicmap.trailFadeSeconds'];
  let enabled = true, available = true;
  try { enabled = localStorage.getItem(flag) !== 'false'; } catch (_) { available = false; }
  function getItem(key) { if (!enabled || !available) return null; try { return localStorage.getItem(key); } catch (_) { available = false; return null; } }
  function setItem(key, value) { if (!enabled || !available) return; try { localStorage.setItem(key, value); } catch (_) { available = false; } }
  function removeItem(key) { try { localStorage.removeItem(key); } catch (_) { available = false; } }
  function clear() { keys.forEach(removeItem); }
  function setEnabled(value) {
    enabled = value;
    try { localStorage.setItem(flag, String(value)); } catch (_) { available = false; }
    if (!value) clear();
  }
  return {getItem,setItem,removeItem,clear,setEnabled,get enabled(){return enabled},get available(){return available}};
})();
