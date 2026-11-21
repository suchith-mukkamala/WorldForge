import {describe,expect,it} from 'vitest';
import {createWorld,isWorld,stepWorld,type Biome,type World} from './engine';
import {compactWorld,readSavedWorld} from './storage';
import {
  HERD_TRAITS,advanceWildlife,herdTraitMeans,migrateWildlife,selectHerdTraits,
  validWildlife,type Herd,type HerdTraits,
} from './wildlife';

const empty={human:0,elf:0,dwarf:0,demon:0};
const even:HerdTraits={size:.5,speed:.45,coat:.5,heat:.5,fertility:.5,wariness:.3};
const spread:HerdTraits={size:.04,speed:.04,coat:.04,heat:.04,fertility:.04,wariness:.04};

function animal(kind:Herd['kind'],index:number,id:number):Herd{
  const means={...even};
  return {kind,id,index,size:36,harvested:0,generation:0,means,
    variance:{...spread},origin:{...means}};
}
function pocket(biome:Biome,height:number,animals:Herd[],width=1,rows=1,
  blocked:number[]=[],seed=81):World{
  const count=width*rows;
  return {settings:{seed,climateEcology:true},width,height:rows,year:0,dayOfYear:0,
    tiles:Array.from({length:count},()=>({biome,food:8})),
    topography:{version:1,heights:Array(count).fill(height)},
    settlements:[],events:[],nextEventId:1,
    transport:{roads:blocked.map(index=>({index,sponsorId:1,built:0,condition:80})),
      bridges:[]},
    wildlife:animals} as unknown as World;
}
function run(world:World,count:number,hunt=0):Herd[]{
  for(let year=0;year<count;year++){
    world.year++;
    if(hunt){
      const prey=world.wildlife?.find(herd=>herd.kind!=='flock');
      if(prey)prey.harvested=hunt;
    }
    advanceWildlife(world);
  }
  return world.wildlife??[];
}

describe('herd evolution',()=>{
  it('seeds stable means, variance and a zero harvest',()=>{
    const settings={seed:44,size:'small' as const,climateEcology:true,starting:empty};
    const first=createWorld(settings),second=createWorld(settings);
    expect(first.wildlife).toEqual(second.wildlife);
    expect(first.wildlife?.length).toBeGreaterThan(0);
    const ids=new Set<number>();
    for(const herd of first.wildlife??[]){
      expect(herd.harvested).toBe(0);
      expect(herd.generation).toBe(0);
      expect(herd.id).toBeGreaterThan(0);
      expect(ids.has(herd.id!)).toBe(false);
      ids.add(herd.id!);
      expect(herd.origin).toEqual(herd.means);
      for(const trait of HERD_TRAITS){
        expect(herd.means?.[trait]).toBeGreaterThanOrEqual(0);
        expect(herd.means?.[trait]).toBeLessThanOrEqual(1);
        expect(herd.variance?.[trait]).toBeGreaterThan(0);
      }
    }
    const stepped=stepWorld(first);
    expect(stepWorld(first).wildlife).toEqual(stepped.wildlife);
    expect(stepped.wildlife?.every(herd=>herd.generation===1&&herd.harvested===0)).toBe(true);
    expect(readSavedWorld(compactWorld(first))?.wildlife).toEqual(first.wildlife);
  });

  it('gives charts a detached copy of the trait means',()=>{
    const herd=animal('grazer',0,4);
    const means=herdTraitMeans(herd);
    expect(means).toEqual(herd.means);
    expect(means).not.toBe(herd.means);
    expect({...means,speed:0}.speed).toBe(0);
    expect(herd.means?.speed).toBe(even.speed);
    const rows=selectHerdTraits([herd]);
    expect(rows).toEqual([{id:4,kind:'grazer',index:0,size:36,generation:0,harvested:0,
      means:even,variance:spread,origin:even}]);
    expect(Object.keys(rows[0].means)).toEqual([...HERD_TRAITS]);
    expect(selectHerdTraits(undefined)).toEqual([]);
  });

  it('thins a hunted herd and shifts it toward speed and wariness',()=>{
    // Mild plains, so climate is not also pushing body size.
    const grazer=()=>({...animal('grazer',0,1),size:48});
    const home=(hunt:number)=>run(pocket('plains',90,[grazer()],1,1,[],900),18,hunt);
    const control=home(0);
    const hunted=home(3);
    expect(hunted).toHaveLength(1);
    expect(control).toHaveLength(1);
    expect(hunted[0].size).toBeLessThan(control[0].size);
    expect(hunted[0].means!.speed).toBeGreaterThan(control[0].means!.speed+.15);
    expect(hunted[0].means!.wariness).toBeGreaterThan(control[0].means!.wariness+.15);
    expect(hunted[0].means!.size).toBeLessThan(control[0].means!.size-.08);
    expect(hunted[0].harvested).toBe(0);
    expect(hunted[0].generation).toBe(18);
    expect(home(3)).toEqual(hunted);
  });

  it('drifts coat and heat with the climate the herd lives in',()=>{
    const cold=run(pocket('taiga',220,[animal('browser',0,3)],1,1,[],7),18)[0];
    const mild=run(pocket('forest',60,[animal('browser',0,3)],1,1,[],7),18)[0];
    const hot=run(pocket('savanna',50,[animal('grazer',0,5)],1,1,[],1),18)[0];
    const cool=run(pocket('plains',220,[animal('grazer',0,5)],1,1,[],1),18)[0];
    expect(cold.means!.coat).toBeGreaterThan(mild.means!.coat+.12);
    expect(cold.means!.coat).toBeGreaterThan(cold.origin!.coat);
    expect(Math.abs(cold.means!.speed-mild.means!.speed)).toBeLessThan(.02);
    expect(hot.means!.heat).toBeGreaterThan(cool.means!.heat+.2);
    expect(hot.means!.size).toBeLessThan(cool.means!.size);
  });

  it('makes grazers beside a flock faster and warier',()=>{
    const blocked=[2,3,4,5,6,7,8];
    const alone=run(pocket('plains',100,[animal('grazer',0,1)],3,3,[1,...blocked]),20)[0];
    const beside=run(pocket('plains',100,[animal('grazer',0,1),animal('flock',1,2)],3,3,
      blocked),20);
    const grazer=beside.find(herd=>herd.kind==='grazer');
    expect(grazer?.index).toBe(0);
    expect(beside.some(herd=>herd.kind==='flock')).toBe(true);
    expect(grazer!.means!.speed).toBeGreaterThan(alone.means!.speed+.05);
    expect(grazer!.means!.wariness).toBeGreaterThan(alone.means!.wariness+.05);
    expect(alone.index).toBe(0);
  });

  it('names a variety once the means leave their origin',()=>{
    const origin={size:.4,speed:.4,coat:.4,heat:.4,fertility:.4,wariness:.4};
    const means={...origin,size:.9};
    const herd:Herd={kind:'grazer',id:1,index:0,size:24,harvested:0,generation:0,
      means,variance:{...spread},origin};
    const world=pocket('plains',100,[herd]);
    advanceWildlife(world);
    expect(world.wildlife?.[0].variety).toEqual({id:'grazer-1-y0',name:'great grazer',year:0});
    expect(world.events.map(event=>event.message)).toEqual([
      'A great grazer is now distinct from its parent herd.']);
    expect(world.nextEventId).toBe(2);
    advanceWildlife(world);
    expect(world.events).toHaveLength(1);
    expect(world.wildlife?.[0].variety?.name).toBe('great grazer');
  });

  it('loads older herds with trait defaults and harvested at zero',()=>{
    const world=createWorld({seed:19,size:'small',climateEcology:true,starting:empty});
    const legacy=world.wildlife!.map(({kind,index,size})=>({kind,index,size}));
    const stripped={...world,wildlife:legacy};
    expect(isWorld(stripped)).toBe(true);
    expect(validWildlife(legacy,world.tiles.length)).toBe(true);
    const loaded=readSavedWorld(compactWorld(stripped));
    expect(loaded?.wildlife?.map(herd=>[herd.kind,herd.index,herd.size])).toEqual(
      legacy.map(herd=>[herd.kind,herd.index,herd.size]));
    expect(loaded?.wildlife?.every(herd=>herd.harvested===0&&herd.generation===0&&
      herd.id!>0&&herd.origin&&herd.means&&herd.variance)).toBe(true);
    expect(loaded?.wildlife?.[0].origin).toEqual(loaded?.wildlife?.[0].means);
    const plain=readSavedWorld(JSON.stringify(stripped));
    expect(plain?.wildlife).toEqual(loaded?.wildlife);
    const migrated=migrateWildlife(legacy,world.settings.seed);
    expect(migrated).toEqual(loaded?.wildlife);
    expect(migrateWildlife(migrated,world.settings.seed)).toBe(migrated);

    const badHarvest={...world,wildlife:[{...world.wildlife![0],harvested:-1}]};
    expect(isWorld(badHarvest)).toBe(false);
    const badMeans={...world,wildlife:[{...world.wildlife![0],means:{size:2}}]};
    expect(isWorld(badMeans)).toBe(false);
    expect(validWildlife([{kind:'nope',index:0,size:4}],world.tiles.length)).toBe(false);
  });
});
