import {describe,expect,it} from 'vitest';
import {createMortal} from './divineDescent';
import {createWorld,type World} from './engine';
import {hydrologyForWorld} from './hydrology';
import {boardRealmBoat,enterUnderworld,landRealmBoat,moveUnderworld,occupiedUnderworld,
  realmLandings,realmWadingBank,wadeRealmBank} from './mortalUnderworld';
import {realmScenery} from './realmScenery';
import {cavernFeederCourse,divertedRiverLinks,inletSurface,realmWater} from './realmWater';
import {riverLinks} from './riverSeasons';
import {seaNeighbors,seaPoint} from './shipSave';
import {compactWorld,readSavedWorld} from './storage';
import {surfaceGrid} from './surfaceGrid';
import {RealmBiome,realmWalkable,underworldMap} from './underworld';
import {advanceVolcanism,volcanicDay} from './volcanism';

const make=(seed=41)=>createWorld({seed,size:'small',layout:'archipelago',volcanicWorld:true,
  worldTree:true,floatingIslands:true,riverlands:true,regionalGeography:true,regionalBiomes:true,
  starting:{human:0,elf:0,dwarf:0,demon:0}});
const walker={name:'Lio Reed',species:'human',background:'scout',
  appearance:{skin:1,hair:1,hairStyle:1,outfit:'wanderer'}} as const;

function follow(world:World,goal:number){
  const {map,visit}=occupiedUnderworld(world)!;
  const aboard=!!visit.ship?.underway;
  const seen=new Map([[visit.at,visit.at]]),queue=[visit.at];
  for(const at of queue){
    if(at===goal)break;
    for(const next of seaNeighbors(at,map.width,map.biomes.length)){
      if(next<0||seen.has(next)||!(aboard?map.biomes[next]===RealmBiome.sea:realmWalkable(map,next,volcanicDay(world))))continue;
      seen.set(next,at);queue.push(next);
    }
  }
  expect(seen.has(goal)).toBe(true);
  const path:number[]=[];
  for(let i=goal;i!==visit.at;i=seen.get(i)!)path.unshift(i);
  let at=visit.at;
  for(const i of path){
    const a=seaPoint(map.width,at),b=seaPoint(map.width,i);
    const move=moveUnderworld(world,b.x-a.x,b.y-a.y);
    expect(move.moved).toBe(true);
    world=move.world;at=i;
  }
  return world;
}

function descend(world:World){
  const vent=world.volcanicLayout!.vents[0];
  const placed=createMortal(world,walker,undefined,undefined,false,vent.index).world;
  const entry=enterUnderworld(placed,vent.index);
  expect(entry.moved).toBe(true);
  return entry.world;
}

describe('The cavern watershed',()=>{
  it('reuses the actual feeder and raises and lowers the lake with the calendar',()=>{
    const world=make(),base=underworldMap(world)!,wet=realmWater(world,base)!;
    const {main}=wet.plan,{flowTo}=hydrologyForWorld(world);
    expect(main.path.every((cell,i)=>i===0||flowTo[main.path[i-1]]===cell)).toBe(true);
    expect(wet.level).toBe(2);
    expect(wet.map.heights[main.cell]).toBe(3);
    expect(realmScenery(wet.map).falls.get(main.bank)).toMatchObject({outlet:main.cell,flow:2});
    expect(realmWater({...world,dayOfYear:10},base)?.map).toBe(wet.map);
    const autumn=realmWater({...world,dayOfYear:230},base)!;
    expect(autumn.map.heights[main.cell]).toBe(1);
    expect(autumn.map.water?.fall?.flow).toBe(1);
    const summer=realmWater({...world,dayOfYear:135},base)!;
    expect(summer.level).toBe(0);
    expect(summer.map.water?.fall).toBeUndefined();
    expect(wet.ledges.length).toBeGreaterThan(2);
    expect(wet.ledges.every(i=>wet.map.biomes[i]===RealmBiome.sea&&
      summer.map.biomes[i]===RealmBiome.chalk&&realmWalkable(summer.map,i,135))).toBe(true);
    expect(base.biomes[main.cell]).toBe(RealmBiome.sea);
    expect(base.heights[main.cell]).toBe(0);
    expect(wet.map.biomes[wet.map.towns.find(town=>town.berth!==undefined)!.berth!]).toBe(RealmBiome.sea);
  });

  it('reroutes a natural eruption on the Surface and fills the alternate cave pool',()=>{
    let world=make(31);
    const base=underworldMap(world)!,baseline=realmWater(world,base)!;
    const spill=baseline.plan.spill!;
    expect(spill).toBeDefined();
    expect(baseline.map.biomes[spill.cell]).not.toBe(RealmBiome.sea);
    for(let day=1;day<80;day++){
      world={...advanceVolcanism(world,day),dayOfYear:day};
      if(realmWater(world,base)?.route==='overflow')break;
    }
    const diverted=realmWater(world,base)!;
    expect(diverted.route).toBe('overflow');
    expect(diverted.level).toBe(0);
    expect(diverted.plan.main.path).toContain(diverted.dam);
    expect(diverted.map.biomes[diverted.plan.main.cell]).toBe(RealmBiome.chalk);
    expect(diverted.map.biomes[spill.cell]).toBe(RealmBiome.sea);
    expect(diverted.map.water?.fall?.outlet).toBe(spill.cell);
    const flooded=[...diverted.map.water!.seasonal].filter(i=>
      base.biomes[i]!==RealmBiome.sea&&diverted.map.biomes[i]===RealmBiome.sea);
    expect(flooded.every(i=>seaNeighbors(i,base.width,base.biomes.length).every(j=>
      diverted.map.heights[j]>=diverted.map.heights[i]))).toBe(true);
    expect(base.heights[spill.bank]-diverted.map.heights[spill.cell]).toBeGreaterThanOrEqual(2);
    expect(cavernFeederCourse(diverted).outlet).toBe(inletSurface(spill));
    const nominal=riverLinks(world),rerouted=divertedRiverLinks(nominal,world.width,diverted);
    const split=diverted.plan.main.path.indexOf(spill.path[0]);
    expect(rerouted.get(spill.path[0])?.map(link=>link.other)).toContain(spill.path[1]);
    expect(rerouted.get(spill.path[0])?.map(link=>link.other)).not.toContain(diverted.plan.main.path[split+1]);
    expect(surfaceGrid(world)).toBe(surfaceGrid({...world,dayOfYear:world.dayOfYear!+1}));
    const restored=readSavedWorld(compactWorld(world))!;
    expect(restored.underworld?.watershed).toEqual(baseline.plan);
    expect(realmWater(restored,underworldMap(restored)!)?.route).toBe('overflow');
  });

  it('sails across the wet ledge, goes ashore when the boat grounds, and walks back',()=>{
    const arrived=descend(make());
    const active=occupiedUnderworld(arrived)!;
    const port=active.map.towns.find(town=>town.berth!==undefined)!;
    const boat=boardRealmBoat(follow(arrived,port.index));
    expect(boat.moved).toBe(true);
    const at=active.water!.plan.main.cell;
    const across=follow(boat.world,at);
    expect(occupiedUnderworld(across)!.visit.at).toBe(at);
    const grounded={...across,dayOfYear:135};
    const shallows=occupiedUnderworld(grounded)!;
    expect(shallows.map.biomes[at]).toBe(RealmBiome.chalk);
    const landing=realmLandings(grounded,shallows.map,shallows.visit).find(i=>
      i===active.water!.plan.main.bank)!;
    expect(landing).toBeDefined();
    const shore=landRealmBoat(grounded,landing);
    expect(shore.moved).toBe(true);
    const exposed=follow(shore.world,at);
    const rising={...exposed,dayOfYear:230};
    const flooded=occupiedUnderworld(readSavedWorld(compactWorld(rising))!)!;
    expect(flooded.visit.at).toBe(at);
    expect(flooded.map.biomes[at]).toBe(RealmBiome.sea);
    expect(realmWadingBank(flooded.map,flooded.visit,230)).toBeDefined();
    const escaped=wadeRealmBank(rising);
    expect(escaped.moved).toBe(true);
    const dry=occupiedUnderworld(escaped.world)!;
    expect(realmWalkable(dry.map,dry.visit.at,230)).toBe(true);
  });

  it('adds the water cycle to an old save using its existing floor and routes',()=>{
    const world=make(),base=underworldMap(world)!;
    const old={...world,underworld:{...world.underworld!,watershed:undefined}};
    const restored=readSavedWorld(compactWorld(old))!;
    expect(underworldMap(restored)).toEqual(base);
    expect(restored.underworld?.watershed).toEqual(world.underworld?.watershed);
  });
});
