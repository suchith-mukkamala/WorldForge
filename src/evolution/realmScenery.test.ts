import {describe,expect,it} from 'vitest';
import {createWorld} from './engine';
import {realmScenery} from './realmScenery';
import {RealmBiome,underworldMap} from './underworld';

describe('Underworld scenery',()=>{
  it('reuses deterministic formations and leaves travel routes and town sites clear',()=>{
    const world=createWorld({seed:41,size:'small',layout:'archipelago',volcanicWorld:true});
    const map=underworldMap(world)!;
    const art=realmScenery(map);
    expect(realmScenery(map)).toBe(art);
    expect(realmScenery(structuredClone(map))).toEqual(art);
    expect(new Set([...art.formations.values()].map(form=>form.kind))).toEqual(
      new Set(['fungus','crystal','spire','vent','calcite']));
    const occupied=new Set([...map.roads,...map.houses.keys(),
      ...map.links.map(link=>link.cell),...map.towns.map(town=>town.index)]);
    expect(art.naturalSites.map(site=>site.name)).toEqual(['Glowroot Canopy','Prism Gallery','Mineral Terraces']);
    expect(new Set(art.naturalSites.map(site=>site.cell)).size).toBe(art.naturalSites.length);
    for(const site of art.naturalSites){
      expect(art.formations.has(site.cell)).toBe(true);
      expect(occupied.has(site.cell)).toBe(false);
    }
    for(const [cell,form] of art.formations){
      expect(occupied.has(cell)).toBe(false);
      expect(map.biomes[cell]).not.toBe(RealmBiome.lava);
      expect(map.biomes[cell]).not.toBe(RealmBiome.sea);
      expect(Math.abs(form.dx)).toBeLessThan(.5);
      expect(Math.abs(form.dy)).toBeLessThan(.5);
    }
    const port=map.towns.find(town=>town.berth!==undefined)!;
    expect(art.docks.has(port.berth!)).toBe(true);
    expect(art.falls.size).toBeGreaterThan(0);
    for(const [cell,{outlet,dx,dy}] of art.falls){
      expect(occupied.has(cell)).toBe(false);
      expect(outlet).toBe(cell+dx+dy*map.width);
      expect(map.biomes[outlet]).toBe(RealmBiome.sea);
      expect(art.spray.has(outlet)).toBe(true);
    }
    expect(art.effects.some(effect=>effect.kind==='spore')).toBe(true);
    for(const effect of art.effects.filter(effect=>effect.kind==='spark')){
      expect(map.biomes[effect.cell]).toBe(RealmBiome.lava);
      expect(map.bridges.has(effect.cell)).toBe(false);
    }
  });
});
