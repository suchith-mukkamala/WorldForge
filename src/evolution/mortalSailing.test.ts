import {describe,expect,it} from 'vitest';
import {adventureMapFor,adventureRegion,useAdventureGate,walkAdventure} from './adventureMap';
import {COSTS,prepareInfrastructure} from './construction';
import {createMortal,setDescentMode,type MortalCreation} from './divineDescent';
import {createWorld,type World} from './engine';
import {landShip,landingSites,launchShip,shipMooring,steerShip} from './mortalSailing';
import {validMortalShip} from './shipSave';
import {compactWorld,readSavedWorld} from './storage';

const sailor:MortalCreation={name:'Mira Tide',species:'human',background:'scout',
  appearance:{skin:0,hair:1,hairStyle:0,outfit:'wanderer'}};

function islands(){
  const world=createWorld({seed:4466,size:'small',layout:'archipelago',
    starting:{human:0,elf:0,dwarf:0,demon:0}});
  const land=(x:number,y:number)=>y>=9&&y<=25&&(x>=4&&x<=12||x>=18&&x<=36);
  world.tiles=world.tiles.map((_,i)=>land(i%world.width,Math.floor(i/world.width))?
    {biome:'plains',food:6}:{biome:'water',food:0});
  world.topography={version:1,heights:world.tiles.map(t=>t.biome==='water'?43:57)};
  world.deposits=[];world.ancientSites=[];world.woodland=undefined;
  world.settlements=[{id:1,name:'Reed Harbor',x:8,y:16,species:'human',founded:0,
    population:0,stores:0,emptyYears:0}];
  world.nextSettlementId=2;
  prepareInfrastructure(world);
  const port=world.settlements[0].infrastructure!;
  port.buildings.push({id:1,x:12,y:16,type:'dock',culture:'human',stage:'complete',
    started:0,progress:100,condition:100,spent:{...COSTS.dock.materials},labor:COSTS.dock.labor});
  port.nextBuildingId=2;
  const yard=adventureMapFor(world).shipyards.get(1)!;
  const {world:started,agent}=createMortal(world,sailor,undefined,1);
  return {world:started,agent,yard};
}

describe('Mortal sailing',()=>{
  it('starts at a connected shipyard and keeps the helm over navigable water',()=>{
    const {world,agent,yard}=islands(),map=adventureMapFor(world),{width}=world;
    expect(yard).toEqual({settlementId:1,shore:16*width+12,water:16*width+13});
    expect(agent).toMatchObject({x:12,y:16});
    expect(launchShip(world,{shore:yard.shore+1,water:yard.water+1}).moved).toBe(false);
    const launched=launchShip(world,yard);
    expect(launched.moved).toBe(true);
    expect(launched.world.agents).toBe(world.agents);
    expect(steerShip(launched.world,-1,0,map.bridges).moved).toBe(false);
    expect(steerShip(launched.world,1,1,map.bridges).moved).toBe(false);
    expect(steerShip(launched.world,1,0,new Set([yard.water+1])).moved).toBe(false);
    const moved=steerShip(launched.world,1,0,map.bridges);
    expect(moved.world.descent?.ship).toMatchObject({at:yard.water+1,underway:true,heading:'east'});
    expect(steerShip(setDescentMode(moved.world,'divine'),1,0,map.bridges).moved).toBe(false);
  });

  it('round-trips a voyage, explores a new island and boards its moored ship again',()=>{
    const {world,yard}=islands(),map=adventureMapFor(world),{width}=world;
    let voyage=launchShip(world,yard).world;
    for(let step=0;step<4;step++)voyage=steerShip(voyage,1,0,map.bridges).world;
    const loaded=readSavedWorld(compactWorld(voyage))!;
    const shore=16*width+18;
    expect(loaded.descent?.ship).toEqual(voyage.descent?.ship);
    expect(landingSites(loaded,adventureMapFor(loaded))).toEqual([shore]);
    expect(landShip(loaded,shore+3).moved).toBe(false);
    const landed=landShip(loaded,shore).world;
    expect(landed.descent?.place).toEqual({kind:'wild',x:18,y:16,expedition:true});
    expect(landed.descent?.ship).toMatchObject({underway:false,landfalls:[shore]});
    expect(landed.agents[0]).toMatchObject({x:18,y:16});
    const mooring=shipMooring(landed,adventureMapFor(landed))!;
    expect(launchShip(landed,mooring).world.descent?.ship?.at).toBe(shore-1);

    let inland:World=landed;
    const region=adventureRegion(inland,adventureMapFor(inland),inland.agents[0]);
    const trail=region.gates.find(gate=>gate.label==='Continue east')!;
    expect(trail).toBeDefined();
    for(let step=0;step<5;step++)inland=walkAdventure(inland,region,1,0,false).world;
    const continued=useAdventureGate(inland,region,inland.agents[0],trail);
    expect(continued.moved).toBe(true);
    expect(adventureRegion(continued.world,adventureMapFor(continued.world),continued.world.agents[0])
      .area.has(16*width+25)).toBe(true);
  });

  it('rejects invalid positions and duplicate landfalls in saves',()=>{
    expect(validMortalShip({at:4,shore:5,underway:false,heading:'west',landfalls:[]},4,4)).toBe(true);
    expect(validMortalShip({at:3,shore:4,underway:false,heading:'west',landfalls:[]},4,4)).toBe(false);
    expect(validMortalShip({at:16,shore:4,underway:true,heading:'west',landfalls:[]},4,4)).toBe(false);
    expect(validMortalShip({at:5,shore:4,underway:true,heading:'west',landfalls:[4,4]},4,4)).toBe(false);
  });
});
