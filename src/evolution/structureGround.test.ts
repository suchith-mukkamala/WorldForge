import {describe,expect,it} from 'vitest';
import {blockBuilding,blockLandmark} from './blockModels';
import {BUILDING_TYPES,COSTS,type Building} from './construction';
import {createWorld,type Biome} from './engine';
import {ANCIENT_KINDS} from './knowledge';
import {compactWorld} from './storage';
import {fitStructure,structureSite,surfaceHeightAt} from './structureGround';
import type {SurfaceGrid} from './surfaceGrid';

const world=createWorld({size:'small',seed:321721,riverlands:false,terrainCells:true,
  starting:{human:0,elf:0,dwarf:0,demon:0}});
const at={x:5,y:5};
const house=(type:Building['type']='house'):Building=>({id:1,type,...at,culture:'human',
  stage:'complete',condition:100,progress:100,started:0,spent:{...COSTS[type].materials},
  labor:COSTS[type].labor});
function habitat(biome:Biome,coast=false){
  const {width}=world,index=at.y*width+at.x;
  const tiles=world.tiles.map(tile=>({...tile,biome:'plains' as Biome}));
  const heights=tiles.map(()=>78);
  tiles[index].biome=biome;
  if(coast){tiles[index+1].biome='water';heights[index]=55;heights[index+1]=39;}
  return {...world,tiles,topography:{...world.topography!,heights}};
}

describe('Grounded structures',()=>{
  it('fits every building and landmark to the actual stepped surface',()=>{
    const columns=88,rows=88,size=columns*rows;
    const grid:SurfaceGrid={columns,rows,ground:Uint16Array.from({length:size},(_,i)=>
      292+Math.floor(i%columns/2)*3+Math.floor(i/columns/2)*7),
      water:new Uint8Array(size),material:new Uint8Array(size),shore:new Uint8Array(size)};
    const site=structureSite(habitat('mountain'),at),unit=.9,elevation=2.6;
    const structures=[...BUILDING_TYPES.map(type=>blockBuilding(house(type),0,{site})),
      ...ANCIENT_KINDS.map(kind=>blockLandmark(kind,false,site))];
    for(const structure of structures){
      expect(structure.feet.length).toBeGreaterThan(0);
      const fitted=fitStructure(grid,structure,at,unit,elevation,site);
      expect(fitted.model.faces.some(face=>face.z<0)).toBe(true);
      const span=unit*fitted.scale/6,block=elevation*fitted.scale;
      for(const [i,foot] of structure.feet.entries()){
        const surfaces=[0.001,.999].flatMap(y=>[0.001,.999].map(x=>
          surfaceHeightAt(grid,fitted.at.x+(foot.x+x)*span,fitted.at.y+(foot.y+y)*span)));
        const base=fitted.height-fitted.depths[i]*block;
        expect(base).toBeLessThanOrEqual(Math.min(...surfaces));
        expect(base).toBeGreaterThan(Math.min(...surfaces)-block-.001);
        expect(fitted.height).toBeGreaterThanOrEqual(Math.max(...surfaces));
      }
    }
  });

  it('finds a nearby ledge when a footprint crosses a cliff',()=>{
    const columns=88,rows=88,size=columns*rows,side=8;
    const grid:SurfaceGrid={columns,rows,ground:Uint16Array.from({length:size},(_,i)=>
      i%columns>=(at.x+.5)*side?640:300),water:new Uint8Array(size),
      material:new Uint8Array(size),shore:new Uint8Array(size)};
    const site=structureSite(habitat('mountain'),at);
    const model=blockBuilding(house(),0,{site});
    const fitted=fitStructure(grid,model,at,.95,2.7,site);
    expect(fitted.height).toEqual(160);
    expect(fitted.at.x).toBeGreaterThan(at.x);
    expect(fitted.scale).toBeLessThan(1);
    expect(Math.max(...fitted.depths)).toBe(0);
  });

  it('uses local materials and puts wetland houses on individual supports',()=>{
    const dry=structureSite(habitat('plains'),at),wet=structureSite(habitat('wetland'),at);
    const ash=structureSite(habitat('volcanic'),at);
    const cold=structureSite({...habitat('taiga'),dayOfYear:320},at);
    expect(cold.snow).toBe(true);
    const model=blockBuilding(house(),0,{site:dry}),raised=blockBuilding(house(),0,{site:wet});
    expect(raised.feet.length).toBeLessThan(model.feet.length/2);
    expect(blockBuilding(house(),0,{site:ash}).faces.some(f=>f.color===ash.material.stone)).toBe(true);
    expect(blockBuilding(house(),0,{site:cold}).faces.some(f=>f.color==='#c0cdd0')).toBe(true);
  });

  it('extends a pier toward real shore water and leaves existing saves untouched',()=>{
    const coastal=habitat('plains',true),save=compactWorld(coastal);
    const coast=structureSite(coastal,at),land=structureSite(habitat('plains'),at);
    expect(coast.shore).toEqual({x:1,y:0});
    const pier=blockBuilding(house('dock'),0,{site:coast});
    const landing=blockBuilding(house('dock'),0,{site:land});
    expect(Math.max(...pier.feet.map(foot=>foot.x))).toBeGreaterThan(5);
    expect(Math.max(...landing.feet.map(foot=>foot.x))).toBeLessThan(5);
    expect(compactWorld(coastal)).toBe(save);
  });
});
