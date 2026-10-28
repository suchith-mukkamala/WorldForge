import {useEffect,useRef} from 'react';
import type {KeyboardEvent,MouseEvent} from 'react';
import {BIOME_INFO,SPECIES_INFO,type Brush,type World} from './engine';
import {ARCHITECTURE,settlementStage} from './construction';
import {RESOURCE_COLORS} from './resources';
import {paintBuilding,paintDeposit,paintPerson,paintTerrain,spriteKey,
  paintAncientSite,PERSON_SPRITE_HEIGHT,PERSON_SPRITE_WIDTH} from './pixelArt';
import {canAnimate,directionBetween,motionFrame,visualMotionDuration,
  type Facing,type Motion,type Point} from './motion';

export const WORLD_CELL_SIZE=6;
const CELL=WORLD_CELL_SIZE;
/** Pixel-art fantasy map. Canvas redraw depends ONLY on world / map settings. */
export function WorldCanvas({
  world,brush,overlay,selected,onSelect,onEdit,zoom=1,speed=4,
  followId=null,onFollowPosition,
}:{
  world:World;brush:Brush;overlay:'terrain'|'resources'|'deposits';
  selected:{x:number;y:number}|null;
  onSelect:(x:number,y:number)=>void;onEdit:(x:number,y:number)=>void;
  zoom?:number;speed?:number;followId?:number|null;
  onFollowPosition?:(x:number,y:number)=>void;
}){
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const backgroundRef=useRef<HTMLCanvasElement|null>(null);
  const backgroundStamp=useRef<{
    tiles:World['tiles'];settlements:World['settlements'];
    ruins:World['ruins'];deposits:World['deposits'];
    ancientSites:World['ancientSites'];
    transport:World['transport'];zoom:number;overlay:string;seed:number;
    width:number;height:number;
  }|null>(null);
  const spriteCache=useRef<Map<string,HTMLCanvasElement>>(new Map());
  const prior=useRef<{year:number;day:number;seed:number;
    positions:Map<number,Point>}|null>(null);
  const facing=useRef<Map<number,Facing>>(new Map());
  const motions=useRef<Map<number,Motion>>(new Map());
  useEffect(()=>{
    const canvas=canvasRef.current,visible=canvas?.getContext('2d');
    if(!canvas||!visible)return;
    const background=backgroundRef.current??document.createElement('canvas');
    backgroundRef.current=background;
    if(background.width!==canvas.width)background.width=canvas.width;
    if(background.height!==canvas.height)background.height=canvas.height;
    const ctx=background.getContext('2d');if(!ctx)return;
    const W=world.width,H=world.height;
    const stamp=backgroundStamp.current;
    const sceneryChanged=!stamp||stamp.tiles!==world.tiles||
      stamp.settlements!==world.settlements||stamp.ruins!==world.ruins||
      stamp.ancientSites!==world.ancientSites||
      stamp.deposits!==world.deposits||stamp.transport!==world.transport||
      stamp.zoom!==zoom||stamp.overlay!==overlay||
      stamp.seed!==world.settings.seed||stamp.width!==canvas.width||
      stamp.height!==canvas.height;
    if(sceneryChanged){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.imageSmoothingEnabled=false;
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      const tile=world.tiles[y*W+x],biome=BIOME_INFO[tile.biome];
      const px=x*CELL,py=y*CELL;
      paintTerrain(ctx,tile.biome,biome.color,x,y,world.settings.seed);
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
        paintDeposit(ctx,d.kind,x,y,d.amount,d.capacity);
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
      const x=ruin.x*CELL,y=ruin.y*CELL;
      const culture=ARCHITECTURE[ruin.species];
      ctx.fillStyle='#222537';ctx.fillRect(x-4,y+4,16,3);
      ctx.fillStyle=culture.wall;ctx.fillRect(x-4,y-3,4,8);
      ctx.fillRect(x+6,y-5,4,9);
      ctx.fillStyle=culture.roof;ctx.fillRect(x-5,y-6,5,2);
      ctx.fillRect(x+5,y-7,5,2);
      ctx.fillStyle='#394351';ctx.fillRect(x,y+2,6,4);
      ctx.fillStyle='#8fa18b';ctx.fillRect(x-3,y+4,2,2);
      ctx.fillRect(x+9,y+3,2,2);
    }
    for(const site of world.ancientSites??[]){
      paintAncientSite(ctx,site.kind,site.x*CELL,site.y*CELL,
        (site.visits??site.visitors.length)>0);
    }
    for(const s of world.settlements){
      const px=s.x*CELL,py=s.y*CELL;
      const stage=settlementStage(s),size={encampment:8,hamlet:10,
        village:12,town:14,city:16}[stage];
      const roof=ARCHITECTURE[s.species].roof;
      ctx.fillStyle='#222b3c';ctx.fillRect(px-3,py-3,size+2,size+2);
      ctx.fillStyle='#e2c598';ctx.fillRect(px-2,py-2,size,size);
      ctx.fillStyle=roof;ctx.fillRect(px-2,py-4,size,4);
      ctx.fillStyle=ARCHITECTURE[s.species].wall;
      ctx.fillRect(px,py,Math.max(3,size-4),Math.max(3,size-4));
      ctx.fillStyle='#342e40';ctx.fillRect(px+2,py+size-6,3,4);
      ctx.fillStyle=SPECIES_INFO[s.species].color;
      ctx.fillRect(px+size-5,py+1,2,2);
      if(stage==='village'||stage==='town'||stage==='city'){
        ctx.fillStyle='#f5e0b1';ctx.fillRect(px,py-5,size-3,1);
        ctx.fillStyle='#d3b78a';ctx.fillRect(px+size-6,py-7,3,5);
      }
      if(stage==='town'||stage==='city'){
        ctx.fillStyle='#f5e5bb';ctx.fillRect(px+size-6,py-9,3,3);
        if(stage==='city'){
          ctx.fillStyle=roof;ctx.fillRect(px-3,py-8,4,6);
          ctx.fillRect(px+size-1,py-8,4,6);
        }
      }
    }
    if(zoom>=2.5){
      for(const s of world.settlements)for(const b of s.infrastructure?.buildings??[]){
        paintBuilding(ctx,b);
      }
    }
    backgroundStamp.current={tiles:world.tiles,settlements:world.settlements,
      ruins:world.ruins,deposits:world.deposits,transport:world.transport,
      ancientSites:world.ancientSites,
      zoom,overlay,seed:world.settings.seed,width:canvas.width,height:canvas.height};
    }
    const current=new Map(world.agents.map(a=>[a.id,{x:a.x,y:a.y}]));
    const previous=prior.current;
    const now=performance.now();
    const day=world.dayOfYear??0;
    if(!previous||previous.seed!==world.settings.seed||
      world.year<previous.year||world.year-previous.year>1||
      world.year===previous.year&&day<previous.day){
      motions.current.clear();facing.current.clear();spriteCache.current.clear();
    }else if(world.year>previous.year||day!==previous.day){
      const duration=visualMotionDuration(speed);
      const nextMotions=new Map<number,Motion>();
      for(const [id,to] of current){
        const from=previous.positions.get(id);if(!from)continue;
        if(canAnimate(from,to)){
          const direction=directionBetween(from,to,facing.current.get(id));
          facing.current.set(id,direction);
          nextMotions.set(id,{from,to,start:now,duration,facing:direction});
        }
      }
      motions.current=nextMotions;
    }
    prior.current={year:world.year,day,seed:world.settings.seed,positions:current};
    for(const id of [...facing.current.keys()])if(!current.has(id))facing.current.delete(id);
    if(spriteCache.current.size>6500)spriteCache.current.clear();
    const ordered=[...world.agents].sort((a,b)=>a.y-b.y||a.x-b.x||a.id-b.id);
    const populationByTile=new Map<number,number>();
    const visualSlot=new Map<number,number>();
    for(const a of ordered){
      const index=a.y*W+a.x;
      visualSlot.set(a.id,populationByTile.get(index)??0);
      populationByTile.set(index,(populationByTile.get(index)??0)+1);
    }
    const offsets=[[0,0],[-2,-2],[2,-2],[-2,2],[2,2],[-3,0],[3,0],
      [0,-3]] as const;
    let handle=0,lastFrame=-Infinity;
    const draw=(timestamp:number)=>{
      // Animation is presentation-only and capped to limit large-world GPU work.
      if(timestamp-lastFrame<1000/24){handle=requestAnimationFrame(draw);return;}
      lastFrame=timestamp;
      visible.clearRect(0,0,canvas.width,canvas.height);
      visible.imageSmoothingEnabled=false;
      visible.drawImage(background,0,0);
      const positions=new Map<number,Point>();
      let active=false;
      for(const a of ordered){
        const movement=motions.current.get(a.id);
        const frame=movement?motionFrame(movement,timestamp):null;
        const x=frame?.x??a.x,y=frame?.y??a.y;
        positions.set(a.id,{x,y});
        if(frame?.walking)active=true;
        const [ox,oy]=offsets[(visualSlot.get(a.id)??0)%offsets.length];
        const px=x*CELL+ox,py=y*CELL+oy;
        if(zoom<3){
          visible.fillStyle='#081323';visible.fillRect(px+1,py+1,4,4);
          visible.fillStyle=SPECIES_INFO[a.species].color;
          visible.fillRect(px+2,py+2,2,2);
          continue;
        }
        const direction=frame?.facing??facing.current.get(a.id)??'south';
        const stride=frame?.stride??0;
        const key=spriteKey(a)+':'+direction+':'+stride;
        let sprite=spriteCache.current.get(key);
        if(!sprite){
          sprite=document.createElement('canvas');
          sprite.width=PERSON_SPRITE_WIDTH;sprite.height=PERSON_SPRITE_HEIGHT;
          const painter=sprite.getContext('2d');
          if(painter)paintPerson(painter,a,0,0,direction,stride);
          spriteCache.current.set(key,sprite);
        }
        const focus=selected?.x===a.x&&selected?.y===a.y;
        const width=focus&&zoom>=5?16:zoom>=5?12:9;
        const height=focus&&zoom>=5?22:zoom>=5?17:13;
        visible.drawImage(sprite,px+3-Math.floor(width/2),py+5-height,width,height);
        if(a.mind?.expedition?.stage==='travel'){
          visible.fillStyle='#7d5947';visible.fillRect(px-4,py-6,3,5);
          visible.fillStyle='#d1b68a';visible.fillRect(px-3,py-6,1,2);
        }
        if(a.artifacts?.length){
          visible.fillStyle='#efd48b';visible.fillRect(px+7,py-10,2,2);
          visible.fillStyle='#fff3c3';visible.fillRect(px+7,py-11,1,1);
        }
        if(a.partnerId!==undefined){
          visible.fillStyle='#ffe1b3';visible.fillRect(px+6,py-8,2,2);
        }
      }
      if(zoom>=1.5)for(const shipment of world.shipments??[]){
        const p=positions.get(shipment.carrierId);if(!p)continue;
        const px=p.x*CELL,py=p.y*CELL;
        if(shipment.mode==='sea'){
          visible.fillStyle='#332f3b';visible.fillRect(px-3,py+3,12,2);
          visible.fillStyle='#c0925c';visible.fillRect(px-2,py+1,10,3);
          visible.fillStyle='#f5e8c5';visible.fillRect(px+2,py-8,1,10);
          visible.fillRect(px-1,py-7,3,6);
          visible.fillStyle='#d3dbea';visible.fillRect(px+3,py-5,3,5);
          visible.fillStyle='#825e50';visible.fillRect(px+5,py+2,2,1);
        }else{
          visible.fillStyle='#3d3340';visible.fillRect(px-2,py+1,10,4);
          visible.fillStyle='#d4ae79';visible.fillRect(px-1,py,8,4);
          visible.fillStyle='#b2835c';visible.fillRect(px,py-2,5,2);
          visible.fillStyle='#242d39';visible.fillRect(px,py+5,2,2);
          visible.fillRect(px+5,py+5,2,2);
        }
      }
      if(selected){
        const marked=ordered.find(a=>a.x===selected.x&&a.y===selected.y);
        const marker=marked?positions.get(marked.id):selected;
        const px=(marker?.x??selected.x)*CELL,py=(marker?.y??selected.y)*CELL;
        visible.strokeStyle='#fff3b4';visible.lineWidth=2;
        visible.strokeRect(px+.5,py+.5,CELL-1,CELL-1);
        visible.strokeStyle='#15192e';visible.lineWidth=1;
        visible.strokeRect(px-.5,py-.5,CELL+1,CELL+1);
      }
      if(followId!==null){
        const tracked=positions.get(followId);
        if(tracked)onFollowPosition?.(tracked.x,tracked.y);
      }
      if(active)handle=requestAnimationFrame(draw);
    };
    draw(now);
    // Calendar days that do not change the map reuse this composed frame.
    return ()=>cancelAnimationFrame(handle);
  },[world.year,world.agents,world.tiles,world.settlements,world.ruins,
    world.deposits,world.transport,world.shipments,world.settings.seed,
    overlay,selected,zoom,speed,followId,onFollowPosition]);
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
