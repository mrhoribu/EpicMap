const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
module.exports = function load(file) {
  const elements = new Map(), frames = [], saved = new Map();
  const gradient = {addColorStop(){}};
  const context = new Proxy({
    createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),
    createRadialGradient:()=>gradient,createLinearGradient:()=>gradient,
    measureText:s=>({width:s.length*6})
  }, {get:(o,k)=>o[k]||(()=>{})});
  class Element {
    constructor(id) {
      this.id=id;this.style={};this.events={};
      const classes=new Set(id==='right'?['closed']:[]);
      this.classList={add:n=>classes.add(n),remove:n=>classes.delete(n),contains:n=>classes.has(n),
        toggle(n,force){if(force===undefined)force=!classes.has(n);if(force)classes.add(n);else classes.delete(n);return force;}};
      this.clientWidth=1200;this.clientHeight=900;this.width=240;this.height=184;
      this.checked=true;this.value='';this.children=[];this.open=false;
      this.hidden=['showLeft','showMinimap'].includes(id);
    }
    getContext(){return context}
    addEventListener(n,f){(this.events[n]||=[]).push(f)}
    dispatch(n,e={}){for(const f of this.events[n]||[])f({target:this,preventDefault(){},...e})}
    append(e){this.children.push(e)}
    setPointerCapture(){} setAttribute(){} select(){} remove(){}
    showModal(){this.open=true} close(){this.open=false}
    getBoundingClientRect(){return{width:1200,height:900,left:0,top:0}}
  }
  const sandbox={window:{},console,Map,Set,performance:{now:()=>0},devicePixelRatio:1,
    Uint8ClampedArray,Image:class{},Path2D:class{},addEventListener(){},
    requestAnimationFrame:f=>frames.push(f),setTimeout(){},clearTimeout(){},setInterval(){},navigator:{},isSecureContext:false,
    URLSearchParams,location:{search:'',protocol:'file:'},
    localStorage:{getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)},
    document:{hidden:false,getElementById(id){if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id)},
      createElement:()=>new Element(),querySelectorAll:()=>[],addEventListener(){},execCommand(){return true},body:new Element('body')},
    flushFrames(t=0){for(const f of frames.splice(0))f(t)}};
  vm.createContext(sandbox);
  for(const name of ['gs4map-data.js','readability.js','preference-store.js','world-map.js']){
    const helper=path.join(path.dirname(file),name);
    if(fs.existsSync(helper))vm.runInContext(fs.readFileSync(helper,'utf8'),sandbox);
  }
  vm.runInContext(fs.readFileSync(file,'utf8')+'\nwindow.TEST={crStatus,zoneStatus,zoneScore,getImg,copy,resize,charColor,screenToCanvas};',sandbox);
  return sandbox;
};
