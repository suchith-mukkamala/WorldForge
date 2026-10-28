/** Optional v1.6 regression: exercise the actual day/week/month/year clock,
 * not just the annual engine. Run: npm run test:daily-life-sweep -- 40
 */
import {advanceWorldDays} from './calendar';
import {createWorld,isWorld,population} from './engine';

const years=Math.max(1,Math.min(250,Number(process.argv[2]??40)));
const seeds=[101,313,719];
for(const seed of seeds){
  let world=createWorld({seed,size:'small'});
  const started=Date.now();
  for(let i=0;i<years;i++){
    world=advanceWorldDays(world,365);
    if(!isWorld(world))throw new Error('Invalid world for seed '+seed+' in year '+world.year);
    if(Object.values(population(world)).some(count=>count===0))
      throw new Error('Species lost for seed '+seed+' in year '+world.year);
  }
  const routines=world.agents.filter(a=>a.dailyLife).length;
  const talking=world.agents.filter(a=>a.dailyLife?.encounters.length).length;
  console.log(JSON.stringify({seed,year:world.year,living:world.agents.length,
    species:population(world),towns:world.settlements.length,
    agentsWithRoutines:routines,agentsWithSocialHistory:talking,
    elapsedMs:Date.now()-started,valid:true}));
}
