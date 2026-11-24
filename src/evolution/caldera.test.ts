import {describe,expect,it} from 'vitest';
import {adventureMapFor,adventureRegion,walkAdventure} from './adventureMap';
import {advanceWorldDays} from './calendar';
import {calderaRiver} from './caldera';
import {createMortal} from './divineDescent';
import {createWorld} from './engine';
import {riverCourses} from './riverCourses';
import {riverLinks} from './riverSeasons';
import {seaNeighbors,seaPoint} from './shipSave';
import {compactWorld,readSavedWorld} from './storage';
import {surfaceGrid} from './surfaceGrid';
import {SEA_LEVEL} from './topography';

const make=(seed=41)=>createWorld({seed,size:'small',layout:'archipelago',
  starting:{human:0,elf:0,dwarf:0,demon:0},volcanicWorld:true,
  regionalGeography:true,regionalBiomes:true,terrainCells:true,worldTree:true,riverlands:true});

describe('Caldera Lake',()=>{
  it('holds an elevated seeded lake behind a continuous volcanic rim',()=>{
    const world=make(),basin=world.volcanicLayout!.caldera!;
    const {lake,outflow}=basin,{width,tiles,topography}=world,level=topography!.heights[lake[0]];
    expect(basin).toEqual(make().volcanicLayout?.caldera);
    expect(basin).not.toEqual(make(31).volcanicLayout?.caldera);
    expect(level).toBeGreaterThan(SEA_LEVEL);
    expect(lake.every(i=>tiles[i].biome==='water'&&topography!.heights[i]===level)).toBe(true);
    expect(lake.every(i=>seaNeighbors(i,width,tiles.length).every(j=>
      lake.includes(j)||tiles[j].biome!=='water'&&topography!.heights[j]>level))).toBe(true);
    expect(tiles[outflow.at(-1)!].biome).toBe('water');
    expect(calderaRiver(world)).toBeUndefined();
    expect(readSavedWorld(compactWorld(world))?.volcanicLayout?.caldera).toEqual(basin);
  });

  it('opens a real downhill river and walkable terraces on the same day after reload',()=>{
    const initial=make(),basin=initial.volcanicLayout!.caldera!,center=basin.lake[0];
    const before=advanceWorldDays(initial,basin.breachDay-1);
    expect(before.volcanicLayout?.caldera?.drainedAt).toBeUndefined();
    const restored=readSavedWorld(compactWorld(before))!;
    const next=advanceWorldDays(restored,1),path=calderaRiver(next)!;
    expect(next.volcanicLayout?.caldera?.drainedAt).toBe(basin.breachDay);
    expect(path).toEqual(basin.outflow);
    expect(next.tiles[center].biome).toBe('water');
    expect(next.topography!.heights[center]).toBeLessThan(initial.topography!.heights[center]);
    const links=riverLinks(next),course=riverCourses(next).find(r=>r.name==='Caldera outflow')!;
    expect(course.path).toEqual(path.slice(1,-1));
    for(let i=1;i<path.length;i++){
      expect(links.get(path[i-1])?.some(link=>link.other===path[i])).toBe(true);
      expect(next.topography!.heights[path[i]]).toBeLessThanOrEqual(next.topography!.heights[path[i-1]]);
    }
    const open=adventureMapFor(next).open;
    expect(basin.lake.slice(1).every(i=>open[i]&&!adventureMapFor(initial).open[i])).toBe(true);
    const landed=createMortal(next,{name:'Ari Flint',species:'human',background:'scout',
      appearance:{skin:1,hair:1,hairStyle:1,outfit:'wanderer'}},course.mouth).world;
    const actor=landed.agents.find(a=>a.id===landed.descent?.agentId)!;
    const from=actor.y*landed.width+actor.x;
    expect(basin.lake).toContain(from);
    const region=adventureRegion(landed,adventureMapFor(landed),actor);
    const ledge=seaNeighbors(from,landed.width,landed.tiles.length).find(i=>
      i!==center&&basin.lake.includes(i)&&region.area.has(i))!;
    const to=seaPoint(landed.width,ledge);
    expect(walkAdventure(landed,region,to.x-actor.x,to.y-actor.y,false).moved).toBe(true);
    expect(calderaRiver(readSavedWorld(compactWorld(next))!)).toEqual(path);
    expect(next.events.filter(event=>event.message.includes('caldera rim'))).toHaveLength(1);
    const layout=next.volcanicLayout!;
    const closed=surfaceGrid({...next,volcanicLayout:{...layout,caldera:{...layout.caldera!,drainedAt:undefined}}});
    const drained=surfaceGrid(next);
    expect(drained).not.toBe(closed);
    expect(drained.shore.some((shore,i)=>shore!==closed.shore[i])).toBe(true);
  });
});
