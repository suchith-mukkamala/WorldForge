import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {advanceWorld,createWorld,editWorld,isWorld,stepWorld,
  type Settlement,type World} from './engine';
import {prepareInfrastructure,validConstruction,type Building} from './construction';
import {activePartnership,advanceEconomy,createEconomy,inferSpecialty,
  relationBetween,stockOf,validEconomy} from './economy';
import {advanceTransport,caravanPace,considerTradeBridge,findTradeRoute,
  validTransport} from './transport';
import {validDeposits} from './resources';
import {SettlementView} from './SettlementView';
import {compactWorld,readSavedWorld} from './storage';

function emptyWorld():World{
  return createWorld({size:'small',seed:603,
    starting:{human:0,elf:0,dwarf:0,demon:0}});
}
function addTown(w:World,id:number,x:number,y:number,name:string):Settlement{
  const town:Settlement={id,name,x,y,species:'human',founded:w.year,
    population:1,stores:25,emptyYears:0,economy:createEconomy()};
  w.nextSettlementId=Math.max(w.nextSettlementId,id+1);
  w.settlements.push(town);prepareInfrastructure(w);return town;
}
function builder(w:World,s:Settlement){
  // Work is an actual person's commitment, not an abstract public-works pool.
  const a=w.agents[0];
  a.x=s.x;a.y=s.y;a.work={job:'builder',settlementId:s.id};
  a.energy=95;a.health=95;
}
function building(s:Settlement,type:Building['type'],x=s.x,y=s.y):Building{
  const b:Building={id:s.infrastructure!.nextBuildingId++,type,x,y,
    culture:'human',stage:'complete',progress:100,condition:100,
    started:0,finished:0,spent:{wood:0,stone:0,clay:0},labor:20};
  s.infrastructure!.buildings.push(b);return b;
}

describe('Worldforge v0.9 — infrastructure, specialization and relations',()=>{
  it('keeps a real 140-year ecology structurally valid across every subsystem',()=>{
    const w=advanceWorld(createWorld({seed:31,size:'small',resourceLevel:1}),140);
    expect(validConstruction(w),'construction').toBe(true);
    expect(validDeposits(w),'deposits').toBe(true);
    expect(validTransport(w),'transport').toBe(true);
    expect(validEconomy(w),'economy').toBe(true);
    const waterAgents=w.agents.filter(a=>w.tiles[a.y*w.width+a.x].biome==='water');
    expect(isWorld(w),'complete world (water agents: '+waterAgents.length+
      ', bridges: '+(w.transport?.bridges.length??0)+')').toBe(true);
  },40000);
  it('lets communities spend stone, wood, treasury and builder labor on real roads',()=>{
    const w=emptyWorld();
    w.agents=[{...createWorld({seed:603}).agents[0],x:20,y:20}];
    const s=addTown(w,1,20,20,'Pavington');builder(w,s);
    for(const x of [20,21])w.tiles[20*w.width+x].biome='plains';
    s.infrastructure!.stock.stone=12;s.infrastructure!.stock.wood=10;
    w.trails=[20,21].map(x=>({index:20*w.width+x,wear:40}));
    w.year=8;
    advanceTransport(w);
    expect(w.transport?.roads).toHaveLength(2);
    expect(s.infrastructure!.stock.stone).toBe(9);
    expect(s.infrastructure!.stock.wood).toBe(8);
    expect(s.economy!.coins).toBe(66);
    expect(caravanPace(w,20*w.width+20,20*w.width+21)).toBe(2);
    expect(validTransport(w)).toBe(true);
  });

  it('builds a narrow bridge only to solve a real missing trade connection',()=>{
    const w=emptyWorld();
    w.agents=[{...createWorld({seed:603}).agents[0],x:21,y:25}];
    for(let y=15;y<=35;y++)for(let x=18;x<=31;x++)
      w.tiles[y*w.width+x].biome=x===25?'water':'plains';
    const west=addTown(w,1,21,25,'Westbank');
    const east=addTown(w,2,29,25,'Eastbank');
    builder(w,west);
    west.infrastructure!.stock.stone=12;
    west.infrastructure!.stock.wood=8;
    expect(findTradeRoute(w,west,east)).toBeNull();
    expect(considerTradeBridge(w,west,east)).toBe(true);
    expect(w.transport?.bridges).toHaveLength(1);
    const crossing=w.transport!.bridges[0].index;
    expect(w.tiles[crossing].biome).toBe('water');
    expect(findTradeRoute(w,west,east)).toContain(crossing);
    expect(west.infrastructure!.stock.stone).toBe(3);
    expect(west.economy!.coins).toBe(56);
    expect(considerTradeBridge(w,west,east)).toBe(false);
    expect(validTransport(w)).toBe(true);
  });

  it('moves a real merchant two adjacent steps on connected paved segments',()=>{
    const w=emptyWorld();
    w.agents=[{...createWorld({seed:603}).agents[0],x:20,y:20}];
    for(let x=20;x<=29;x++)w.tiles[20*w.width+x].biome='plains';
    const west=addTown(w,1,20,20,'West'),east=addTown(w,2,29,20,'East');
    const courier=w.agents[0];courier.energy=95;
    const route=Array.from({length:10},(_,x)=>20*w.width+20+x);
    w.shipments=[{id:1,originId:west.id,destinationId:east.id,
      carrierId:courier.id,good:'stone',quantity:6,payment:8,
      started:0,route,progress:0}];w.nextShipmentId=2;
    courier.work={job:'trader',settlementId:west.id,tradeId:1};
    const onFoot=structuredClone(w);
    w.transport={roads:[20,21,22].map(x=>({index:20*w.width+x,
      sponsorId:west.id,built:0,condition:100})),bridges:[]};
    advanceEconomy(onFoot);
    advanceEconomy(w);
    expect(onFoot.shipments?.[0].progress).toBe(1);
    expect(w.shipments?.[0].progress).toBe(2);
    expect(w.agents[0].x).toBe(22);
    expect(stockOf(east,'stone')).toBe(stockOf(onFoot.settlements[1],'stone'));
  });

  it('cancels and refunds a caravan when an unrepaired bridge becomes unsafe',()=>{
    let w=emptyWorld();
    for(let y=15;y<=35;y++)for(let x=20;x<=28;x++)
      w.tiles[y*w.width+x].biome=x===24?'water':'plains';
    w.deposits=w.deposits?.filter(d=>w.tiles[d.index].biome!=='water');
    w=editWorld(w,20,25,{kind:'spawn',species:'human'});
    const water=25*w.width+24;
    const west=addTown(w,1,20,25,'Westbank');
    const east=addTown(w,2,28,25,'Eastbank');
    west.infrastructure!.stock.stone=0;east.infrastructure!.stock.stone=0;
    w.transport={roads:[],bridges:[{index:water,sponsorId:west.id,
      built:0,condition:25.1}]};
    const route=findTradeRoute(w,west,east)!;
    expect(route).toContain(water);
    const courier=w.agents[0];courier.energy=95;
    courier.work={job:'trader',settlementId:west.id,tradeId:1};
    w.shipments=[{id:1,originId:west.id,destinationId:east.id,
      carrierId:courier.id,good:'wood',quantity:6,payment:8,started:0,
      route,progress:0}];w.nextShipmentId=2;
    east.economy!.coins-=8;
    w=stepWorld(w);
    expect(w.shipments).toHaveLength(0);
    expect(w.settlements.find(s=>s.id===east.id)!.economy!.coins).toBe(70);
    expect(w.events.some(e=>e.message.includes('severed'))).toBe(true);
    expect(isWorld(w)).toBe(true);
  });

  it('lets resource endowments and built workplaces shape economic identity',()=>{
    const w=emptyWorld();
    const s=addTown(w,1,20,20,'Greenwood');
    const plots=Array.from({length:14},(_,n)=>19*w.width+12+n);
    s.infrastructure!.land=plots;
    const forest=new Map(plots.map(index=>[index,{kind:'tree',amount:10}]));
    expect(inferSpecialty(w,s,forest)).toBe('forestry');
    for(const idx of plots)w.tiles[idx].biome='plains';
    building(s,'farm',20,20);building(s,'farm',21,20);
    expect(inferSpecialty(w,s,new Map())).toBe('agriculture');
    building(s,'workshop',22,20);building(s,'workshop',23,20);
    expect(inferSpecialty(w,s,new Map())).toBe('industry');
    building(s,'market',24,20);building(s,'market',25,20);
    expect(inferSpecialty(w,s,new Map())).toBe('commerce');
  });

  it('earns partnerships through deliveries and damages trust after failed journeys',()=>{
    const w=emptyWorld();
    const west=addTown(w,1,20,20,'West'),east=addTown(w,2,27,20,'East');
    w.agents=[{...createWorld({seed:603}).agents[0],x:east.x,y:east.y}];
    const courier=w.agents[0];
    for(let i=0;i<3;i++){
      w.shipments=[{id:i+1,originId:west.id,destinationId:east.id,
        carrierId:courier.id,good:'wood',quantity:3,payment:6,
        started:w.year,route:[20*w.width+20,20*w.width+21],progress:0}];
      w.nextShipmentId=i+2;
      courier.work={job:'trader',settlementId:west.id,tradeId:i+1};
      advanceEconomy(w);w.year++;
    }
    const relation=relationBetween(w,west.id,east.id)!;
    expect(relation.completed).toBe(3);
    expect(relation.trust).toBe(53);
    expect(activePartnership(relation,w.year)).toBe(true);
    expect(w.events.some(e=>e.message.includes('trusted trading partnership')))
      .toBe(true);
    // A shipment stranded by a new water barrier counts against that trust.
    for(let i=0;i<3;i++){
      const route=[20*w.width+20,20*w.width+21];
      w.shipments=[{id:4+i,originId:west.id,destinationId:east.id,
        carrierId:courier.id,good:'wood',quantity:3,payment:6,
        started:w.year,route,progress:0,lastAdvance:w.year-15}];
      courier.x=west.x;courier.y=west.y;courier.energy=20;
      advanceEconomy(w);w.year++;
    }
    expect(relation.failures).toBe(3);
    expect(relation.trust).toBe(2);
    expect(relation.disputeUntil).toBeGreaterThan(w.year);
    expect(activePartnership(relation,w.year)).toBe(false);
  });

  it('uses an actual warehouse to store incoming food beyond open-air limits',()=>{
    const w=emptyWorld();
    const west=addTown(w,1,20,20,'Farmstead');
    const east=addTown(w,2,27,20,'Warehouse Town');
    const a=createWorld({seed:603}).agents[0];
    w.agents=[{...a,x:east.x,y:east.y}];
    building(east,'storage');
    east.economy!.food=358;
    w.shipments=[{id:1,originId:west.id,destinationId:east.id,
      carrierId:a.id,good:'food',quantity:10,payment:12,started:0,
      route:[20*w.width+20,20*w.width+21],progress:0}];
    advanceEconomy(w);
    expect(stockOf(east,'food')).toBeGreaterThan(360);
    expect(stockOf(east,'food')).toBeLessThanOrEqual(440);
    expect(east.economy!.imports).toBe(1);
  });

  it('preserves new infrastructure and market identity through deterministic saves',()=>{
    const w=createWorld({size:'small',seed:186});
    const person=w.agents[0];
    const town=addTown(w,1,person.x,person.y,'Seaport');
    const index=person.y*w.width+person.x;
    w.transport={roads:[{index,sponsorId:town.id,built:0,condition:99}],bridges:[]};
    town.economy!.specialty='commerce';
    w.tradeRelations=[{a:1,b:2,completed:4,failures:1,trust:70,lastYear:0}];
    expect(isWorld(w)).toBe(true);
    expect(readSavedWorld(compactWorld(w))).toEqual(w);
    const a=stepWorld(w),b=stepWorld(w);
    expect(a).toEqual(b);
    expect(isWorld(a)).toBe(true);
    const html=renderToStaticMarkup(<SettlementView world={w}
      selectedId={town.id} playing={false} onTogglePlay={()=>{}}
      onFindOnMap={()=>{}} onAdvance={()=>{}}/>);
    expect(html).toContain('Trading post');
    expect(html).toContain('TRADE RELATIONSHIPS');
    expect(html).toContain('PAVED ROADS / BRIDGES');
  });
});
