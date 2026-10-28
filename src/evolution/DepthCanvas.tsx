import {useEffect,useRef} from 'react';
import type {KeyboardEvent,MouseEvent} from 'react';
import {BIOME_INFO,SPECIES_INFO,type Biome,type Brush,type World} from './engine';
import type {MapOverlay} from './WorldCanvas';
import {topographyForWorld} from './topography';
import {hydrologyForWorld} from './hydrology';
import {terrainDetailAt} from './terrainDetails';
import {populationScene,renderedPopulation} from './populationVisibility';
import {paintDepthBuilding,paintDepthPerson,paintDepthTree} from './depthSprites';
import {mortalWorldPoint} from './spatialDetails';
import {canAnimate,directionBetween,motionFrame,visualMotionDuration,
  type Motion,type Point} from './motion';
import {depthCanvasSize,projectDepth,tileFromHit,tileHitColor,
  DEPTH_TILE_HEIGHT,DEPTH_TILE_WIDTH,DEPTH_RISE} from './depthProjection';

const HALF_X=DEPTH_TILE_WIDTH/2,HALF_Y=DEPTH_TILE_HEIGHT/2;
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

function polygon(ctx:CanvasRenderingContext2D,points:readonly Pt[],color:string){
  ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);
  for(let i=1;i<points.length;i++)ctx.lineTo(points[i].x,points[i].y);
  ctx.closePath();ctx.fill();
}
function diamond(p:Pt):Pt[]{return [
  {x:p.x,y:p.y-HALF_Y},{x:p.x+HALF_X,y:p.y},
  {x:p.x,y:p.y+HALF_Y},{x:p.x-HALF_X,y:p.y},
];}
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
  ctx:CanvasRenderingContext2D,hit:CanvasRenderingContext2D){
  const W=w.width,H=w.height,heights=topographyForWorld(w).heights;
  const drainage=overlay==='watersheds'||overlay==='terrain'?
    hydrologyForWorld(w):null;
  ctx.fillStyle='#101b2f';ctx.fillRect(0,0,ctx.canvas.width,ctx.canvas.height);
  hit.clearRect(0,0,hit.canvas.width,hit.canvas.height);
  ctx.imageSmoothingEnabled=false;hit.imageSmoothingEnabled=false;
  for(let sum=0;sum<W+H-1;sum++){
    const minX=Math.max(0,sum-(H-1)),maxX=Math.min(W-1,sum);
    for(let x=minX;x<=maxX;x++){
      const y=sum-x,index=y*W+x,height=heights[index];
      const p=projectDepth(w,x,y,height),corners=diamond(p);
      const biome=w.tiles[index].biome,palette=PALETTE[biome];
      // The front-facing extrusion corresponds to the actual drop into the
      // next world tile, not an invented height or a second physical map.
      const dropX=x<W-1?Math.max(0,Math.round(
        (height-heights[index+1])/DEPTH_RISE)):0;
      const dropY=y<H-1?Math.max(0,Math.round(
        (height-heights[index+W])/DEPTH_RISE)):0;
      if(dropX>0)polygon(ctx,[corners[1],corners[2],
        {x:corners[2].x,y:corners[2].y+dropX},
        {x:corners[1].x,y:corners[1].y+dropX}],palette.right);
      if(dropY>0)polygon(ctx,[corners[2],corners[3],
        {x:corners[3].x,y:corners[3].y+dropY},
        {x:corners[2].x,y:corners[2].y+dropY}],palette.left);
      polygon(ctx,corners,tileColor(w,index,overlay,height,drainage));
      ctx.strokeStyle='rgba(10,24,39,.28)';ctx.lineWidth=.6;
      ctx.beginPath();ctx.moveTo(corners[3].x,corners[3].y);
      ctx.lineTo(corners[2].x,corners[2].y);
      ctx.lineTo(corners[1].x,corners[1].y);ctx.stroke();
      if(overlay==='elevation'&&(
        x>0&&Math.floor(heights[index-1]/30)<Math.floor(height/30)||
        y>0&&Math.floor(heights[index-W]/30)<Math.floor(height/30))){
        ctx.strokeStyle='rgba(247,232,193,.8)';ctx.lineWidth=.9;
        ctx.beginPath();ctx.moveTo(corners[3].x,corners[3].y);
        ctx.lineTo(corners[0].x,corners[0].y);ctx.stroke();
      }
      // Sparse high-pixel silhouettes preserve the seeded motif vocabulary
      // while leaving the shape of hills and cliffs easy to distinguish.
      if(overlay==='terrain'&&((x*17+y*11+w.settings.seed)%4===0)){
        const detail=terrainDetailAt(biome,x,y,w.settings.seed,height);
        if(detail.motif==='oak'||detail.motif==='pine'){
          paintDepthTree(ctx,p,detail.motif==='pine');
        }else if(['boulder','snowstone','crystal','basalt'].includes(detail.motif)){
          ctx.fillStyle=detail.motif==='snowstone'?'#ecf1e5':
            detail.motif==='crystal'?'#9cddd5':'#aeb2b5';
          ctx.fillRect(p.x-1,p.y-4,3,3);
        }
      }
      if(overlay==='watersheds'&&drainage&&
        drainage.pondDepth[index]>=6&&biome!=='water'){
        ctx.fillStyle='#89b9be';ctx.fillRect(p.x-2,p.y-1,4,2);
      }
      polygon(hit,corners,tileHitColor(index));
    }
  }
  if(drainage)for(let i=0;i<W*H;i++){
    const tier=drainage.channel[i],next=drainage.flowTo[i];
    if(!tier||next<0)continue;
    const from=projectDepth(w,i%W,Math.floor(i/W),heights[i]);
    const to=projectDepth(w,next%W,Math.floor(next/W),heights[next]);
    ctx.strokeStyle=overlay==='watersheds'?'#a3e5ee':'#5fc4e3';
    ctx.lineWidth=tier>=3?2:tier===2?1.5:1;
    ctx.beginPath();ctx.moveTo(from.x,from.y);
    ctx.lineTo(to.x,to.y);ctx.stroke();
  }
  if(overlay==='deposits')for(const d of w.deposits??[]){
    if(d.amount<=.1)continue;
    const p=projectDepth(w,d.index%W,Math.floor(d.index/W),heights[d.index]);
    ctx.fillStyle=d.kind==='tree'?'#92ca91':'#e9c790';
    ctx.fillRect(p.x-1,p.y-4,3,4);
  }
}

function paintInhabitants(ctx:CanvasRenderingContext2D,w:World,
  selected:{x:number;y:number}|null,zoom:number,
  positions:Map<number,Point>,walking:Set<number>){
  const heights=topographyForWorld(w).heights;
  const actors:{order:number;paint:()=>void}[]=[];
  for(const s of w.settlements){
    const p=projectDepth(w,s.x,s.y,heights[s.y*w.width+s.x]);
    actors.push({order:p.y+.2,paint:()=>{
      // A compact town banner identifies the settlement; actual structures
      // occupy their separate addresses and evolve independently below.
      ctx.fillStyle='#21364a';ctx.fillRect(p.x-1,p.y-9,2,9);
      ctx.fillStyle=SPECIES_INFO[s.species].color;
      ctx.fillRect(p.x-6,p.y-12,11,4);
      ctx.fillStyle='#f1d9a9';ctx.fillRect(p.x-4,p.y-11,7,1);
    }});
    for(const b of s.infrastructure?.buildings??[]){
      const bp=projectDepth(w,b.x,b.y,heights[b.y*w.width+b.x]);
      actors.push({order:bp.y+.4,paint:()=>paintDepthBuilding(ctx,b,bp)});
    }
  }
  const agents=renderedPopulation(w.agents,populationScene(w),{
    bounds:{minX:0,minY:0,maxX:w.width-1,maxY:w.height-1},
    selected,zoom:Math.max(1,zoom),maxVisible:350});
  for(const a of agents){
    const pos=positions.get(a.id)??{x:a.x,y:a.y};
    const p=projectDepth(w,pos.x,pos.y,heights[a.y*w.width+a.x]);
    actors.push({order:p.y+.6,paint:()=>paintDepthPerson(ctx,a,p,walking.has(a.id))});
  }
  actors.sort((a,b)=>a.order-b.order);
  for(const actor of actors)actor.paint();
  if(selected){
    const index=selected.y*w.width+selected.x;
    if(index>=0&&index<heights.length){
      const p=projectDepth(w,selected.x,selected.y,heights[index]);
      const corners=diamond(p);
      ctx.lineWidth=2;ctx.strokeStyle='#fff0ac';ctx.beginPath();
      ctx.moveTo(corners[0].x,corners[0].y);
      for(let i=1;i<corners.length;i++)ctx.lineTo(corners[i].x,corners[i].y);
      ctx.closePath();ctx.stroke();
      ctx.fillStyle='#fff2af';ctx.fillRect(p.x-1,p.y-16,3,5);
    }
  }
}

export function DepthCanvas({world,brush,overlay,selected,onSelect,onEdit,
  zoom=1,speed=4}:{
  world:World;brush:Brush;overlay:MapOverlay;
  selected:{x:number;y:number}|null;onSelect:(x:number,y:number)=>void;
  onEdit:(x:number,y:number)=>void;zoom?:number;speed?:number;
}){
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const sceneryRef=useRef<HTMLCanvasElement|null>(null);
  const pickingRef=useRef<HTMLCanvasElement|null>(null);
  const stampRef=useRef<{tiles:World['tiles'];topography:World['topography'];
    overlay:MapOverlay;deposits:World['deposits'];seed:number}|null>(null);
  const priorRef=useRef<{seed:number;year:number;day:number;
    positions:Map<number,Point>}|null>(null);
  const motionsRef=useRef<Map<number,Motion>>(new Map());
  const size=depthCanvasSize(world);
  useEffect(()=>{
    const canvas=canvasRef.current,ctx=canvas?.getContext('2d');
    if(!canvas||!ctx)return;
    const scenery=sceneryRef.current??document.createElement('canvas');
    const picking=pickingRef.current??document.createElement('canvas');
    sceneryRef.current=scenery;pickingRef.current=picking;
    const resize=(c:HTMLCanvasElement)=>{
      if(c.width!==canvas.width)c.width=canvas.width;
      if(c.height!==canvas.height)c.height=canvas.height;
    };
    resize(scenery);resize(picking);
    const backdrop=scenery.getContext('2d'),hit=picking.getContext('2d',
      {willReadFrequently:true});
    if(!backdrop||!hit)return;
    const stamp=stampRef.current;
    const landChanged=stamp?.tiles!==world.tiles&&(!stamp||
      overlay==='resources'||stamp.tiles.length!==world.tiles.length||
      stamp.tiles.some((t,i)=>t.biome!==world.tiles[i].biome));
    if(!stamp||landChanged||stamp.topography!==world.topography||
      stamp.overlay!==overlay||stamp.seed!==world.settings.seed||
      overlay==='deposits'&&stamp.deposits!==world.deposits){
      renderTerrain(world,overlay,backdrop,hit);
    }
    stampRef.current={tiles:world.tiles,topography:world.topography,
      overlay,deposits:world.deposits,seed:world.settings.seed};
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
    let frameHandle=0;
    const draw=(time:number)=>{
      ctx.clearRect(0,0,canvas.width,canvas.height);
      ctx.imageSmoothingEnabled=false;ctx.drawImage(scenery,0,0);
      const interpolated=new Map<number,Point>(),walking=new Set<number>();
      for(const [id,target] of positions){
        const motion=motionsRef.current.get(id);
        const frame=motion?motionFrame(motion,time):null;
        interpolated.set(id,frame??target);
        if(frame?.walking)walking.add(id);
      }
      paintInhabitants(ctx,world,selected,zoom,interpolated,walking);
      if(walking.size)frameHandle=requestAnimationFrame(draw);
    };
    draw(now);
    return ()=>cancelAnimationFrame(frameHandle);
  },[world,overlay,selected,zoom,speed]);
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
    aria-label={'Isometric terrain depth view: '+world.width+' by '+
      world.height+' world cells. Click a raised tile to '+
      (brush.kind==='inspect'?'inspect it':'apply the selected map tool')+
      '. Arrow keys move the selection; Enter applies the brush.'}
    onClick={click} onKeyDown={keyboard}/>;
}
