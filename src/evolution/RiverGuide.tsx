import type {World} from './engine';
import {riverCourses,type RiverCourse} from './riverCourses';
import {waterSeason} from './riverSeasons';
import {inletSurface,realmWaterStatus,type RealmWaterView} from './realmWater';

export function RiverGuide({world,course,onCourse,onLocate,onStart,water,onBelow}:{
  world:World;course:RiverCourse|undefined;
  onCourse:(mouth:number)=>void;onLocate:(index:number)=>void;onStart:(mouth:number)=>void;
  water?:RealmWaterView;onBelow?:(surface:number)=>void;
}){
  const rivers=riverCourses(world),hasMortal=world.agents.some(a=>a.id===world.descent?.agentId);
  if(!course)return <section className="atlas-river-guide" aria-label="River guide">
    <p>No river courses are charted in this world.</p>
  </section>;
  const season=waterSeason(world);
  return <section className="atlas-river-guide" aria-label="River guide">
    <div className="atlas-river-heading">
      <label>River course <select value={course.mouth} onChange={e=>onCourse(Number(e.target.value))}>
        {rivers.map(river=><option key={river.mouth} value={river.mouth}>{river.name}</option>)}
        {water&&<option value={-1}>Cavern feeder</option>}
      </select></label>
      {course.mouth>=0&&!hasMortal&&<button type="button" onClick={()=>onStart(course.mouth)}>Descend at headwaters</button>}
      {course.mouth===-1&&water&&onBelow&&<button type="button" onClick={()=>onBelow(inletSurface(
        water.route==='overflow'?water.plan.spill??water.plan.main:water.plan.main))}>View water below</button>}
    </div>
    <ol className="atlas-river-stops">
      {course.stops.map(stop=><li key={stop.kind}>
        <button type="button" onClick={()=>onLocate(stop.index)}>{stop.label}</button>
      </li>)}
    </ol>
    {course.mouth===-1&&water?<small>{realmWaterStatus(water)}</small>:<small>{hasMortal?(world.settings.riverlands?
      'Use a river trail sign in Descend to join on foot. ':
      'River trail signs appear in newly generated Riverlands worlds. '):
      'Walk from the headwaters to the shore in Descend. '}
      {world.settings.riverlands&&season==='Bloom'?'Spring floodwater covers some low trails. ':''}
      {season==='Highsun'?'Low summer water exposes gravel bars. ':''}
      {world.settings.riverlands?'Search the banks near falls and fords for uncharted landmarks.':''}
    </small>}
  </section>;
}
