import {describe,expect,it} from 'vitest';
import {createWorld,editWorld,isWorld,stepWorld} from './engine';
import {compactWorld,readSavedWorld} from './storage';
import {enableTerrainCells,routeTerrainWater,terrainCellsIn,terrainRenderGrid} from './terrainCells';
import {terrainFarmFactor,terrainStepEffort} from './terrainPhysics';

const landscape=()=>createWorld({size:'small',seed:321721,layout:'continents',
  regionalGeography:true,starting:{human:0,elf:0,dwarf:0,demon:0}});

describe('fine terrain and material physics',()=>{
  it('provides the same four by four square grid across active and legacy maps',()=>{
    const old=landscape(),active=enableTerrainCells(old);
    const plain=terrainRenderGrid(old),grid=terrainRenderGrid(active);
    expect(grid.columns).toBe(active.width*4);
    expect(grid.rows).toBe(active.height*4);
    expect(plain.ground.length).toBe(grid.ground.length);
    expect(plain.water.every(depth=>depth===0)).toBe(true);
    const visibleLand=active.tiles.map((tile,i)=>tile.biome==='water'?-1:i).filter(i=>i>=0);
    for(const tile of [visibleLand[0],visibleLand[Math.floor(visibleLand.length/2)],visibleLand.at(-1)!]){
      const first=(Math.floor(tile/active.width)*grid.columns+tile%active.width)*4;
      const cells=terrainCellsIn(active,tile)!;
      cells.forEach((square,offset)=>{
        const cell=first+Math.floor(offset/4)*grid.columns+offset%4;
        expect(grid.ground[cell]).toBe(square.height*4);
        expect(grid.water[cell]).toBe(square.waterDepth*4);
      });
    }
  });
  it('moves water across small steps and lets it pool in a low cell',()=>{
    const ground=new Uint16Array([240,234,228,234,240]);
    const depth=new Uint8Array([6,0,0,0,0]);
    const {water,flow}=routeTerrainWater(5,1,ground,depth,new Uint8Array(5),5);
    expect([...water]).toEqual([0,0,6,0,0]);
    expect([...flow]).toEqual([6,6,0,0,0]);
    expect(depth[0]).toBe(6);
  });

  it('drains into existing water bodies at their surface level',()=>{
    const {water,flow}=routeTerrainWater(2,1,new Uint16Array([201,186]),
      new Uint8Array([7,0]),new Uint8Array([0,1]));
    expect([...water]).toEqual([0,0]);
    expect(flow[0]).toBe(7);
  });

  it('stores independent cell heights and erodes cover while leaving bare rock fixed',()=>{
    const start=enableTerrainCells(landscape());
    const initial=compactWorld(start),initialCells=start.tiles.map((_,i)=>terrainCellsIn(start,i)!);
    let world=start;
    for(let year=0;year<18;year++)world=stepWorld(world);
    expect(compactWorld(start)).toBe(initial);
    expect(world.topography).toBe(start.topography);
    let eroded=0,exposed=0;
    for(let i=0;i<world.tiles.length;i++){
      const cells=terrainCellsIn(world,i)!;
      expect(cells).toHaveLength(16);
      for(const [j,cell] of cells.entries()){
        const before=initialCells[i][j];
        if(before.material==='stone'&&before.coverDepth===0)expect(cell.height).toBe(before.height);
        if(cell.eroded<=before.eroded)continue;
        eroded++;
        expect(cell.height).toBe(before.height-(cell.eroded-before.eroded));
        if(cell.material==='stone')exposed++;
      }
    }
    expect(eroded).toBeGreaterThan(0);
    expect(exposed).toBeGreaterThan(0);
    expect(isWorld(world)).toBe(true);
  });

  it('affects travel costs and growing conditions through the normal terrain rules',()=>{
    const old=landscape(),active=enableTerrainCells(old);
    const wet=active.tiles.findIndex((tile,i)=>tile.biome==='plains'&&
      terrainCellsIn(active,i)!.some(cell=>cell.waterDepth>=1));
    expect(wet).toBeGreaterThan(0);
    expect(terrainStepEffort(active,wet-1,wet)).toBeGreaterThan(terrainStepEffort(old,wet-1,wet));
    const gains=active.tiles.some((tile,i)=>tile.biome==='plains'&&
      terrainFarmFactor(active,i)>terrainFarmFactor(old,i));
    const losses=active.tiles.some((tile,i)=>tile.biome==='mountain'&&
      terrainFarmFactor(active,i)<terrainFarmFactor(old,i));
    expect(gains&&losses).toBe(true);
  });

  it('round-trips runoff and erosion and resets a painted tile',()=>{
    const old=landscape();
    expect(stepWorld(old).terrainCells).toBeUndefined();
    const active=stepWorld(enableTerrainCells(old)),restored=readSavedWorld(compactWorld(active))!;
    expect(restored.terrainCells).toEqual(active.terrainCells);
    expect(stepWorld(restored).terrainCells).toEqual(stepWorld(active).terrainCells);
    const wet=active.tiles.findIndex((tile,i)=>tile.biome==='plains'&&
      terrainCellsIn(active,i)!.some(cell=>cell.waterDepth>0));
    expect(wet).toBeGreaterThanOrEqual(0);
    const painted=editWorld(restored,wet%active.width,Math.floor(wet/active.width),
      {kind:'terrain',biome:'mountain'});
    expect(terrainCellsIn(painted,wet)!.every(cell=>cell.waterDepth===0&&cell.eroded===0)).toBe(true);
    expect(isWorld(painted)).toBe(true);
    expect(isWorld({...active,terrainCells:{version:1,packed:'4-'}})).toBe(false);
  });
});
