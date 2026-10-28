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
  if(today&&today!=='idle'&&available.has(today))return true;
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
  const candidates=agents.filter(a=>
    a.x>=bounds.minX&&a.x<=bounds.maxX&&
    a.y>=bounds.minY&&a.y<=bounds.maxY&&
    a.id===focus?.id||(
      a.x>=bounds.minX&&a.x<=bounds.maxX&&
      a.y>=bounds.minY&&a.y<=bounds.maxY&&!isVisuallyIndoors(a,scene)));
  candidates.sort((a,b)=>priority(a.id)-priority(b.id)||a.id-b.id);
  const cells=new Map<number,number>(),visible:Agent[]=[];
  for(const agent of candidates){
    if(agent.id===focus?.id)continue;
    const tile=agent.y*scene.width+agent.x;
    const used=cells.get(tile)??0;
    if(used>=perTile)continue;
    cells.set(tile,used+1);
    visible.push(agent);
    if(visible.length>=maxVisible)break;
  }
  if(focus&&!visible.some(a=>a.id===focus.id))visible.push(focus);
  return visible.sort((a,b)=>a.y-b.y||a.x-b.x||a.id-b.id);
}
