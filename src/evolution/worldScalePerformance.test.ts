import {describe,expect,it} from 'vitest';
import {createWorld,isWorld,stepWorld,type Agent,type World} from './engine';
import {residentIndex,tileCapacity} from './density';
import {terrainStepEffort} from './terrainPhysics';
import {findMortalRoute} from './mindII';
import {RouteFrontier} from './routeFrontier';
import {occupancyCounts,residentsNear,neighborhoodMask,
  markNeighborhood} from './spatialIndex';

const chebyshev=(a:{x:number;y:number},b:{x:number;y:number})=>
  Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));

/** The original bounded A* kept for exact route-parity verification. */
function baselineRoute(w:World,a:Agent,target:{x:number;y:number},
  occupied:Map<number,number[]>,capacities:ArrayLike<number>,
  bridge:Set<number>,limit=300):number[]{
  const start=a.y*w.width+a.x,goal=target.y*w.width+target.x;
  if(start===goal)return [start];
  const walkable=(x:number,y:number)=>{
    if(x<0||y<0||x>=w.width||y>=w.height)return false;
    const index=y*w.width+x;
    if(w.tiles[index].biome==='water'&&!bridge.has(index))return false;
    return index===goal||(occupied.get(index)?.length??0)<capacities[index];
  };
  const open=[start],scores=new Map<number,number>([[start,0]]);
  const previous=new Map<number,number>(),closed=new Set<number>();
  const heuristic=(index:number)=>Math.max(
    Math.abs(index%w.width-target.x),
    Math.abs(Math.floor(index/w.width)-target.y));
  let bestReached=start,bestDistance=heuristic(start);
  const trace=(destination:number)=>{
    const route=[destination];let p=destination;
    while(previous.has(p)){p=previous.get(p)!;route.push(p);}
    route.reverse();return route.length<=180?route:route.slice(0,180);
  };
  const neighbors=[[-1,0],[1,0],[0,-1],[0,1],
    [-1,-1],[-1,1],[1,-1],[1,1]] as const;
  let visits=0;
  while(open.length&&visits++<limit){
    let chosen=0,best=Infinity;
    for(let i=0;i<open.length;i++){
      const idx=open[i],f=(scores.get(idx)??Infinity)+heuristic(idx);
      if(f<best){best=f;chosen=i;}
    }
    const current=open.splice(chosen,1)[0];
    if(current===goal)return trace(goal);
    const remaining=heuristic(current);
    if(remaining<bestDistance){bestDistance=remaining;bestReached=current;}
    closed.add(current);
    const cx=current%w.width,cy=Math.floor(current/w.width);
    for(const [dx,dy] of neighbors){
      const x=cx+dx,y=cy+dy,index=y*w.width+x;
      if(!walkable(x,y)||closed.has(index))continue;
      if(dx&&dy&&!walkable(cx+dx,cy)&&!walkable(cx,cy+dy))continue;
      const tentative=(scores.get(current)??0)+(dx&&dy?1.414:1)*
        terrainStepEffort(w,current,index);
      if(tentative>=(scores.get(index)??Infinity))continue;
      scores.set(index,tentative);previous.set(index,current);
      if(!open.includes(index))open.push(index);
    }
  }
  return bestDistance<heuristic(start)-1?trace(bestReached):[];
}

describe('v2.1.5.2 — scalable world simulation, exact output',()=>{
  it('uses stable priority ties and supports decreases without duplicates',()=>{
    const q=new RouteFrontier();
    q.addOrDecrease(12,8);q.addOrDecrease(25,8);q.addOrDecrease(9,11);
    q.addOrDecrease(9,8);q.addOrDecrease(25,7);
    q.addOrDecrease(12,7);q.addOrDecrease(12,9);
    expect(q.size).toBe(3);
    expect([q.pop(),q.pop(),q.pop(),q.pop()]).toEqual([
      12,25,9,undefined]);
  });
  it('preserves original A* routes for multiple seeds, people and distances',()=>{
    for(const seed of [12001,12003,12005]){
      const w=createWorld({seed,size:'small'});
      const occupancy=residentIndex(w.agents,w.width);
      const capacities=tileCapacity(w);
      const bridges=new Set<number>();
      for(const a of w.agents.slice(0,10))for(const delta of [
        {x:5,y:5},{x:-8,y:3},{x:15,y:-9},{x:-19,y:-18},{x:2,y:1}]){
        const target={x:Math.max(0,Math.min(w.width-1,a.x+delta.x)),
          y:Math.max(0,Math.min(w.height-1,a.y+delta.y))};
        for(const limit of [25,100,300]){
          expect(findMortalRoute(w,a,target,occupancy,capacities,bridges,limit))
            .toEqual(baselineRoute(w,a,target,occupancy,capacities,bridges,limit));
        }
      }
    }
  });
  it('counts settlement residents and proximity exactly, including borders',()=>{
    const width=70,height=52;
    const people=Array.from({length:3300},(_,i)=>({
      x:(i*13+i%7)%width,y:(i*29+i%11)%height}));
    const counts=occupancyCounts(width,height,people);
    for(const point of [{x:0,y:0},{x:69,y:51},{x:32,y:22},
      {x:1,y:45},{x:55,y:1}]){
      for(const radius of [0,2,5,7]){
        const expected=people.filter(person=>chebyshev(person,point)<=radius).length;
        expect(residentsNear(counts,width,height,point,radius)).toBe(expected);
      }
    }
    expect(counts.reduce((a,b)=>a+b,0)).toBe(people.length);
  });
  it('updates settled zones immediately and preserves well overlap and edges',()=>{
    const width=23,height=19;
    const points=[{x:0,y:0},{x:8,y:5},{x:22,y:18}];
    const mask=neighborhoodMask(width,height,points,5);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      expect(mask[y*width+x]===1).toBe(
        points.some(point=>chebyshev(point,{x,y})<=5));
    }
    markNeighborhood(mask,width,height,{x:12,y:14},7);
    expect(mask[14*width+12]).toBe(1);
    expect(mask[8*width+17]).toBe(1);
  });
  it('keeps a world valid and deterministic across yearly evolution',()=>{
    const origin=createWorld({seed:215205,size:'small'});
    const a=stepWorld(origin),b=stepWorld(origin);
    expect(a).toEqual(b);
    expect(isWorld(a)).toBe(true);
    expect(a.lineage.length).toBeGreaterThanOrEqual(origin.lineage.length);
    expect(a.history.at(-1)?.year).toBe(1);
  });
});
