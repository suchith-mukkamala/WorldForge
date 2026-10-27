import {useEffect,useRef} from 'react';
import type {KeyboardEvent,MouseEvent} from 'react';
import {BIOME_INFO,SPECIES_INFO,type Brush,type World} from './engine';
import {ARCHITECTURE,settlementStage} from './construction';
import {RESOURCE_COLORS} from './resources';

export const WORLD_CELL_SIZE=6;
const CELL=WORLD_CELL_SIZE;
const hex=(n:number)=>Math.abs(Math.imul(n,16807))>>>0;
/** Pixel-art fantasy map. Canvas redraw depends ONLY on world / map settings. */
export function WorldCanvas({
  world,brush,overlay,selected,onSelect,onEdit,zoom=1,
}:{
  world:World;brush:Brush;overlay:'terrain'|'resources'|'deposits';
  selected:{x:number;y:number}|null;
  onSelect:(x:number,y:number)=>void;onEdit:(x:number,y:number)=>void;zoom?:number;
}){
  const canvasRef=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{
    const canvas=canvasRef.current,ctx=canvas?.getContext('2d');
    if(!canvas||!ctx)return;
    const W=world.width,H=world.height;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      const tile=world.tiles[y*W+x],biome=BIOME_INFO[tile.biome];
      const px=x*CELL,py=y*CELL,h=hex((x+5)*73+(y+11)*317+world.settings.seed);
      ctx.fillStyle=biome.color;ctx.fillRect(px,py,CELL,CELL);
      // Small textures preserve geographic scale even in 320×208 worlds.
      if(tile.biome==='forest'){
        ctx.fillStyle=h%3===0?'#43836b':'#32705c';
        ctx.fillRect(px+(h%3)+1,py+((h>>>4)%3)+1,2,2);
      }else if(tile.biome==='mountain'){
        ctx.fillStyle='#a2a8bb';ctx.fillRect(px+1+(h%2),py+1,3,1);
      }else if(tile.biome==='cave'){
        ctx.fillStyle='#111829';ctx.fillRect(px+2,py+2,3,3);
      }else if(tile.biome==='water'){
        ctx.fillStyle='#377698';ctx.fillRect(px+(h%3),py+3,3,1);
      }else if(tile.biome==='volcanic'){
        ctx.fillStyle='#d68170';ctx.fillRect(px+2,py+2,2,2);
      }else if(tile.biome==='plains'){
        ctx.fillStyle='#86a07c';ctx.fillRect(px+(h%4),py+1,1,1);
      }else if(tile.biome==='wasteland'){
        ctx.fillStyle='#a97882';ctx.fillRect(px+(h%4),py+4,2,1);
      }
      if(overlay==='resources'&&tile.biome!=='water'){
        const fullness=Math.min(1,tile.food/Math.max(1,biome.food*world.settings.resourceLevel));
        ctx.fillStyle=fullness>.66?'rgba(117,255,176,.34)':
          fullness>.32?'rgba(233,202,99,.35)':'rgba(255,88,124,.45)';
        ctx.fillRect(px,py,CELL,CELL);
      }
    }
    if(overlay==='deposits'||zoom>=2){
      for(const d of world.deposits??[]){
        const x=d.index%W,y=Math.floor(d.index/W),px=x*CELL,py=y*CELL;
        if(d.amount<.1)continue;
        ctx.fillStyle=RESOURCE_COLORS[d.kind];
        if(d.kind==='tree'){
          ctx.fillRect(px+2,py,2,5);ctx.fillRect(px+1,py+2,4,2);
        }else{
          ctx.fillRect(px+1,py+3,4,2);ctx.fillRect(px+2,py+1,2,2);
        }
        if(overlay==='deposits'){
          ctx.fillStyle='rgba(8,14,27,.8)';
          ctx.fillRect(px,py+5,6,1);
          ctx.fillStyle=RESOURCE_COLORS[d.kind];
          ctx.fillRect(px,py+5,6*d.amount/d.capacity,1);
        }
      }
    }
    if(zoom>=2){
      for(const s of world.settlements){
        for(const id of s.infrastructure?.roads??[]){
          const x=id%W,y=Math.floor(id/W);
          ctx.fillStyle='rgba(239,207,151,.65)';
          ctx.fillRect(x*CELL+1,y*CELL+2,CELL-2,2);
        }
      }
    }
    // Engine-owned transport infrastructure is visible at both world and
    // neighborhood scales. Display decisions never enter its simulation.
    for(const road of world.transport?.roads??[]){
      if(road.condition<=25)continue;
      const x=road.index%W,y=Math.floor(road.index/W);
      ctx.fillStyle='rgba(229,185,111,.85)';
      ctx.fillRect(x*CELL,y*CELL+2,CELL,3);
      if(zoom>=2){
        ctx.fillStyle='#725f53';ctx.fillRect(x*CELL+2,y*CELL+3,2,1);
      }
    }
    for(const bridge of world.transport?.bridges??[]){
      if(bridge.condition<=25)continue;
      const x=bridge.index%W,y=Math.floor(bridge.index/W);
      ctx.fillStyle='#f2d1a0';ctx.fillRect(x*CELL,y*CELL+1,CELL,4);
      ctx.fillStyle='#876b58';ctx.fillRect(x*CELL+1,y*CELL+2,1,3);
      ctx.fillRect(x*CELL+4,y*CELL+2,1,3);
    }
    for(const ruin of world.ruins??[]){
      ctx.fillStyle='#b5a4ae';ctx.fillRect(ruin.x*CELL-1,ruin.y*CELL-2,8,6);
      ctx.fillStyle='#272b3e';ctx.fillRect(ruin.x*CELL+2,ruin.y*CELL-1,4,4);
    }
    for(const s of world.settlements){
      const px=s.x*CELL,py=s.y*CELL;
      const stage=settlementStage(s),size={encampment:8,hamlet:10,
        village:12,town:14,city:16}[stage];
      ctx.fillStyle='#f6d7a5';ctx.fillRect(px-2,py-3,size,size);
      ctx.fillStyle=ARCHITECTURE[s.species].roof;
      ctx.fillRect(px-1,py-2,size-2,size-2);
      ctx.fillStyle=SPECIES_INFO[s.species].color;
      ctx.fillRect(px+2,py+1,Math.max(2,size-7),Math.max(2,size-7));
      ctx.fillStyle='#f7dea1';ctx.fillRect(px,py-4,size-3,2);
      if(stage==='town'||stage==='city'){
        ctx.fillStyle='#f5e5bb';ctx.fillRect(px+size-5,py-7,3,5);
      }
    }
    if(zoom>=2.5){
      for(const s of world.settlements)for(const b of s.infrastructure?.buildings??[]){
        const x=b.x*CELL,y=b.y*CELL,style=ARCHITECTURE[b.culture];
        ctx.fillStyle=b.stage==='ruin'?'#676577':
          b.stage==='abandoned'?'#6f5965':style.wall;
        ctx.fillRect(x+1,y+1,5,5);
        ctx.fillStyle=b.stage==='complete'?style.roof:'#e5c48a';
        ctx.fillRect(x,y,5,2);
        if(['foundation','frame','finishing'].includes(b.stage)){
          ctx.fillStyle='#e2c78e';ctx.fillRect(x,y+5,Math.max(1,b.progress/20),1);
        }
      }
    }
    for(const a of world.agents){
      const px=a.x*CELL,py=a.y*CELL;
      ctx.fillStyle='#081323';ctx.fillRect(px+1,py+1,4,4);
      ctx.fillStyle=SPECIES_INFO[a.species].color;
      // Two pixels versus the old 7-pixel sprites: people look like small
      // inhabitants of a broad landscape rather than occupying whole tiles.
      ctx.fillRect(px+2,py+2,2,2);
      if(a.partnerId!==undefined){
        ctx.fillStyle='#ffe7b8';ctx.fillRect(px+4,py+1,1,1);
      }
    }
    if(zoom>=1.5){
      const drivers=new Map(world.agents.map(a=>[a.id,a]));
      for(const shipment of world.shipments??[]){
        const a=drivers.get(shipment.carrierId);if(!a)continue;
        const px=a.x*CELL,py=a.y*CELL;
        ctx.fillStyle='#201b2b';ctx.fillRect(px,py,6,5);
        ctx.fillStyle='#f4bd76';ctx.fillRect(px+1,py,4,3);
        ctx.fillStyle='#5b5c6a';ctx.fillRect(px+1,py+4,1,1);
        ctx.fillRect(px+4,py+4,1,1);
      }
    }
    if(selected){
      const px=selected.x*CELL,py=selected.y*CELL;
      ctx.strokeStyle='#fff3b4';ctx.lineWidth=2;ctx.strokeRect(px+.5,py+.5,CELL-1,CELL-1);
      ctx.strokeStyle='#15192e';ctx.lineWidth=1;ctx.strokeRect(px-.5,py-.5,CELL+1,CELL+1);
    }
  },[world,overlay,selected,zoom]);
  const select=(event:MouseEvent<HTMLCanvasElement>)=>{
    const rect=event.currentTarget.getBoundingClientRect();
    const x=Math.floor((event.clientX-rect.left)/rect.width*world.width);
    const y=Math.floor((event.clientY-rect.top)/rect.height*world.height);
    if(x<0||x>=world.width||y<0||y>=world.height)return;
    if(brush.kind==='inspect')onSelect(x,y);
    else onEdit(x,y);
  };
  const keyboard=(event:KeyboardEvent<HTMLCanvasElement>)=>{
    if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter',' '].includes(event.key))return;
    event.preventDefault();
    const current=selected??{x:Math.floor(world.width/2),y:Math.floor(world.height/2)};
    let {x,y}=current;
    if(event.key==='ArrowUp')y=Math.max(0,y-1);
    if(event.key==='ArrowDown')y=Math.min(world.height-1,y+1);
    if(event.key==='ArrowLeft')x=Math.max(0,x-1);
    if(event.key==='ArrowRight')x=Math.min(world.width-1,x+1);
    if(event.key==='Enter'||event.key===' '){
      if(brush.kind!=='inspect')onEdit(x,y);
    }else onSelect(x,y);
  };
  return <canvas ref={canvasRef} className="evo-world-canvas"
    width={world.width*CELL} height={world.height*CELL}
    style={{width:(zoom*100)+'%'}}
    role="grid" tabIndex={0}
    aria-label={'Interactive fantasy map: '+world.width+' by '+world.height+
      ' cells. Click to '+(brush.kind==='inspect'?'inspect a location':
        brush.kind==='spawn'?'place a '+brush.species:
          brush.kind==='food'?'replenish food':'paint '+brush.biome)+
      '. Arrow keys move the selection; Enter applies the selected brush.'}
    onClick={select} onKeyDown={keyboard}/>;
}
