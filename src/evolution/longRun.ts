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
  const exports=populated.settlements.reduce((n,s)=>n+(s.economy?.exports??0),0);
  const food=populated.settlements.reduce((n,s)=>n+(s.economy?.food??0),0);
  const workers=populated.settlements.reduce((n,s)=>n+
    Object.values(s.economy?.jobs??{}).reduce((a,b)=>a+b,0),0);
  const roads=populated.transport?.roads.length??0;
  const bridges=populated.transport?.bridges.length??0;
  const specializations=populated.settlements.filter(s=>
    !!s.economy?.specialty).length;
  const partnerships=(populated.tradeRelations??[]).filter(r=>
    r.completed>=3&&r.trust>=47).length;
  check(populated.agents.length>850,'populations may rise above the former limit');
  check(isWorld(populated),'populated world is valid at year 250');
  check(houses>0&&communal>0,'construction diversifies beyond farms');
  check(farms<houses*4+10,'farm overproduction stays controlled');
  check(workers>0,'inhabitants continue participating in useful work');
  check(food>0,'economic food stock exists after sustained farming');
  check(exports>0,'caravans complete at least one genuine inter-settlement delivery');
  check(specializations>0,'places develop specialties from local work and resources');
  check(roads>0,'inhabitants invest in paved infrastructure as traffic grows');
  check(readSavedWorld(compactWorld(populated))!==null,
    'uncapped world can be exported and imported');
  console.log('250-year uncapped stress test passed:',JSON.stringify({
    people:populated.agents.length,species:population(populated),
    settlements:populated.settlements.length,farms,houses,communal,
    employed:workers,storedFood:Math.round(food),completedExports:exports,
    travelling:populated.shipments?.length??0,roads,bridges,
    specializedSettlements:specializations,tradePartnerships:partnerships}));
}
await run();
