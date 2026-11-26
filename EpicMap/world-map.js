/* EpicMap vector overview. Illustrative geography; room coordinates remain authoritative.
 * Mainland silhouette references the credited Simutronics Elanthia artwork.
 * This is native Canvas geometry, not a larger copy of the low-resolution JPEG.
 */
'use strict';
window.EpicWorldMap = (() => {
  const width=1024,height=782;
  const mainland='M166 -12 L852 -12 L851 24 Q894 30 910 60 L927 99 L919 128 L881 149 L864 177 L855 208 L843 231 L839 252 L819 277 L826 305 L830 331 L814 352 L785 368 L784 390 L794 419 L781 443 L785 467 L775 491 L757 517 L744 536 L731 558 L725 580 L711 603 L696 625 L679 643 L660 663 L648 682 L640 699 L622 710 L604 714 L586 723 L568 733 L549 730 L540 717 L520 719 L503 724 L490 719 L470 723 L450 726 L432 724 L413 729 L393 731 L373 734 L353 730 L334 732 L310 731 L287 737 L265 731 L242 736 L222 729 L201 732 L180 723 L160 716 L149 701 L140 683 L142 664 L157 644 L174 634 L194 627 L196 612 L211 603 L224 590 L234 573 L233 556 L228 538 L230 519 L222 499 L220 482 L222 467 L223 451 L225 434 L220 419 L205 414 L189 411 L177 401 L161 391 L150 374 L144 355 L142 339 L137 319 L137 298 L131 282 L133 268 L129 249 L129 235 L134 220 L133 203 L130 187 L134 171 L132 153 L146 144 L148 130 L166 129 L173 120 L169 112 L156 115 L144 120 L134 118 L127 112 L114 113 L107 108 L94 110 L87 104 L102 85 L116 73 L124 51 Z';
  const islands=[
    'M82 139 L95 140 L102 151 L100 167 L109 180 L105 195 L116 205 L114 219 L103 229 L90 229 L82 240 L70 235 L69 222 L61 213 L65 200 L61 190 L64 175 L70 159 Z',
    'M946 213 L961 207 L976 216 L981 230 L971 243 L952 242 L943 231 Z',
    'M889 464 L903 457 L918 466 L914 480 L898 485 L885 477 Z',
    'M53 503 L66 495 L83 501 L90 513 L88 527 L97 539 L86 550 L72 546 L67 533 L53 530 L47 517 Z',
    'M83 596 L100 586 L113 596 L121 611 L115 628 L100 637 L85 628 L78 613 Z'
  ];
  const rivers=[
    'M352 147 Q326 160 296 173 T257 187 Q239 201 247 219 T229 245 Q222 257 220 275',
    'M408 91 Q369 111 338 129 T291 154 Q278 163 269 184',
    'M442 170 Q438 199 406 220 T372 254 Q357 279 326 292 T289 318 Q265 331 242 334',
    'M366 299 Q392 322 384 350 T369 388 Q361 419 349 433 T334 457',
    'M681 131 Q661 162 650 190 T644 230 Q638 251 657 273 T668 316 Q668 350 653 372 T654 421 Q660 449 646 474',
    'M858 91 Q829 115 818 151 T787 200 Q775 225 786 251 T777 303 Q759 330 732 340',
    'M598 302 Q575 329 553 345 T520 386 Q500 414 501 442 T481 487 Q463 505 469 534 T450 576'
  ];
  const lakes=[
    'M337 174 Q348 165 365 174 L359 190 L341 194 L331 184 Z',
    'M434 149 Q445 141 458 149 L454 161 L440 164 Z',
    'M660 263 L676 258 L686 269 L675 278 L659 275 Z',
    'M566 299 Q582 291 597 301 L587 310 L570 309 Z'
  ];
  const peaks=[[337,41,17],[368,55,19],[398,72,18],[428,91,20],[458,111,17],
    [481,135,20],[504,158,18],[526,185,22],[540,215,18],[538,246,20],
    [531,277,17],[519,308,20],[509,338,17],[502,370,19],[493,403,16]];
  const forests=[[707,185],[737,201],[761,226],[721,233],[742,266],[698,287],
    [729,321],[752,357],[705,362],[679,402],[715,431],[687,456],[648,503],
    [633,534],[604,562],[291,253],[307,274],[274,300],[315,332],[343,353]];
  const labels=[
    ['DRAGONSPINE',451,77,16],['MOUNTAINS',457,98,11],
    ['NORTHERN STEPPES',772,64,13],['ELVEN NATIONS',750,320,16],
    ['TURAMZZYRIAN EMPIRE',391,367,15],['RHOSKA-TOR',497,591,16],
    ['SOUTHERN WASTES',378,679,13],['GREAT WESTERN SEA',115,405,11],
    ['ABANDONED WATERS',893,558,11]
  ];
  const paths=new Map(),palettes=new WeakMap();
  function path(d){if(!paths.has(d))paths.set(d,new Path2D(d));return paths.get(d);}
  function palette(ctx){
    if(palettes.has(ctx))return palettes.get(ctx);
    const sea=ctx.createLinearGradient(0,0,1024,782);
    sea.addColorStop(0,'#112936');sea.addColorStop(.5,'#0b202e');sea.addColorStop(1,'#071720');
    const land=ctx.createLinearGradient(280,0,650,770);
    land.addColorStop(0,'#80988b');land.addColorStop(.2,'#586f5c');
    land.addColorStop(.6,'#425a45');land.addColorStop(1,'#66634b');
    const p={sea,land};palettes.set(ctx,p);return p;
  }
  function draw(ctx,w,h,{labels:showLabels=true,mini=false}={}){
    ctx.save();
    ctx.scale(w/width,h/height);
    const colors=palette(ctx),lands=[mainland,...islands];
    ctx.fillStyle=colors.sea;ctx.fillRect(0,0,width,height);
    if(!mini){
      ctx.strokeStyle='#81acb014';ctx.lineWidth=.5;
      ctx.beginPath();
      for(let x=32;x<1024;x+=64){ctx.moveTo(x,0);ctx.lineTo(x,782);}
      for(let y=14;y<782;y+=64){ctx.moveTo(0,y);ctx.lineTo(1024,y);}
      ctx.stroke();
    }
    ctx.lineJoin='round';ctx.lineCap='round';
    for(const d of lands){
      const shape=path(d);
      ctx.strokeStyle='#73bac317';ctx.lineWidth=10;ctx.stroke(shape);
      ctx.strokeStyle='#9fc9c42b';ctx.lineWidth=4;ctx.stroke(shape);
      ctx.fillStyle=colors.land;ctx.fill(shape);
      ctx.strokeStyle='#c8cf9ca3';ctx.lineWidth=mini?1.7:1.1;ctx.stroke(shape);
    }
    if(!mini){
      ctx.save();ctx.clip(path(mainland));
      for(const[x,y]of forests){
        ctx.fillStyle='#223c30';
        for(const[dx,dy]of[[0,0],[-8,7],[7,9]]){
          ctx.beginPath();ctx.moveTo(x+dx,y+dy-6);ctx.lineTo(x+dx-4,y+dy+3);ctx.lineTo(x+dx+4,y+dy+3);ctx.closePath();ctx.fill();
        }
      }
      for(const[x,y,s]of peaks){
        ctx.fillStyle='#3a514c';ctx.strokeStyle='#a6b8a999';ctx.lineWidth=.8;
        ctx.beginPath();ctx.moveTo(x-s*.7,y+s*.55);ctx.lineTo(x,y-s*.6);ctx.lineTo(x+s*.7,y+s*.55);ctx.closePath();ctx.fill();ctx.stroke();
        ctx.fillStyle='#b6c9bd';ctx.beginPath();ctx.moveTo(x,y-s*.6);ctx.lineTo(x-s*.25,y-s*.15);ctx.lineTo(x,y-s*.25);ctx.lineTo(x+s*.23,y-s*.12);ctx.closePath();ctx.fill();
      }
      ctx.restore();
      ctx.strokeStyle='#6bafbd';ctx.lineWidth=1.3;
      for(const d of rivers)ctx.stroke(path(d));
      ctx.fillStyle='#367582';for(const d of lakes)ctx.fill(path(d));
      ctx.save();ctx.translate(865,663);
      ctx.strokeStyle='#b9bd8770';ctx.lineWidth=1;ctx.beginPath();ctx.arc(0,0,39,0,Math.PI*2);ctx.stroke();
      for(let i=0;i<8;i++){
        ctx.save();ctx.rotate(i*Math.PI/4);const r=i%2?28:49;
        ctx.fillStyle=i%2?'#8a997e':'#c5c99e';ctx.beginPath();ctx.moveTo(0,-r);ctx.lineTo(6,0);ctx.lineTo(0,9);ctx.lineTo(-6,0);ctx.closePath();ctx.fill();ctx.restore();
      }
      ctx.fillStyle='#e5deba';ctx.font='12px Georgia,serif';ctx.textAlign='center';ctx.fillText('N',0,-60);ctx.restore();
    }
    if(showLabels&&!mini){
      ctx.textAlign='center';ctx.fillStyle='#e0dfc6';
      for(const[text,x,y,size]of labels){ctx.font=`${size}px Georgia,serif`;ctx.fillText(text,x,y);}
    }
    ctx.restore();
  }
  return{draw,width,height,labels};
})();
