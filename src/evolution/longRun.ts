/** Opt-in long-horizon regression: npm run test:long-simulation.
 * Keeps the default UI/CI tests fast while checking 3,000-year save history
 * and an uncapped 250-year populated world.
 */
import {advanceWorld,createWorld,isWorld,population} from './engine';
import {readSavedWorld,compactWorld} from './storage';

function check(condition:boolean,explanation:string):void{
  if(!condition)throw Error('Long-run regression: '+explanation);
}
async function run(){
  // The low-density run exercises renewable deposits and world chronology
  // through thousands of calendar years without unbounded browser-memory use.
  let ancient=createWorld({size:'small',seed:9201,
    starting:{human:1,elf:1,dwarf:1,demon:1},resourceLevel:.7});
  for(let year=0;year<3000;year+=50){
    ancient=advanceWorld(ancient,50);
    if(year%250===0){
      check(isWorld(ancient),'invalid ancient world at year '+ancient.year);
      await new Promise<void>(resolve=>setTimeout(resolve,0));
    }
  }
  check(ancient.year===3000,'clock must reach year 3000');
  check(readSavedWorld(compactWorld(ancient))!==null,'3,000-year save round-trip');
  check(ancient.deposits!.every(d=>d.amount<=d.capacity),
    'deposits stay in capacity after 3,000 years');
  console.log('3,000-year archival test passed.');

  // Intentionally keep reproduction enabled. No ceiling may stop births at 850.
  let populated=createWorld({size:'small',seed:104729});
  for(let year=0;year<250;year+=10){
    populated=advanceWorld(populated,10);
    if(year%50===0)await new Promise<void>(resolve=>setTimeout(resolve,0));
  }
  const structures=populated.settlements.flatMap(s=>s.infrastructure?.buildings??[])
    .filter(b=>b.stage==='complete');
  const farms=structures.filter(b=>b.type==='farm').length;
  const houses=structures.filter(b=>b.type==='house').length;
  const communal=structures.filter(b=>b.type==='communal').length;
  check(populated.agents.length>850,'populations may rise above the former limit');
  check(isWorld(populated),'populated world is valid at year 250');
  check(houses>0&&communal>0,'construction diversifies beyond farms');
  check(farms<houses*4+10,'farm overproduction stays controlled');
  check(readSavedWorld(compactWorld(populated))!==null,
    'uncapped world can be exported and imported');
  console.log('250-year uncapped stress test passed:',JSON.stringify({
    people:populated.agents.length,species:population(populated),
    settlements:populated.settlements.length,farms,houses,communal}));
}
await run();
