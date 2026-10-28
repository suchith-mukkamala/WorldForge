/** Opt-in deterministic expedition/population performance diagnostic.
 * Run with: npx vite-node src/evolution/expeditionBenchmark.ts 31 240
 */
import {advanceWorld,createWorld,isWorld,population} from './engine';

const runtime=globalThis as unknown as {process?:{argv:string[]}};
const args=runtime.process?.argv??[];
const seed=Number(args[2]??31),years=Number(args[3]??240);
let world=createWorld({seed,size:'small',resourceLevel:1});
for(let i=0;i<years;i+=10){
  const started=performance.now();
  world=advanceWorld(world,Math.min(10,years-i));
  console.log(JSON.stringify({year:world.year,
    elapsedMs:Math.round(performance.now()-started),
    living:world.agents.length,species:population(world),
    towns:world.settlements.length,
    planned:world.agents.filter(a=>a.mind?.expedition).length,
    finds:world.expeditions?.length,
    valid:isWorld(world)}));
  await new Promise<void>(resolve=>setTimeout(resolve,0));
}
