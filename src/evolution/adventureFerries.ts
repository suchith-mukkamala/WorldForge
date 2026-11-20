import type {World} from './engine';
import {RouteFrontier} from './routeFrontier';

type Shore={town:number;land:number;water:number};
export type FerryPassage={from:Shore;to:Shore;seaTiles:number;distance:number};

/** Find one short crossing between each pair of reachable land groups. The
 * water search uses only actual sea tiles and starts at walkable shores that
 * the land search has already reached from a town. */
export function ferryPassages(world:World,owners:Int32Array,landCost:Float64Array,
  groups:readonly number[]):FerryPassage[]{
  if(new Set(groups).size<2)return [];

  const {width,tiles}=world;
  const frontier=new RouteFrontier();
  const costs=new Float64Array(tiles.length).fill(Infinity);
  const roots=new Int32Array(tiles.length).fill(-1);
  const waterStarts=new Int32Array(tiles.length).fill(-1);
  const steps=new Int32Array(tiles.length);
  const settled=new Uint8Array(tiles.length);
  const passages=new Map<string,FerryPassage>();

  function neighbors(i:number):number[]{
    const x=i%width;
    return [x>0?i-1:-1,x<width-1?i+1:-1,i-width,i+width];
  }
  const docks=new Set<number>();
  for(const town of world.settlements){
    for(const building of town.infrastructure?.buildings??[]){
      if(building.type==='dock'&&building.stage==='complete'&&building.condition>0)
        docks.add(building.y*width+building.x);
    }
  }
  function connect(a:Shore,b:Shore,distance:number,seaTiles:number){
    const aGroup=groups[a.town-1],bGroup=groups[b.town-1];
    if(aGroup===bGroup)return;
    const key=Math.min(aGroup,bGroup)+':'+Math.max(aGroup,bGroup);
    if(distance>=(passages.get(key)?.distance??Infinity))return;
    const forward=a.town<b.town;
    passages.set(key,{from:forward?a:b,to:forward?b:a,distance,seaTiles});
  }
  const shore=(i:number):Shore=>({
    town:owners[roots[i]],land:roots[i],water:waterStarts[i],
  });
  for(let i=0;i<tiles.length;i++){
    if(!owners[i]||tiles[i].biome==='water')continue;
    const cost=Math.max(0,landCost[i]*.45-(docks.has(i)?5:0));
    for(const next of neighbors(i)){
      if(tiles[next]?.biome!=='water'||owners[next])continue;
      if(roots[next]>=0)connect({town:owners[i],land:i,water:next},shore(next),cost+costs[next]+1,1);
      if(cost>=costs[next])continue;
      costs[next]=cost;
      roots[next]=i;
      waterStarts[next]=next;
      steps[next]=1;
      frontier.addOrDecrease(next,cost);
    }
  }

  while(frontier.size){
    const i=frontier.pop()!;
    settled[i]=1;
    for(const next of neighbors(i)){
      if(tiles[next]?.biome!=='water'||owners[next])continue;
      if(settled[next]){
        connect(shore(i),shore(next),costs[i]+costs[next]+1,steps[i]+steps[next]);
      }else if(costs[i]+1<costs[next]){
        costs[next]=costs[i]+1;
        roots[next]=roots[i];
        waterStarts[next]=waterStarts[i];
        steps[next]=steps[i]+1;
        frontier.addOrDecrease(next,costs[next]);
      }
    }
  }
  return [...passages.values()].sort((a,b)=>a.distance-b.distance||
    a.from.town-b.from.town||a.to.town-b.to.town);
}
