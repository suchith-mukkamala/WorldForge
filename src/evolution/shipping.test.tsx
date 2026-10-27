import {describe,expect,it} from 'vitest';
import {createWorld,isWorld,stepWorld,type Settlement,type World} from './engine';
import {advanceConstruction,prepareInfrastructure,type Building} from './construction';
import {advanceEconomy,createEconomy,stockOf} from './economy';
import {findSeaRoute,rescueSailor} from './shipping';
import {findTradeRoute} from './transport';
import {readSavedWorld,compactWorld} from './storage';

function coastalWorld():{w:World;west:Settlement;east:Settlement}{
  const w=createWorld({size:'small',seed:784,
    starting:{human:8,elf:0,dwarf:0,demon:0}});
  for(let y=14;y<=36;y++)for(let x=17;x<=43;x++){
    const water=x>=25&&x<=35;
    w.tiles[y*w.width+x]={biome:water?'water':'plains',food:water?0:7};
  }
  w.deposits=w.deposits?.filter(d=>w.tiles[d.index].biome!=='water');
  w.agents.forEach((a,i)=>{
    a.x=19+i%4;a.y=24+Math.floor(i/4);
    a.age=24+i;a.energy=96;a.health=96;
  });
  const west:Settlement={id:w.nextSettlementId++,species:'human',
    name:'Harbor West',x:22,y:25,founded:0,population:8,stores:30,
    emptyYears:0,economy:createEconomy()};
  const east:Settlement={id:w.nextSettlementId++,species:'human',
    name:'Harbor East',x:38,y:25,founded:0,population:1,stores:10,
    emptyYears:0,economy:createEconomy()};
  w.settlements=[west,east];prepareInfrastructure(w);
  west.economy!.food=250;west.economy!.tools=6;
  west.infrastructure!.stock.wood=48;
  east.economy!.food=0;east.economy!.coins=100;
  return {w,west,east};
}

describe('WorldForge v1.0 — actual sea navigation and shipping',()=>{
  it('lets citizens propose a real harbor dock on suitable shoreline land',()=>{
    const {w,west}=coastalWorld();
    w.households=[]; // A prepared town with no pending housing requests.
    for(const a of w.agents)a.development!.householdId=undefined;
    for(const type of ['shelter','well'] as const){
      const b:Building={id:west.infrastructure!.nextBuildingId++,type,
        x:west.x,y:west.y,culture:'human',stage:'complete',progress:100,
        condition:100,started:0,finished:0,
        spent:{wood:10,stone:10,clay:10},labor:20};
      west.infrastructure!.buildings.push(b);
    }
    advanceConstruction(w,[]);
    const dock=west.infrastructure!.buildings.find(b=>b.type==='dock');
    expect(dock).toBeDefined();
    expect(w.tiles[dock!.y*w.width+dock!.x].biome).not.toBe('water');
    expect([-1,0,1].some(dx=>[-1,0,1].some(dy=>{
      const x=dock!.x+dx,y=dock!.y+dy;
      return (dx||dy)&&w.tiles[y*w.width+x]?.biome==='water';
    }))).toBe(true);
  });
  it('links otherwise isolated ports through connected water instead of crossing land',()=>{
    const {w,west,east}=coastalWorld();
    expect(findTradeRoute(w,west,east)).toBeNull();
    const route=findSeaRoute(w,west,east);
    expect(route).not.toBeNull();
    const water=route!.filter(i=>w.tiles[i].biome==='water');
    expect(water.length).toBeGreaterThan(4);
    expect(route![0]).toBe(west.y*w.width+west.x);
    expect(route!.at(-1)).toBe(east.y*w.width+east.x);
    expect(route!.slice(1).every((n,i)=>Math.max(
      Math.abs(n%w.width-route![i]%w.width),
      Math.abs(Math.floor(n/w.width)-Math.floor(route![i]/w.width)))===1))
      .toBe(true);
  });

  it('purchases boats and provisions, sails a captain, and pays only on arrival',()=>{
    const {w,west,east}=coastalWorld();
    advanceEconomy(w);
    const ship=w.shipments?.find(t=>t.mode==='sea');
    expect(ship).toBeDefined();
    expect(ship?.provisions).toBeGreaterThan(0);
    expect(stockOf(west,'wood')).toBeLessThan(48);
    expect(stockOf(west,'tools')).toBeLessThan(6);
    expect(stockOf(east,'food')).toBe(0);
    let sailor=w.agents.find(a=>a.id===ship!.carrierId)!;
    for(let i=0;i<50&&(w.shipments?.some(t=>t.id===ship!.id));i++){
      w.year++;
      advanceEconomy(w);
      sailor=w.agents.find(a=>a.id===ship!.carrierId)!;
      const progress=w.shipments?.find(t=>t.id===ship!.id);
      if(progress&&w.tiles[sailor.y*w.width+sailor.x].biome==='water')
        expect(progress.mode).toBe('sea');
    }
    expect(w.settlements[0].economy!.exports).toBeGreaterThan(0);
    expect(w.settlements[0].economy!.seaExports).toBeGreaterThan(0);
    expect(w.settlements[1].economy!.imports).toBeGreaterThan(0);
    expect(stockOf(east,'food')).toBeGreaterThan(0);
    expect(w.events.some(e=>e.message.includes('by sea'))).toBe(true);
    // This unit test advances only the economy, so synchronize its snapshot.
    w.history=[{...w.history.at(-1)!,year:w.year,
      total:w.agents.length,settlements:w.settlements.length}];
    expect(isWorld(w)).toBe(true);
    expect(readSavedWorld(compactWorld(w))).toEqual(w);
  });

  it('chooses a faster sea passage when both shores have invested in docks',()=>{
    const {w,west,east}=coastalWorld();
    for(let x=25;x<=35;x++)w.tiles[25*w.width+x]={biome:'plains',food:7};
    for(const [s,x] of [[west,24],[east,36]] as const){
      s.infrastructure!.buildings.push({id:s.infrastructure!.nextBuildingId++,type:'dock',
        x,y:25,culture:s.species,stage:'complete',progress:100,condition:100,
        started:0,finished:0,spent:{wood:14,stone:5,clay:4},labor:18});
    }
    const road=findTradeRoute(w,west,east)!;
    const passage=findSeaRoute(w,west,east)!;
    expect(road).not.toBeNull();
    expect(passage).not.toBeNull();
    advanceEconomy(w);
    const seaYears=passage.reduce((n,idx)=>n+
      (w.tiles[idx].biome==='water'?1/3:1),0);
    expect(w.shipments!.find(t=>t.destinationId===east.id)?.mode,
      `land=${road.length},sea=${passage.length},seaYears=${seaYears}`)
      .toBe('sea');
  });

  it('respects stocked meals while a captain spends a year at sea',()=>{
    const {w}=coastalWorld();advanceEconomy(w);
    const ship=w.shipments!.find(t=>t.mode==='sea')!;
    const sailor=w.agents.find(a=>a.id===ship.carrierId)!;
    const atSea=ship.route.findIndex(i=>w.tiles[i].biome==='water');
    sailor.x=ship.route[atSea]%w.width;
    sailor.y=Math.floor(ship.route[atSea]/w.width);
    ship.progress=atSea;
    const before=ship.provisions!;
    const next=stepWorld(w);
    expect(next.year).toBe(1);
    expect(next.shipments!.find(t=>t.id===ship.id)?.provisions).toBeLessThan(before);
    expect(isWorld(next)).toBe(true);
  });

  it('never pushes a shoreline resident into water when a ship lands',()=>{
    const {w}=coastalWorld();advanceEconomy(w);
    const ship=w.shipments!.find(t=>t.mode==='sea')!;
    const sailor=w.agents.find(a=>a.id===ship.carrierId)!;
    let lastWater=-1;
    for(let i=0;i<ship.route.length;i++)
      if(w.tiles[ship.route[i]].biome==='water')lastWater=i;
    const landing=ship.route[lastWater+1];
    expect(landing).toBeDefined();
    expect(w.tiles[landing].biome).not.toBe('water');
    sailor.x=ship.route[lastWater]%w.width;
    sailor.y=Math.floor(ship.route[lastWater]/w.width);
    ship.progress=lastWater;
    const resident=w.agents.find(a=>a.id!==sailor.id)!;
    resident.x=landing%w.width;resident.y=Math.floor(landing/w.width);
    resident.development!.values.community=90;
    resident.work=undefined;
    w.year++;
    advanceEconomy(w);
    expect(w.tiles[resident.y*w.width+resident.x].biome).not.toBe('water');
    expect(new Set(w.agents.map(a=>a.y*w.width+a.x)).size).toBe(w.agents.length);
  });

  it('completes a voyage through real yearly survival and settlement simulation',()=>{
    const scenario=coastalWorld();
    let {w}=scenario;
    const resident=w.agents.at(-1)!;
    resident.x=scenario.east.x;resident.y=scenario.east.y;
    advanceEconomy(w);
    expect(w.shipments?.some(t=>t.mode==='sea')).toBe(true);
    for(let year=0;year<38&&w.settlements[0].economy!.seaExports===0;year++){
      w=stepWorld(w);
      expect(isWorld(w),'valid sea navigation at year '+w.year).toBe(true);
    }
    expect(w.settlements[0].economy!.seaExports).toBeGreaterThan(0);
    expect(w.events.some(e=>e.message.includes('delivered')&&
      e.message.includes('by ship'))).toBe(true);
  },30000);

  it('rescues a sailor from a lost vessel without overlapping another person',()=>{
    const {w}=coastalWorld();
    const a=w.agents[0];a.x=29;a.y=25;
    const occupied=new Map(w.agents.map(p=>[p.y*w.width+p.x,p]));
    rescueSailor(w,a,occupied);
    expect(w.tiles[a.y*w.width+a.x].biome).not.toBe('water');
    expect(new Set(w.agents.map(p=>p.y*w.width+p.x)).size).toBe(w.agents.length);
  });
});
