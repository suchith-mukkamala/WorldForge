/** Render signatures are presentation-only. World time, AI, and save state
 * must never depend on whether scenery is cached or refreshed. */
import type {Settlement} from './engine';
import {buildingTier,settlementStage,type Building} from './construction';

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
    if(b.type==='well'||b.type==='dock'||b.type==='storage')return 6;
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
    (s.infrastructure?.buildings??[]).map(b=>[
      b.id,b.x,b.y,b.type,b.culture,b.stage,buildingTier(b),
    ].join(':')).join(','),
  ].join('|')).join(';');
}
