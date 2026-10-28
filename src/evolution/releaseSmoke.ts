/** v1.8 release smoke: fast enough for every PR, with deterministic world
 * updates and packed-save compatibility. Nightly CI runs the deeper sweeps.
 * Measured durations are diagnostics, never hardware-dependent pass/fail limits.
 */
import {advanceWorld,createWorld,isWorld} from './engine';
import {advanceWorldDays} from './calendar';
import {compactWorld,readSavedWorld} from './storage';
import {populationScene,renderedPopulation} from './populationVisibility';

function assert(condition:unknown,message:string):asserts condition{
  if(!condition)throw Error('WorldForge release smoke: '+message);
}
function run(){
  const start=performance.now();
  for(const seed of [4099,8123]){
    const initial=createWorld({seed,size:'small'});
    const a=advanceWorldDays(initial,365+60);
    const b=advanceWorldDays(advanceWorldDays(initial,365),60);
    assert(JSON.stringify(a)===JSON.stringify(b),
      'calendar boundary order differs for seed '+seed);
    const cameraBefore=JSON.stringify(a);
    const scene=populationScene(a);
    for(const zoom of [1,2.5,4,8]){
      renderedPopulation(a.agents,scene,{
        bounds:{minX:0,minY:0,maxX:32,maxY:32},zoom,
        maxVisible:60});
      renderedPopulation(a.agents,scene,{
        bounds:{minX:35,minY:20,maxX:70,maxY:55},zoom,
        maxVisible:60});
    }
    assert(JSON.stringify(a)===cameraBefore,
      'rendering mutated authoritative world for seed '+seed);
    const evolved=advanceWorld(a,20);
    assert(isWorld(evolved),'invalid evolved world for seed '+seed);
    assert(readSavedWorld(compactWorld(evolved))!==null,
      'corrupted save round-trip for seed '+seed);
    console.log(JSON.stringify({seed,year:evolved.year,people:evolved.agents.length,
      settlements:evolved.settlements.length,
      saveBytes:compactWorld(evolved).length}));
  }
  console.log('v1.8 release smoke passed in '+Math.round(performance.now()-start)+' ms');
}
run();
