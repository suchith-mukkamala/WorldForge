/** Settlement customs emerge from the adults who actually live there.
 * Selection is deterministic and does not draw the world RNG, so faith,
 * births and construction keep their existing random sequences. Missing
 * customs on older saves simply begin the next time a town qualifies. */
import type {Agent,Settlement,World} from './engine';

export const CUSTOMS=['hearth','workshop','road','archive','ancestors',
  'liberty'] as const;
export type CustomId=typeof CUSTOMS[number];
export type CustomPurpose='learn'|'explore'|'care'|'work'|'create'|'reflect';
export const CUSTOM_INFO:Record<CustomId,{name:string;blurb:string;
  purpose:CustomPurpose}>={
  hearth:{name:'Hearth hospitality',purpose:'care',
    blurb:'Neighbors are expected to share food, shelter and care.'},
  workshop:{name:'Workshop pride',purpose:'create',
    blurb:'Useful making is this town\'s public pride.'},
  road:{name:'Open roads',purpose:'explore',
    blurb:'Leaving to see other places is admired here.'},
  archive:{name:'Shared learning',purpose:'learn',
    blurb:'Questions and teaching are part of civic life.'},
  ancestors:{name:'Ancestor keeping',purpose:'reflect',
    blurb:'Names and old promises are kept aloud.'},
  liberty:{name:'Personal liberty',purpose:'work',
    blurb:'People are expected to choose their own work.'},
};
export type SettlementCustom={settlementId:number;custom:CustomId;since:number;
  strength:number;voice:string};
export const isCustomId=(value:unknown):value is CustomId=>
  typeof value==='string'&&(CUSTOMS as readonly string[]).includes(value);

function scoreTown(adults:readonly Agent[]):{custom:CustomId;strength:number}|
  undefined{
  let n=0,community=0,independence=0,tradition=0,discovery=0;
  let craft=0,care=0,knowledge=0,navigation=0;
  for(const a of adults){
    const d=a.development;
    if(!d)continue;
    n++;
    community+=d.values.community;independence+=d.values.independence;
    tradition+=d.values.tradition;discovery+=d.values.discovery;
    craft+=d.skills.craft;care+=d.skills.care;
    knowledge+=d.skills.knowledge;navigation+=d.skills.navigation;
  }
  if(n<4)return;
  const avg=(v:number)=>v/n;
  const scored:Record<CustomId,number>={
    hearth:avg(community)*.62+avg(care)*.38,
    workshop:avg(craft)*.55+avg(independence)*.25+avg(community)*.2,
    road:avg(discovery)*.5+avg(navigation)*.3+(100-avg(tradition))*.2,
    archive:avg(knowledge)*.55+avg(discovery)*.45,
    ancestors:avg(tradition)*.72+avg(community)*.28,
    liberty:avg(independence)*.7+avg(discovery)*.3,
  };
  let best:CustomId='hearth',bestScore=-1;
  for(const id of CUSTOMS){
    if(scored[id]>bestScore){best=id;bestScore=scored[id];}
  }
  return {custom:best,strength:Math.max(1,Math.min(100,Math.round(bestScore)))};
}

/** The next custom list. An existing custom holds unless a clearly stronger
 * way of life has lasted long enough to replace it. */
export function planCustoms(year:number,
  settlements:readonly Pick<Settlement,'id'>[],
  adultsByTown:ReadonlyMap<number,readonly Agent[]>,
  previous:readonly SettlementCustom[]|undefined):SettlementCustom[]{
  const prev=new Map((previous??[]).map(c=>[c.settlementId,c]));
  const next:SettlementCustom[]=[];
  for(const s of settlements){
    const existing=prev.get(s.id);
    const winner=scoreTown(adultsByTown.get(s.id)??[]);
    if(!winner){if(existing)next.push(existing);continue;}
    const fresh:SettlementCustom={settlementId:s.id,custom:winner.custom,
      since:year,strength:winner.strength,voice:CUSTOM_INFO[winner.custom].blurb};
    if(!existing){next.push(fresh);continue;}
    if(existing.custom!==winner.custom&&year-existing.since>=6&&
      winner.strength>=existing.strength+8)next.push(fresh);
    else next.push(existing);
  }
  return next;
}

type Place={id:number;name:string;distance:number;custom?:SettlementCustom};
const placeCache=new WeakMap<World,{settlements:World['settlements'];
  customs:readonly SettlementCustom[]|undefined;tiles:Map<number,Place>}>();
function places(world:World):Map<number,Place>{
  const settlements=world.settlements,customs=world.culture?.customs;
  const hit=placeCache.get(world);
  if(hit&&hit.settlements===settlements&&hit.customs===customs)return hit.tiles;
  const tiles=new Map<number,Place>();
  const byTown=new Map((customs??[]).map(c=>[c.settlementId,c]));
  for(const s of [...settlements].sort((a,b)=>a.id-b.id)){
    for(let dy=-6;dy<=6;dy++)for(let dx=-6;dx<=6;dx++){
      const x=s.x+dx,y=s.y+dy;
      if(x<0||y<0||x>=world.width||y>=world.height)continue;
      const distance=Math.max(Math.abs(dx),Math.abs(dy));
      const index=y*world.width+x,prev=tiles.get(index);
      if(prev&&distance>=prev.distance)continue;
      const custom=byTown.get(s.id);
      tiles.set(index,{id:s.id,name:s.name,distance,
        ...(custom?{custom}:{})});
    }
  }
  placeCache.set(world,{settlements,customs,tiles});
  return tiles;
}
export type ResidentHome={settlementId:number;name:string;custom?:SettlementCustom};
/** People within six tiles of a settlement center count as its inhabitants.
 * Overlaps keep the nearer town. This is the same neighborhood culture uses. */
export function residentHome(world:World,agent:{x:number;y:number}):ResidentHome|
  undefined{
  const place=places(world).get(agent.y*world.width+agent.x);
  if(!place)return;
  return {settlementId:place.id,name:place.name,
    ...(place.custom?{custom:place.custom}:{})};
}
export function customNear(world:World,x:number,y:number):SettlementCustom|
  undefined{
  return places(world).get(y*world.width+x)?.custom;
}
