/** Optional v1.6 regression: exercise the actual day/week/month/year clock,
 * not just the annual engine. Run: npm run test:daily-life-sweep -- 40
 */
import {advanceWorldDays} from './calendar';
import {createWorld,isWorld,population} from './engine';

const runtime=globalThis as unknown as {process?:{argv:string[]}};
const years=Number(runtime.process?.argv[2]??40);
if(!Number.isSafeInteger(years)||years<1||years>250)
  throw new Error('Choose a whole number of years between 1 and 250.');
const seeds=[101,313,719];
for(const seed of seeds){
  let world=createWorld({seed,size:'small'});
  const started=Date.now();
  for(let i=0;i<years;i++){
    world=advanceWorldDays(world,365);
    if(!isWorld(world))throw new Error('Invalid world for seed '+seed+' in year '+(i+1));
    if(Object.values(population(world)).some(count=>count===0))
      throw new Error('Species lost for seed '+seed+' in year '+world.year);
  }
  const routines=world.agents.filter(a=>a.dailyLife).length;
  const talking=world.agents.filter(a=>a.dailyLife?.encounters.length).length;
  const agendas=world.agents.filter(a=>a.cognition?.agenda.length).length;
  const noPlans=world.agents.filter(a=>!a.cognition?.agenda.length).length;
  const interrupted=world.agents.reduce((n,a)=>n+
    (a.cognition?.history.filter(h=>h.outcome==='interrupted').length??0),0);
  const completed=world.agents.reduce((n,a)=>n+
    (a.cognition?.history.filter(h=>h.outcome==='completed').length??0),0);
  const exploredPaths=world.agents.filter(a=>
    (a.cognition?.trail.length??0)>2).length;
  console.log(JSON.stringify({seed,year:world.year,living:world.agents.length,
    species:population(world),towns:world.settlements.length,
    agentsWithRoutines:routines,agentsWithSocialHistory:talking,
    agendas,noPlans,completed,interrupted,exploredPaths,
    elapsedMs:Date.now()-started,valid:true}));
}
