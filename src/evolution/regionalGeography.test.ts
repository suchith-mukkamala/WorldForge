import {describe,expect,it} from 'vitest';
import {createWorld,isWorld,stepWorld} from './engine';
import {atlasRivers} from './atlasTerrain';
import {hydrologyForWorld,riverBanks} from './hydrology';
import {settlementGeography} from './regionalGeography';
import {compactWorld,readSavedWorld} from './storage';
import {terrainFarmFactor} from './terrainPhysics';
import {SEA_LEVEL} from './topography';

const settings={size:'small',seed:321721,layout:'continents',regionalGeography:true} as const;

describe('regional geography',()=>{
  it('builds different relief profiles on the same coastline and keeps them in the save',()=>{
    const classic=createWorld(settings);
    const varied=createWorld({...settings,landforms:'varied'});
    const alpine=createWorld({...settings,landforms:'alpine'});
    const rolling=createWorld({...settings,landforms:'rolling'});
    const heights=(w:typeof varied)=>w.topography!.heights;
    const crest=(w:typeof varied)=>Math.max(...heights(w));
    expect(crest(alpine)).toBeGreaterThan(crest(rolling)+60);
    expect(crest(varied)).toBeGreaterThan(crest(rolling)+35);
    expect(heights(varied)).not.toEqual(heights(classic));
    expect(heights(varied)).toEqual(heights(createWorld({...settings,landforms:'varied'})));
    for(const w of [varied,alpine,rolling]){
      expect(w.tiles.map(t=>t.biome)).toEqual(classic.tiles.map(t=>t.biome));
      expect(heights(w).every((h,i)=>w.tiles[i].biome==='water'?h<SEA_LEVEL:h>=SEA_LEVEL)).toBe(true);
      expect(atlasRivers(hydrologyForWorld(w),false).length).toBeGreaterThan(0);
      expect(readSavedWorld(compactWorld(w))).toEqual(w);
    }
    expect(readSavedWorld(compactWorld(classic))?.settings.landforms).toBeUndefined();
  });

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
