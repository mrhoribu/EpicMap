/* Elanthia Epic Map — read-only viewer. Never sends game commands. */
'use strict';
const G=window.GS4MAP, $=id=>document.getElementById(id);
const K=G.meta.K, WORLD_W=G.meta.baseW*K, WORLD_H=G.meta.baseH*K;
const rooms=G.rooms, images=G.images, zones=G.zones;
const byId=new Map(); rooms.forEach((r,i)=>{byId.set(r.id,i)});
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)), lerp=(a,b,t)=>a+(b-a)*t, smooth=t=>t*t*(3-2*t);
// State
const S={lvMin:55,lvMax:65,strict:false,region:'',night:false,fx:false,tilt:false,follow:false,trail:true,trailFadeSec:120,autoArea:true,worldStyle:'illustrated',
  layers:{base:true,areas:false,roads:false,rooms:true,exits:false,selectedExits:true,zoneFill:true,
    hunt:true,huntGlow:true,towns:true,svc:false,guild:false,shops:false,areaLabels:true,huntLabels:true,townLabels:true,roomLabels:false,liveLabels:true}};
const DEFAULT_LAYERS={...S.layers};
const defaultPreferences = JSON.parse(JSON.stringify(S));
const LAYERS=[
  ['base','World artwork','#c9a35c'],['areas','Original map images (baked-in text)','#e8dcc2'],
  ['zoneFill','Location shading','#94dfc1'],['rooms','Room nodes','#d6e3ec'],
  ['exits','All room connections','#adc7d4'],['selectedExits','Selected room connections','#fff1ba'],
  ['roads','Static links between maps','#e3c68f'],['hunt','Hunting markers','#a8e3b4'],['huntGlow','In-range hunting glow','#62f0a4'],
  ['towns','Town markers','#ffe2a0'],['svc','Service markers','#88e8ec'],
  ['guild','Guild markers','#efcf93'],['shops','Player shops','#ffd4e0'],
  ['areaLabels','Location / area names','#94dfc1'],['huntLabels','Hunting names and levels','#a8e3b4'],
  ['townLabels','Town names','#ffe2a0'],['roomLabels','Individual room names (busy)','#f1f5f9'],
  ['liveLabels','Character names','#ffd6fb']
];
const READ=window.EpicReadability;
const locationGroups=READ.buildGroups(G);
// zone membership per room
const roomZone=new Map(); zones.forEach((z,zi)=>z.rooms.forEach(id=>{if(!roomZone.has(id))roomZone.set(id,[]);roomZone.get(id).push(zi)}));
function roomXY(r){ if(r.xy) return r.xy; if(r.near!=null){const n=rooms[byId.get(r.near)]; if(n&&n.xy) return n.xy;} if(r.im!=null){const im=images[r.im]; if(im.x==null&&im.parent>=0){const p=images[im.parent];return [p.x+p.w*p.s/2,p.y+p.h*p.s/2]}} return null }
// spatial grid for rooms
const CELL=600, grid=new Map();
rooms.forEach((r,i)=>{if(!r.xy)return;const k=Math.floor(r.xy[0]/CELL)+','+Math.floor(r.xy[1]/CELL);(grid.get(k)||grid.set(k,[]).get(k)).push(i)});
// edges (same image, exact coords)
const edges=[];{const seen=new Set();rooms.forEach((r,i)=>{if(!r.xy||r.ax||!r.w)return;for(const t of r.w){const j=byId.get(t);if(j==null)continue;const q=rooms[j];if(!q.xy||q.ax||q.im!==r.im)continue;const key=i<j?i+'_'+j:j+'_'+i;if(seen.has(key))continue;seen.add(key);const dx=q.xy[0]-r.xy[0],dy=q.xy[1]-r.xy[1];if(dx*dx+dy*dy>260*260)continue;edges.push(i,j)}})}
const egrid=new Map();for(let e=0;e<edges.length;e+=2){const r=rooms[edges[e]];const k=Math.floor(r.xy[0]/CELL)+','+Math.floor(r.xy[1]/CELL);(egrid.get(k)||egrid.set(k,[]).get(k)).push(e)}
// Canvas
const cv=$('map'), ctx=cv.getContext('2d'); let W=0,H=0,DPR=1;
const cam={x:WORLD_W*0.36,y:WORLD_H*0.42,z:0.03}, tgt={x:cam.x,y:cam.y,z:cam.z}; let fly=null;
const ZMIN=0.003, ZMAX=7;
function fitWorld(){return Math.min(W/(WORLD_W*0.82),H/(WORLD_H*0.9))}
function resize() {
  DPR = Math.min(2, devicePixelRatio || 1);
  W = cv.clientWidth;
  H = cv.clientHeight;
  cv.width = W * DPR;
  cv.height = H * DPR;
}
addEventListener('resize',resize);resize();
const w2s=(x,y)=>[(x-cam.x)*cam.z+W/2,(y-cam.y)*cam.z+H/2], s2w=(x,y)=>[(x-W/2)/cam.z+cam.x,(y-H/2)/cam.z+cam.y];
// tilt-aware pointer mapping (inverse of CSS 3D transform)
function screenToCanvas(cx,cy){ if(!S.tilt) return [cx,cy];
  const plane=$('plane'), st=$('stage').getBoundingClientRect(), ox=st.width/2, oy=st.height/2;
  const M=new DOMMatrix(getComputedStyle(plane).transform), P=new DOMMatrix(); P.m34=-1/1400;
  const F=new DOMMatrix().translate(ox,oy).multiply(P).multiply(M).translate(-ox,-oy);
  const sx=cx-st.left, sy=cy-st.top;
  const a=F.m11-sx*F.m14,b=F.m21-sx*F.m24,c=sx*F.m44-F.m41,d=F.m12-sy*F.m14,e=F.m22-sy*F.m24,f=sy*F.m44-F.m42;
  const det=a*e-b*d; if(Math.abs(det)<1e-9) return [cx,cy]; return [(c*e-b*f)/det,(a*f-c*d)/det] }
// Assets
const IMG=new Map(); let pending=0;
function getImg(src) {
  let o = IMG.get(src);
  if (o) return o.ok ? o.img : null;

  const img = new Image();
  o = { img, ok: false };
  IMG.set(src, o);
  pending++;
  img.onload = () => { o.ok = true; pending--; };
  img.onerror = () => { pending--; };
  img.src = src;
  return null;
}
const baseNight='world/elanthia_night.jpg', baseHD='world/elanthia_hd.jpg';
const baseIllustrated='world/elanthia_illustrated.png';
// pre-render textures
function makeNoise(size,alpha){const c=document.createElement('canvas');c.width=c.height=size;const x=c.getContext('2d'),d=x.createImageData(size,size);for(let i=0;i<d.data.length;i+=4){const v=Math.random()*255;d.data[i]=v;d.data[i+1]=v*.9;d.data[i+2]=v*.7;d.data[i+3]=alpha*Math.random()}x.putImageData(d,0,0);return c}
const noiseTex=makeNoise(256,26);
function makeCloud(){const c=document.createElement('canvas');c.width=c.height=512;const x=c.getContext('2d');for(let i=0;i<26;i++){const px=128+Math.random()*256,py=128+Math.random()*256,r=60+Math.random()*120;const g=x.createRadialGradient(px,py,0,px,py,r);g.addColorStop(0,'rgba(170,190,210,.05)');g.addColorStop(1,'rgba(170,190,210,0)');x.fillStyle=g;x.fillRect(0,0,512,512)}return c}
const clouds=[...Array(9)].map(()=>({c:makeCloud(),x:Math.random()*WORLD_W,y:Math.random()*WORLD_H,s:9000+Math.random()*14000,v:20+Math.random()*40}));
const embers=[...Array(70)].map(()=>({x:Math.random(),y:Math.random(),v:.02+Math.random()*.05,p:Math.random()*6.28,r:.6+Math.random()*1.8}));
function glowDot(color){const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d');const g=x.createRadialGradient(64,64,0,64,64,64);g.addColorStop(0,color);g.addColorStop(.18,color);g.addColorStop(.35,color.replace(/[\d.]+\)$/,'0.35)'));g.addColorStop(1,color.replace(/[\d.]+\)$/,'0)'));x.fillStyle=g;x.fillRect(0,0,128,128);return c}
const GLOW={in:glowDot('rgba(98,240,164,1)'),hot:glowDot('rgba(255,90,74,1)'),cold:glowDot('rgba(127,166,201,1)'),town:glowDot('rgba(242,197,107,1)'),you:glowDot('rgba(255,61,242,1)'),sel:glowDot('rgba(255,236,170,1)'),svc:glowDot('rgba(79,214,232,1)')};
// Hunting logic
function crStatus(lv) {
  return lv < S.lvMin ? 'cold' : lv > S.lvMax ? 'hot' : 'in';
}
function zoneStatus(z) {
  const count = z.cr.filter(c => crStatus(c.lv) === 'in').length;
  if (S.strict) {
    if (z.cr.length && count === z.cr.length) return 'in';
    return z.hi > S.lvMax ? 'hot' : 'cold';
  }
  if (count > 0) return 'in';
  return z.lo > S.lvMax ? 'hot' : z.hi < S.lvMin ? 'cold' : 'hot';
}
function zoneScore(z) {
  const inn = z.cr.filter(c => crStatus(c.lv) === 'in');
  const mid = (S.lvMin + S.lvMax) / 2;
  return inn.length * 10
    - Math.abs(inn.reduce((a, c) => a + c.lv, 0) / Math.max(1, inn.length) - mid)
    - (z.hi > S.lvMax + 5 ? 6 : 0);
}
let zoneStat=[];function recomputeZones(){zoneStat=zones.map(zoneStatus)}
// Render
let T0=performance.now(), now=0, hover=null, selected=null;
function tier(){const z=cam.z;return z<0.05?'WORLD':z<0.16?'REGION':z<0.75?'AREA':'ROOM'}
// Render only the visible map, with names kept outside room groups.
let labelHits = [];
function draw() {
  ctx.setTransform(DPR,0,0,DPR,0,0);
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle='#101c2a';ctx.fillRect(0,0,W,H);
  const z=cam.z,t=now/1000;
  const x0=cam.x-W/2/z,y0=cam.y-H/2/z,x1=cam.x+W/2/z,y1=cam.y+H/2/z;
  const visible=(x,y,w,h)=>x<x1&&x+w>x0&&y<y1&&y+h>y0;
  const detail=smooth(clamp((z-.08)/.2,0,1));
  const candidates=[],obstacles=[],visibleRooms=[];
  ctx.save();ctx.translate(W/2,H/2);ctx.scale(z,z);ctx.translate(-cam.x,-cam.y);

  if(S.layers.base){
    ctx.globalAlpha=1-detail*.96;
    if(S.worldStyle==='illustrated'){
      const image=getImg(baseIllustrated);
      if(image){ctx.drawImage(image,0,0,WORLD_W,WORLD_H);ctx.save();ctx.globalAlpha*=.14;ctx.fillStyle='#07131b';ctx.fillRect(0,0,WORLD_W,WORLD_H);ctx.restore();}
      else window.EpicWorldMap.draw(ctx,WORLD_W,WORLD_H,{labels:false});
    }
    else if(S.worldStyle==='atlas')window.EpicWorldMap.draw(ctx,WORLD_W,WORLD_H,{labels:false});
    else{const image=getImg(z>.05?baseHD:baseNight)||getImg(baseNight);if(image)ctx.drawImage(image,0,0,WORLD_W,WORLD_H);}
    ctx.globalAlpha=1;
  }
  if(S.layers.areas){const alpha=smooth(clamp((z-.035)/.06,0,1));
    for(const im of images){if(im.x==null||!visible(im.x,im.y,im.w*im.s,im.h*im.s))continue;
      const source=getImg((S.night?'night/':'maps/')+im.b+'.webp');
      if(source){ctx.globalAlpha=alpha*.9;ctx.drawImage(source,im.x,im.y,im.w*im.s,im.h*im.s);ctx.globalAlpha=1;}}}

  const gx0=Math.floor(x0/CELL),gx1=Math.floor(x1/CELL),gy0=Math.floor(y0/CELL),gy1=Math.floor(y1/CELL);
  if(z>.18)for(let gx=gx0;gx<=gx1;gx++)for(let gy=gy0;gy<=gy1;gy++)for(const i of grid.get(gx+','+gy)||[]){
    const r=rooms[i];if(r.ax||r.xy[0]<x0||r.xy[0]>x1||r.xy[1]<y0||r.xy[1]>y1)continue;
    visibleRooms.push(i);const [sx,sy]=w2s(...r.xy);obstacles.push([sx-6,sy-6,sx+6,sy+6]);}

  if(z>.18&&(S.layers.zoneFill||S.layers.areaLabels||S.layers.huntGlow)) {
    for(const group of locationGroups.groups){
      const im=images[group.im];if(!im||im.x==null||!visible(im.x,im.y,im.w*im.s,im.h*im.s))continue;
      let best=null;
      for(const part of group.parts){const [a,b,c,d]=part.bounds;if(!visible(a,b,c-a,d-b))continue;
        if(!best||part.ids.length>best.ids.length)best=part;
        if(S.layers.zoneFill){ctx.beginPath();part.poly.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();
          ctx.fillStyle=group.color+'20';ctx.fill();ctx.strokeStyle=group.color+'70';ctx.lineWidth=1/z;ctx.stroke();}
        if(S.layers.huntGlow&&part.ids.some(id=>(roomZone.get(id)||[]).some(i=>zoneStat[i]==='in'&&(!S.region||zones[i].region===S.region)))){
          ctx.save();ctx.beginPath();part.poly.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();
          ctx.globalAlpha=.62+.15*Math.sin(t*2.2);ctx.strokeStyle='#62f0a4';ctx.lineWidth=1.8/z;
          ctx.shadowColor='#62f0a4';ctx.shadowBlur=12;ctx.stroke();ctx.restore();
        }
}
      if(best&&S.layers.areaLabels){const [a,b,c,d]=best.bounds,p=w2s(a,b),q=w2s(c,d);
        candidates.push({text:group.name,sub:null,col:group.color,size:13,pri:4,bounds:[p[0],p[1],q[0],q[1]],
          mapId:group.im,anchor:[(p[0]+q[0])/2,(p[1]+q[1])/2],sel:{type:'room',i:byId.get(best.ids[0])}});}
    }
  }

  // Inter-area links stay still and are drawn once per pair of maps.
  if(S.layers.roads&&z>.03&&z<.75){const seen=new Set();ctx.strokeStyle='#e3c68f66';ctx.lineWidth=1.2/z;
    const selectedImage=selected?.type==='image'?selected.i:selected?.type==='room'?rooms[selected.i]?.im:null;
    for(const [a,b,ra,rb] of G.cross){const key=[a,b].sort((a,b)=>a-b).join(':');if(seen.has(key))continue;
      if(selectedImage!=null&&a!==selectedImage&&b!==selectedImage)continue;
      const p=rooms[byId.get(ra)],q=rooms[byId.get(rb)];if(!p?.xy||!q?.xy)continue;seen.add(key);
      ctx.beginPath();ctx.moveTo(...p.xy);ctx.lineTo(...q.xy);ctx.stroke();}}

  if(S.layers.exits&&z>.22){ctx.strokeStyle='#adc7d466';ctx.lineWidth=1/z;ctx.beginPath();
    for(let gx=gx0;gx<=gx1;gx++)for(let gy=gy0;gy<=gy1;gy++)for(const e of egrid.get(gx+','+gy)||[]){
      ctx.moveTo(...rooms[edges[e]].xy);ctx.lineTo(...rooms[edges[e+1]].xy);}ctx.stroke();}
  if(S.layers.selectedExits&&selected?.type==='room'){
    const r=rooms[selected.i];if(r.xy){ctx.strokeStyle='#fff1ba';ctx.lineWidth=2/z;ctx.beginPath();
      for(const id of r.w||[]){const q=rooms[byId.get(id)];if(q?.xy&&q.im===r.im){ctx.moveTo(...r.xy);ctx.lineTo(...q.xy);}}ctx.stroke();}}

  if(S.layers.rooms&&z>.18){const size=Math.max(5,4/z);
    for(const i of visibleRooms){const r=rooms[i],group=locationGroups.roomGroup.get(r.id);
      let color=group?.color||'#d6e3ec';
      if(r.f&1&&S.layers.guild)color='#efcf93';
      if(r.f&2&&S.layers.shops)color='#ffd4e0';
      if(r.sv&&S.layers.svc)color='#88e8ec';
      if(r.f&4&&S.layers.towns)color='#ffe2a0';
      ctx.fillStyle=color;ctx.strokeStyle='#09121e';ctx.lineWidth=1.4/z;
      ctx.fillRect(r.xy[0]-size/2,r.xy[1]-size/2,size,size);ctx.strokeRect(r.xy[0]-size/2,r.xy[1]-size/2,size,size);
      if(S.layers.roomLabels&&z>1.2){const [sx,sy]=w2s(...r.xy);candidates.push({x:sx+14,y:sy,text:r.t.replace(/^\[|\]$/g,''),col:'#f1f5f9',size:11,pri:1,sel:{type:'room',i}});}
    }
  }
  ctx.restore();

  if(S.layers.base&&S.worldStyle!=='original'&&S.layers.areaLabels&&z<.12){
    for(const[text,x,y,size]of window.EpicWorldMap.labels){const[sx,sy]=w2s(x*K,y*K);
      if(sx<0||sy<0||sx>W||sy>H)continue;
      candidates.push({x:sx,y:sy,text,size:Math.min(size,14),pri:0,col:'#ddd8bd',serif:true,atlas:true});
    }
  }
  if(S.layers.hunt||S.layers.huntLabels||S.layers.huntGlow){
    zones.forEach((zone,i)=>{if(zone.x==null||(S.region&&zone.region!==S.region))return;
      const status=zoneStat[i];if(z<.12&&status!=='in')return;
      const name=zone.name.replace(/^.*?,\s*/,'');
      const existing=S.layers.huntLabels&&candidates.find(c=>c.mapId===zone.im&&c.text.toLowerCase()===name.toLowerCase());
      if(existing){existing.levelLow=Math.min(existing.levelLow??zone.lo,zone.lo);existing.levelHigh=Math.max(existing.levelHigh??zone.hi,zone.hi);existing.sub='Lv '+existing.levelLow+'–'+existing.levelHigh;}
      const [sx,sy]=w2s(zone.x,zone.y);
      if(sx<-50||sy<-50||sx>W+50||sy>H+50)return;
      const group=locationGroups.roomGroup.get(zone.go),color=group?.color||(status==='in'?'#a8e3b4':status==='hot'?'#ffb59e':'#b6cddd');
      if(S.layers.huntGlow&&status==='in'){
        const radius=(z<.18?23:15)*(1+.1*Math.sin(t*2.2+i));
        ctx.save();ctx.globalAlpha=z<.18?.8:.52;ctx.drawImage(GLOW.in,sx-radius,sy-radius,radius*2,radius*2);
        ctx.globalAlpha=.9;ctx.strokeStyle='#9effc6';ctx.lineWidth=1.3;ctx.beginPath();ctx.arc(sx,sy,z<.18?7:4,0,Math.PI*2);ctx.stroke();ctx.restore();
      }
      if(S.layers.hunt&&z<.18){ctx.beginPath();ctx.arc(sx,sy,status==='in'?5:3,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();ctx.lineWidth=1.5;ctx.strokeStyle='#0a1521';ctx.stroke();obstacles.push([sx-7,sy-7,sx+7,sy+7]);}
      if(S.layers.huntLabels&&!existing)candidates.push({x:sx,y:sy-18,text:name,sub:'Lv '+zone.lo+'–'+zone.hi,col:color,size:12,pri:status==='in'?3:2,anchor:[sx,sy],sel:{type:'zone',i}});
    });
  }

  if(S.layers.towns&&z<.9)for(const town of G.towns){const [sx,sy]=w2s(town.x,town.y);if(sx<0||sy<0||sx>W||sy>H)continue;
    ctx.save();ctx.translate(sx,sy);ctx.rotate(Math.PI/4);ctx.fillStyle='#ffe2a0';ctx.strokeStyle='#08131e';ctx.lineWidth=2;ctx.fillRect(-5,-5,10,10);ctx.strokeRect(-5,-5,10,10);ctx.restore();obstacles.push([sx-8,sy-8,sx+8,sy+8]);
    if(S.layers.townLabels)candidates.push({x:sx,y:sy-18,text:town.n,pri:7,col:'#ffe2a0',size:14,serif:true,sel:{type:'town',t:town}});}
  drawLive(candidates,t);
  if(!S.layers.liveLabels)for(let i=candidates.length-1;i>=0;i--)if(candidates[i].pri===9)candidates.splice(i,1);

  if(selected){const p=selXY(selected);if(p){const [x,y]=w2s(...p);ctx.strokeStyle='#fff2b8';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,10,0,Math.PI*2);ctx.stroke();}}
  const reserved=[];
  for(const id of ['top','left','right','minimapWrap','showLeft','showMinimap']){const el=$(id);if(el.hidden)continue;if(id==='right'&&el.classList.contains('closed'))continue;const b=el.getBoundingClientRect();if(b.width&&b.height)reserved.push([b.left,b.top,b.right??b.left+b.width,b.bottom??b.top+b.height]);}
  const placed=READ.placeLabels(ctx,candidates,obstacles,W,H,reserved);labelHits=[];
  for(const label of placed){const [a,b,c,d]=label.box;
    if(label.anchor){ctx.strokeStyle=label.col+'88';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(...label.anchor);ctx.lineTo(label.cx,label.cy);ctx.stroke();}
    if(!label.atlas){ctx.fillStyle='#09131ff2';ctx.fillRect(a,b,c-a,d-b);ctx.strokeStyle=label.col+'88';ctx.lineWidth=1;ctx.strokeRect(a,b,c-a,d-b);}
    ctx.font=`${label.serif?'600 ':''}${label.size||12}px ${label.serif?'Georgia,serif':'Segoe UI,sans-serif'}`;ctx.textAlign='center';ctx.fillStyle=label.col;
    ctx.fillText(label.text,label.cx,b+17);if(label.sub){ctx.font='11px Segoe UI';ctx.fillStyle='#f0f4f7';ctx.fillText(label.sub,label.cx,b+32);}
    if(label.sel)labelHits.push({box:label.box,sel:label.sel,html:'<b>'+esc(label.text)+'</b>'+(label.sub?'<br>'+esc(label.sub):'')});
  }
}

// Live tracking
const live={chars:new Map(),connected:false,lastOk:0,colors:['#ff3df2','#3df2ff','#ffd93d','#7dff6a','#ff8a3d']};
function charColor(name) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return live.colors[h % live.colors.length];
}
function drawLive(labels,t){for(const [name,c] of live.chars){if(!c.pos)continue;
  if(c.disp==null)c.disp=[...c.pos];c.disp[0]=lerp(c.disp[0],c.pos[0],.18);c.disp[1]=lerp(c.disp[1],c.pos[1],.18);
  const col=charColor(name);
  if (S.trail) drawTrail(c, col);
  const [sx,sy]=w2s(c.disp[0],c.disp[1]);
  if(S.fx)for(let k=0;k<3;k++){const ph=((t*0.8+k/3)%1);ctx.strokeStyle=col;ctx.globalAlpha=(1-ph)*.8;ctx.lineWidth=2;ctx.beginPath();ctx.arc(sx,sy,8+ph*38,0,6.283);ctx.stroke()}
  ctx.globalAlpha=1;if(S.fx)ctx.drawImage(GLOW.you,sx-26,sy-26,52,52);
  ctx.fillStyle=col;ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(sx,sy-11);ctx.lineTo(sx+8,sy+7);ctx.lineTo(sx,sy+3);ctx.lineTo(sx-8,sy+7);ctx.closePath();ctx.fill();ctx.stroke();
  labels.push({x:sx,y:sy-22,text:name+(c.inside?' (inside)':''),pri:9,col:'#ffd6fb',size:13,serif:true})}}
// Keep step ages when the server repeats its recent-room list.
function syncTrail(c, incoming, timestamp) {
  const previous = c.trail || [];
  const times = c.trailTimes || [];
  let overlap = Math.min(previous.length, incoming.length);
  while (overlap > 0) {
    let matches = true;
    for (let i = 0; i < overlap; i++) {
      if (previous[previous.length - overlap + i] !== incoming[i]) {
        matches = false;
        break;
      }
    }
    if (matches) break;
    overlap--;
  }
  c.trail = incoming.slice();
  c.trailTimes = times.slice(previous.length - overlap)
    .concat(incoming.slice(overlap).map(() => timestamp));
}

function visibleTrail(c, timestamp = Date.now()) {
  const lifetime = S.trailFadeSec * 1000;
  return c.trail.map((id, i) => {
    const time = c.trailTimes?.[i] ?? timestamp;
    const alpha = lifetime ? clamp(1 - (timestamp - time) / lifetime, 0, 1) : 1;
    return { id, alpha, time };
  }).filter(step => step.alpha > 0 && step.time > (c.trailResetAt ?? -1));
}

function drawTrail(c, color) {
  const pts = visibleTrail(c).map(step => {
    const room = rooms[byId.get(step.id)];
    const point = room && roomXY(room);
    return point ? { point, alpha: step.alpha } : null;
  }).filter(Boolean);
  if (!pts.length) return;
  pts.push({ point: c.disp, alpha: 1 });
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let i = 1; i < pts.length; i++) {
    const a = w2s(...pts[i - 1].point), b = w2s(...pts[i].point);
    for (let pass = 0; pass < 2; pass++) {
      ctx.globalAlpha = Math.min(pts[i - 1].alpha, pts[i].alpha);
      ctx.beginPath();
      ctx.moveTo(...a);
      ctx.lineTo(...b);
      ctx.strokeStyle = pass ? color : color + '55';
      ctx.lineWidth = pass ? 2.5 : 9;
      ctx.shadowColor = color;
      ctx.shadowBlur = pass ? 8 : 0;
      ctx.stroke();
    }
  }
  for (const step of pts) {
    const [x, y] = w2s(...step.point);
    ctx.globalAlpha = step.alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function clearTrails() {
  const timestamp = Date.now();
  live.chars.forEach(c => { c.trailResetAt = timestamp; });
  toast('Trails cleared. New steps will still show.');
}

function setCharPos(name, id, title, trail) {
  let c = live.chars.get(name);
  if (!c) {
    c = { trail: [], trailTimes: [], pos: null, id: null };
    live.chars.set(name, c);
  }
  const timestamp = Date.now();
  if (Array.isArray(trail)) {
    syncTrail(c, trail.slice(-80), timestamp);
  } else if (c.id !== id && c.id != null) {
    const next = c.trail.concat(c.id).slice(-80);
    syncTrail(c, next, timestamp);
  }
  if (c.id !== id) {
    c.id = id;
    c.title = title;
    c.moved = performance.now();
    const r = rooms[byId.get(id)];
    c.pos = r ? roomXY(r) : null;
    c.inside = r && !r.xy;
    c.room = r;
    if (S.follow && name === followName() && c.pos) followTo(c.pos);
    renderLivePanel();
  }
}
function followName() {
  if (live.pinned) return live.chars.has(live.pinned) ? live.pinned : null;
  if (live.host && live.chars.has(live.host)) return live.host;
  let best = null, latest = -1;
  for (const [name, character] of live.chars) {
    if ((character.moved || 0) > latest) {
      latest = character.moved || 0;
      best = name;
    }
  }
  return best;
}

function updateFollowControls() {
  const target = followName();
  const picker = $('followCharacter');
  const options = ['<option value="">Auto' + (live.host ? ' (' + esc(live.host) + ')' : '') + '</option>'];
  for (const name of [...live.chars.keys()].sort()) {
    options.push('<option value="' + esc(name) + '">' + esc(name) + '</option>');
  }
  if (live.pinned && !live.chars.has(live.pinned)) {
    options.push('<option value="' + esc(live.pinned) + '">' + esc(live.pinned) + ' (offline)</option>');
  }
  const markup = options.join('');
  if (picker.innerHTML !== markup) picker.innerHTML = markup;
  picker.value = live.pinned || '';
  const button = $('btnFollow');
  button.classList.toggle('on', S.follow);
  button.textContent = target ? 'Follow: ' + target : 'Follow';
  button.title = target ? (S.follow ? 'Following ' : 'Follow ') + target + ' (F)' : 'Follow selected character (F)';
  $('followStatus').textContent = target
    ? (S.follow ? 'Following: ' : 'Selected: ') + target + (S.follow ? '' : ' (follow paused)')
    : live.pinned ? 'Waiting for ' + live.pinned + ' to connect.' : 'No live characters yet.';
}

function chooseFollow(name) {
  live.pinned = name || null;
  try {
    if (live.pinned) window.EpicPrefs.setItem('epicmap.followCharacter', live.pinned);
    else window.EpicPrefs.removeItem('epicmap.followCharacter');
  } catch (_) {}
  setFollow(true);
  renderLivePanel();
}
function followTo(p,initial=false){
  if(drag||pinch)return;
  const requested=fly?fly.z:tgt.z;
  const z=clamp(initial&&S.autoArea?Math.max(requested,1.1):requested,ZMIN,ZMAX);
  const dist=Math.hypot(p[0]-cam.x,p[1]-cam.y)*cam.z;
  if(dist>W*1.5)flyTo(p[0],p[1],z,1200,true);
  else{tgt.x=p[0];tgt.y=p[1];tgt.z=z;fly=null;}
}
async function poll() {
  try {
    const response = await fetch('/api/pos', { cache: 'no-store' });
    if (!response.ok) throw new Error('Position feed unavailable');
    const data = await response.json();
    live.connected = true;
    live.host = data.host;
    live.lastOk = Date.now();
    const characters = data.chars || [];
    const online = new Set(characters.filter(c => c.id != null).map(c => c.name));
    for (const name of live.chars.keys()) if (!online.has(name)) live.chars.delete(name);
    for (const c of characters) if (c.id != null) setCharPos(c.name, c.id, c.title, c.trail);
    renderLivePanel();
    liveStatus(true, data);
  } catch (_) {
    liveStatus(false);
  }
  setTimeout(poll, 700);
}
function liveStatus(ok,j){const el=$('liveStatus');el.className='livestatus '+(ok?'ok':'off');el.textContent=ok?`Connected · ${(j.chars||[]).length} character(s) · ${new Date().toLocaleTimeString()}`:'Not connected — run ;epicmap in Lich'}
function renderLivePanel() {
  const selectedName = followName();
  $('liveChars').innerHTML = [...live.chars].map(([name, c]) =>
    `<div class="char ${name === selectedName ? 'on' : ''}" data-n="${esc(name)}" role="button" tabindex="0" title="Follow ${esc(name)}"><i style="background:${charColor(name)};box-shadow:0 0 8px ${charColor(name)}"></i><b>${esc(name)}</b><small class="muted">[${c.id}] ${esc((c.title || '').slice(0, 40))}</small></div>`
  ).join('');
  document.querySelectorAll('.char').forEach(element => {
    const pick = () => {
      chooseFollow(element.dataset.n);
      const c = live.chars.get(element.dataset.n);
      if (c && c.room) select({ type: 'room', i: byId.get(c.id) }, false);
    };
    element.onclick = pick;
    element.onkeydown = event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); pick(); }
    };
  });
  updateFollowControls();
}
// demo walker (?demo=1) — simulated movement for previewing live tracking without Lich
function startDemo(){const start=byId.get(+(new URLSearchParams(location.search).get('start')||5423));let cur=rooms[start],prev=null,trail=[];
  live.chars.set('Vaelzhar (demo)',{trail:[],pos:null,id:null});
  setInterval(()=>{const opts=(cur.w||[]).map(id=>rooms[byId.get(id)]).filter(r=>r&&r.xy&&!r.ax&&r!==prev);const nx=opts.length?opts[Math.floor(Math.random()*opts.length)]:prev;if(!nx)return;prev=cur;cur=nx;setCharPos('Vaelzhar (demo)',cur.id,cur.t);liveStatus(true,{chars:[1]})},1100)}
// Selection & details
function selXY(s){if(s.type==='room')return roomXY(rooms[s.i]);if(s.type==='zone'){const z=zones[s.i];return z.x!=null?[z.x,z.y]:null}if(s.type==='town')return [s.t.x,s.t.y];if(s.type==='image'){const im=images[s.i];return im.x!=null?[im.x+im.w*im.s/2,im.y+im.h*im.s/2]:null}return null}
function go2Box(id){return `<div class="go2"><code>;go2 ${id}</code><button data-copy=";go2 ${id}">Copy</button></div>`}
function crChips(cr){return `<div class="chips">${cr.map(c=>`<span class="chip ${crStatus(c.lv)}" title="${c.src==='gswiki'?'Level from gswiki':'Level from huntplan.lic (no gswiki page found)'}">${c.url?`<a href="${c.url}" target="_blank">${esc(c.n)}</a>`:esc(c.n)} · ${c.lv}${c.src==='gswiki'?'':' *'}</span>`).join('')}</div>`}
function select(s,flyThere=true){selected=s;const d=$('detail');let h='';
  if(s.type==='room'){const r=rooms[s.i];const im=r.im!=null?images[r.im]:null;const zs=(roomZone.get(r.id)||[]).map(i=>zones[i]);
    h=`<h2>${esc(r.t)}</h2><div class="sub">Room #${r.id}${r.l?' · '+esc(r.l):''}${r.ax?' · position approximate (no drawn map)':''}${!r.xy?' · interior / pocket map':''}</div>${go2Box(r.id)}
    <div class="kv"><span>Region</span><span>${esc(im?im.region:'—')}</span><span>Area map</span><span>${im?`<a href="#" data-area="${r.im}">${esc(im.label)}</a>`:'none'}</span>${r.sv?`<span>Services</span><span>${r.sv.map(esc).join(', ')}</span>`:''}</div>
    ${zs.length?`<h5>Hunting here</h5>${zs.map(z=>`<div><a href="#" data-zone="${zones.indexOf(z)}">${esc(z.name)}</a> <span class="muted">L${z.lo}–${z.hi}</span></div>${crChips(z.cr)}`).join('')}`:''}
    <h5>Exits</h5><div class="exits">${(r.w||[]).map(id=>{const q=rooms[byId.get(id)];return q?`<div data-room="${id}"><b>#${id}</b>${esc(q.t)}</div>`:''}).join('')||'<span class="muted">none recorded</span>'}</div>`;
    if(flyThere&&!r.xy&&im){openArea(r.im,r.id)}}
  else if(s.type==='zone'){const z=zones[s.i];const im=z.im!=null?images[z.im]:null;
    h=`<h2>${esc(z.name)}</h2><div class="sub">${esc(z.region||'')} · ${z.n} spawn rooms · creature levels ${z.lo}–${z.hi}</div>${go2Box(z.go)}
    <div class="bar">${barHTML(z)}</div><h5>Creatures (${z.cr.length})</h5>${crChips(z.cr)}
    <p class="fine">* = level from huntplan.lic only. Click a creature for its gswiki page. go2 target is the spawn room nearest the middle of the area.</p>
    ${im?`<h5>Area map</h5><button data-area="${z.im}">Open “${esc(im.label)}” map ↗</button>`:''}`}
  else if(s.type==='town'){const near=zones.map((z,i)=>[z,i]).filter(([z])=>z.x!=null&&Math.hypot(z.x-s.t.x,z.y-s.t.y)<K*70).sort((a,b)=>zoneScore(b[0])-zoneScore(a[0])).slice(0,10);
    h=`<h2>${esc(s.t.n)}</h2><div class="sub">Town</div><h5>Best nearby hunting for L${S.lvMin}–${S.lvMax}</h5>${near.map(([z,i])=>`<div class="zone" data-zone="${i}"><h4>${esc(z.name)}<span>L${z.lo}–${z.hi}</span></h4></div>`).join('')}`}
  else if(s.type==='image'){const im=images[s.i];h=`<h2>${esc(im.label)}</h2><div class="sub">${esc(im.region)} · ${im.n} rooms · ${esc(im.f)}</div><button data-area="${s.i}">Open original map ↗</button>
    <h5>Locations</h5>${im.locs.filter(Boolean).map(esc).join('<br>')}<h5>Interiors & pockets attached</h5>${images.map((p,i)=>[p,i]).filter(([p])=>p.parent===s.i).map(([p,i])=>`<div><a href="#" data-area="${i}">${esc(p.label)}</a> <span class="muted">${p.kind}</span></div>`).join('')||'<span class="muted">none</span>'}`}
  d.innerHTML=h;$('right').classList.remove('closed');
  if(flyThere){const p=selXY(s);if(p){const zz=s.type==='room'?Math.max(cam.z,1.4):s.type==='zone'?Math.max(cam.z,0.35):s.type==='image'?0.3:0.12;flyTo(p[0],p[1],zz)}}}
function barHTML(z){const lo=Math.min(S.lvMin,z.lo)-3,hi=Math.max(S.lvMax,z.hi)+3,sc=v=>(v-lo)/(hi-lo)*100;return `<i class="rng" style="left:${sc(S.lvMin)}%;width:${sc(S.lvMax)-sc(S.lvMin)}%"></i><i class="z" style="left:${sc(z.lo)}%;width:${Math.max(1.5,sc(z.hi)-sc(z.lo))}%"></i>`}
document.addEventListener('click',e=>{const t=e.target.closest('[data-copy],[data-area],[data-zone],[data-room]');if(!t)return;
  if(t.dataset.copy){copy(t.dataset.copy);return}e.preventDefault();
  if(t.dataset.area!=null)openArea(+t.dataset.area);else if(t.dataset.zone!=null)select({type:'zone',i:+t.dataset.zone});else if(t.dataset.room)select({type:'room',i:byId.get(+t.dataset.room)})});
function copy(txt) {
  const done = () => toast('Copied  ' + txt + '  — paste it in game');
  if (navigator.clipboard && isSecureContext) {
    navigator.clipboard.writeText(txt).then(done, fallback);
  } else {
    fallback();
  }

  function fallback() {
    const ta = document.createElement('textarea');
    ta.value = txt;
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    done();
  }
}
let toastT;function toast(m){const t=$('toast');t.textContent=m;t.classList.add('show');clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove('show'),1800)}
$('closeRight').onclick=()=>{$('right').classList.add('closed');selected=null};
// Camera animation
function flyTo(x,y,z,ms=1400,keepZoom=false){z=clamp(z,ZMIN,ZMAX);const z0=cam.z,d=Math.hypot(x-cam.x,y-cam.y);const zm=Math.min(z0,z,Math.max(ZMIN,Math.min(W,H)/(d*1.4+1)));fly={x0:cam.x,y0:cam.y,z0,x,y,z,zm,t0:now,ms,keepZoom}}
function step(){if(fly){let t=clamp((now-fly.t0)/fly.ms,0,1),e=t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
    const lz0=Math.log(fly.z0),lz1=Math.log(fly.z),lzm=Math.log(fly.zm);const lz=fly.keepZoom?lerp(lz0,lz1,e):(1-e)*(1-e)*lz0+2*(1-e)*e*Math.min(lzm,(lz0+lz1)/2)+e*e*lz1;
    // keep the target point steady in screen space while zooming
    cam.x=lerp(fly.x0,fly.x,e);cam.y=lerp(fly.y0,fly.y,e);cam.z=Math.exp(lz);tgt.x=cam.x;tgt.y=cam.y;tgt.z=cam.z;if(t>=1)fly=null}
  else{cam.x=lerp(cam.x,tgt.x,.2);cam.y=lerp(cam.y,tgt.y,.2);const lz=lerp(Math.log(cam.z),Math.log(tgt.z),.18);cam.z=Math.exp(lz)}}
function zoomAt(sx,sy,f){const [wx,wy]=[(sx-W/2)/tgt.z+tgt.x,(sy-H/2)/tgt.z+tgt.y];const nz=clamp(tgt.z*f,ZMIN,ZMAX);tgt.x=wx-(sx-W/2)/nz;tgt.y=wy-(sy-H/2)/nz;tgt.z=nz;fly=null}
// Input
const ptrs=new Map();let drag=null,pinch=null,moved=false;
cv.addEventListener('pointerdown',e=>{cv.setPointerCapture(e.pointerId);fly=null;const [x,y]=screenToCanvas(e.clientX,e.clientY);ptrs.set(e.pointerId,[x,y]);moved=false;
  if(ptrs.size===1){drag={x,y,cx:tgt.x,cy:tgt.y};cv.classList.add('drag')}else if(ptrs.size===2){const [a,b]=[...ptrs.values()];pinch={d:Math.hypot(a[0]-b[0],a[1]-b[1]),z:tgt.z,mx:(a[0]+b[0])/2,my:(a[1]+b[1])/2};drag=null}});
cv.addEventListener('pointermove',e=>{const [x,y]=screenToCanvas(e.clientX,e.clientY);
  if(ptrs.has(e.pointerId))ptrs.set(e.pointerId,[x,y]);
  if(pinch&&ptrs.size===2){const [a,b]=[...ptrs.values()];const d=Math.hypot(a[0]-b[0],a[1]-b[1]);const f=d/pinch.d*pinch.z/tgt.z;zoomAt(pinch.mx,pinch.my,f);moved=true;return}
  if(drag){const dx=x-drag.x,dy=y-drag.y;if(Math.abs(dx)+Math.abs(dy)>3)moved=true;tgt.x=drag.cx-dx/cam.z;tgt.y=drag.cy-dy/cam.z;cam.x=tgt.x;cam.y=tgt.y;fly=null;return}
  hover=hit(x,y);const tip=$('tip');if(hover){tip.style.display='block';tip.innerHTML=hover.html;tip.style.left=(e.clientX+16)+'px';tip.style.top=(e.clientY+14)+'px';cv.style.cursor='pointer'}else{tip.style.display='none';cv.style.cursor=''}
  const [wx,wy]=s2w(x,y);$('coords').textContent=`${Math.round(wx/K)}, ${Math.round(wy/K)} · zoom ${cam.z.toFixed(3)}`});
function endPtr(e){ptrs.delete(e.pointerId);if(ptrs.size<2)pinch=null;if(ptrs.size===0){cv.classList.remove('drag');if(drag&&!moved){const [x,y]=screenToCanvas(e.clientX,e.clientY);const h=hit(x,y);if(h)select(h.sel,h.sel.type!=='room')}drag=null}}
cv.addEventListener('pointerup',endPtr);cv.addEventListener('pointercancel',endPtr);
cv.addEventListener('wheel',e=>{e.preventDefault();const [x,y]=screenToCanvas(e.clientX,e.clientY);const f=Math.exp(-e.deltaY*(e.ctrlKey?0.01:0.0016));zoomAt(x,y,f)},{passive:false});
cv.addEventListener('dblclick',e=>{const [x,y]=screenToCanvas(e.clientX,e.clientY);zoomAt(x,y,2.4)});
function hit(x,y){const [wx,wy]=s2w(x,y);
  for(const label of labelHits)if(x>=label.box[0]&&x<=label.box[2]&&y>=label.box[1]&&y<=label.box[3])return{sel:label.sel,html:label.html};
  for(const [n,c] of live.chars){if(!c.disp)continue;const [sx,sy]=w2s(c.disp[0],c.disp[1]);if(Math.hypot(sx-x,sy-y)<14&&c.room)return{sel:{type:'room',i:byId.get(c.id)},html:`<b>${esc(n)}</b><br>[${c.id}] ${esc(c.title)}`}}
  if(S.layers.rooms&&cam.z>0.22){const gx=Math.floor(wx/CELL),gy=Math.floor(wy/CELL);let best=null,bd=Math.max(10,7/cam.z*1.2);for(let i=gx-1;i<=gx+1;i++)for(let j=gy-1;j<=gy+1;j++){for(const k of grid.get(i+','+j)||[]){const r=rooms[k];const d=Math.hypot(r.xy[0]-wx,r.xy[1]-wy);if(d<bd){bd=d;best=k}}}
    if(best!=null){const r=rooms[best];const zs=roomZone.get(r.id);return{sel:{type:'room',i:best},html:`<b>${esc(r.t)}</b><br><span class="muted">#${r.id}${zs?' · '+zs.map(i=>esc(zones[i].name)+' L'+zones[i].lo+'–'+zones[i].hi).join(', '):''}${r.sv?' · '+r.sv.join(', '):''}</span>`}}}
  if(S.layers.towns)for(const tw of G.towns){const [sx,sy]=w2s(tw.x,tw.y);if(Math.hypot(sx-x,sy-y)<14)return{sel:{type:'town',t:tw},html:`<b>${esc(tw.n)}</b><br><span class="muted">Town · click for nearby hunting</span>`}}
  if(S.layers.hunt){let best=null,bd=22;zones.forEach((z,i)=>{if(z.x==null||(S.region&&z.region!==S.region))return;if(cam.z<=0.07&&zoneStat[i]!=='in')return;const [sx,sy]=w2s(z.x,z.y);const d=Math.hypot(sx-x,sy-y);if(d<bd){bd=d;best=i}});
    if(best!=null){const z=zones[best];return{sel:{type:'zone',i:best},html:`<b>${esc(z.name)}</b> <span class="muted">L${z.lo}–${z.hi}</span><br>${z.cr.slice(0,6).map(c=>esc(c.n)+' '+c.lv).join(', ')}${z.cr.length>6?'…':''}`}}}
  if(cam.z>0.035){for(let i=images.length-1;i>=0;i--){const im=images[i];if(im.x==null)continue;if(wx>=im.x&&wy>=im.y&&wx<=im.x+im.w*im.s&&wy<=im.y+im.h*im.s)return{sel:{type:'image',i},html:`<b>${esc(im.label)}</b><br><span class="muted">${esc(im.region)} · ${im.n} rooms · click for details</span>`}}}
  return null}
addEventListener('keydown',e=>{if(/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)||e.target.isContentEditable)return;if(e.key==='/'){e.preventDefault();$('search').focus()}else if(e.key==='+'||e.key==='=')zoomAt(W/2,H/2,1.6);else if(e.key==='-')zoomAt(W/2,H/2,1/1.6);else if(e.key==='t'||e.key==='T')toggleTilt();else if(e.key==='h'||e.key==='H')home();else if(e.key==='f'||e.key==='F')setFollow(!S.follow);
  else{const m={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];if(m){tgt.x+=m[0]*W*.2/cam.z;tgt.y+=m[1]*H*.2/cam.z}}});
$('zin').onclick=()=>zoomAt(W/2,H/2,1.8);$('zout').onclick=()=>zoomAt(W/2,H/2,1/1.8);
function home(){flyTo(WORLD_W*0.43,WORLD_H*0.47,fitWorld(),1500)}$('btnHome').onclick=home;
function toggleTilt(){S.tilt=!S.tilt;document.body.classList.toggle('tilt',S.tilt);$('btnTilt').classList.toggle('on',S.tilt)}$('btnTilt').onclick=toggleTilt;
function setFollow(value) {
  S.follow = value;
  updateFollowControls();
  if (value) {
    const c = live.chars.get(followName());
    if (c && c.pos) followTo(c.pos,true);
    else toast(live.pinned ? 'Waiting for ' + live.pinned : 'No live character yet - run ;epicmap in Lich');
  }
}
$('btnFollow').onclick=()=>setFollow(!S.follow);
$('followCharacter').onchange = event => chooseFollow(event.target.value);
try { live.pinned = window.EpicPrefs.getItem('epicmap.followCharacter') || null; } catch (_) {}
updateFollowControls();
// Search
const lowT=rooms.map(r=>r.t.toLowerCase());let resSel=0,resItems=[];
function doSearch(q){q=q.trim().toLowerCase();const out=[];if(!q){$('results').classList.remove('show');return}
  if(/^\d+$/.test(q)){const i=byId.get(+q);if(i!=null)out.push({k:'room',label:rooms[i].t,sub:'#'+q,sel:{type:'room',i}})}
  for(const tw of G.towns)if(tw.n.toLowerCase().includes(q))out.push({k:'town',label:tw.n,sel:{type:'town',t:tw}});
  zones.forEach((z,i)=>{if(z.name.toLowerCase().includes(q))out.push({k:'hunting',label:z.name,sub:`L${z.lo}–${z.hi}`,sel:{type:'zone',i}})});
  const crs=new Map();zones.forEach((z,i)=>z.cr.forEach(c=>{if(c.n.includes(q)){if(!crs.has(c.n))crs.set(c.n,[]);crs.get(c.n).push([z,i,c])}}));
  for(const [n,L] of [...crs].slice(0,12))for(const [z,i,c] of L.slice(0,3))out.push({k:'creature',label:`${n} (L${c.lv})`,sub:z.name,sel:{type:'zone',i}});
  images.forEach((im,i)=>{if(im.label.toLowerCase().includes(q)||im.nice.toLowerCase().includes(q))out.push({k:'area map',label:im.label,sub:im.region,sel:{type:'image',i}})});
  let n=0;for(let i=0;i<lowT.length&&n<40;i++)if(lowT[i].includes(q)){out.push({k:'room',label:rooms[i].t,sub:'#'+rooms[i].id,sel:{type:'room',i}});n++}
  resItems=out.slice(0,60);resSel=0;$('results').innerHTML=resItems.map((r,i)=>`<div class="res ${i===0?'sel':''}" data-i="${i}"><span class="k">${r.k}</span>${esc(r.label)}<small>${esc(r.sub||'')}</small></div>`).join('')||'<div class="res muted">No matches</div>';$('results').classList.add('show')}
let sT;$('search').addEventListener('input',e=>{clearTimeout(sT);sT=setTimeout(()=>doSearch(e.target.value),90)});
$('search').addEventListener('keydown',e=>{const els=[...document.querySelectorAll('.res[data-i]')];if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();resSel=clamp(resSel+(e.key==='ArrowDown'?1:-1),0,els.length-1);els.forEach((x,i)=>x.classList.toggle('sel',i===resSel));els[resSel]?.scrollIntoView({block:'nearest'})}else if(e.key==='Enter'&&resItems[resSel]){pick(resSel)}else if(e.key==='Escape'){$('results').classList.remove('show');e.target.blur()}});
$('results').addEventListener('click',e=>{const r=e.target.closest('.res[data-i]');if(r)pick(+r.dataset.i)});
function pick(i){const it=resItems[i];$('results').classList.remove('show');select(it.sel)}
// Hunting finder
const regs=[...new Set(zones.map(z=>z.region).filter(Boolean))].sort();$('regionSel').innerHTML+=regs.map(r=>`<option>${esc(r)}</option>`).join('');
function renderHunt(){recomputeZones();const list=zones.map((z,i)=>[z,i]).filter(([z,i])=>zoneStat[i]==='in'&&(!S.region||z.region===S.region)).sort((a,b)=>zoneScore(b[0])-zoneScore(a[0]));
  $('huntCount').textContent=`${list.length} hunting areas with creatures in L${S.lvMin}–${S.lvMax}${S.region?' · '+S.region:''}`;
  $('huntList').innerHTML=list.map(([z,i])=>`<div class="zone" data-zone="${i}"><h4>${esc(z.name)}<span>L${z.lo}–${z.hi}</span></h4><div class="rg">${esc(z.region||'—')} · ${z.n} rooms · <code>;go2 ${z.go}</code></div><div class="bar">${barHTML(z)}</div>${crChips(z.cr.filter(c=>crStatus(c.lv)==='in').concat(z.cr.filter(c=>crStatus(c.lv)!=='in')).slice(0,8))}</div>`).join('')}
function readLv(){S.lvMin=+$('lvMin').value||0;S.lvMax=Math.max(S.lvMin,+$('lvMax').value||0);S.region=$('regionSel').value;S.strict=$('strict').checked;renderHunt();if(selected&&selected.type==='zone')select(selected,false)}
['lvMin','lvMax','regionSel','strict'].forEach(id=>$(id).addEventListener('input',readLv));
document.querySelectorAll('.presets [data-p]').forEach(b=>b.onclick=()=>{const [a,c]=b.dataset.p.split(',');$('lvMin').value=a;$('lvMax').value=c;readLv()});
document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tabs button,.tab').forEach(x=>x.classList.remove('on'));b.classList.add('on');$('tab-'+b.dataset.tab).classList.add('on')});
$('layerList').innerHTML=LAYERS.map(([k,n,c])=>`<label class="layer"><input type="checkbox" data-l="${k}" ${S.layers[k]?'checked':''}><span class="sw" style="background:${c};box-shadow:0 0 6px ${c}"></span>${n}</label>`).join('');
document.querySelectorAll('[data-l]').forEach(x=>x.onchange=()=>{S.layers[x.dataset.l]=x.checked});
$('readableDefaults').onclick=()=>{
  Object.assign(S.layers,DEFAULT_LAYERS);S.night=false;S.fx=false;
  document.querySelectorAll('[data-l]').forEach(input=>input.checked=!!S.layers[input.dataset.l]);
  $('optNight').checked=false;$('optFx').checked=false;$('grain').style.display='none';
};
$('grain').style.display='none';

$('optNight').onchange=e=>S.night=e.target.checked;$('optFx').onchange=e=>{S.fx=e.target.checked;$('grain').style.display=S.fx?'':'none'};
$('optTrail').onchange = e => S.trail = e.target.checked;
$('optAutoArea').onchange = e => S.autoArea = e.target.checked;
$('worldStyle').onchange = e => {if(['illustrated','atlas','original'].includes(e.target.value))S.worldStyle=e.target.value;};
$('btnClearTrail').onclick = clearTrails;
const fadeOptions = [0, 30, 60, 120, 300, 600];
try {
  const saved = window.EpicPrefs.getItem('epicmap.trailFadeSeconds');
  if (saved !== null && fadeOptions.includes(Number(saved))) S.trailFadeSec = Number(saved);
} catch (_) { /* The default still works when browser storage is unavailable. */ }
$('trailFade').value = String(S.trailFadeSec);
$('trailFade').onchange = e => {
  const seconds = Number(e.target.value);
  if (!fadeOptions.includes(seconds)) return;
  S.trailFadeSec = seconds;
  try { window.EpicPrefs.setItem('epicmap.trailFadeSeconds', String(seconds)); } catch (_) {}
};
// Minimap
const mm=$('minimap'),mx=mm.getContext('2d');
function drawMini(){const w=mm.width,h=mm.height;mx.fillStyle='#05080c';mx.fillRect(0,0,w,h);
  if(S.layers.base){
    if(S.worldStyle==='atlas')window.EpicWorldMap.draw(mx,w,h,{labels:false,mini:true});
    else{const img=getImg(S.worldStyle==='illustrated'?baseIllustrated:baseNight);if(img)mx.drawImage(img,0,0,w,h);else if(S.worldStyle==='illustrated')window.EpicWorldMap.draw(mx,w,h,{labels:false,mini:true});}
  }
  const sx=w/WORLD_W,sy=h/WORLD_H;zones.forEach((z,i)=>{if(z.x==null||zoneStat[i]!=='in')return;mx.fillStyle='rgba(98,240,164,.9)';mx.fillRect(z.x*sx-1,z.y*sy-1,2.5,2.5)});
  for(const [n,c] of live.chars){if(!c.disp)continue;mx.fillStyle=charColor(n);mx.beginPath();mx.arc(c.disp[0]*sx,c.disp[1]*sy,3.5,0,6.283);mx.fill()}
  const vw=W/cam.z,vh=H/cam.z;mx.strokeStyle='#ffdf9a';mx.lineWidth=1.5;mx.shadowColor='#ffdf9a';mx.shadowBlur=6;mx.strokeRect((cam.x-vw/2)*sx,(cam.y-vh/2)*sy,Math.max(3,vw*sx),Math.max(3,vh*sy));mx.shadowBlur=0}
mm.addEventListener('click',e=>{const r=mm.getBoundingClientRect();const x=(e.clientX-r.left)/r.width*WORLD_W,y=(e.clientY-r.top)/r.height*WORLD_H;flyTo(x,y,Math.max(cam.z,0.06),900)});
// Area dialog (original map viewer for any image, incl. interiors)
const ad=$('areaDlg'),ac=$('areaCanvas'),actx=ac.getContext('2d');let A=null;
function openArea(i,focusRoom){
  const im=images[i];if(!im)return;
  const previousZoom=A?A.z:null;
  const area={i,im,x:im.w/2,y:im.h/2,z:previousZoom??1,focus:focusRoom,rooms:rooms.map((r,k)=>[r,k]).filter(([r])=>r.im===i)};
  A=area;ad_drag=null;
  $('areaTitle').textContent=im.label+'  ·  '+im.region;
  $('areaInfo').textContent=`${im.n} rooms · source image ${im.f} · click a room to select it`;
  if(!ad.open)ad.showModal();
  requestAnimationFrame(()=>{
    if(A!==area||!ad.open)return;
    ac.width=ac.clientWidth*DPR;ac.height=ac.clientHeight*DPR;
    A.z=clamp(previousZoom??Math.min(ac.clientWidth/im.w,ac.clientHeight/im.h)*.95,.05,8);
    if(focusRoom){const r=rooms[byId.get(focusRoom)];if(r&&r.im===i&&r.c){A.x=r.c[0];A.y=r.c[1];if(previousZoom===null)A.z=Math.max(A.z,1.2);}}
  });
}
function drawArea(){if(!A||!ad.open)return;const c=actx,w=ac.clientWidth,h=ac.clientHeight;c.setTransform(DPR,0,0,DPR,0,0);c.fillStyle='#06090d';c.fillRect(0,0,w,h);c.save();c.translate(w/2,h/2);c.scale(A.z,A.z);c.translate(-A.x,-A.y);
  const img=getImg(($('areaNight').checked?'night/':'maps/')+A.im.b+'.webp');if(img)c.drawImage(img,0,0);
  const t=now/1000;for(const [r] of A.rooms){if(!r.c)continue;const zs=roomZone.get(r.id);const hl=selected&&selected.type==='room'&&rooms[selected.i]===r;
    if(zs){const st=zoneStat[zs[0]];c.strokeStyle=st==='in'?'#62f0a4':st==='hot'?'#ff6a55':'#7fa6c9';c.lineWidth=2/A.z;c.strokeRect(r.c[0]-r.c[2]/2,r.c[1]-r.c[2]/2,r.c[2],r.c[2])}
    if(hl){c.strokeStyle='#ffdf9a';c.lineWidth=3/A.z;c.beginPath();c.arc(r.c[0],r.c[1],r.c[2]*(1+.2*Math.sin(t*5)),0,6.283);c.stroke()}
    for(const [n,ch] of live.chars)if(ch.id===r.id){c.fillStyle=charColor(n);c.beginPath();c.arc(r.c[0],r.c[1],r.c[2]*.6,0,6.283);c.fill()}}
  c.restore()}
let ad_drag=null;ac.addEventListener('pointerdown',e=>{ac.setPointerCapture(e.pointerId);ad_drag={x:e.offsetX,y:e.offsetY,ax:A.x,ay:A.y,m:false}});
ac.addEventListener('pointermove',e=>{if(!ad_drag)return;const dx=e.offsetX-ad_drag.x,dy=e.offsetY-ad_drag.y;if(Math.abs(dx)+Math.abs(dy)>3)ad_drag.m=true;A.x=ad_drag.ax-dx/A.z;A.y=ad_drag.ay-dy/A.z});
ac.addEventListener('pointerup',e=>{if(ad_drag&&!ad_drag.m){const wx=(e.offsetX-ac.clientWidth/2)/A.z+A.x,wy=(e.offsetY-ac.clientHeight/2)/A.z+A.y;let best=null,bd=1e9;for(const [r,k] of A.rooms){if(!r.c)continue;const d=Math.hypot(r.c[0]-wx,r.c[1]-wy);if(d<bd&&d<Math.max(r.c[2],12/A.z)){bd=d;best=k}}if(best!=null)select({type:'room',i:best},false)}ad_drag=null});
ac.addEventListener('wheel',e=>{e.preventDefault();const f=Math.exp(-e.deltaY*.0018);const wx=(e.offsetX-ac.clientWidth/2)/A.z+A.x,wy=(e.offsetY-ac.clientHeight/2)/A.z+A.y;A.z=clamp(A.z*f,.05,8);A.x=wx-(e.offsetX-ac.clientWidth/2)/A.z;A.y=wy-(e.offsetY-ac.clientHeight/2)/A.z},{passive:false});
$('areaClose').onclick=()=>ad.close();
// Loop
let lastPaint=-Infinity,lastMini=-Infinity;
function frame(ts){
  requestAnimationFrame(frame);
  if(document.hidden||ts-lastPaint<1000/30)return;
  lastPaint=ts;now=ts;step();draw();
  if(ts-lastMini>=200){drawMini();lastMini=ts;}
  if(ad.open)drawArea();
  $('tier').textContent=tier();
  $('zknob').style.top=(110-110*(Math.log(cam.z/ZMIN)/Math.log(ZMAX/ZMIN)))+'px';
}
recomputeZones();renderHunt();cam.z=tgt.z=fitWorld();cam.x=tgt.x=WORLD_W*0.43;cam.y=tgt.y=WORLD_H*0.47;
const qs=new URLSearchParams(location.search);
if(qs.get('demo'))startDemo();else if(location.protocol.startsWith('http'))poll();else liveStatus(false);
if(qs.get('view')){const [x,y,z]=qs.get('view').split(',').map(Number);cam.x=tgt.x=x*K;cam.y=tgt.y=y*K;cam.z=tgt.z=z}
if(qs.get('tilt'))toggleTilt();if(qs.get('follow'))setFollow(true);
requestAnimationFrame(frame);
window.EPICMAP={S,cam,tgt,select,flyTo,openArea,zones,rooms,byId,live,setCharPos,setFollow};

Object.assign(window.EPICMAP,{defaultPreferences,worldWidth:WORLD_W,worldHeight:WORLD_H,zoomMin:ZMIN,zoomMax:ZMAX,renderHunt,updateFollowControls,
  restoreView(v){fly=null;Object.assign(cam,v);Object.assign(tgt,v);},
  viewDestination(){return fly?{x:fly.x,y:fly.y,z:fly.z}:{...tgt};},
  defaultView(){return {x:WORLD_W*.43,y:WORLD_H*.47,z:clamp(fitWorld(),ZMIN,ZMAX)};}
});
