import {describe,expect,it} from 'vitest';
import {advanceWorldDays} from './calendar';
import {prepareInfrastructure} from './construction';
import {createWorld,editWorld,isWorld,stepWorld,type Settlement} from './engine';
import {compactWorld,readSavedWorld} from './storage';
import {advanceWoodland,enableLivingBiomes,woodlandCover} from './woodland';

const landscape=()=>createWorld({seed:321721,size:'small',layout:'continents',
  starting:{human:0,elf:0,dwarf:0,demon:0}});

describe('living biome borders',()=>{
  it('grows and thins over years, keeping landforms and other deposits in place',()=>{
    const start=enableLivingBiomes(landscape());
    let world=start;
    const first=stepWorld(start);
    expect(first.woodland).not.toBe(start.woodland);
    expect(first.tiles.map(t=>t.biome)).toEqual(start.tiles.map(t=>t.biome));
    for(let year=0;year<40;year++){
      const next=stepWorld(world);
      for(let i=0;i<world.tiles.length;i++){
        if(next.woodland![i]===world.woodland![i])continue;
        const change=Math.abs(woodlandCover(next.woodland,i)!-woodlandCover(world.woodland,i)!);
        if(change>2/63+1e-9)throw Error('Canopy changed too quickly at tile '+i);
      }
      world=next;
    }
    expect(world.tiles.some((tile,i)=>tile.biome==='forest'&&
      start.tiles[i].biome==='plains')).toBe(true);
    expect(world.tiles.some((tile,i)=>tile.biome==='plains'&&
      start.tiles[i].biome==='forest')).toBe(true);
    expect(world.tiles.every((tile,i)=>tile.biome===start.tiles[i].biome||
      ['plains','forest'].includes(tile.biome)&&['plains','forest'].includes(start.tiles[i].biome)))
      .toBe(true);
    expect(world.topography).toBe(start.topography);
    const before=new Map(start.deposits!.map(d=>[d.index,d]));
    expect(world.deposits!.some(d=>d.kind==='tree'&&d.amount>0&&!before.has(d.index)))
      .toBe(true);
    expect(world.deposits!.filter(d=>d.kind!=='tree').map(d=>[d.index,d.kind,d.capacity]))
      .toEqual(start.deposits!.filter(d=>d.kind!=='tree').map(d=>[d.index,d.kind,d.capacity]));
    expect(isWorld(world)).toBe(true);
  });

  it('keeps settlement centers, building plots and paved roads clear of succession',()=>{
    const world=enableLivingBiomes(landscape());
    const annual=stepWorld(world);
    const [center,farm,road]=world.tiles.flatMap((_,i)=>
      annual.woodland![i]!==world.woodland![i]?[i]:[]).slice(0,3);
    const xy=(i:number)=>({x:i%world.width,y:Math.floor(i/world.width)});
    const town:Settlement={id:1,name:'Millbrook',species:'human',...xy(center),
      founded:0,population:0,stores:0,emptyYears:0};
    world.settlements=[town];
    prepareInfrastructure(world);
    town.infrastructure!.buildings.push({id:town.infrastructure!.nextBuildingId++,
      type:'farm',...xy(farm),culture:'human',stage:'foundation',progress:0,
      condition:100,started:0,spent:{wood:0,stone:0,clay:0},labor:0});
    world.transport!.roads=[{index:road,sponsorId:1,built:0,condition:100}];
    const before=world.woodland!;
    advanceWoodland(world);
    expect(world.woodland).not.toBe(before);
    for(const index of [center,farm,road]){
      expect(world.woodland![index]).toBe(before[index]);
    }
  });

  it('round-trips canopy in compact saves and advances it on the next new year',()=>{
    const legacy=landscape();
    expect(stepWorld(legacy).woodland).toBeUndefined();
    const world=stepWorld(enableLivingBiomes(legacy));
    const restored=readSavedWorld(compactWorld(world))!;
    expect(restored.woodland).toBe(world.woodland);
    expect(stepWorld(restored)).toEqual(stepWorld(world));
    const december={...restored,dayOfYear:363};
    expect(advanceWorldDays(december,1).woodland).toBe(december.woodland);
    expect(advanceWorldDays(december,2).woodland).toBe(stepWorld(december).woodland);
    expect(isWorld({...restored,woodland:'!'+restored.woodland!.slice(1)})).toBe(false);
  });

  it('applies terrain brush changes to the painted canopy and its local terrain',()=>{
    const world=stepWorld(enableLivingBiomes(landscape()));
    const index=world.tiles.findIndex(t=>t.biome==='forest');
    const x=index%world.width,y=Math.floor(index/world.width);
    const cleared=editWorld(world,x,y,{kind:'terrain',biome:'plains'});
    expect(woodlandCover(cleared.woodland,index)).toBe(0);
    const replanted=editWorld(cleared,x,y,{kind:'terrain',biome:'forest'});
    expect(woodlandCover(replanted.woodland,index)).toBe(1);
    expect(replanted.woodland!.slice(index+1)).toBe(world.woodland!.slice(index+1));
    expect(replanted.topography!.heights.slice(index+1)).toEqual(
      world.topography!.heights.slice(index+1));
    expect(isWorld(replanted)).toBe(true);
  });
});
