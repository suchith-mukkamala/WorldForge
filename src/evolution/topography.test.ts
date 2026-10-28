import {describe,expect,it} from 'vitest';
import {advanceWorldDays} from './calendar';
import {createWorld,editWorld,isWorld,stepWorld} from './engine';
import {paintRelief} from './pixelArt';
import {compactWorld,readSavedWorld} from './storage';
import {SEA_LEVEL,elevationAt,generateTopography,topographyForWorld,
  validTopography} from './topography';

describe('WorldForge v1.9.1 — deterministic elevation and compatible art',()=>{
  it('creates valid reproducible topography without modifying the world RNG',()=>{
    const a=createWorld({seed:231,size:'small'});
    const b=createWorld({seed:231,size:'small'});
    expect(a.topography).toEqual(b.topography);
    expect(validTopography(a.topography,a.width,a.height)).toBe(true);
    expect(topographyForWorld(a)).toBe(a.topography);
    expect(a.topography?.heights.length).toBe(a.width*a.height);
    expect(a.topography?.heights.every(h=>Number.isInteger(h)&&h>=0&&h<=255))
      .toBe(true);
    const elevations=new Set(a.topography!.heights);
    expect(elevations.size).toBeGreaterThan(20);
    const water=a.tiles.findIndex(t=>t.biome==='water');
    expect(a.topography!.heights[water]).toBeLessThan(SEA_LEVEL);
    const mountains=a.topography!.heights.filter((h,i)=>
      a.tiles[i].biome==='mountain');
    expect(mountains.length).toBeGreaterThan(0);
    expect(mountains.some(h=>h>120)).toBe(true);
    expect(generateTopography(a.width,a.height,a.tiles,a.settings.seed))
      .toEqual(a.topography);
  });
  it('persists terrain and rejects corrupt elevation while loading older worlds',()=>{
    const start=createWorld({seed:232,size:'small'});
    const after=advanceWorldDays(start,80);
    expect(after.topography).toBe(start.topography);
    const saved=compactWorld(after);
    expect(readSavedWorld(saved)).toEqual(after);
    const older={...after};
    delete older.topography;
    expect(isWorld(older)).toBe(true);
    expect(readSavedWorld(JSON.stringify(older))).toEqual(older);
    const before=JSON.stringify(older);
    const derived=topographyForWorld(older);
    expect(derived).toEqual(start.topography);
    expect(topographyForWorld(older)).toBe(derived);
    expect(JSON.stringify(older)).toBe(before);
    expect(elevationAt(older,-1,2)).toBeNull();
    expect(elevationAt(older,1,1)).toBe(derived.heights[1+older.width]);
    expect(isWorld({...after,topography:{version:1,heights:[1]}})).toBe(false);
    expect(isWorld({...after,topography:{version:1,
      heights:after.topography!.heights.map((h,i)=>i===2?NaN:h)}})).toBe(false);
  });
  it('recomputes edited biome elevation without changing travel rules',()=>{
    const start=createWorld({seed:233,size:'small'});
    const index=start.tiles.findIndex(t=>t.biome==='plains');
    expect(index).toBeGreaterThanOrEqual(0);
    const x=index%start.width,y=Math.floor(index/start.width);
    const change=editWorld(start,x,y,{kind:'terrain',biome:'mountain'});
    expect(change.topography?.heights[index]).toBeGreaterThan(
      start.topography!.heights[index]);
    expect(start.tiles[index].biome).toBe('plains');
    expect(start.topography).not.toBe(change.topography);
    expect(isWorld(change)).toBe(true);
    expect(isWorld(stepWorld(start))).toBe(true);
  });
  it('shades relief and heightmaps without mutating data',()=>{
    const pixels:{color:string;x:number;y:number}[]=[];
    const recorder={fillStyle:'',fillRect(x:number,y:number){
      pixels.push({color:recorder.fillStyle,x,y});
    }} as unknown as CanvasRenderingContext2D;
    const heights={north:75,east:95,south:66,west:65};
    paintRelief(recorder,2,3,110,heights,'mountain');
    expect(pixels.length).toBeGreaterThan(0);
    const before=pixels.length;
    paintRelief(recorder,2,3,110,heights,'mountain','elevation');
    expect(pixels.length).toBeGreaterThan(before);
    expect(heights).toEqual({north:75,east:95,south:66,west:65});
  });
});
