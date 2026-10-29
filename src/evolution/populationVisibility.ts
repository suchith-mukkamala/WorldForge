/** v1.8: presentation-only population selection.
 * No RNG, world mutations, saved flags, or clock dependency. Camera movement
 * and crowd budgets never affect decisions or history.
 */
import type {Agent,World} from './engine';
import type {BuildingType} from './construction';

export type RenderBounds={minX:number;minY:number;maxX:number;maxY:number};
export type PopulationView={bounds:RenderBounds;zoom:number;
  focusId?:number|null;selected?:{x:number;y:number}|null;
  maxVisible?:number};
export type PopulationScene={width:number;indoor:Map<number,Set<string>>};

const indoorActions:Partial<Record<BuildingType,readonly string[]>>={
  shelter:['rest','care'],house:['rest','care'],
  workshop:['work','craft','practice'],
  storage:['work'],market:['work'],
  communal:['study','observe','reflect','socialize','talk'],
};
/** Occupancy is an outdoor-visibility hint, not a teleport or simulated job. */
export function populationScene(world:Pick<World,'width'|'height'|'settlements'>):
    PopulationScene{
  const indoor=new Map<number,Set<string>>();
  for(const s of world.settlements)for(const b of s.infrastructure?.buildings??[]){
    if(b.stage!=='complete')continue;
    const allowed=indoorActions[b.type];if(!allowed)continue;
    // A building occupies its own tile and immediate doorway neighborhood.
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      const x=b.x+dx,y=b.y+dy;
      if(x<0||y<0||x>=world.width||y>=world.height)continue;
      const key=y*world.width+x;
      let actions=indoor.get(key);
      if(!actions){actions=new Set();indoor.set(key,actions);}
      for(const action of allowed)actions.add(action);
    }
  }
  return {width:world.width,indoor};
}
export function isVisuallyIndoors(agent:Agent,scene:PopulationScene):boolean{
  const available=scene.indoor.get(agent.y*scene.width+agent.x);
  if(!available)return false;
  const today=agent.cognition?.today?.action;
  // An active daily decision (especially travel) overrides the older
  // weekly routine, so someone departing a workshop is visible outdoors.
  if(today&&today!=='idle')return available.has(today);
  const routine=agent.dailyLife?.activity;
  return !!routine&&available.has(routine);
}
const priority=(id:number)=>Math.imul(id,0x9e3779b1)>>>0;
/** Select stable representatives; always retain a tracked or selected person.
 * A small visible sample still conveys movement without an unbounded pile of
 * pixel sprites. Selection does not touch or reschedule any mortal.
 */
export function renderedPopulation(agents:readonly Agent[],scene:PopulationScene,
    view:PopulationView):Agent[]{
  const {bounds,zoom}=view;
  const maxVisible=Math.max(1,Math.trunc(view.maxVisible??(zoom>=3?100:200)));
  const perTile=zoom>=3?2:1;
  const focus=agents.find(a=>a.id===view.focusId)??agents.find(a=>
    !!view.selected&&a.x===view.selected.x&&a.y===view.selected.y);
  const compare=(a:Agent,b:Agent)=>priority(a.id)-priority(b.id)||a.id-b.id;
  // Select top residents per location before sorting. Crowded cities can
  // contain thousands of agents but only 1-2 sprites appear per world tile.
  const eligible=new Map<number,Agent[]>();
  for(const a of agents){
    if(a.id===focus?.id||a.x<bounds.minX||a.x>bounds.maxX||
      a.y<bounds.minY||a.y>bounds.maxY||isVisuallyIndoors(a,scene))continue;
    const tile=a.y*scene.width+a.x;
    const onTile=eligible.get(tile);
    if(!onTile){eligible.set(tile,[a]);continue;}
    if(onTile.length<perTile){onTile.push(a);continue;}
    let last=0;
    for(let i=1;i<onTile.length;i++)
      if(compare(onTile[i],onTile[last])>0)last=i;
    if(compare(a,onTile[last])<0)onTile[last]=a;
  }
  const candidates=Array.from(eligible.values()).flat();
  candidates.sort(compare);
  const visible=candidates.slice(0,maxVisible);
  if(focus)visible.push(focus);
  return visible.sort((a,b)=>a.y-b.y||a.x-b.x||a.id-b.id);
}
