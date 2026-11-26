'use strict';
(() => {
  const api = window.EPICMAP, store = window.EpicPrefs;
  const {S, cam, tgt, live} = api;
  const $ = id => document.getElementById(id);
  const key = 'epicmap.preferences.v1';
  const defaults = JSON.parse(JSON.stringify(api.defaultPreferences));
  const toggle = $('rememberPreferences'), status = $('preferencesStatus');
  let timer;
  const bools = ['strict','night','fx','tilt','follow','trail','autoArea'];
  const bounded = (v,lo,hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
  function panel(id, hidden) {
    const button = $(hidden ? (id === 'left' ? 'hideLeft' : 'hideMinimap') : (id === 'left' ? 'showLeft' : 'showMinimap'));
    if ($(id).hidden !== hidden) button.click();
  }
  function apply(p, restoreView = true) {
    if (!p || typeof p !== 'object' || Array.isArray(p)) return;
    if (bounded(p.lvMin,0,120)) S.lvMin = p.lvMin;
    if (bounded(p.lvMax,0,120)) S.lvMax = Math.max(S.lvMin,p.lvMax);
    S.lvMax = Math.max(S.lvMin,S.lvMax);
    if (typeof p.region === 'string' && [...$('regionSel').options].some(o=>o.value===p.region)) S.region = p.region;
    for (const name of bools) if (typeof p[name] === 'boolean') S[name] = p[name];
    if (p.layers && typeof p.layers === 'object') for (const name of Object.keys(S.layers)) if (typeof p.layers[name] === 'boolean') S.layers[name] = p.layers[name];
    if ([0,30,60,120,300,600].includes(p.trailFadeSec)) S.trailFadeSec = p.trailFadeSec;
    if (p.pinned === null || (typeof p.pinned === 'string' && p.pinned.length <= 100)) live.pinned = p.pinned;
    if (['illustrated','atlas','original'].includes(p.worldStyle)) S.worldStyle = p.worldStyle;
    $('worldStyle').value = S.worldStyle;
    if (restoreView && p.view && bounded(p.view.x,-api.worldWidth,api.worldWidth*2) && bounded(p.view.y,-api.worldHeight,api.worldHeight*2) && bounded(p.view.z,api.zoomMin,api.zoomMax)) api.restoreView(p.view);
    $('lvMin').value = S.lvMin; $('lvMax').value = S.lvMax; $('regionSel').value = S.region; $('strict').checked = S.strict;
    for (const [id,name] of [['optNight','night'],['optFx','fx'],['optTrail','trail'],['optAutoArea','autoArea']]) $(id).checked = S[name];
    $('trailFade').value = String(S.trailFadeSec);
    document.querySelectorAll('[data-l]').forEach(el=>el.checked=!!S.layers[el.dataset.l]);
    document.body.classList.toggle('tilt',S.tilt); $('btnTilt').classList.toggle('on',S.tilt); $('grain').style.display = S.fx ? '' : 'none';
    $('areaNight').checked = p.areaNight === true;
    api.updateFollowControls(); api.renderHunt();
    if (typeof p.leftHidden === 'boolean') panel('left',p.leftHidden);
    if (typeof p.minimapHidden === 'boolean') panel('minimapWrap',p.minimapHidden);
    if (['hunt','layers','live'].includes(p.tab)) document.querySelector('.tabs [data-tab="'+p.tab+'"]').click();
  }
  function snapshot() {
    return {...Object.fromEntries(['lvMin','lvMax','region','trailFadeSec','worldStyle',...bools].map(k=>[k,S[k]])), layers:{...S.layers}, pinned:live.pinned || null,
      view:api.viewDestination(), areaNight:$('areaNight').checked, leftHidden:$('left').hidden, minimapHidden:$('minimapWrap').hidden,
      tab:document.querySelector('.tabs button.on')?.dataset.tab || 'hunt'};
  }
  function feedback() {
    toggle.checked = store.enabled;
    status.textContent = !store.available ? 'Browser storage is unavailable. Settings work for this visit only.' : store.enabled ? 'Preferences are saved automatically in this browser.' : 'Saving is off. Settings apply for this visit only.';
  }
  function save() { clearTimeout(timer); store.setItem(key,JSON.stringify(snapshot())); feedback(); }
  function schedule() { clearTimeout(timer); timer = setTimeout(save,400); }
  let saved;
  try { saved = JSON.parse(store.getItem(key)); } catch (_) { /* Invalid saved data leaves defaults intact. */ }
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) saved = null;
  // Explicit view links override only the remembered camera and tilt.
  const qs = new URLSearchParams(location.search);
  if (saved && qs.has('tilt')) saved.tilt = S.tilt;
  if (saved && qs.has('follow')) saved.follow = S.follow;
  apply(saved,!qs.has('view'));
  feedback();
  toggle.addEventListener('change',()=>{ store.setEnabled(toggle.checked); if (store.enabled) save(); else feedback(); });
  $('savePreferences').addEventListener('click',()=>{store.setEnabled(true);save();if(store.available) status.textContent='Preferences saved in this browser.';});
  $('resetPreferences').addEventListener('click',()=>{
    clearTimeout(timer); store.clear();
    apply({...defaults,view:api.defaultView(),pinned:null,leftHidden:false,minimapHidden:false,tab:'layers',areaNight:false});
    save(); if (store.available) status.textContent='Preferences reset to defaults.';
  });
  for (const type of ['change','click','pointerup','wheel','keydown']) document.addEventListener(type,schedule,{passive:true});
  addEventListener('pagehide',save);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)save();});
})();
