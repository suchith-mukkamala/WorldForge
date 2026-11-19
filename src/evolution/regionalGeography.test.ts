import {describe,expect,it} from 'vitest';
import {createWorld,isWorld,stepWorld} from './engine';
import {atlasRivers} from './atlasTerrain';
import {hydrologyForWorld,riverBanks} from './hydrology';
import {settlementGeography} from './regionalGeography';
import {compactWorld,readSavedWorld} from './storage';
import {terrainFarmFactor} from './terrainPhysics';

const settings={size:'small',seed:321721,layout:'continents',regionalGeography:true} as const;

describe('regional geography',()=>{
  it('connects inland headwaters to lower ground and persists its seed and elevation',()=>{
    const world=createWorld(settings),drainage=hydrologyForWorld(world);
    const heads=atlasRivers(drainage,true).filter(link=>world.topography!.heights[link.from]>=108);
    expect(heads.length).toBeGreaterThan(0);
    for(const {from} of heads){
      let i=from;
      while(drainage.flowTo[i]>=0){
        const next=drainage.flowTo[i];
        expect(drainage.catchment[next]).toBeGreaterThan(drainage.catchment[i]);
        i=next;
      }
      expect(world.tiles[i].biome).toBe('water');
      expect(world.topography!.heights[i]).toBeLessThan(world.topography!.heights[from]);
    }
    expect(world.topography).toEqual(createWorld(settings).topography);
    expect(readSavedWorld(compactWorld(world))).toEqual(world);
  });

  it('irrigates land beside the channel and recognizes distinct town sites',()=>{
    const world=createWorld(settings),drainage=hydrologyForWorld(world);
    const oldRules={...world,settings:{...world.settings,regionalGeography:false}};
    const former=hydrologyForWorld(oldRules),wet=riverBanks(drainage,world.width,world.height);
    const farm=world.tiles.findIndex((t,i)=>t.biome==='plains'&&wet[i]>.35&&
      drainage.channel[i]===0&&former.channel[i]===0);
    expect(farm).toBeGreaterThanOrEqual(0);
    expect(terrainFarmFactor(world,farm)).toBeGreaterThan(terrainFarmFactor(oldRules,farm));
    const landforms=new Set(world.tiles.flatMap((tile,i)=>tile.biome==='water'?[]:
      [settlementGeography(world,i).landform]));
    expect(landforms).toContain('Sheltered harbor');
    expect(landforms).toContain('River crossing');
    expect(landforms).toContain('Fertile valley');
  });

  it('lets real communities found towns on favorable sites near their residents',()=>{
    let world=createWorld({...settings,livingBiomes:true});
    let usedLandform=false;
    for(let year=0;year<24;year++){
      world=stepWorld(world);
      for(const town of world.settlements.filter(s=>s.founded===world.year)){
        const record=world.codex!.settlements.find(s=>s.id===town.id);
        const founder=world.agents.find(a=>a.id===record?.founderId);
        if(!founder||!settlementGeography(world,town.y*world.width+town.x).landform)continue;
        const offset=Math.max(Math.abs(town.x-founder.x),Math.abs(town.y-founder.y));
        if(offset>0&&offset<=2)usedLandform=true;
      }
    }
    expect(usedLandform).toBe(true);
    expect(isWorld(world)).toBe(true);
  });
});
