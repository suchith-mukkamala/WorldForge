import {adventureDistance,adventureMapFor,adventureRegion} from './adventureMap';
import type {World} from './engine';
import {FRUIT,fruitStage,fruitStatus} from './fruitTrees';
import {adventureFruitAt} from './surfaceLife';

/** Harvesting is a small use of the existing energy meter and save clock. */
export function gatherFruit(world:World,index:number):{world:World;message:string}{
  const descent=world.descent;
  const actor=descent?.mode==='mortal'?world.agents.find(a=>a.id===descent.agentId):undefined;
  if(!actor||descent?.interior||descent?.ship?.underway||descent?.tidal?.inside||descent?.realm?.visit)
    return {world,message:'Gather fruit while exploring the Surface on foot.'};
  const map=adventureMapFor(world),region=adventureRegion(world,map,actor);
  const tree=region.area.has(index)?adventureFruitAt(world,map,region,index):undefined;
  if(!tree)return {world,message:'There is no reachable fruit tree here.'};
  if(adventureDistance(actor,tree)>1)return {world,message:'Walk closer to the tree.'};
  if(fruitStage(world,tree)!=='ripe')return {world,message:fruitStatus(world,tree)+'.'};
  const crop=FRUIT[tree.kind],energy=Math.min(100,Math.round((actor.energy+crop.energy)*100)/100);
  const trees=world.fruitHarvest?.year===world.year?world.fruitHarvest.trees:[];
  const next={...world,fruitHarvest:{year:world.year,trees:[...trees,index]},
    agents:world.agents.map(a=>a.id===actor.id?{...a,energy}:a)};
  const restored=Math.round((energy-actor.energy)*10)/10;
  return {world:next,message:'You picked and ate '+crop.fruit+
    (restored>0?'. Energy +'+restored+'.':'.')};
}
