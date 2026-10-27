import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {createWorld,editWorld,isWorld,stepWorld,type Settlement,type World} from './engine';
import {advanceConstruction,prepareInfrastructure,type Building} from './construction';
import {advanceEconomy,createEconomy,stockOf,validEconomy} from './economy';
import {SettlementView} from './SettlementView';
import {compactWorld,readSavedWorld} from './storage';

function neighbors(w:World,x:number,y:number){
  return w.agents.filter(a=>Math.max(Math.abs(a.x-x),Math.abs(a.y-y))<=6);
}
function settlementWorld(seed=86){
  const w=createWorld({size:'small',seed});
  const human=w.agents.find(a=>a.species==='human'&&a.age>=16)!;
  const s:Settlement={id:w.nextSettlementId++,name:'Market Town',species:'human',
    x:human.x,y:human.y,founded:0,population:neighbors(w,human.x,human.y).length,
    stores:25,emptyYears:0};
  w.settlements.push(s);prepareInfrastructure(w);
  return {w,s};
}
function completedFarm(s:Settlement):Building{
  const i=s.infrastructure!;
  return {id:i.nextBuildingId++,type:'farm',x:s.x,y:s.y,culture:s.species,
    stage:'complete',progress:100,condition:100,started:0,finished:0,
    spent:{wood:5,stone:2,clay:3},labor:11};
}

describe('Worldforge v0.8 — autonomous economy, work and trade',()=>{
  it('reallocates scarce labor toward farming when food runs short',()=>{
    const scenario=(food:number)=>{
      const {w,s}=settlementWorld(184);
      w.agents=neighbors(w,s.x,s.y).filter(a=>a.age>=16).slice(0,4);
      expect(w.agents).toHaveLength(4);
      s.population=4;s.infrastructure!.buildings.push(completedFarm(s));
      s.economy=createEconomy();s.economy.food=food;
      advanceEconomy(w);
      return s.economy!.jobs;
    };
    const scarcity=scenario(0),surplus=scenario(200);
    expect(scarcity.farmer).toBeGreaterThan(surplus.farmer);
    expect(scarcity.farmer+scarcity.miner+scarcity.woodcutter+
      scarcity.trader).toBeLessThanOrEqual(4);
  });

  it('assigns distinct paid-work roles, staffs farms and produces real food',()=>{
    const {w,s}=settlementWorld();
    s.infrastructure!.buildings.push(completedFarm(s));
    advanceEconomy(w);
    expect(s.economy).toBeDefined();
    expect(s.economy!.jobs.farmer).toBeGreaterThan(0);
    expect(s.economy!.produced).toBeGreaterThan(0);
    const workers=w.agents.filter(a=>a.work?.settlementId===s.id);
    expect(new Set(workers.map(a=>a.id)).size).toBe(workers.length);
    expect(workers.length).toBe(Object.values(s.economy!.jobs)
      .reduce((sum,v)=>sum+v,0));
    expect(validEconomy(w)).toBe(true);
  });

  it('makes construction compete with farming and resource extraction',()=>{
    const {w,s}=settlementWorld(32);
    s.infrastructure!.buildings.push(completedFarm(s));
    s.infrastructure!.buildings.push({id:s.infrastructure!.nextBuildingId++,
      type:'house',x:s.x+1,y:s.y,culture:s.species,stage:'foundation',
      progress:0,condition:100,started:0,
      spent:{wood:0,stone:0,clay:0},labor:0});
    if(!s.infrastructure!.land.includes(s.y*w.width+s.x+1))
      s.infrastructure!.land.push(s.y*w.width+s.x+1);
    advanceEconomy(w);
    const builders=w.agents.filter(a=>a.work?.job==='builder');
    const gatherers=w.agents.filter(a=>a.work?.job==='woodcutter'||
      a.work?.job==='miner');
    expect(builders.every(a=>!gatherers.includes(a))).toBe(true);
    expect(s.economy!.jobs.builder).toBe(builders.length);
    const before=s.infrastructure!.buildings[1].labor;
    advanceConstruction(w,[]);
    expect(s.infrastructure!.buildings[1].labor).toBeGreaterThanOrEqual(before);
    expect(isWorld(w)).toBe(true);
  });

  it('keeps goods in transit until the real carrier reaches another settlement',()=>{
    const {w,s}=settlementWorld(315);
    const targetX=Math.min(w.width-5,s.x+10),targetY=s.y;
    for(let x=Math.min(s.x,targetX);x<=Math.max(s.x,targetX);x++)
      w.tiles[targetY*w.width+x].biome='plains';
    const target:Settlement={id:w.nextSettlementId++,name:'Needham',
      species:'human',x:targetX,y:targetY,founded:0,population:8,
      stores:2,emptyYears:0,economy:createEconomy()};
    w.settlements.push(target);prepareInfrastructure(w);
    s.economy=createEconomy();s.economy.food=255;
    target.economy!.food=0;target.economy!.coins=100;
    advanceEconomy(w);
    const shipment=w.shipments?.find(t=>t.good==='food');
    expect(shipment).toBeDefined();
    expect(shipment!.originId).toBe(s.id);
    expect(shipment!.destinationId).toBe(target.id);
    const amount=shipment!.quantity;
    expect(stockOf(target,'food')).toBe(0);
    expect(s.economy!.food).toBeLessThan(255);
    expect(shipment!.route.every(idx=>w.tiles[idx].biome!=='water')).toBe(true);
    const carrier=w.agents.find(a=>a.id===shipment!.carrierId)!;
    // Advance the physical courier to the destination; goods cannot arrive early.
    carrier.x=target.x;carrier.y=target.y;
    w.year++;
    advanceEconomy(w);
    expect(w.shipments).toHaveLength(0);
    expect(stockOf(target,'food')+target.economy!.consumed).toBeCloseTo(amount,1);
    expect(target.economy!.imports).toBe(1);
    expect(s.economy!.exports).toBe(1);
    expect(w.events.some(e=>e.type==='trade'&&e.message.includes('delivered'))).toBe(true);
    expect(validEconomy(w)).toBe(true);
  });

  it('upgrades older worlds, replays decisions deterministically and saves work',()=>{
    const {w}=settlementWorld(181);
    w.shipments=undefined;w.nextShipmentId=undefined;
    expect(isWorld(w)).toBe(true);
    const a=stepWorld(w),b=stepWorld(w);
    expect(a).toEqual(b);
    expect(a.settlements[0].economy).toBeDefined();
    expect(a.nextShipmentId).toBe(1);
    expect(isWorld(a)).toBe(true);
    expect(readSavedWorld(compactWorld(a))).toEqual(a);
  });

  it('lets a merchant actually travel along a land route before delivering cargo',()=>{
    let w=createWorld({size:'small',seed:404,starting:{human:0,elf:0,dwarf:0,demon:0}});
    const y=23;
    for(let x=20;x<=30;x++)w.tiles[y*w.width+x].biome='plains';
    w=editWorld(w,20,y,{kind:'spawn',species:'human'});
    w=editWorld(w,22,y,{kind:'spawn',species:'human'});
    w=editWorld(w,30,y,{kind:'spawn',species:'human'});
    const origin:Settlement={id:w.nextSettlementId++,name:'West Market',species:'human',
      x:20,y,founded:0,population:2,stores:25,emptyYears:0,economy:createEconomy()};
    const destination:Settlement={id:w.nextSettlementId++,name:'East Market',
      species:'human',x:30,y,founded:0,population:1,stores:25,emptyYears:0,
      economy:createEconomy()};
    w.settlements=[origin,destination];prepareInfrastructure(w);
    const courier=w.agents.find(a=>a.x===20)!,route=Array.from({length:11},
      (_,i)=>y*w.width+20+i);
    courier.work={job:'trader',settlementId:origin.id,tradeId:1};
    w.shipments=[{id:1,originId:origin.id,destinationId:destination.id,
      carrierId:courier.id,good:'wood',quantity:8,payment:9,started:0,
      route,progress:0}];w.nextShipmentId=2;
    const initial=stockOf(destination,'wood');
    for(let year=0;year<24&&(w.shipments?.length??0)>0;year++)w=stepWorld(w);
    expect(w.shipments).toHaveLength(0);
    expect(w.events.some(e=>e.type==='trade'&&e.message.includes('delivered'))).toBe(true);
    expect(stockOf(w.settlements.find(s=>s.id===destination.id)!,'wood'))
      .toBeGreaterThan(initial);
    expect(isWorld(w)).toBe(true);
  });

  it('lets cooperative adults yield a crowded road without overlapping people',()=>{
    let w=createWorld({size:'small',seed:721,starting:{human:0,elf:0,dwarf:0,demon:0}});
    const y=25;
    for(let x=20;x<=28;x++)w.tiles[y*w.width+x].biome='plains';
    w=editWorld(w,20,y,{kind:'spawn',species:'human'});
    w=editWorld(w,21,y,{kind:'spawn',species:'human'});
    w=editWorld(w,28,y,{kind:'spawn',species:'human'});
    const courier=w.agents.find(a=>a.x===20)!,neighbor=w.agents.find(a=>a.x===21)!;
    neighbor.development!.values.community=80;
    const west:Settlement={id:w.nextSettlementId++,name:'West',species:'human',
      x:20,y,founded:0,population:2,stores:10,emptyYears:0};
    const east:Settlement={id:w.nextSettlementId++,name:'East',species:'human',
      x:28,y,founded:0,population:1,stores:10,emptyYears:0};
    w.settlements=[west,east];prepareInfrastructure(w);
    courier.work={job:'trader',settlementId:west.id,tradeId:1};
    w.shipments=[{id:1,originId:west.id,destinationId:east.id,
      carrierId:courier.id,good:'stone',quantity:4,payment:6,started:0,
      route:Array.from({length:9},(_,i)=>y*w.width+20+i),progress:0}];
    w.nextShipmentId=2;
    advanceEconomy(w);
    expect(courier.x).toBe(21);
    expect(neighbor.x).toBe(20);
    expect(w.shipments?.[0].progress).toBe(1);
    expect(new Set(w.agents.map(a=>a.y*w.width+a.x)).size).toBe(w.agents.length);
    expect(validEconomy(w)).toBe(true);
  });

  it('cancels and refunds a trade if divine terraforming floods its route',()=>{
    const {w,s}=settlementWorld(75);
    const targetX=s.x+8,y=s.y;
    for(let x=s.x;x<=targetX;x++)w.tiles[y*w.width+x].biome='plains';
    const target:Settlement={id:w.nextSettlementId++,name:'Riverport',
      species:'human',x:targetX,y,founded:0,population:2,stores:10,
      emptyYears:0,economy:createEconomy()};
    w.settlements.push(target);prepareInfrastructure(w);
    s.economy=createEconomy();target.economy!.coins=48;
    const courier=w.agents.find(a=>a.age>=16&&
      Math.max(Math.abs(a.x-s.x),Math.abs(a.y-s.y))<=2)!;
    const route=Array.from({length:9},(_,i)=>y*w.width+s.x+i);
    courier.work={job:'trader',settlementId:s.id,tradeId:1};
    w.shipments=[{id:1,originId:s.id,destinationId:target.id,carrierId:courier.id,
      good:'clay',quantity:4,payment:11,started:0,route,progress:0}];
    w.nextShipmentId=2;
    const blocked=route.slice(2,-1).find(idx=>!w.agents.some(a=>
      a.y*w.width+a.x===idx))!;
    const before=JSON.stringify(w);
    const changed=editWorld(w,blocked%w.width,Math.floor(blocked/w.width),
      {kind:'terrain',biome:'water'});
    expect(changed.shipments).toHaveLength(0);
    expect(changed.settlements.find(t=>t.id===target.id)!.economy!.coins).toBe(59);
    expect(changed.agents.find(a=>a.id===courier.id)?.work).toBeUndefined();
    expect(changed.events.some(e=>e.type==='trade'&&e.message.includes('severed')))
      .toBe(true);
    expect(JSON.stringify(w)).toBe(before);
    expect(isWorld(changed)).toBe(true);
  });

  it('renders economy, labor, shortages and caravans independently of simulation',()=>{
    const {w,s}=settlementWorld(502);
    advanceEconomy(w);
    const snapshot=JSON.stringify(w);
    const html=renderToStaticMarkup(<SettlementView world={w} selectedId={s.id}
      playing={false} onTogglePlay={()=>{}} onAdvance={()=>{}} onFindOnMap={()=>{}}/>);
    expect(html).toContain('WORK, PROVISIONS &amp; TRADE');
    expect(html).toContain('WORKFORCE');
    expect(html).toContain('MARKET &amp; SHORTAGES');
    expect(html).toContain('MERCHANTS IN TRANSIT');
    expect(JSON.stringify(w)).toBe(snapshot);
  });
});
