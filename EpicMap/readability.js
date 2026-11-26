'use strict';
window.EpicReadability = (() => {
  const palette = ['#75d7ee', '#f7bc80', '#a8dd8e', '#d2b8f2', '#f4a5b7', '#a5cee9', '#e4d27e', '#94dfc1'];

  function hull(points) {
    const sorted = [...new Map(points.map(p => [p.join(','), p])).values()].sort((a,b) => a[0]-b[0] || a[1]-b[1]);
    if (sorted.length < 3) return sorted;
    const turn = (a,b,c) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
    const lower = [], upper = [];
    for (const p of sorted) { while (lower.length > 1 && turn(lower.at(-2),lower.at(-1),p) <= 0) lower.pop(); lower.push(p); }
    for (const p of sorted.slice().reverse()) { while (upper.length > 1 && turn(upper.at(-2),upper.at(-1),p) <= 0) upper.pop(); upper.push(p); }
    return lower.slice(0,-1).concat(upper.slice(0,-1));
  }

  function contour(points) {
    const padding = 11;
    const expanded = points.flatMap(([x,y]) => [[x-padding,y-padding],[x+padding,y-padding],[x+padding,y+padding],[x-padding,y+padding]]);
    return hull(expanded);
  }

  function buildGroups(data) {
    const byId = new Map(data.rooms.map(r => [r.id,r]));
    const groupMap = new Map(), roomGroup = new Map();
    for (const r of data.rooms) {
      if (!r.xy || r.ax || r.im == null) continue;
      const key = r.im + '|' + r.t;
      if (!groupMap.has(key)) groupMap.set(key,{key,im:r.im,title:r.t,name:r.t.replace(/^\[|\]$/g,'').split(',').at(-1).trim(),rooms:[],parts:[]});
      groupMap.get(key).rooms.push(r.id);
    }
    const groups = [...groupMap.values()].filter(g => g.rooms.length >= 3);
    const colorsPerMap = new Map();
    for (const group of groups.sort((a,b) => a.key.localeCompare(b.key))) {
      const colorIndex = colorsPerMap.get(group.im) || 0;
      colorsPerMap.set(group.im,colorIndex+1);
      group.color = /south beach/i.test(group.name) ? '#75d7ee' : /coastal woods/i.test(group.name) ? '#ffae9c' : /^warrens$/i.test(group.name) ? '#a8dd8e' : palette[colorIndex%palette.length];
      const remaining = new Set(group.rooms);
      while (remaining.size) {
        const queue = [remaining.values().next().value];
        remaining.delete(queue[0]);
        for (let i=0;i<queue.length;i++) for (const id of byId.get(queue[i]).w || []) {
          if (!remaining.has(id)) continue;
          const a=byId.get(queue[i]).xy,b=byId.get(id).xy;
          if (Math.hypot(a[0]-b[0],a[1]-b[1])>260) continue;
          remaining.delete(id); queue.push(id);
        }
        const points=queue.map(id=>byId.get(id).xy), poly=contour(points);
        group.parts.push({ids:queue,poly,bounds:[Math.min(...poly.map(p=>p[0])),Math.min(...poly.map(p=>p[1])),Math.max(...poly.map(p=>p[0])),Math.max(...poly.map(p=>p[1]))]});
      }
      for (const id of group.rooms) roomGroup.set(id,group);
    }
    return {groups,roomGroup};
  }

  const intersects = (a,b) => a[0]<b[2] && a[2]>b[0] && a[1]<b[3] && a[3]>b[1];
  function placeLabels(ctx, labels, obstacles, width, height, reserved=[]) {
    const buckets = new Map(), step=64;
    for (const rect of obstacles) for(let x=Math.floor(rect[0]/step);x<=Math.floor(rect[2]/step);x++) for(let y=Math.floor(rect[1]/step);y<=Math.floor(rect[3]/step);y++) {
      const key=x+','+y;if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(rect);
    }
    const boxes=reserved.slice(), placed=[];
    for (const label of labels.slice().sort((a,b)=>b.pri-a.pri).slice(0,200)) {
      ctx.font=`${label.serif?'600 ':''}${label.size || 12}px ${label.serif?'Georgia,serif':'Segoe UI,sans-serif'}`;
      const w=Math.max(ctx.measureText(label.text).width,label.sub?ctx.measureText(label.sub).width:0)+16,h=label.sub?39:25;
      let candidates;
      if(label.bounds){const [x0,y0,x1,y1]=label.bounds,mx=(x0+x1)/2,my=(y0+y1)/2;
        candidates=[{x:mx,y:y0-h/2-10},{x:x0-w/2-12,y:my},{x:x1+w/2+12,y:my},{x:mx,y:y1+h/2+10},
          {x:x0-w/2-12,y:y0-h/2-8},{x:x1+w/2+12,y:y1+h/2+8}];
      } else candidates=[{x:label.x,y:label.y-h/2},{x:label.x+w/2+12,y:label.y},{x:label.x-w/2-12,y:label.y},{x:label.x,y:label.y+h/2+16}];
      for (const candidate of candidates) {
        const box=[candidate.x-w/2,candidate.y-h/2,candidate.x+w/2,candidate.y+h/2];
        if(box[0]<8||box[1]<65||box[2]>width-8||box[3]>height-8||boxes.some(b=>intersects(box,b)))continue;
        let blocked=false;
        for(let x=Math.floor(box[0]/step);x<=Math.floor(box[2]/step)&&!blocked;x++)for(let y=Math.floor(box[1]/step);y<=Math.floor(box[3]/step)&&!blocked;y++) {
          if((buckets.get(x+','+y)||[]).some(b=>intersects(box,b)))blocked=true;
        }
        if(blocked)continue;
        boxes.push(box);placed.push({...label,box,cx:candidate.x,cy:candidate.y});break;
      }
    }
    return placed;
  }
  return {buildGroups,hull,contour,placeLabels,intersects};
})();
