import {describe,expect,it} from 'vitest';
import {advanceWorld,createWorld,isWorld,type Settlement,type World} from './engine';
import {createEconomy} from './economy';
import {COSTS,prepareInfrastructure} from './construction';
import {advanceLivelihood,harvestQuota} from './livelihood';
import {compactWorld,readSavedWorld} from './storage';
import type {Herd} from './wildlife';

function climateWorld(seed=11){
  return createWorld({seed,size:'small',climateEcology:true,
    starting:{human:8,elf:0,dwarf:0,demon:0}});
}
function place(world:World,index:number):Settlement{
  const town:Settlement={id:world.nextSettlementId++,species:'human',name:'Huntford',
    x:index%world.width,y:Math.floor(index/world.width),founded:world.year,
    population:6,stores:20,emptyYears:0,economy:createEconomy()};
  world.settlements.push(town);
  prepareInfrastructure(world);
  return town;
}
function assign(world:World,townId:number,index:number,
  job:'hunter'|'fisher'|'herder',count:number){
  const x=index%world.width,y=Math.floor(index/world.width);
  const people=world.agents.filter(a=>a.age>=16).slice(0,count);
  for(const person of people){
    person.x=x;person.y=y;
    person.work={job,settlementId:townId};
  }
  return people.length;
}
function herdOf(world:World,kind:Herd['kind']){
  const herd=world.wildlife?.find(item=>item.kind===kind);
  if(!herd)throw Error('missing '+kind);
  return herd;
}

describe('hunting, fishing and herding',()=>{
  it('limits a hunt and records the animals a herd lost',()=>{
    const world=climateWorld();
    const herd=herdOf(world,'grazer');
    herd.size=24;herd.harvested=9;
    const town=place(world,herd.index);
    expect(assign(world,town.id,herd.index,'hunter',6)).toBe(6);
    const before=town.economy!.food;
    advanceLivelihood(world);
    expect(herd.harvested).toBe(harvestQuota(24));
    expect(herd.harvested).toBe(3);
    expect(herd.size).toBe(21);
    expect(town.economy!.food).toBeGreaterThan(before);
    expect(town.economy!.meat).toBeGreaterThan(0);
    expect(town.economy!.hides).toBeGreaterThan(0);
  });

  it('thins a herd until it is too small to hunt',()=>{
    const world=climateWorld(12);
    const herd=herdOf(world,'browser');
    herd.size=10;
    world.wildlife=[herd];
    const town=place(world,herd.index);
    assign(world,town.id,herd.index,'hunter',4);
    const start=herd.size;
    advanceLivelihood(world);
    expect(herd.harvested).toBe(harvestQuota(start));
    expect(herd.size).toBe(start-herd.harvested!);
    for(let year=0;year<6;year++)advanceLivelihood(world);
    expect(herd.size).toBeLessThan(8);
    expect(herd.harvested).toBe(0);
    const held=herd.size;
    advanceLivelihood(world);
    expect(herd.size).toBe(held);
    expect(herd.harvested).toBe(0);
  });

  it('tames animals only when a pasture is standing',()=>{
    const world=climateWorld(13);
    const herd=herdOf(world,'grazer');
    herd.size=16;
    world.wildlife=[herd];
    const town=place(world,herd.index);
    assign(world,town.id,herd.index,'herder',1);
    advanceLivelihood(world);
    expect(town.livestock).toBeUndefined();
    expect(herd.size).toBe(16);
    const site=town.infrastructure!.land.find(index=>index!==herd.index)??herd.index;
    town.infrastructure!.buildings.push({id:1,type:'pasture',
      x:site%world.width,y:Math.floor(site/world.width),culture:'human',
      stage:'complete',progress:100,condition:100,started:0,
      spent:{...COSTS.pasture.materials},labor:COSTS.pasture.labor});
    advanceLivelihood(world);
    expect(town.livestock).toEqual([{kind:'grazer',size:1}]);
    expect(herd.harvested).toBe(1);
    expect(herd.size).toBe(15);
    const food=town.economy!.food;
    advanceLivelihood(world);
    expect(town.livestock![0].size).toBeGreaterThan(1);
    expect(town.economy!.food).toBeGreaterThan(food);
    expect((town.economy!.wool??0)+(town.economy!.hides??0)+(town.economy!.meat??0))
      .toBeGreaterThan(0);
  });

  function bank(world:World){
    const water=world.tiles.findIndex((tile,index)=>{
      if(tile.biome!=='water')return false;
      const x=index%world.width,y=Math.floor(index/world.width);
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        const nx=x+dx,ny=y+dy;
        if(nx<0||ny<0||nx>=world.width||ny>=world.height)continue;
        if(world.tiles[ny*world.width+nx].biome!=='water')return true;
      }
      return false;
    });
    const x=water%world.width,y=Math.floor(water/world.width);
    let shore=-1;
    for(let dy=-1;dy<=1&&shore<0;dy++)for(let dx=-1;dx<=1;dx++){
      const nx=x+dx,ny=y+dy;
      if(nx<0||ny<0||nx>=world.width||ny>=world.height)continue;
      const index=ny*world.width+nx;
      if(world.tiles[index].biome!=='water'){shore=index;break;}
    }
    return {water,shore};
  }
  function fished(seed:number,stock:number,harvested:number){
    const world=climateWorld(seed);
    world.wildlife=world.wildlife?.filter(herd=>herd.kind!=='fish');
    const {shore}=bank(world);
    const town=place(world,shore);
    assign(world,town.id,shore,'fisher',2);
    advanceLivelihood(world);
    const kept=world.fishStocks?.find(item=>Math.max(
      Math.abs(item.index%world.width-town.x),
      Math.abs(Math.floor(item.index/world.width)-town.y))<=6);
    if(!kept)throw Error('no fish stock');
    kept.stock=stock;kept.harvested=harvested;
    town.economy!.food=18;town.economy!.fish=0;town.economy!.produced=0;
    advanceLivelihood(world);
    const after=world.fishStocks?.find(item=>item.index===kept.index)??kept;
    return {food:town.economy!.food-18,fish:town.economy!.fish??0,kept:after};
  }

  it('thins fish schools and gives less from a depleted water stock',()=>{
    const world=climateWorld(14);
    const school=herdOf(world,'fish');
    school.size=20;
    world.wildlife=[school];
    const land=world.tiles.findIndex((tile,index)=>{
      if(tile.biome==='water')return false;
      const x=index%world.width,y=Math.floor(index/world.width);
      const sx=school.index%world.width,sy=Math.floor(school.index/world.width);
      return Math.max(Math.abs(x-sx),Math.abs(y-sy))<=2;
    });
    expect(land).toBeGreaterThanOrEqual(0);
    const town=place(world,land);
    assign(world,town.id,land,'fisher',2);
    advanceLivelihood(world);
    expect(school.harvested).toBeGreaterThan(0);
    expect(school.size).toBe(20-school.harvested!);

    const poor=fished(15,2,6);
    const rich=fished(15,16,0);
    expect(rich.fish).toBeGreaterThan(poor.fish);
    expect(rich.food).toBeGreaterThan(poor.food);
    expect(poor.kept.harvested).toBeLessThanOrEqual(1);
    expect(rich.kept.harvested).toBe(2);
    expect(poor.kept.stock).toBeLessThan(rich.kept.stock);
  });

  it('adds food from the hunt on top of the existing pantry',()=>{
    const world=climateWorld(17);
    const herd=herdOf(world,'flock');
    herd.size=22;
    const town=place(world,herd.index);
    const idle=town.economy!.food;
    advanceLivelihood(world);
    expect(town.economy!.food).toBe(idle);
    assign(world,town.id,herd.index,'hunter',2);
    advanceLivelihood(world);
    expect(town.economy!.produced).toBeGreaterThan(0);
    expect(town.economy!.food).toBeGreaterThan(idle);
    expect(town.economy!.meat).toBeGreaterThan(0);
    expect(town.economy!.wool).toBeGreaterThan(0);
  });

  it('loads an old save that has no livelihood fields and packs it again',()=>{
    const world=climateWorld(18);
    const index=world.tiles.findIndex(tile=>tile.biome==='plains');
    place(world,index);
    expect(isWorld(world)).toBe(true);
    const old=JSON.parse(JSON.stringify(world)) as World;
    for(const herd of old.wildlife??[])delete herd.harvested;
    for(const town of old.settlements){
      const economy=town.economy;
      if(!economy)continue;
      const jobs=economy.jobs as {hunter?:number;fisher?:number;herder?:number};
      const prices=economy.prices as {meat?:number;fish?:number;hides?:number;wool?:number};
      delete jobs.hunter;delete jobs.fisher;delete jobs.herder;
      delete prices.meat;delete prices.fish;delete prices.hides;delete prices.wool;
      delete economy.meat;delete economy.fish;delete economy.hides;delete economy.wool;
      delete town.livestock;
    }
    delete old.fishStocks;
    const loaded=readSavedWorld(JSON.stringify(old));
    expect(loaded).not.toBeNull();
    expect(loaded!.wildlife!.every(herd=>herd.harvested===0)).toBe(true);
    expect(loaded!.settlements.every(town=>!town.economy||
      town.economy.jobs.hunter===0&&town.economy.meat===0&&
      town.economy.prices.wool===1)).toBe(true);
    expect(loaded).toEqual(world);
    const packed=compactWorld(loaded!);
    expect(packed.startsWith('{"format":"evo-packed-v3"')).toBe(true);
    expect(readSavedWorld(packed)).toEqual(loaded);
  });

  it('keeps a climate world populated without emptying the herds',()=>{
    let world=createWorld({seed:21,size:'small',climateEcology:true,resourceLevel:1});
    const start=world.agents.length;
    const herds=world.wildlife!.length;
    world=advanceWorld(world,40);
    expect(isWorld(world)).toBe(true);
    expect(world.agents.length).toBeGreaterThan(start*.45);
    expect(world.agents.length).toBeLessThan(start*8);
    expect(world.wildlife?.length).toBeGreaterThan(0);
    expect(world.wildlife!.length).toBeLessThanOrEqual(herds+4);
    for(const herd of world.wildlife??[]){
      expect(herd.harvested??0).toBeLessThanOrEqual(
        harvestQuota(herd.size+(herd.harvested??0)));
    }
    const again=advanceWorld(createWorld({seed:21,size:'small',climateEcology:true,
      resourceLevel:1}),40);
    expect(again.agents.length).toBe(world.agents.length);
    expect(again.wildlife).toEqual(world.wildlife);
  });
});
