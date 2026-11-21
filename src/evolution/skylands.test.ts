import {describe,expect,it} from 'vitest';
import {createDepthProjector} from './depthProjection';
import {createWorld,isWorld} from './engine';
import {enableSkylands,generateSkylands,skylandMesh,skylandName,validSkylands} from './skylands';
import {packSimulationWorld,receiveSimulationWorld} from './simulationProtocol';
import {compactWorld,readSavedWorld} from './storage';
import {Shore,surfaceGrid,VISUAL_TERRAIN_SIDE as SIDE} from './surfaceGrid';

const settings={seed:321721,size:'small',layout:'continents',landforms:'varied',
  regionalGeography:true,regionalBiomes:true,riverlands:true,terrainCells:true} as const;
const before=createWorld(settings);
const after=enableSkylands(before);

describe('Floating islands',()=>{
  it('reproduces suspended land from the seed without moving the surface world',()=>{
    const newlyGenerated=createWorld({...settings,floatingIslands:true});
    expect(newlyGenerated.skylands).toEqual(after.skylands);
    expect(newlyGenerated.tiles).toEqual(before.tiles);
    expect(newlyGenerated.agents).toEqual(before.agents);
    expect(newlyGenerated.rngState).toBe(before.rngState);
    expect(after.tiles).toBe(before.tiles);
    expect(after.topography).toBe(before.topography);
    expect(after.settlements).toBe(before.settlements);
    expect(after.transport).toBe(before.transport);
    expect(enableSkylands(after)).toBe(after);
    expect(isWorld(after)).toBe(true);
    expect(readSavedWorld(compactWorld(after))?.skylands).toEqual(after.skylands);
    expect(readSavedWorld(compactWorld(before))?.skylands).toBeUndefined();
    expect(new Set(after.skylands?.map(skylandName)).size).toBe(after.skylands?.length);
  });

  it('keeps every island clear of the ground and reserves space for the sky at every tilt',()=>{
    const sites=after.skylands!;
    expect(sites.length).toBe(2);
    for(const group of sites){
      const {islands,fall}=skylandMesh(group);
      expect(islands.length).toBeGreaterThanOrEqual(3);
      expect(new Set(islands.map(mesh=>mesh.island.height)).size).toBe(islands.length);
      for(const mesh of islands){
        const {surface,underside}=mesh;
        expect(surface.some(Boolean)).toBe(true);
        expect(surface.every((z,i)=>!z||z>underside[i]&&underside[i]>255)).toBe(true);
      }
      const main=islands[0];
      expect(main.water.includes(1)).toBe(true);
      expect(main.water.includes(2)).toBe(true);
      expect(main.water.includes(3)).toBe(true);
      expect(fall.height).toBe(main.island.height+2);
      for(const yaw of [0,45,90,135,180,270,315])for(const pitch of [18,30,55]){
        const projector=createDepthProjector(after,4,{yaw,pitch});
        for(const mesh of islands){
          const p=projector.projectSmooth(mesh.island.x,mesh.island.y,mesh.island.height+48);
          expect(p.x).toBeGreaterThan(0);expect(p.x).toBeLessThan(projector.size.width);
          expect(p.y).toBeGreaterThan(0);expect(p.y).toBeLessThan(projector.size.height);
        }
      }
    }
  });

  it('shades the same ground cells and seats each waterfall in a surface pool',()=>{
    const original=surfaceGrid(before),terrain=surfaceGrid(after);
    expect(original.shadow).toBeUndefined();
    expect(terrain.shadow?.some(shade=>shade===2)).toBe(true);
    expect(terrain).not.toBe(original);
    expect(surfaceGrid(after)).toBe(terrain);
    for(const site of after.skylands!){
      const {fall}=skylandMesh(site),{direction}=fall;
      const x=Math.floor((fall.x+.5)*SIDE+direction.x*.0001);
      const y=Math.floor((fall.y+.5)*SIDE+direction.y*.0001);
      expect(terrain.shore[y*terrain.columns+x]).toBe(Shore.spray);
    }
    const packet=packSimulationWorld(after,{...after,dayOfYear:1});
    expect(packet.retained).toContain('skylands');
    const hydrated=receiveSimulationWorld(after,{kind:'advanced',id:1,elapsedMs:0,...packet});
    expect(hydrated.skylands).toBe(after.skylands);
  });

  it('keeps the saved parcel bounds valid across different shapes and legacy sizes',()=>{
    for(const [width,height] of [[44,30],[96,64],[160,104],[320,208]]){
      const site={...before,width,height,topography:{version:1 as const,
        heights:new Array<number>(width*height).fill(75)},tiles:Array.from({length:width*height},
          ()=>({biome:'plains' as const,food:1}))};
      for(const seed of [5,10,589,321721,2147483647]){
        const list=generateSkylands({...site,settings:{...site.settings,seed}});
        expect(list.length).toBeGreaterThan(0);
        expect(validSkylands(list,width,height)).toBe(true);
      }
    }
    const malformed=structuredClone(after.skylands!);
    malformed[0].islands[0].rx=Infinity;
    expect(validSkylands(malformed,after.width,after.height)).toBe(false);
  });
});
