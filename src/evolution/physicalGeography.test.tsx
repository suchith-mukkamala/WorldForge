import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {advanceWorldDays} from './calendar';
import {DepthCanvas} from './DepthCanvas';
import {depthCanvasSize,projectDepth,tileFromHit,tileHitColor} from './depthProjection';
import {createWorld,isWorld,type World} from './engine';
import {findMortalRoute} from './mindII';
import {compactWorld,readSavedWorld} from './storage';
import {enablePhysicalTerrain,hasPhysicalTerrain,terrainBuildPenalty,
  terrainFarmFactor,terrainRuggedness,terrainStepEffort} from './terrainPhysics';
import {topographyForWorld} from './topography';

function steppedWorld():World{
  const original=createWorld({seed:2001,size:'small'});
  const width=original.width;
  const heights=new Array<number>(original.tiles.length).fill(90);
  heights[4*width+5]=245;
  return {...original,tiles:original.tiles.map(()=>({biome:'plains',food:5})),
    topography:{version:1,heights}};
}

describe('v2.0 — terrain that physically matters and a selectable depth view',()=>{
  it('uses physical terrain in new worlds while preserving save compatibility',()=>{
    const world=createWorld({seed:2000,size:'small'});
    expect(hasPhysicalTerrain(world)).toBe(true);
    expect(isWorld(world)).toBe(true);
    expect(readSavedWorld(compactWorld(world))).toEqual(world);
    expect(isWorld({...world,terrainPhysics:{version:2}})).toBe(false);
    expect(isWorld({...world,terrainPhysics:null})).toBe(false);
  });

  it('leaves old worlds neutral until the owner explicitly upgrades them',()=>{
    const world=createWorld({seed:2077,size:'small'});
    const old:World={...world,topography:undefined,terrainPhysics:undefined};
    const prior=JSON.stringify(old);
    expect(hasPhysicalTerrain(old)).toBe(false);
    expect(terrainStepEffort(old,0,old.width)).toBe(1);
    expect(terrainFarmFactor(old,0)).toBe(1);
    expect(terrainBuildPenalty(old,0)).toBe(0);
    expect(readSavedWorld(compactWorld(old))).toEqual(old);
    const upgraded=enablePhysicalTerrain(old);
    expect(hasPhysicalTerrain(upgraded)).toBe(true);
    expect(upgraded.topography).toEqual(topographyForWorld(old));
    expect(upgraded.agents).toBe(old.agents);
    expect(upgraded.tiles).toBe(old.tiles);
    expect(upgraded.history).toBe(old.history);
    expect(upgraded.rngState).toBe(old.rngState);
    expect(JSON.stringify(old)).toBe(prior);
    expect(enablePhysicalTerrain(upgraded)).toBe(upgraded);
    expect(readSavedWorld(compactWorld(upgraded))).toEqual(upgraded);
  });

  it('makes steep ascents tiring, lowers rugged farmland yield and building suitability',()=>{
    const world=steppedWorld(),low=4*world.width+4,peak=low+1;
    expect(terrainStepEffort(world,low,peak)).toBeGreaterThan(4);
    expect(terrainStepEffort(world,peak,low)).toBeGreaterThan(1);
    expect(terrainStepEffort(world,low,peak)).toBeGreaterThan(
      terrainStepEffort(world,peak,low));
    expect(terrainStepEffort(world,low,low+world.width)).toBe(1);
    expect(terrainRuggedness(world,peak)).toBe(155);
    expect(terrainBuildPenalty(world,peak)).toBeGreaterThan(0);
    expect(terrainFarmFactor(world,peak)).toBeLessThan(
      terrainFarmFactor(world,2*world.width+2));
  });

  it('finds a gentler route instead of the shortest route over a sharp summit',()=>{
    const world=steppedWorld(),agent={...world.agents[0],x:2,y:4};
    const capacities=new Uint16Array(world.tiles.length).fill(10);
    const args=[new Map<number,number[]>(),capacities,new Set<number>()] as const;
    const route=findMortalRoute(world,agent,{x:8,y:4},...args);
    const oldRoute=findMortalRoute({...world,terrainPhysics:undefined},agent,
      {x:8,y:4},...args);
    const summit=4*world.width+5;
    expect(route[0]).toBe(4*world.width+2);
    expect(route.at(-1)).toBe(4*world.width+8);
    expect(route).not.toContain(summit);
    expect(oldRoute).toContain(summit);
    for(let i=1;i<route.length;i++){
      const dx=Math.abs(route[i]%world.width-route[i-1]%world.width);
      const dy=Math.abs(Math.floor(route[i]/world.width)-
        Math.floor(route[i-1]/world.width));
      expect(Math.max(dx,dy)).toBe(1);
    }
  });

  it('projects exactly the same grid into a selectable raised isometric view',()=>{
    const world=createWorld({seed:2002,size:'small'});
    const size=depthCanvasSize(world);
    expect(size.width).toBeGreaterThan(world.width);
    expect(size.height).toBeGreaterThan(world.height);
    const low=projectDepth(world,7,9,48),high=projectDepth(world,7,9,208);
    expect(high.x).toBe(low.x);
    expect(high.y).toBe(low.y-20);
    for(const index of [0,1,255,256,65534,world.tiles.length-1]){
      const rgb=tileHitColor(index).match(/\d+/g)!.map(Number);
      expect(tileFromHit(rgb[0],rgb[1],rgb[2])).toBe(index);
    }
    const before=JSON.stringify(world);
    const html=renderToStaticMarkup(createElement(DepthCanvas,{
      world,brush:{kind:'inspect'},overlay:'terrain',selected:{x:7,y:9},
      onSelect:()=>{},onEdit:()=>{},zoom:1,
    }));
    expect(html).toContain('Isometric terrain depth view');
    expect(html).toContain('role="grid"');
    expect(html).toContain('tabindex="0"');
    expect(JSON.stringify(world)).toBe(before);
  });

  it('keeps calendar stepping deterministic with the v2.0 terrain rules',()=>{
    const world=createWorld({seed:2020,size:'small'});
    expect(advanceWorldDays(world,25)).toEqual(advanceWorldDays(
      advanceWorldDays(world,11),14));
  });
});
