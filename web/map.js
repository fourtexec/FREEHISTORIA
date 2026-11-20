import {gameWorld} from './shared/world.js';
import {mapYearFor,nationName} from './shared/game.js';
import catalog from './shared/catalog.json' with {type:'json'};

const palette=['#8da46c','#ca917b','#7e9da9','#c6b072','#86aba3','#b79cb0','#be8866','#a9aa88','#899aba','#c9a6a0','#abc195','#a98d76'];
const ocean='#82bbd5';
const relief=new Image();
relief.src=new URL('./assets/relief.webp',import.meta.url);
let activeResize;

// Use the largest polygon for labels, so islands and distant dependencies don't move the camera.
function labelBox(path){
  let best;
  for(const ring of path.split('M').slice(1)){
    let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;
    for(const pair of ring.slice(0,-1).split(' ')){
      const [x,y]=pair.split(',').map(Number);
      left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
    }
    const w=right-left,h=bottom-top;
    if(!best || w*h>best.area)best={x:(left+right)/2,y:(top+bottom)/2,w,h,area:w*h};
  }
  return best;
}
export async function drawMap(canvas,game,onSelect) {
  const historical=game.mapSource==='cliopatria', board=canvas.closest('.board');
  const backgroundYear=historical?mapYearFor(game.mapYear,catalog):game.mapYear;
  const res=await fetch('./maps/'+backgroundYear+'.json');
  if(!res.ok)throw Error('Не удалось загрузить карту.');
  const list=(await res.json()).map(([n,p])=>[historical?'':n,p]);
  if(historical){
    const records=[...gameWorld(game,catalog).records].sort((a,b)=>b.area-a.area);
    const shards=new Map(await Promise.all([...new Set(records.map(r=>r.shard))].map(async id=>{
      const r=await fetch('./history/'+id+'.json',{cache:'force-cache'});
      if(!r.ok)throw Error('Не удалось загрузить границы Cliopatria.');
      return [id,await r.json()];
    })));
    for(const row of records)list.push([row.nation,shards.get(row.shard)[row.shape]]);
  }
  if(!canvas.isConnected)return;
  let layer='political',showNames=true,showRelief=true;
  const relations=new Map((game.relations||[]).map(r=>[r.nation,r.value]));
  const shapes=list.map(([name,p])=>{
    const hash=Array.from(name).reduce((a,c)=>(a*31+c.charCodeAt(0))>>>0,0);
    const seat=game.players?.findIndex(player=>player.nation===name||player.members.includes(name))??-1;
    const own=name && (name===game.nation||game.members?.includes(name));
    const relation=relations.get(name)||25;
    const diplomaticColor=own?'#dab16d':!name?'#dbd5be':relation>=75?'#7aa980':relation>=50?'#83abbf':'#a8adb0';
    return {name,diplomaticColor,path:new Path2D(p),box:name && (board||onSelect)?labelBox(p):null,
      color:own?'#d17d57':seat>=0?['#5684b2','#936daf','#57948a','#a18f53'][seat%4]:name?palette[hash%palette.length]:'#dbd5be'};
  });
  const labels=shapes.filter(s=>s.box?.area>0).sort((a,b)=>b.box.area-a.box.area);
  const ctx=canvas.getContext('2d');
  let width=1440,height=628,scale=4,cx=180,cy=83.5,zoom=1;
  let dx=0,dy=0,unit=4;
  const own=labels.find(s=>s.name===game.nation)?.box;
  function constrain(){
    const hx=Math.min(180,width/(2*unit)),hy=Math.min(90,height/(2*unit));
    cx=Math.max(hx,Math.min(360-hx,cx));cy=Math.max(hy,Math.min(180-hy,cy));
  }
  function render(){
    unit=scale*zoom;constrain();
    dx=width/2-cx*unit;dy=height/2-cy*unit;
    ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle=ocean;ctx.fillRect(0,0,width,height);
    ctx.setTransform(unit,0,0,unit,dx,dy);
    ctx.strokeStyle='#3c4340';ctx.lineWidth=Math.max(.025,.74/unit);
    for(const s of shapes){ctx.fillStyle=layer==='relations'?s.diplomaticColor:s.color;ctx.fill(s.path,'evenodd');ctx.stroke(s.path);}
    if(showRelief && relief.complete && relief.naturalWidth){
      ctx.save();ctx.globalCompositeOperation='soft-light';ctx.globalAlpha=.55;ctx.drawImage(relief,0,0,360,180);ctx.restore();
    }
    ctx.setTransform(1,0,0,1,0,0);
    if(!showNames)return;
    const occupied=[];
    for(const s of labels){
      const b=s.box,x=b.x*unit+dx,y=b.y*unit+dy;
      if(b.w*unit<48||x<0||y<0||x>width||y>height)continue;
      const text=nationName(s.name).toLocaleUpperCase('ru');
      const size=Math.min(27,Math.max(9,b.w*unit/(text.length*.72)));
      ctx.font='bold '+size+'px Georgia, serif';
      const w=ctx.measureText(text).width;
      if(w>b.w*unit*1.2||occupied.some(o=>Math.abs(x-o.x)<(w+o.w)/2+4 && Math.abs(y-o.y)<(size+o.size)/2+2))continue;
      if(!ctx.isPointInPath(s.path,b.x,b.y,'evenodd'))continue;
      ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineWidth=2.2;
      ctx.strokeStyle='#283238ad';ctx.fillStyle='#fff9df';ctx.strokeText(text,x,y);ctx.fillText(text,x,y);
      occupied.push({x,y,w,size});
    }
  }
  function resize(){
    if(board){
      const ratio=Math.min(2,window.devicePixelRatio||1),rect=board.getBoundingClientRect();
      width=Math.max(1,Math.round(rect.width*ratio));height=Math.max(1,Math.round(rect.height*ratio));
      scale=Math.min(width/360,height/150);
    }
    canvas.width=width;canvas.height=height;render();
  }
  if(board && own){cx=own.x;cy=own.y;zoom=Math.min(8,Math.max(2.4,95/Math.max(own.w,own.h,1)));}
  resize();
  if(!relief.complete)relief.addEventListener('load',()=>{if(canvas.isConnected)render();},{once:true});
  if(!onSelect)return;
  function point(e){
    const r=canvas.getBoundingClientRect();
    return {x:(e.clientX-r.left)*width/r.width,y:(e.clientY-r.top)*height/r.height};
  }
  function select(e){
    const {x,y}=point(e);
    const hit=shapes.findLast(s=>s.name && ctx.isPointInPath(s.path,(x-dx)/unit,(y-dy)/unit,'evenodd'));
    if(hit)onSelect(hit.name,nationName(hit.name));
  }
  if(!board){canvas.onclick=select;return;}
  const layerForm=board.querySelector('.map-layers');
  layerForm.onchange=()=>{
    layer=layerForm.querySelector('[data-layer]').value;showNames=layerForm.querySelector('[data-labels]').checked;showRelief=layerForm.querySelector('[data-relief]').checked;
    layerForm.querySelector('[data-legend]').hidden=layer!=='relations';render();
  };
  activeResize?.disconnect();activeResize=new ResizeObserver(resize);activeResize.observe(board);
  function magnify(factor,x=width/2,y=height/2){
    const old=unit;
    zoom=Math.max(1,Math.min(32,zoom*factor));
    cx+=(x-width/2)*(1/old-1/(scale*zoom));cy+=(y-height/2)*(1/old-1/(scale*zoom));render();
  }
  for(const b of board.querySelectorAll('[data-zoom]'))b.onclick=()=>{
    if(b.dataset.zoom==='fit'){cx=180;cy=85;zoom=1;render();}
    else magnify(b.dataset.zoom==='in'?1.5:1/1.5);
  };
  canvas.onwheel=e=>{e.preventDefault();const p=point(e);magnify(e.deltaY<0?1.25:.8,p.x,p.y);};
  let drag;
  canvas.onpointerdown=e=>{if(!e.isPrimary||e.button!==0)return;const p=point(e);drag={...p,startX:p.x,startY:p.y,moved:false};canvas.setPointerCapture(e.pointerId);};
  canvas.onpointermove=e=>{
    if(!drag||!e.isPrimary)return;
    const p=point(e);
    if(!drag.moved && Math.hypot(p.x-drag.startX,p.y-drag.startY)<5)return;
    cx-=(p.x-drag.x)/unit;cy-=(p.y-drag.y)/unit;Object.assign(drag,p,{moved:true});render();
  };
  canvas.onpointerup=e=>{if(!e.isPrimary||!drag)return;if(!drag.moved)select(e);drag=null;};
  canvas.onpointercancel=()=>{drag=null;};
  canvas.onkeydown=e=>{
    const offsets={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
    if(offsets[e.key]){e.preventDefault();cx+=offsets[e.key][0]*50/unit;cy+=offsets[e.key][1]*50/unit;render();}
    else if(['+','=','-'].includes(e.key)){e.preventDefault();magnify(e.key==='-'?.8:1.25);}
  };
  return nation=>{
    const box=labels.find(s=>s.name===nation)?.box;
    if(!box)return;
    cx=box.x;cy=box.y;zoom=Math.max(2,Math.min(18,Math.min(width/(box.w*scale*2.4),height/(box.h*scale*2.4))));render();
  };
}
