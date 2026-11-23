import {describe,expect,it} from 'vitest';
import {advanceWorldDays} from './calendar';
import {createMortal,setDescentMode} from './divineDescent';
import {createWorld,type Biome,type World} from './engine';
import {walkMortal} from './mortalGameplay';
import {boardRealmBoat,enterUnderworld,landRealmBoat,leaveUnderworld,moveUnderworld,
  occupiedUnderworld,realmLandings} from './mortalUnderworld';
import {controlsMortal,seaNeighbors,seaPoint} from './shipSave';
import {compactWorld,readSavedWorld} from './storage';
import {TERRAIN_CELL_SIDE,TERRAIN_ELEVATION_UNITS} from './terrainCells';
import {SEA_LEVEL} from './topography';
import {initializeUnderworld,realmResidents,RealmBiome,realmWalkable,underworldMap} from './underworld';
import {enableVolcanicWorld,sculptVolcanicIslands,ventHasGround} from './volcanicGeography';
import {advanceVolcanism,lavaField,volcanicDay,volcanoPhase} from './volcanism';

const starting={human:0,elf:0,dwarf:0,demon:0};
const make=(volcanicWorld=true,seed=41)=>createWorld({seed,size:'small',layout:'archipelago',
  starting,regionalGeography:true,regionalBiomes:true,riverlands:true,livingBiomes:true,
  terrainCells:true,floatingIslands:true,worldTree:true,volcanicWorld});
const wayfinder={name:'Mira Flint',species:'human',background:'scout',
  appearance:{skin:1,hair:1,hairStyle:1,outfit:'wanderer'}} as const;

function reachable(start:number,width:number,size:number,open:(index:number)=>boolean){
  const seen=new Map([[start,start]]),queue=[start];
  for(const at of queue)for(const i of seaNeighbors(at,width,size)){
    if(i<0||seen.has(i)||!open(i))continue;
    queue.push(i);seen.set(i,at);
  }
  return seen;
}

function follow(world:World,goal:number){
  const {map,visit}=occupiedUnderworld(world)!;
  const sea=!!visit.ship?.underway;
  const seen=reachable(visit.at,map.width,map.biomes.length,i=>sea?
    map.biomes[i]===RealmBiome.sea:realmWalkable(map,i,volcanicDay(world)));
  expect(seen.has(goal)).toBe(true);
  const route:number[]=[];
  for(let i=goal;i!==visit.at;i=seen.get(i)!)route.unshift(i);
  let at=seaPoint(map.width,visit.at),next=world;
  for(const i of route){
    const p=seaPoint(map.width,i),step=moveUnderworld(next,p.x-at.x,p.y-at.y);
    expect(step.moved).toBe(true);
    next=step.world;at=p;
  }
  return next;
}

describe('Volcanic island chains',()=>{
  it('grows a young cone, weathered island and an open coral lagoon in real ocean',()=>{
    const world=make(),same=make(),earlier=make(false);
    const chain=world.volcanicLayout!,{width,tiles}=world;
    expect(chain).toEqual(same.volcanicLayout);
    expect(chain.islands.map(island=>island.age)).toEqual(['young','weathered','atoll']);
    for(const island of chain.islands)expect(earlier.tiles[island.index].biome).toBe('water');
    expect(chain.vents.every(vent=>ventHasGround(world,vent))).toBe(true);
    const volcano=chain.vents[0];
    expect(tiles[volcano.index].biome).toBe('volcanic');
    expect(world.topography!.heights[volcano.rim]).toBeGreaterThan(world.topography!.heights[chain.islands[2].index]);
    const lagoon=chain.islands[2].index;
    expect(tiles[lagoon].biome).toBe('water');
    const water=reachable(lagoon,width,tiles.length,i=>tiles[i].biome==='water');
    expect([...water.keys()].some(i=>i<width||i>=tiles.length-width)).toBe(true);
  });

  it('varies island silhouettes even when the starting ocean is identical',()=>{
    const width=96,height=64;
    const generate=(seed:number)=>{
      const biomes:Biome[]=Array(width*height).fill('water');
      const heights=Array(width*height).fill(SEA_LEVEL-12);
      const islands=sculptVolcanicIslands(width,height,seed,biomes,heights);
      return islands.map(({index,radius})=>{
        const side=radius*2+1;
        return Array.from({length:side},(_,row)=>biomes.slice(
          index+(row-radius)*width-radius,index+(row-radius)*width+radius+1)
          .map(biome=>biome==='water'?'0':'1').join('')).join('/');
      });
    };
    const first=generate(41),second=generate(203);
    expect(first).toHaveLength(3);
    expect(first).toEqual(generate(41));
    expect(second).toHaveLength(3);
    expect(second.every((shape,i)=>shape!==first[i])).toBe(true);
  });

  it('runs downhill over multiple squares, fills the seabed and saves emerged land',()=>{
    const initial=make();
    const initialWater=initial.tiles.filter(tile=>tile.biome==='water').length;
    let scene=initial,sawHot=false,sawSubmerged=false;
    for(let day=1;day<=110;day++){
      scene=advanceVolcanism(scene,day);
      const lava=lavaField(scene);
      if(lava.hot.size>3)sawHot=true;
      if([...lava.byTile].some(([tile,patches])=>scene.tiles[tile].biome==='water'&&
        patches.some(cell=>cell[3]>0&&cell[1]+cell[3]<SEA_LEVEL*TERRAIN_ELEVATION_UNITS)))sawSubmerged=true;
    }
    expect(sawHot).toBe(true);
    expect(sawSubmerged).toBe(true);
    expect(initial.volcanism).toBeUndefined();
    expect(initial.tiles.filter(tile=>tile.biome==='water')).toHaveLength(initialWater);
    expect(scene.volcanism!.shelves.length).toBeGreaterThan(0);
    for(const [tile] of scene.volcanism!.shelves){
      expect(initial.tiles[tile].biome).toBe('water');
      expect(scene.tiles[tile].biome).toBe('volcanic');
      const emerged=lavaField(scene).byTile.get(tile)!.filter(cell=>
        cell[1]+cell[3]>=SEA_LEVEL*TERRAIN_ELEVATION_UNITS+2);
      expect(emerged.length).toBeGreaterThanOrEqual(TERRAIN_CELL_SIDE**2*.625);
    }
    const restored=readSavedWorld(compactWorld({...scene,dayOfYear:110}))!;
    expect(restored.volcanism).toEqual(scene.volcanism);
    expect(restored.topography).toEqual(scene.topography);
    const pioneers=advanceVolcanism(restored,900),soil=advanceVolcanism(pioneers,2400);
    const first=scene.volcanism!.shelves[0][0];
    expect(pioneers.tiles[first].biome).toBe('wasteland');
    expect(['plains','forest','taiga','savanna']).toContain(soil.tiles[first].biome);
  });

  it('advances geology and underground populations consistently with time batching',()=>{
    const world={...make(),dayOfYear:357};
    const batch=advanceWorldDays(world,24);
    let steps:World=world;
    for(let i=0;i<24;i++)steps=advanceWorldDays(steps,1);
    expect(batch.volcanism).toEqual(steps.volcanism);
    expect(batch.underworld!.population).toEqual(steps.underworld!.population);
    expect(batch.underworld!.population).not.toEqual(world.underworld!.population);
  });

  it('adds real vents to a legacy save without reshaping the existing landscape',()=>{
    const old=make(false);
    const loaded=readSavedWorld(compactWorld(old))!;
    const updated=initializeUnderworld(enableVolcanicWorld(loaded));
    expect(updated.tiles).toBe(loaded.tiles);
    expect(updated.topography).toBe(loaded.topography);
    expect(updated.volcanicLayout!.vents.length).toBeGreaterThan(0);
    expect(updated.underworld!.links.some(link=>link.kind==='crater')).toBe(true);
    expect(readSavedWorld(compactWorld(updated))).not.toBeNull();
  });
});


describe('The Underworld',()=>{
  it('has connected biome regions, distinct communities and linked surface exits',()=>{
    for(const seed of [41,31,104729]){
      const world=make(true,seed),map=underworldMap(world)!;
      expect(new Set(map.biomes)).toEqual(new Set(Object.values(RealmBiome)));
      expect(new Set(map.links.map(link=>link.kind))).toEqual(new Set(['crater','roots','falls']));
      expect(map.towns).toHaveLength(4);
      const count=world.underworld!.population.reduce((total,town)=>({
        demons:total.demons+town.demons,ashBorne:total.ashBorne+town.ashBorne,
      }),{demons:0,ashBorne:0});
      expect(count.demons).toBeGreaterThan(count.ashBorne);
      expect(count.ashBorne).toBeGreaterThan(30);
      expect(realmResidents(world,map).map(resident=>resident.people)).toContain('ash-borne');
      for(const day of [0,13,25]){
        const seen=reachable(map.links[0].cell,map.width,map.biomes.length,i=>realmWalkable(map,i,day));
        expect(map.links.every(link=>seen.has(link.cell))).toBe(true);
        expect(map.towns.every(town=>seen.has(town.index))).toBe(true);
      }
    }
  });

  it('gates crater entry, holds the return passage open and restores a separate position',()=>{
    const world=make(),vent=world.volcanicLayout!.vents[0];
    const {world:surface,agent}=createMortal(world,wayfinder,undefined,undefined,false,vent.index);
    expect(volcanoPhase(surface,vent)).toBe('Dormant');
    expect(volcanoPhase({...surface,year:9999},vent)).toBe('Dormant');
    const eruptionDay=vent.period-vent.offset;
    expect(enterUnderworld({...surface,dayOfYear:eruptionDay},vent.index).moved).toBe(false);
    const arrived=enterUnderworld(surface,vent.index);
    expect(arrived.moved).toBe(true);
    const active=occupiedUnderworld(arrived.world)!;
    expect(walkMortal(arrived.world,1,0).moved).toBe(false);
    expect(controlsMortal(setDescentMode(arrived.world,'divine').descent,agent.id)).toBe(true);
    const returnDuringEruption=leaveUnderworld({...arrived.world,dayOfYear:eruptionDay},active.origin);
    expect(returnDuringEruption.moved).toBe(true);
    expect(returnDuringEruption.world.agents[0]).toMatchObject(seaPoint(world.width,vent.rim));

    const far=active.map.links.find(link=>link.kind==='roots')!;
    const explored=follow(arrived.world,far.cell);
    const restored=readSavedWorld(compactWorld(explored))!;
    expect(occupiedUnderworld(restored)?.visit.at).toBe(far.cell);
    expect(restored.descent?.realm?.chart).toContain(far.surface);
    const returned=leaveUnderworld(restored,far);
    expect(returned.moved).toBe(true);
    expect(returned.world.agents[0]).toMatchObject(seaPoint(world.width,far.surface));
  });

  it('sails and lands in the Buried Sea, leaving a usable mooring',()=>{
    const world=make(),vent=world.volcanicLayout!.vents[0];
    const {world:surface}=createMortal(world,wayfinder,undefined,undefined,false,vent.index);
    const below=enterUnderworld(surface,vent.index).world;
    const {map}=occupiedUnderworld(below)!;
    const port=map.towns.find(town=>town.berth!==undefined)!;
    const atPort=follow(below,port.index);
    const embarked=boardRealmBoat(atPort);
    expect(embarked.moved).toBe(true);
    const continent=reachable(port.index,map.width,map.biomes.length,i=>realmWalkable(map,i,0));
    const water=reachable(port.berth!,map.width,map.biomes.length,i=>map.biomes[i]===RealmBiome.sea);
    const bank=[...water.keys()].find(at=>
      seaNeighbors(at,map.width,map.biomes.length).some(i=>realmWalkable(map,i,0)&&!continent.has(i)))!;
    expect(bank).toBeDefined();
    const far=follow(embarked.world,bank);
    const reloaded=readSavedWorld(compactWorld(far))!;
    const active=occupiedUnderworld(reloaded)!;
    expect(active.visit.ship?.underway).toBe(true);
    const shore=realmLandings(reloaded,map,active.visit).find(i=>!continent.has(i))!;
    expect(shore).toBeDefined();
    const landed=landRealmBoat(reloaded,shore);
    expect(landed.moved).toBe(true);
    expect(occupiedUnderworld(landed.world)?.visit.at).toBe(shore);
    expect(boardRealmBoat(landed.world).moved).toBe(true);
  });
});
