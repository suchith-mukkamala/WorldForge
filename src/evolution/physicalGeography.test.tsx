import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {advanceWorldDays} from './calendar';
import {DepthCanvas} from './DepthCanvas';
import {createDepthProjector,depthCanvasSize,depthDrop,projectDepth,
  RELIEF_LEVELS,tileFromHit,tileHitColor} from './depthProjection';
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

  it('exaggerates visible relief without changing height data or losing canvas room',()=>{
    const world=createWorld({seed:2006,size:'small'});
    const original=JSON.stringify(world);
    const lower=48,upper=208;
    const naturalLow=projectDepth(world,7,9,lower,RELIEF_LEVELS.natural);
    const naturalHigh=projectDepth(world,7,9,upper,RELIEF_LEVELS.natural);
    const dramaticLow=projectDepth(world,7,9,lower,RELIEF_LEVELS.dramatic);
    const dramaticHigh=projectDepth(world,7,9,upper,RELIEF_LEVELS.dramatic);
    const monumentalLow=projectDepth(world,7,9,lower,RELIEF_LEVELS.monumental);
    const monumentalHigh=projectDepth(world,7,9,upper,RELIEF_LEVELS.monumental);
    expect(naturalLow.y-naturalHigh.y).toBe(20);
    expect(dramaticLow.y-dramaticHigh.y).toBe(50);
    expect(monumentalLow.y-monumentalHigh.y).toBe(80);
    expect(depthDrop(upper,lower,RELIEF_LEVELS.monumental)).toBe(80);
    expect(depthDrop(lower,upper,RELIEF_LEVELS.monumental)).toBe(0);
    expect(depthCanvasSize(world,4).height).toBeGreaterThan(
      depthCanvasSize(world,1).height);
    const highest=projectDepth(world,0,0,255,4);
    expect(highest.y).toBeGreaterThan(0);
    expect(JSON.stringify(world)).toBe(original);
    const html=renderToStaticMarkup(createElement(DepthCanvas,{
      world,brush:{kind:'inspect'},overlay:'terrain',selected:null,
      onSelect:()=>{},onEdit:()=>{},relief:4,
    }));
    expect(html).toContain('exaggerated cliffs');
    expect(html).toContain(`height="${depthCanvasSize(world,4).height}"`);
  });

  it('orbits the physical heightfield through 360 degrees without clipping or rotating tile IDs',()=>{
    const world=createWorld({seed:2070,size:'small'});
    const before=JSON.stringify(world);
    const directions=[0,15,45,90,135,180,225,270,315,345,360];
    for(const yaw of directions)for(const pitch of [18,30,55]){
      const camera={yaw,pitch};
      const projection=createDepthProjector(world,4,camera);
      expect(projection.size.width).toBeGreaterThan(world.width);
      expect(projection.size.height).toBeGreaterThan(world.height);
      for(const [x,y] of [[0,0],[world.width-1,0],
        [0,world.height-1],[world.width-1,world.height-1]]){
        for(const vertex of projection.tileCorners(x,y,255)){
          expect(vertex.x).toBeGreaterThanOrEqual(0);
          expect(vertex.x).toBeLessThan(projection.size.width);
          expect(vertex.y).toBeGreaterThanOrEqual(0);
          expect(vertex.y).toBeLessThan(projection.size.height);
        }
        const bottom=projection.project(x,y,0);
        expect(bottom.y).toBeGreaterThan(0);
        expect(bottom.y).toBeLessThan(projection.size.height);
      }
      const mountain=projection.project(10,10,208);
      const sea=projection.project(10,10,48);
      expect(mountain.y).toBeLessThan(sea.y);
      expect(depthCanvasSize(world,4,camera)).toEqual(projection.size);
    }
    const north=createDepthProjector(world,2.5,{yaw:0,pitch:30});
    const east=createDepthProjector(world,2.5,{yaw:90,pitch:30});
    expect(north.frontX).toBe(1);expect(north.frontY).toBe(1);
    expect(east.frontX).toBe(1);expect(east.frontY).toBe(-1);
    expect(createDepthProjector(world,2.5,{yaw:180,pitch:30}).frontX).toBe(-1);
    expect(createDepthProjector(world,2.5,{yaw:180,pitch:30}).frontY).toBe(-1);
    expect(createDepthProjector(world,2.5,{yaw:45,pitch:30}).frontY).toBe(0);
    expect(createDepthProjector(world,2.5,{yaw:135,pitch:30}).frontX).toBe(0);
    const base=north.project(10,20,108);
    expect(east.project(10,20,108).x).not.toBe(base.x);
    expect(JSON.stringify(world)).toBe(before);
    const html=renderToStaticMarkup(createElement(DepthCanvas,{
      world,brush:{kind:'inspect'},overlay:'terrain',selected:{x:10,y:20},
      onSelect:()=>{},onEdit:()=>{},relief:2.5,
      camera:{yaw:135,pitch:18},
    }));
    expect(html).toContain('orbit camera');
    expect(html).toContain(`width="${depthCanvasSize(world,2.5,
      {yaw:135,pitch:18}).width}"`);
  });

  it('keeps calendar stepping deterministic with the v2.0 terrain rules',()=>{
    const world=createWorld({seed:2020,size:'small'});
    expect(advanceWorldDays(world,25)).toEqual(advanceWorldDays(
      advanceWorldDays(world,11),14));
  });
});
