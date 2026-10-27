/** Repeatable ecological regression across unrelated world seeds.
 * Run via `npm run test:population-sweep` (more expensive than unit tests).
 */
import {advanceWorld,createWorld,DEATH_CAUSES,isWorld,population,SPECIES,
  type Species} from './engine';

const seeds=[31,72,85,95,504,721,104729,2027,4343,9021,1907,9201];
const runtime=globalThis as unknown as {process?:{argv:string[]}};
const years=Number(runtime.process?.argv[2]??120);
if(!Number.isSafeInteger(years)||years<10||years>3000||years%10!==0)
  throw Error('Specify a whole number of years divisible by 10, from 10 to 3000.');
const totals:Record<Species,{survived:number;extinct:number;born:number;
  died:number;causes:Record<(typeof DEATH_CAUSES)[number],number>}>=
  Object.fromEntries(SPECIES.map(s=>[s,{survived:0,extinct:0,born:0,died:0,
    causes:Object.fromEntries(DEATH_CAUSES.map(c=>[c,0]))}])) as never;

for(const seed of seeds){
  let world=createWorld({seed,size:'small'});
  for(let year=0;year<years;year+=10){
    world=advanceWorld(world,10);
    await new Promise<void>(resolve=>setTimeout(resolve,0));
  }
  if(!isWorld(world))throw Error('Invalid world after '+years+' years: seed '+seed);
  const current=population(world);
  for(const species of SPECIES){
    const record=totals[species],vital=world.demography!.bySpecies[species];
    if(current[species]>0)record.survived++;else record.extinct++;
    record.born+=vital.births;record.died+=vital.deaths;
    for(const cause of DEATH_CAUSES)record.causes[cause]+=vital.causes[cause];
  }
  console.log('seed',seed,'year',world.year,'people',world.agents.length,
    'species',JSON.stringify(current));
}
console.log('Ecological seed-sweep summary ('+seeds.length+' seeds × '+years+
  ' years):',JSON.stringify(totals,null,2));
for(const species of SPECIES){
  if(totals[species].survived<seeds.length/2)
    throw Error(species+' survives fewer than half the sampled worlds');
}
