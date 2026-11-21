/** Render signatures are presentation-only. World time, AI, and save state
 * must never depend on whether scenery is cached or refreshed. */
import type {Settlement} from './engine';
import {buildingTier,settlementStage,type Building} from './construction';
import type {ArtBounds} from './atlasBuildingArt';

/** Keep adjacent roofs visible when their projected silhouettes can coexist.
 * Where they strongly overlap, prioritize projects and distinctive services. */
export function uncrowdedDistrictBuildings<T extends {building:Building;x:number;y:number;bounds:ArtBounds}>(
  buildings:readonly T[]):T[]{
  const priority=(b:Building)=>b.stage!=='complete'?9:
    b.type==='communal'?8:b.type==='market'||b.type==='workshop'?7:
    b.type==='well'||b.type==='storage'||b.type==='granary'||b.type==='dock'?6:
    b.type==='farm'?4:1+buildingTier(b)*.2;
  const occupied=new Map<string,ArtBounds[]>(),kept:T[]=[];
  const cells=(box:ArtBounds)=>{
    const keys:string[]=[];
    for(let y=Math.floor(box.top/24);y<=Math.floor(box.bottom/24);y++)
      for(let x=Math.floor(box.left/24);x<=Math.floor(box.right/24);x++)
        keys.push(x+':'+y);
    return keys;
  };
  for(const entry of [...buildings].sort((a,b)=>
    priority(b.building)-priority(a.building)||
    a.building.id-b.building.id||a.x-b.x||a.y-b.y)){
    const box=entry.bounds;
    const bucketKeys=cells(box);
    if(bucketKeys.some(key=>(occupied.get(key)??[]).some(other=>{
      const overlapX=Math.min(box.right,other.right)-Math.max(box.left,other.left);
      const overlapY=Math.min(box.bottom,other.bottom)-Math.max(box.top,other.top);
      return overlapX>0&&overlapY>0&&overlapX*overlapY>
        (box.right-box.left)*(box.bottom-box.top)*.35;
    })))continue;
    for(const key of bucketKeys){
      const bucket=occupied.get(key);
      if(bucket)bucket.push(box);else occupied.set(key,[box]);
    }
    kept.push(entry);
  }
  return kept;
}

/** Distance-only building simplification. Keep ongoing projects and civic
 * landmarks visible ahead of generic houses in each screen-space cluster.
 * The full simulation and close-up settlement map still contain every house.
 */
export function visibleDistrictBuildings<T extends {building:Building;x:number;y:number}>(
  buildings:readonly T[],detail:0|1|2):T[]{
  if(detail===2)return [...buildings];
  const scale=detail===0?14:9;
  const priority=(b:Building)=>{
    if(b.stage==='foundation'||b.stage==='frame'||b.stage==='finishing')return 9;
    if(b.type==='communal'||b.type==='market'||b.type==='workshop')return 7;
    if(b.type==='well'||b.type==='dock'||b.type==='storage'||b.type==='granary')return 6;
    if(b.type==='farm')return 4;
    return 1+buildingTier(b);
  };
  const kept:T[]=[],covered=new Set<string>();
  for(const entry of [...buildings].sort((a,b)=>
    priority(b.building)-priority(a.building)||a.building.id-b.building.id)){
    const key=Math.round(entry.x/scale)+':'+Math.round(entry.y/(scale*.8));
    if(covered.has(key))continue;
    covered.add(key);kept.push(entry);
  }
  return kept;
}

/** Excludes changing stores and resident counts; only visible silhouettes
 * should invalidate the projected structure layer. */
export function depthStructureSignature(settlements:readonly Settlement[]):string{
  return settlements.map(s=>[
    s.id,s.species,s.x,s.y,settlementStage(s),
    (s.infrastructure?.roads??[]).join(','),
    (s.infrastructure?.buildings??[]).map(b=>[
      b.id,b.x,b.y,b.type,b.culture,b.stage,buildingTier(b),b.condition<46,
    ].join(':')).join(','),
  ].join('|')).join(';');
}
