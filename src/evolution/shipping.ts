/** WorldForge v1.0 — sail a real connected waterway between coastal ports.
 * Boats travel the tile grid; view scale never changes route or progress.
 */
import type {Agent,Settlement,World} from './engine';
import {findTradeRoute} from './transport';

const distance=(a:{x:number;y:number},b:{x:number;y:number})=>
  Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
const at=(w:World,x:number,y:number)=>y*w.width+x;
const inside=(w:World,x:number,y:number)=>x>=0&&y>=0&&x<w.width&&y<w.height;
type Port={land:number;water:number;road:number[]};

export function hasHarbor(w:World,s:Settlement):boolean{
  for(let y=Math.max(0,s.y-5);y<=Math.min(w.height-1,s.y+5);y++)
    for(let x=Math.max(0,s.x-5);x<=Math.min(w.width-1,s.x+5);x++)
      if(w.tiles[at(w,x,y)].biome==='water')return true;
  return false;
}

/** Search for water with a reachable stretch of land immediately beside it. */
function harbors(w:World,s:Settlement):Port[]{
  const choices:Port[]=[],start=at(w,s.x,s.y);
  const parent=new Int32Array(w.tiles.length).fill(-1);
  const seen=new Uint8Array(w.tiles.length),queue=[start];seen[start]=1;
  // One tiny local path search replaces dozens of expensive full-map routes.
  for(let head=0;head<queue.length;head++){
    const land=queue[head],x=land%w.width,y=Math.floor(land/w.width);
    const road:number[]=[];
    for(let step=land;step>=0;step=parent[step])road.push(step);
    road.reverse();
    if(road.length>8)continue;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      if(!dx&&!dy)continue;
      const nx=x+dx,ny=y+dy;
      if(!inside(w,nx,ny)||distance({x:nx,y:ny},s)>5)continue;
      const next=at(w,nx,ny);
      if(w.tiles[next].biome==='water')choices.push({land,water:next,road});
      else if(!seen[next]&&road.length<8){
        seen[next]=1;parent[next]=land;queue.push(next);
      }
    }
  }
  return choices.sort((a,b)=>a.road.length-b.road.length||a.water-b.water)
    .filter((p,i,all)=>all.findIndex(q=>q.water===p.water)===i).slice(0,12);
}

/** Coastal settlements must share one navigable body of water. The result
 * includes land access, embarkation, every real sea tile, and disembarkation.
 */
export function findSeaRoute(w:World,origin:Settlement,target:Settlement):number[]|null{
  if(distance(origin,target)>55||!hasHarbor(w,origin)||!hasHarbor(w,target))return null;
  const entries=harbors(w,origin),exits=harbors(w,target);
  if(!entries.length||!exits.length)return null;
  const ends=new Map(exits.map(p=>[p.water,p]));
  const parent=new Int32Array(w.tiles.length).fill(-1);
  const roots=new Int16Array(w.tiles.length).fill(-1);
  const seen=new Uint8Array(w.tiles.length),queue:number[]=[];
  for(let i=0;i<entries.length;i++){
    const idx=entries[i].water;
    if(!seen[idx]){seen[idx]=1;roots[idx]=i;queue.push(idx);}
  }
  const minX=Math.max(0,Math.min(origin.x,target.x)-14),
    maxX=Math.min(w.width-1,Math.max(origin.x,target.x)+14);
  const minY=Math.max(0,Math.min(origin.y,target.y)-14),
    maxY=Math.min(w.height-1,Math.max(origin.y,target.y)+14);
  let goal:number|undefined;
  for(let head=0;head<queue.length&&head<12000;head++){
    const current=queue[head];
    if(ends.has(current)){goal=current;break;}
    const x=current%w.width,y=Math.floor(current/w.width);
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      if(!dx&&!dy)continue;
      const nx=x+dx,ny=y+dy;
      if(nx<minX||nx>maxX||ny<minY||ny>maxY)continue;
      const next=at(w,nx,ny);
      if(seen[next]||w.tiles[next].biome!=='water')continue;
      // A ship cannot cut diagonally through two adjacent land corners.
      if(dx&&dy&&w.tiles[at(w,x+dx,y)].biome!=='water'&&
        w.tiles[at(w,x,y+dy)].biome!=='water')continue;
      seen[next]=1;parent[next]=current;roots[next]=roots[current];
      queue.push(next);
    }
  }
  if(goal===undefined)return null;
  const water:number[]=[];
  for(let n=goal;n>=0;n=parent[n]){
    water.push(n);if(water.length>115)return null;
  }
  water.reverse();
  const start=entries[roots[goal]],finish=ends.get(goal)!;
  const exit={x:finish.land%w.width,y:Math.floor(finish.land/w.width)};
  const toTown=findTradeRoute(w,exit,target);
  if(!toTown)return null;
  const route=[...start.road,...water,finish.land,...toTown.slice(1)];
  return route.length<=150&&water.length>=2?route:null;
}

/** Shipwrecked sailors are recovered from the nearest unoccupied shore.
 * This avoids leaving invalid land-only agents stranded when cargo is lost.
 */
export function rescueSailor(w:World,a:Agent,occupied:Map<number,Agent>):void{
  const here=at(w,a.x,a.y);
  if(w.tiles[here].biome!=='water')return;
  let found:number|undefined,best=Infinity;
  for(let i=0;i<w.tiles.length;i++){
    if(w.tiles[i].biome==='water'||occupied.has(i))continue;
    const x=i%w.width,y=Math.floor(i/w.width);
    const d=distance(a,{x,y});
    if(d<best){best=d;found=i;}
  }
  if(found!==undefined){
    occupied.delete(here);a.x=found%w.width;a.y=Math.floor(found/w.width);
    occupied.set(found,a);
  }
}
