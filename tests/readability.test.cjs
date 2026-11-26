const fs=require('fs'),vm=require('vm'),assert=require('assert');
const load=require('./load-app.cjs');
const ctx=load('EpicMap/app.js');
vm.runInContext('window.READ_TEST={draw,frame,locationGroups,READ,getHits:()=>labelHits};',ctx);
const t=ctx.window.READ_TEST,api=ctx.window.EPICMAP;
assert(!api.S.layers.areas&&!api.S.layers.roads&&!api.S.layers.exits&&!api.S.layers.roomLabels&&!api.S.night&&!api.S.fx);
assert(api.S.layers.areaLabels&&api.S.layers.huntLabels&&api.S.layers.zoneFill&&api.S.layers.selectedExits);
const beach=t.locationGroups.roomGroup.get(5215),woods=t.locationGroups.roomGroup.get(5225);
assert.equal(beach.name,'South Beach');assert.equal(woods.name,'Coastal Woods');assert.notEqual(beach.color,woods.color);
for(const id of beach.rooms)assert.equal(t.locationGroups.roomGroup.get(id),beach);
for(const group of t.locationGroups.groups)for(const part of group.parts){assert(part.poly.length>=3);for(const id of part.ids)assert(group.rooms.includes(id));}
const docs=ctx.document;for(const id of ['top','left','right','minimapWrap'])docs.getElementById(id).getBoundingClientRect=()=>({width:0,height:0,left:0,top:0});
for(const z of [.03,.12,.5,1.4,3]){api.cam.z=z;api.cam.x=8200;api.cam.y=13360;t.draw();}
const hits=t.getHits();assert(hits.length>0,'labels should be placed at detail zoom');
const names=hits.map(h=>h.html);assert(names.some(n=>n.includes('Warrens')||n.includes('Coastal Woods')||n.includes('South Beach')));
const mctx=docs.getElementById('map').getContext('2d');let labels=t.READ.placeLabels(mctx,[{text:'South Beach',size:13,pri:4,bounds:[300,300,400,500],col:'#75d7ee'}],[[300,300,310,310],[390,490,405,505]],1000,800);
assert.equal(labels.length,1);assert(!t.READ.intersects(labels[0].box,[300,300,310,310]));
api.S.layers.roomLabels=true;t.draw();api.S.layers.roomLabels=false;api.S.layers.areaLabels=false;api.S.layers.huntLabels=false;api.S.layers.townLabels=false;api.S.layers.liveLabels=false;t.draw();assert.equal(t.getHits().length,0,'label layers must be independently disabled');
api.S.layers.exits=true;api.S.layers.areas=true;t.draw();docs.getElementById('readableDefaults').onclick();assert(!api.S.layers.exits&&!api.S.layers.areas&&api.S.layers.areaLabels);
let drawCount=0;const canvas=docs.getElementById('map').getContext('2d');canvas.clearRect=()=>drawCount++;t.frame(0);t.frame(10);t.frame(20);t.frame(34);assert.equal(drawCount,2,'30fps frame limit');ctx.document.hidden=true;t.frame(100);assert.equal(drawCount,2,'hidden tab skips drawing');
console.log(JSON.stringify({passed:true,locationGroups:t.locationGroups.groups.length,beachRooms:beach.rooms.length,checks:'Quiet defaults, consistent location colors, connected shading, named detail labels, label/node avoidance, separate label layers, reset preset, frame cap and hidden tab rendering'}));
