/** v2.1.6 — deterministic, static 2.5D environmental artwork.
 * Visual-only: reads real world geography and infrastructure without
 * advancing the simulation, consuming RNG, or touching the picking buffer.
 */
import type {Biome,World} from './engine';
type Point={x:number;y:number};
type Projector={project:(x:number,y:number,elevation:number)=>Point};
const shades:Record<Biome,readonly string[]>={
  plains:['#7a9b75','#83a378','#74936f','#8ba87c','#769a7b'],
  forest:['#36765f','#3c8064','#326a58','#427f64','#39765d'],
  mountain:['#9ca9ad','#aeb3b1','#8d9ba3','#bac0b9','#909da7'],
  cave:['#667185','#73798b','#59667b','#7c8291','#606c82'],
  volcanic:['#a46a73','#b57d74','#90616d','#aa7068','#9c6876'],
  wasteland:['#a28182','#b19085','#957580','#ae8c82','#9d7c78'],
  water:['#367c9b','#357694','#4385a1','#397b9b','#30738e'],
};
export function pixelTerrainHash(x:number,y:number,seed:number):number{
  let n=(Math.imul(x+1,73856093)^Math.imul(y+3,19349663)^seed)>>>0;
  n=Math.imul(n^(n>>>15),0x2c1b3c6d);
  n=Math.imul(n^(n>>>12),0x297a2d39);
  return (n^(n>>>15))>>>0;
}
export function surfaceColor(biome:Biome,x:number,y:number,seed:number):string{
  const t=shades[biome],hash=pixelTerrainHash(x,y,seed);
  return t[hash%t.length];
}
/** Small top-surface markings suggest terrain material rather than uniform
 * flat faces. The current painter's fill pixels never alter collision masks. */
export function paintDepthSurfaceDetail(ctx:CanvasRenderingContext2D,
  biome:Biome,p:Point,x:number,y:number,seed:number):void{
  const hash=pixelTerrainHash(x,y,seed);
  if(hash%4!==0)return;
  const px=Math.round(p.x),py=Math.round(p.y);
  const put=(color:string,dx:number,dy:number,w=1,h=1)=>{
    ctx.fillStyle=color;ctx.fillRect(px+dx,py+dy,w,h);
  };
  switch(biome){
    case 'water':
      put('#9bcacc',-2,-1,3,1);if(hash%13===0)put('#d8e6d9',1,-2,2,1);
      break;
    case 'plains':
      put('#b5c68b',-2,-2,2,1);
      if(hash%11===0)put('#efcf9b',1,-3,1,1);
      break;
    case 'forest':
      put('#244e45',-3,-1,3,1);
      put(hash%3===0?'#b5cc91':'#699c70',1,-3,2,1);
      break;
    case 'mountain':
      put('#e0ded0',-2,-3,3,1);put('#677d8b',1,-1,3,1);
      break;
    case 'cave':
      put('#38445b',-2,-2,4,1);
      if(hash%9===0)put('#8cc0bd',2,-4,1,2);
      break;
    case 'volcanic':
      put('#5b3e50',-3,-1,4,1);
      if(hash%9===0){put('#e6a26c',0,-3,2,1);put('#e8ba87',1,-2,1,1);}
      break;
    case 'wasteland':
      put('#c0a090',-3,-2,3,1);put('#664b61',1,-1,2,1);
      break;
  }
}
/** Active roads are actual built tiles, not guessed links between cities.
 * A thin dark underlay and warm path surface make streets visible when towns
 * expand, while leaving buildings and terrain elevation legible.
 */
export function paintDepthRoads(ctx:CanvasRenderingContext2D,
  world:Pick<World,'width'|'height'|'settlements'|'transport'|'trails'>,
  heights:readonly number[],projector:Projector):number{
  const roads=new Set<number>();
  const maintained=new Set<number>();
  for(const s of world.settlements)
    for(const i of s.infrastructure?.roads??[]){
      if(i>=0&&i<heights.length){roads.add(i);maintained.add(i);}
    }
  for(const segment of world.transport?.roads??[])
    if(segment.index>=0&&segment.index<heights.length){
      roads.add(segment.index);maintained.add(segment.index);
    }
  for(const segment of world.trails??[])
    if(segment.index>=0&&segment.index<heights.length)roads.add(segment.index);
  for(const i of roads){
    const x=i%world.width,y=Math.floor(i/world.width);
    const p=projector.project(x,y,heights[i]);
    const px=Math.round(p.x),py=Math.round(p.y);
    const paved=maintained.has(i);
    ctx.fillStyle='rgba(21,28,39,.48)';
    ctx.fillRect(px-4,py-1,9,3);
    ctx.fillStyle=paved?'#d4ba8d':'#96856e';
    ctx.fillRect(px-4,py-1,8,2);
    ctx.fillStyle=paved?'#f3d9a1':'#bbad85';
    ctx.fillRect(px-2,py-2,4,1);
    const adjacent=[i-1,i+1,i-world.width,i+world.width];
    for(let direction=0;direction<4;direction++){
      const neighbor=adjacent[direction];
      if(!roads.has(neighbor))continue;
      if(direction===0&&x===0||direction===1&&x===world.width-1||
        direction===2&&y===0||direction===3&&y===world.height-1)continue;
      const q=projector.project(neighbor%world.width,
        Math.floor(neighbor/world.width),heights[neighbor]);
      ctx.strokeStyle=paved?'#bda178':'#877862';ctx.lineWidth=2;
      ctx.beginPath();ctx.moveTo(p.x,p.y);
      ctx.lineTo((p.x+q.x)/2,(p.y+q.y)/2);ctx.stroke();
    }
  }
  return roads.size;
}

/** Minimal visual invalidation key: re-rasterize the raised road layer only
 * when existing path tiles change, not on every advancing world snapshot. */
export function depthRoadSignature(world:Pick<World,'settlements'|'transport'|'trails'>):
  number{
  let hash=2166136261;
  const add=(value:number)=>{hash=Math.imul(hash^(value>>>0),16777619);};
  add(world.settlements.length);
  for(const s of world.settlements){
    add(s.id);
    const roads=s.infrastructure?.roads??[];
    add(roads.length);
    for(const index of roads)add(index);
  }
  const transportRoads=world.transport?.roads??[];
  add(transportRoads.length);
  for(const segment of transportRoads)add(segment.index);
  const trails=world.trails??[];
  add(trails.length);
  for(const trail of trails)add(trail.index);
  return hash>>>0;
}
