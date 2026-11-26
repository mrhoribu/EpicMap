const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const load=require('./load-app.cjs');
function session(){
  const context=load(process.env.EPICMAP_TEST_APP||'EpicMap/app.js');
  vm.runInContext('window.NAV_TEST={followTo,step,zoomAt,area:()=>A,setAreaZoom:z=>A.z=z};',context);
  const api=context.window.EPICMAP;
  api.live.host=api.live.pinned='Vaelgore';
  const mapped=api.rooms.filter(r=>r.xy&&!r.ax),first=mapped[0];
  const next=mapped.find(r=>r.im!==first.im),third=mapped.find(r=>r.im!==first.im&&r.im!==next.im);
  api.setCharPos('Vaelgore',first.id,first.t);
  return{context,api,nav:context.window.NAV_TEST,first,next,third};
}
test('map following retains every selected zoom, including wide overview',()=>{
  const{api,next,nav}=session();api.S.follow=true;api.S.autoArea=true;
  for(const z of [.003,.035,.4,2.8,7]){api.restoreView({x:0,y:0,z});nav.followTo(next.xy);assert.equal(api.viewDestination().z,z)}
});
test('position updates preserve requested zoom rather than an intermediate scale',()=>{
  const{api,next}=session();api.S.follow=true;api.restoreView({x:0,y:0,z:.2});api.tgt.z=.73;
  api.setCharPos('Vaelgore',next.id,next.t);assert.equal(api.viewDestination().z,.73);
});
test('long follow pans do not zoom out, including another update mid-flight',()=>{
  const{api,context,nav,next,third}=session();api.S.follow=true;api.restoreView({x:-40000,y:-40000,z:.4});
  api.setCharPos('Vaelgore',next.id,next.t);vm.runInContext('now=600;',context);nav.step();
  assert.ok(Math.abs(api.cam.z-.4)<1e-10);api.setCharPos('Vaelgore',third.id,third.t);assert.equal(api.viewDestination().z,.4);
});
test('optional initial room zoom applies only when explicitly enabling Follow',()=>{
  const{api,next}=session();api.restoreView({x:0,y:0,z:.02});api.setFollow(true);assert.equal(api.viewDestination().z,1.1);
  api.restoreView({x:0,y:0,z:.06});api.setCharPos('Vaelgore',next.id,next.t);assert.equal(api.viewDestination().z,.06);
  api.S.autoArea=false;api.setFollow(false);api.setFollow(true);assert.equal(api.viewDestination().z,.06);
});
test('drag retains Follow, yields to the gesture, and resumes on the next move',()=>{
  const{api,context,first,next,third}=session();api.S.autoArea=false;
  api.restoreView({x:first.xy[0],y:first.xy[1],z:.2});api.setFollow(true);
  const cv=context.document.getElementById('map'),e={pointerId:1,clientX:600,clientY:450};
  cv.dispatch('pointerdown',e);cv.dispatch('pointermove',{...e,clientX:680,clientY:480});
  const panned={...api.viewDestination()};assert.equal(api.S.follow,true);assert.equal(api.live.pinned,'Vaelgore');
  api.setCharPos('Vaelgore',next.id,next.t);assert.deepEqual({...api.viewDestination()},panned);
  cv.dispatch('pointerup',{...e,clientX:680,clientY:480});api.setCharPos('Vaelgore',third.id,third.t);
  assert.equal(api.S.follow,true);assert.deepEqual([api.viewDestination().x,api.viewDestination().y],[...third.xy]);
  assert.equal(api.viewDestination().z,.2);
});
test('area transitions and reopening retain local zoom, including focused rooms',()=>{
  const{api,context,nav,first,next}=session();api.openArea(first.im);context.flushFrames();nav.setAreaZoom(2.4);
  api.openArea(next.im,next.id);context.flushFrames();assert.equal(nav.area().z,2.4);
  context.document.getElementById('areaDlg').close();api.openArea(first.im);context.flushFrames();assert.equal(nav.area().z,2.4);
});
test('stale area callbacks cannot overwrite the newest map',()=>{
  const{api,context,nav,first,next}=session();api.openArea(first.im);api.openArea(next.im);context.flushFrames();
  assert.equal(nav.area().i,next.im);assert.ok(Number.isFinite(nav.area().z));
});
