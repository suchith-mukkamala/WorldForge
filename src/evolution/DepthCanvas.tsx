import {useEffect,useRef} from 'react';
import type {KeyboardEvent,MouseEvent} from 'react';
import {BIOME_INFO,SPECIES_INFO,type Biome,type Brush,type World} from './engine';
import type {MapOverlay} from './WorldCanvas';
import {SEA_LEVEL,topographyForWorld} from './topography';
import {hydrologyForWorld} from './hydrology';
import {terrainDetailAt} from './terrainDetails';
import {surfaceColor,paintDepthSurfaceDetail,paintDepthRoads,
  depthRoadSignature} from './depthWorldArt';
import {populationScene,renderedPopulation} from './populationVisibility';
import {paintDepthBuilding,paintDepthPerson,paintDepthTree} from './depthSprites';
import {buildingTier,type Building} from './construction';
import type {Agent} from './engine';
import {mortalWorldPoint} from './spatialDetails';
import {updateAtmosphereLayer} from './sceneAtmosphere';
import {canAnimate,directionBetween,motionFrame,visualMotionDuration,
  type Motion,type Point} from './motion';
import {createDepthProjector,DEFAULT_DEPTH_CAMERA,depthDrop,
  tileFromHit,tileHitColor,type DepthCamera} from './depthProjection';

const BASINS=['#385e60','#4a6758','#536072','#637056',
  '#42637c','#6c695e','#456f68','#606d77'];
const PALETTE:Record<Biome,{top:string;right:string;left:string}>={
  plains:{top:'#7a9b75',right:'#426e5a',left:'#527d60'},
  forest:{top:'#36765f',right:'#204b47',left:'#286554'},
  mountain:{top:'#9ca9ad',right:'#495972',left:'#62778a'},
  cave:{top:'#667185',right:'#303b52',left:'#414c63'},
  wasteland:{top:'#a28182',right:'#624e63',left:'#795c6d'},
  volcanic:{top:'#a46a73',right:'#513e59',left:'#74465d'},
  water:{top:'#367c9b',right:'#1d4b72',left:'#285f83'},
};
const HEIGHT_COLORS=['#234966','#3b7182','#5d866b','#74936a',
  '#8c9a72','#b19f7c','#9b918b','#bcc1c4','#e8e7d9'];
type Pt={x:number;y:number};
type Projector=ReturnType<typeof createDepthProjector>;

function polygon(ctx:CanvasRenderingContext2D,points:readonly Pt[],color:string){
  ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);
  for(let i=1;i<points.length;i++)ctx.lineTo(points[i].x,points[i].y);
  ctx.closePath();ctx.fill();
}
/** Illuminated rock faces are drawn as real projected geometry. Their surface
 * is part of the tile's color-picking silhouette, including tall cliff walls. */
function rockFace(ctx:CanvasRenderingContext2D,hit:CanvasRenderingContext2D,
  a:Pt,b:Pt,drop:number,color:string,index:number){
  if(drop<=0)return;
  const shape=[a,b,{x:b.x,y:b.y+drop},{x:a.x,y:a.y+drop}];
  polygon(ctx,shape,color);
  polygon(hit,shape,tileHitColor(index));
  if(drop>=5){
    ctx.strokeStyle='rgba(238,221,181,.23)';ctx.lineWidth=.7;
    for(let layer=5;layer<drop;layer+=8){
      ctx.beginPath();ctx.moveTo(a.x,a.y+layer);
      ctx.lineTo(b.x,b.y+layer);ctx.stroke();
    }
    ctx.strokeStyle='rgba(10,22,35,.45)';ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(a.x,a.y+drop);
    ctx.lineTo(b.x,b.y+drop);ctx.stroke();
  }
}
function tileColor(w:World,index:number,overlay:MapOverlay,height:number,
  drainage:ReturnType<typeof hydrologyForWorld>|null):string{
  const tile=w.tiles[index];
  if(overlay==='elevation')return HEIGHT_COLORS[tile.biome==='water'?0:
    Math.min(8,Math.floor(height/30))];
  if(overlay==='watersheds'&&drainage)return tile.biome==='water'?'#285d7a':
    BASINS[(drainage.basin[index]>>>0)%BASINS.length];
  if(overlay==='resources'&&tile.biome!=='water'){
    const fraction=tile.food/Math.max(1,
      BIOME_INFO[tile.biome].food*w.settings.resourceLevel);
    return fraction>.66?'#639b75':fraction>.32?'#b1a36b':'#a36a73';
  }
  return PALETTE[tile.biome].top;
}

/** Static terrain is drawn rear-to-front, so even vast worlds can be rendered
 * in one inexpensive 2D canvas without allocating thousands of SVG nodes.
 */
function renderTerrain(w:World,overlay:MapOverlay,
  ctx:CanvasRenderingContext2D,hit:CanvasRenderingContext2D,
  projector:Projector){
  const W=w.width,H=w.height,heights=topographyForWorld(w).heights;
  const drainage=overlay==='watersheds'||overlay==='terrain'?
    hydrologyForWorld(w):null;
  const skyline=ctx.createLinearGradient(0,0,0,ctx.canvas.height);
  skyline.addColorStop(0,'#10233b');
  skyline.addColorStop(.5,'#142a3b');
  skyline.addColorStop(1,'#091928');
  ctx.fillStyle=skyline;ctx.fillRect(0,0,ctx.canvas.width,ctx.canvas.height);
  hit.clearRect(0,0,hit.canvas.width,hit.canvas.height);
  ctx.imageSmoothingEnabled=false;hit.imageSmoothingEnabled=false;
  const ordered=Array.from({length:W*H},(_,i)=>i);
  ordered.sort((a,b)=>projector.order(a%W,Math.floor(a/W))-
    projector.order(b%W,Math.floor(b/W))||a%W-b%W);
  for(const index of ordered){
      const x=index%W,y=Math.floor(index/W),height=heights[index];
      const p=projector.project(x,y,height);
      const corners=projector.tileCorners(x,y,height);
      const biome=w.tiles[index].biome,palette=PALETTE[biome];
      const east=x<W-1?heights[index+1]:height;
      const south=y<H-1?heights[index+W]:height;
      const west=x>0?heights[index-1]:height;
      const north=y>0?heights[index-W]:height;
      // Whichever side of the continent faces the orbiting camera gets a
      // physical cliff wall; the opposite side cannot bleed through it.
      const fx=projector.frontX,fy=projector.frontY;
      if(fx){
        const adjacent=fx>0?east:west;
        const boundary=fx>0?x===W-1:x===0;
        const drop=depthDrop(height,boundary?SEA_LEVEL:adjacent,
          projector.riseScale)+(boundary?15:0);
        rockFace(ctx,hit,fx>0?corners[1]:corners[3],
          fx>0?corners[2]:corners[0],drop,
          fx>0?palette.right:palette.left,index);
      }
      if(fy){
        const adjacent=fy>0?south:north;
        const boundary=fy>0?y===H-1:y===0;
        const drop=depthDrop(height,boundary?SEA_LEVEL:adjacent,
          projector.riseScale)+(boundary?15:0);
        rockFace(ctx,hit,fy>0?corners[2]:corners[0],
          fy>0?corners[3]:corners[1],drop,
          fy>0?palette.left:palette.right,index);
      }
      polygon(ctx,corners,overlay==='terrain'?
        surfaceColor(biome,x,y,w.settings.seed):
        tileColor(w,index,overlay,height,drainage));
      if(overlay==='terrain'||overlay==='elevation'){
        // A northwest sun illuminates west-facing slopes; the other aspect
        // darkens. Light depends on real neighboring heights, not random art.
        const light=(west+north-east-south)/160;
        const tint=Math.max(-.26,Math.min(.26,light));
        polygon(ctx,corners,tint>=0?
          `rgba(250,237,193,${(.06+tint*.75).toFixed(3)})`:
          `rgba(9,24,45,${(.09-tint*.85).toFixed(3)})`);
        if(height>=135&&biome!=='water'&&overlay==='terrain')
          polygon(ctx,corners,`rgba(224,231,222,${Math.min(.3,
            (height-125)/380).toFixed(3)})`);
      }
      if(overlay==='terrain'){
        paintDepthSurfaceDetail(ctx,biome,p,x,y,w.settings.seed);
        if(biome!=='water'&&[east,south,west,north].some((_,n)=>{
          const at=n===0?index+1:n===1?index+W:n===2?index-1:index-W;
          const inBounds=n===0?x<W-1:n===1?y<H-1:n===2?x>0:y>0;
          return inBounds&&w.tiles[at].biome==='water';
        })){
          ctx.fillStyle='rgba(245,223,176,.58)';
          ctx.fillRect(Math.round(p.x)-2,Math.round(p.y)-2,4,1);
        }
      }
      ctx.strokeStyle='rgba(10,24,39,.28)';ctx.lineWidth=.6;
      ctx.beginPath();
      if(fx){const a=fx>0?corners[1]:corners[3];
        const b=fx>0?corners[2]:corners[0];
        ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);}
      if(fy){const a=fy>0?corners[2]:corners[0];
        const b=fy>0?corners[3]:corners[1];
        ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);}
      ctx.stroke();
      if((overlay==='elevation'||overlay==='terrain')&&(
        x>0&&Math.floor(heights[index-1]/30)<Math.floor(height/30)||
        y>0&&Math.floor(heights[index-W]/30)<Math.floor(height/30))){
        ctx.strokeStyle=overlay==='elevation'?'rgba(247,232,193,.8)':
          'rgba(255,245,200,.5)';ctx.lineWidth=.9;
        ctx.beginPath();ctx.moveTo(corners[3].x,corners[3].y);
        ctx.lineTo(corners[0].x,corners[0].y);ctx.stroke();
      }
      // Sparse high-pixel silhouettes preserve the seeded motif vocabulary
      // while leaving the shape of hills and cliffs easy to distinguish.
      const vegetationHash=(Math.imul(x+w.settings.seed,73856093)^
        Math.imul(y+w.settings.seed,19349663))>>>0;
      if(overlay==='terrain'&&vegetationHash%7===0){
        const detail=terrainDetailAt(biome,x,y,w.settings.seed,height);
        if(detail.motif==='oak'||detail.motif==='pine'){
          paintDepthTree(ctx,p,detail.motif==='pine',
            (vegetationHash>>>5)%3);
        }else if(['boulder','snowstone','crystal','basalt'].includes(detail.motif)){
          ctx.fillStyle='rgba(10,25,35,.32)';
          ctx.fillRect(p.x-3,p.y,7,2);
          ctx.fillStyle=detail.motif==='snowstone'?'#dce5e8':
            detail.motif==='crystal'?'#5dc5c5':
            detail.motif==='basalt'?'#4b4456':'#83949b';
          ctx.fillRect(p.x-2,p.y-4,6,4);
          ctx.fillStyle=detail.motif==='crystal'?'#d4f6e7':'#ecdfc6';
          ctx.fillRect(p.x-1,p.y-6,3,3);
          ctx.fillStyle='#465466';ctx.fillRect(p.x+2,p.y-1,2,1);
        }else if(['flowers','grass','reeds','fern','scrub'].includes(detail.motif)){
          ctx.fillStyle=biome==='wasteland'?'#9c9279':'#427b5d';
          ctx.fillRect(p.x-2,p.y-2,5,2);
          ctx.fillStyle=detail.motif==='flowers'?'#e9c88a':
            detail.motif==='reeds'?'#bad6a0':'#83b98b';
          ctx.fillRect(p.x-1,p.y-4,1,3);
          ctx.fillRect(p.x+2,p.y-3,1,2);
        }
      }
      if(overlay==='watersheds'&&drainage&&
        drainage.pondDepth[index]>=6&&biome!=='water'){
        ctx.fillStyle='#89b9be';ctx.fillRect(p.x-2,p.y-1,4,2);
      }
      polygon(hit,corners,tileHitColor(index));
  }
  if(drainage)for(let i=0;i<W*H;i++){
    const tier=drainage.channel[i],next=drainage.flowTo[i];
    if(!tier||next<0)continue;
    const from=projector.project(i%W,Math.floor(i/W),heights[i]);
    const to=projector.project(next%W,Math.floor(next/W),heights[next]);
    ctx.strokeStyle=overlay==='watersheds'?'#a3e5ee':'#5fc4e3';
    ctx.lineWidth=tier>=3?2:tier===2?1.5:1;
    ctx.beginPath();ctx.moveTo(from.x,from.y);
    ctx.lineTo(to.x,to.y);ctx.stroke();
  }
  if(overlay==='terrain')paintDepthRoads(ctx,w,heights,projector);
  if(overlay==='deposits')for(const d of w.deposits??[]){
    if(d.amount<=.1)continue;
    const p=projector.project(d.index%W,Math.floor(d.index/W),heights[d.index]);
    ctx.fillStyle=d.kind==='tree'?'#92ca91':'#e9c790';
    ctx.fillRect(p.x-1,p.y-4,3,4);
  }
}

type DepthActor={order:number;paint:()=>void};
type BuildingSpriteCache=Map<string,HTMLCanvasElement>;
/** A fixed 64px atlas slot holds every current building silhouette, including
 * tier-3 roofs. Rendering the expensive pixel geometry once per appearance
 * replaces dozens of fillRects per building on each walk-animation frame. */
function paintCachedBuilding(ctx:CanvasRenderingContext2D,b:Building,
  p:Pt,cache:BuildingSpriteCache):void{
  const key=[b.type,b.stage,b.culture,buildingTier(b)].join(':');
  let sprite=cache.get(key);
  if(!sprite){
    sprite=document.createElement('canvas');
    sprite.width=64;sprite.height=64;
    const painter=sprite.getContext('2d');
    if(painter){painter.imageSmoothingEnabled=false;
      paintDepthBuilding(painter,b,{x:32,y:54});}
    if(cache.size>160)cache.clear();
    cache.set(key,sprite);
  }
  ctx.drawImage(sprite,Math.round(p.x)-32,Math.round(p.y)-54);
}
/** Geometry and structures are immutable throughout an animation. Build
 * projected actors only when the world or camera changes. */
function prepareDepthStructures(ctx:CanvasRenderingContext2D,w:World,
  projector:Projector,cache:BuildingSpriteCache):DepthActor[]{
  const heights=topographyForWorld(w).heights,actors:DepthActor[]=[];
  for(const s of w.settlements){
    const p=projector.project(s.x,s.y,heights[s.y*w.width+s.x]);
    actors.push({order:p.y+.2,paint:()=>{
      ctx.fillStyle='#21364a';ctx.fillRect(p.x-1,p.y-9,2,9);
      ctx.fillStyle=SPECIES_INFO[s.species].color;
      ctx.fillRect(p.x-6,p.y-12,11,4);
      ctx.fillStyle='#f1d9a9';ctx.fillRect(p.x-4,p.y-11,7,1);
    }});
    for(const b of s.infrastructure?.buildings??[]){
      const bp=projector.project(b.x,b.y,heights[b.y*w.width+b.x]);
      actors.push({order:bp.y+.4,paint:()=>paintCachedBuilding(ctx,b,bp,cache)});
    }
  }
  return actors;
}
function paintInhabitants(ctx:CanvasRenderingContext2D,w:World,
  selected:{x:number;y:number}|null,zoom:number,
  positions:Map<number,Point>,walking:Set<number>,projector:Projector,
  structures:DepthActor[],visibleAgents:readonly Agent[]):void{
  const heights=topographyForWorld(w).heights;
  const actors:DepthActor[]=[...structures];
  for(const a of visibleAgents){
    const pos=positions.get(a.id)??{x:a.x,y:a.y};
    const p=projector.project(pos.x,pos.y,heights[a.y*w.width+a.x]);
    actors.push({order:p.y+.6,paint:()=>paintDepthPerson(ctx,a,p,walking.has(a.id),
      zoom>=2||!!selected&&selected.x===a.x&&selected.y===a.y)});
  }
  actors.sort((a,b)=>a.order-b.order);
  for(const actor of actors)actor.paint();
  if(selected){
    const index=selected.y*w.width+selected.x;
    if(index>=0&&index<heights.length){
      const p=projector.project(selected.x,selected.y,heights[index]);
      const corners=projector.tileCorners(selected.x,selected.y,heights[index]);
      ctx.lineWidth=2;ctx.strokeStyle='#fff0ac';ctx.beginPath();
      ctx.moveTo(corners[0].x,corners[0].y);
      for(let i=1;i<corners.length;i++)ctx.lineTo(corners[i].x,corners[i].y);
      ctx.closePath();ctx.stroke();
      ctx.fillStyle='#fff2af';ctx.fillRect(p.x-1,p.y-16,3,5);
    }
  }
}

export function DepthCanvas({world,brush,overlay,selected,onSelect,onEdit,
  zoom=1,speed=4,relief=2.5,camera=DEFAULT_DEPTH_CAMERA,
  followId=null,onFollowPosition}:{
  world:World;brush:Brush;overlay:MapOverlay;
  selected:{x:number;y:number}|null;onSelect:(x:number,y:number)=>void;
  onEdit:(x:number,y:number)=>void;zoom?:number;speed?:number;
  relief?:number;camera?:DepthCamera;followId?:number|null;
  onFollowPosition?:(x:number,y:number)=>void;
}){
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const sceneryRef=useRef<HTMLCanvasElement|null>(null);
  const atmosphereRef=useRef<HTMLCanvasElement|null>(null);
  const pickingRef=useRef<HTMLCanvasElement|null>(null);
  const buildingSpritesRef=useRef<BuildingSpriteCache>(new Map());
  const stampRef=useRef<{tiles:World['tiles'];topography:World['topography'];
    overlay:MapOverlay;deposits:World['deposits'];seed:number;
    relief:number;yaw:number;pitch:number;roadKey:number}|null>(null);
  const priorRef=useRef<{seed:number;year:number;day:number;
    positions:Map<number,Point>}|null>(null);
  const motionsRef=useRef<Map<number,Motion>>(new Map());
  const projector=createDepthProjector(world,relief,camera);
  const size=projector.size;
  useEffect(()=>{
    const canvas=canvasRef.current,ctx=canvas?.getContext('2d');
    if(!canvas||!ctx)return;
    const scenery=sceneryRef.current??document.createElement('canvas');
    const picking=pickingRef.current??document.createElement('canvas');
    sceneryRef.current=scenery;pickingRef.current=picking;
    const atmosphere=atmosphereRef.current??document.createElement('canvas');
    atmosphereRef.current=atmosphere;
    const resize=(c:HTMLCanvasElement)=>{
      if(c.width!==canvas.width)c.width=canvas.width;
      if(c.height!==canvas.height)c.height=canvas.height;
    };
    resize(scenery);resize(picking);resize(atmosphere);
    if(overlay==='terrain')updateAtmosphereLayer(atmosphere,
      world.settings.seed,world.year,world.dayOfYear??0,'depth');
    const backdrop=scenery.getContext('2d'),hit=picking.getContext('2d',
      {willReadFrequently:true});
    if(!backdrop||!hit)return;
    const stamp=stampRef.current;
    const roadKey=overlay==='terrain'?depthRoadSignature(world):0;
    const landChanged=stamp?.tiles!==world.tiles&&(!stamp||
      overlay==='resources'||stamp.tiles.length!==world.tiles.length||
      stamp.tiles.some((t,i)=>t.biome!==world.tiles[i].biome));
    if(!stamp||landChanged||stamp.topography!==world.topography||
      stamp.overlay!==overlay||stamp.seed!==world.settings.seed||
      stamp.relief!==relief||stamp.roadKey!==roadKey||
      stamp.yaw!==camera.yaw||
      stamp.pitch!==camera.pitch||
      overlay==='deposits'&&stamp.deposits!==world.deposits){
      renderTerrain(world,overlay,backdrop,hit,projector);
    }
    stampRef.current={tiles:world.tiles,topography:world.topography,
      overlay,deposits:world.deposits,seed:world.settings.seed,relief,
      yaw:camera.yaw,pitch:camera.pitch,roadKey};
    const positions=new Map(world.agents.map(a=>[a.id,mortalWorldPoint(a,world)]));
    const previous=priorRef.current,day=world.dayOfYear??0;
    const now=performance.now();
    if(!previous||previous.seed!==world.settings.seed||
      world.year<previous.year||world.year-previous.year>1||
      world.year===previous.year&&day<previous.day){
      motionsRef.current.clear();
    }else if(previous.year!==world.year||previous.day!==day){
      const moving=new Map<number,Motion>();
      for(const [id,to] of positions){
        const from=previous.positions.get(id);
        if(!from||!canAnimate(from,to))continue;
        moving.set(id,{from,to,start:now,
          duration:visualMotionDuration(speed),
          facing:directionBetween(from,to)});
      }
      motionsRef.current=moving;
    }
    priorRef.current={seed:world.settings.seed,year:world.year,day,positions};
    const structures=prepareDepthStructures(ctx,world,projector,
      buildingSpritesRef.current);
    const visibleAgents=renderedPopulation(world.agents,populationScene(world),{
      bounds:{minX:0,minY:0,maxX:world.width-1,maxY:world.height-1},
      selected,zoom:Math.max(1,zoom),maxVisible:350});
    let frameHandle=0,lastFollow:Point|null=null;
    const draw=(time:number)=>{
      ctx.clearRect(0,0,canvas.width,canvas.height);
      ctx.imageSmoothingEnabled=false;ctx.drawImage(scenery,0,0);
      if(overlay==='terrain')ctx.drawImage(atmosphere,0,0);
      const interpolated=new Map<number,Point>(),walking=new Set<number>();
      for(const [id,target] of positions){
        const motion=motionsRef.current.get(id);
        const frame=motion?motionFrame(motion,time):null;
        interpolated.set(id,frame??target);
        if(frame?.walking)walking.add(id);
      }
      paintInhabitants(ctx,world,selected,zoom,interpolated,walking,
        projector,structures,visibleAgents);
      const tracked=followId!==null?interpolated.get(followId):undefined;
      if(tracked&&onFollowPosition&&(!lastFollow||
        Math.abs(tracked.x-lastFollow.x)>.12||
        Math.abs(tracked.y-lastFollow.y)>.12)){
        lastFollow=tracked;
        onFollowPosition(tracked.x,tracked.y);
      }
      if(walking.size)frameHandle=requestAnimationFrame(draw);
    };
    draw(now);
    return ()=>cancelAnimationFrame(frameHandle);
  },[world,overlay,selected,zoom,speed,relief,camera.yaw,camera.pitch,
    followId,onFollowPosition]);
  const apply=(x:number,y:number)=>{
    if(brush.kind==='inspect')onSelect(x,y);else onEdit(x,y);
  };
  const click=(event:MouseEvent<HTMLCanvasElement>)=>{
    const rect=event.currentTarget.getBoundingClientRect();
    const x=Math.floor((event.clientX-rect.left)/rect.width*size.width);
    const y=Math.floor((event.clientY-rect.top)/rect.height*size.height);
    if(x<0||y<0||x>=size.width||y>=size.height)return;
    const hit=pickingRef.current?.getContext('2d',{willReadFrequently:true});
    if(!hit)return;
    const color=hit.getImageData(x,y,1,1).data;
    const index=color[3]?tileFromHit(color[0],color[1],color[2]):-1;
    if(index<0||index>=world.tiles.length)return;
    apply(index%world.width,Math.floor(index/world.width));
  };
  const keyboard=(event:KeyboardEvent<HTMLCanvasElement>)=>{
    if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter',' ']
      .includes(event.key))return;
    event.preventDefault();
    const pos=selected??{x:Math.floor(world.width/2),
      y:Math.floor(world.height/2)};
    const x=Math.max(0,Math.min(world.width-1,pos.x+
      (event.key==='ArrowRight'?1:event.key==='ArrowLeft'?-1:0)));
    const y=Math.max(0,Math.min(world.height-1,pos.y+
      (event.key==='ArrowDown'?1:event.key==='ArrowUp'?-1:0)));
    if(event.key==='Enter'||event.key===' '){
      if(brush.kind!=='inspect')onEdit(x,y);
    }else onSelect(x,y);
  };
  return <canvas ref={canvasRef} className="evo-world-canvas evo-depth-canvas"
    width={size.width} height={size.height}
    style={{width:(zoom*100)+'%'}} role="grid" tabIndex={0}
    aria-label={'Isometric terrain depth view with exaggerated cliffs and orbit camera: '+world.width+' by '+
      world.height+' world cells. Click a raised tile to '+
      (brush.kind==='inspect'?'inspect it':'apply the selected map tool')+
      '. Arrow keys move the selection; Enter applies the brush.'}
    onClick={click} onKeyDown={keyboard}/>;
}
