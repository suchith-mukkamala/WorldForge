import {describe,expect,it} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {advanceWorldDays} from './calendar';
import {BIOMES,createWorld} from './engine';
import {SettlementView} from './SettlementView';
import {paintTerrainDetail,terrainDetailAt} from './terrainDetails';
import {readSavedWorld,compactWorld} from './storage';
import {topographyForWorld} from './topography';

describe('v1.9.4 — deterministic vegetation and rocky scenery',()=>{
  it('chooses biome-aware motifs without consuming simulation RNG',()=>{
    const world=createWorld({seed:194,size:'small'});
    const before=JSON.stringify(world),rng=world.rngState;
    const topography=topographyForWorld(world);
    const choices=world.tiles.map((t,i)=>terrainDetailAt(t.biome,
      i%world.width,Math.floor(i/world.width),world.settings.seed,
      topography.heights[i]));
    expect(new Set(choices.map(d=>d.motif)).size).toBeGreaterThan(10);
    expect(choices).toEqual(world.tiles.map((t,i)=>terrainDetailAt(t.biome,
      i%world.width,Math.floor(i/world.width),world.settings.seed,
      topography.heights[i])));
    expect(world.rngState).toBe(rng);
    expect(JSON.stringify(world)).toBe(before);
  });

  it('uses elevation and shorelines while keeping all terrain types distinct',()=>{
    expect(terrainDetailAt('mountain',5,8,19,220).motif).toBe('snowstone');
    expect(['boulder','scree']).toContain(
      terrainDetailAt('mountain',5,8,19,135).motif);
    expect(['oak','pine','fern']).toContain(
      terrainDetailAt('forest',5,8,19,135).motif);
    expect(['crystal','stalagmite']).toContain(
      terrainDetailAt('cave',5,8,19,150).motif);
    expect(['basalt','embers']).toContain(
      terrainDetailAt('volcanic',5,8,19,185).motif);
    expect(BIOMES.every(b=>terrainDetailAt(b,5,8,19,150)
      .motif!==undefined)).toBe(true);
    const shoreModes=new Set(Array.from({length:30},(_,x)=>
      terrainDetailAt('water',x,3,19,39,true).motif));
    expect(shoreModes.has('shorefoam')).toBe(true);
  });

  it('renders crisp varied tile details and matches settlement motifs',()=>{
    const colors:string[]=[],rectangles:number[]=[];
    const recorder={fillStyle:'',fillRect(_x:number,_y:number,w:number,h:number){
      colors.push(String(recorder.fillStyle));rectangles.push(w*h);
    }} as unknown as CanvasRenderingContext2D;
    for(const biome of BIOMES){
      const d=terrainDetailAt(biome,14,9,111,193,true);
      paintTerrainDetail(recorder,d,14,9);
    }
    expect(colors.length).toBeGreaterThan(10);
    expect(new Set(colors).size).toBeGreaterThan(6);
    expect(rectangles.every(a=>a>0&&a<=36)).toBe(true);
    const world=createWorld({seed:414,size:'small'});
    world.settlements=[{id:1,name:'Ridge',species:'human',x:28,y:24,
      founded:0,population:3,stores:10,emptyYears:0}];
    const before=JSON.stringify(world);
    const markup=renderToStaticMarkup(createElement(SettlementView,{
      world,selectedId:1,onFindOnMap:()=>{},playing:false,
      onTogglePlay:()=>{},onAdvance:()=>{},
    }));
    expect(markup).toContain('data-terrain-motif=');
    expect(markup).toContain('Elevation ');
    expect(JSON.stringify(world)).toBe(before);
  });

  it('replays identically after saves and legacy reconstruction',()=>{
    const observed=createWorld({seed:2077,size:'small'});
    const original=JSON.stringify(observed);
    const restored=readSavedWorld(compactWorld(observed))!;
    const old={...observed};delete old.topography;
    const i=observed.tiles.findIndex(t=>t.biome==='mountain');
    const choose=(world:typeof observed)=>terrainDetailAt(world.tiles[i].biome,
      i%world.width,Math.floor(i/world.width),world.settings.seed,
      topographyForWorld(world).heights[i]);
    expect(choose(restored)).toEqual(choose(observed));
    expect(choose(old)).toEqual(choose(observed));
    expect(JSON.stringify(observed)).toBe(original);
    expect(advanceWorldDays(observed,45)).toEqual(
      advanceWorldDays(createWorld({seed:2077,size:'small'}),45));
  });
});
