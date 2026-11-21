import {describe,expect,it} from 'vitest';
import {advanceWorldDays} from './calendar';
import {advanceClimateEcology,enableClimateEcology} from './climateEcology';
import {
  annualGrowthFactor,applyClimateBiomes,climateField,isClimateBiome,orographicMoisture,
  preferredHabitat,prevailingWind,stepToward,successionBiome,weatherAnomaly,weatherAt,
} from './climate';
import {createWorld,isWorld,population,stepWorld,WORLD_SIZES,type Biome,type World} from './engine';
import {terrainStepEffort} from './terrainPhysics';
import {compactWorld,readSavedWorld} from './storage';
import {generateWorldLandscape} from './worldLandscape';
import {initialWoodland,woodlandCover} from './woodland';
import {fitsHabitat,herdDelta,validWildlife} from './wildlife';

const empty={human:0,elf:0,dwarf:0,demon:0};
const geography={
  seed:321721,size:'small' as const,layout:'continents' as const,landforms:'varied' as const,
  regionalGeography:true,regionalBiomes:true,riverlands:true,livingBiomes:true,
  climateEcology:true,resourceLevel:1,wandering:1,interbreeding:true,starting:empty,
};

function settled():World{
  return createWorld(geography);
}

describe('climate, seasons and wildlife',()=>{
  it('dries the lee of a ridge and repeats for the same seed',()=>{
    const seed=17,wind=prevailingWind(seed),width=48,height=36;
    const heights=new Array<number>(width*height).fill(80);
    const base=new Float32Array(width*height).fill(.55);
    const alongX=-wind.y,alongY=wind.x;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const cx=x-width/2,cy=y-height/2;
      const across=cx*wind.x+cy*wind.y;
      const along=cx*alongX+cy*alongY;
      if(Math.abs(along)>height*.45)continue;
      heights[y*width+x]=Math.round(80+Math.exp(-across*across/18)*120);
    }
    const moist=orographicMoisture(width,height,heights,base,seed);
    expect(Array.from(orographicMoisture(width,height,heights,base,seed))).toEqual(Array.from(moist));
    let up=0,upN=0,down=0,downN=0;
    for(let y=2;y<height-2;y++)for(let x=2;x<width-2;x++){
      const cx=x-width/2,cy=y-height/2;
      const across=cx*wind.x+cy*wind.y;
      const along=cx*alongX+cy*alongY;
      if(Math.abs(along)>8)continue;
      const value=moist[y*width+x];
      if(across<-2&&across>-8){up+=value;upN++;}
      if(across>2&&across<8){down+=value;downN++;}
    }
    expect(upN).toBeGreaterThan(10);
    expect(downN).toBeGreaterThan(10);
    expect(up/upN).toBeGreaterThan(down/downN+.04);
  });

  it('builds coherent habitats around rivers, coasts and rain without moving rock or sea',()=>{
    const [width,height]=WORLD_SIZES.small;
    const baseSettings={...geography,climateEcology:false};
    const before=generateWorldLandscape(width,height,baseSettings);
    const after=generateWorldLandscape(width,height,{...baseSettings,climateEcology:true});
    expect(generateWorldLandscape(width,height,baseSettings).biomes).toEqual(before.biomes);
    expect(after.topography.heights).toEqual(before.topography.heights);
    const fixed:Biome[]=['mountain','cave','wasteland','volcanic','water'];
    expect(before.biomes.every((biome,index)=>!fixed.includes(biome)||biome===after.biomes[index]))
      .toBe(true);
    const counts=Object.fromEntries(['plains','forest','taiga','wetland','savanna']
      .map(biome=>[biome,after.biomes.filter(value=>value===biome).length]));
    for(const biome of ['plains','forest','taiga','wetland','savanna'])
      expect(counts[biome]).toBeGreaterThan(40);
    let climate=0,alone=0;
    for(let index=0;index<after.biomes.length;index++){
      if(!isClimateBiome(after.biomes[index]))continue;
      climate++;
      const x=index%width,y=Math.floor(index/width),neighbors:Biome[]=[];
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]] as const){
        const nx=x+dx,ny=y+dy;
        if(nx<0||ny<0||nx>=width||ny>=height)continue;
        neighbors.push(after.biomes[ny*width+nx]);
      }
      if(neighbors.length&&neighbors.every(biome=>biome!==after.biomes[index]))alone++;
    }
    expect(alone/climate).toBeLessThan(.03);
    const field=climateField({width,height,
      tiles:after.biomes.map(biome=>({biome,food:1})),
      settings:{...geography,seed:geography.seed},topography:after.topography});
    let wet=0,wetN=0,dry=0,dryN=0;
    for(let index=0;index<after.biomes.length;index++){
      const soaked=(field.coast[index]<=2?1:0)+(field.banks[index]>.2?1:0)+(field.channel[index]>0?1:0);
      if(after.biomes[index]==='wetland'){wet+=soaked;wetN++;}
      if(after.biomes[index]==='savanna'){dry+=soaked;dryN++;}
    }
    expect(wet/wetN).toBeGreaterThan(dry/dryN);
  });

  it('marshes a gentle shore and keeps a sea cliff',()=>{
    const width=18,height=12;
    const biomes:Biome[]=Array.from({length:width*height},(_,index)=>{
      const x=index%width,y=Math.floor(index/width);
      return x===0||y===0||x===width-1||y===height-1?'water':'plains';
    });
    const heights=biomes.map((biome,index)=>{
      if(biome==='water')return 39;
      return index%width<8?58:168;
    });
    const shaped=applyClimateBiomes(width,height,biomes,heights,5,true);
    let beach=0,beachWet=0,cliff=0,cliffWet=0;
    for(let index=0;index<shaped.length;index++){
      const x=index%width,y=Math.floor(index/width);
      if(y!==1||biomes[index]==='water')continue;
      if(x>1&&x<6){beach++;if(shaped[index]==='wetland')beachWet++;}
      if(x>10&&x<16){cliff++;if(shaped[index]==='wetland')cliffWet++;}
    }
    expect(beach).toBeGreaterThan(0);
    expect(cliff).toBeGreaterThan(0);
    expect(beachWet/beach).toBeGreaterThan(.5);
    expect(cliffWet).toBe(0);
  });

  it('steps habitats one climate at a time and leaves towns alone',()=>{
    expect(stepToward('taiga','savanna')).toBe('forest');
    expect(stepToward('plains','wetland')).toBe('forest');
    expect(stepToward('savanna','plains')).toBe('plains');
    expect(stepToward('forest','taiga')).toBe('taiga');
    const [width,height]=WORLD_SIZES.small;
    const landscape=generateWorldLandscape(width,height,geography);
    const tiles=landscape.biomes.map(biome=>({biome,food:5}));
    const world={width,height,tiles,topography:landscape.topography,year:0,
      settings:geography,settlements:[],transport:{roads:[],bridges:[]}} as unknown as World;
    const field=climateField(world);
    const heights=landscape.topography.heights;
    const index=tiles.findIndex((_,at)=>preferredHabitat(field,at,width,height,heights)==='savanna');
    expect(index).toBeGreaterThanOrEqual(0);
    tiles[index]={biome:'taiga',food:5};
    world.year=((index%5)+5)%5;
    const next=successionBiome('taiga',field,index,width,height,heights);
    expect(next?.biome).toBe('forest');
    world.settlements=[{id:1,species:'human',name:'Hold',x:index%width,
      y:Math.floor(index/width),founded:0,population:0,stores:0,emptyYears:0}];
    advanceClimateEcology(world);
    expect(tiles[index].biome).toBe('taiga');
    world.settlements=[];
    advanceClimateEcology(world);
    expect(tiles[index].biome).toBe('forest');
  });

  it('makes cold years and droughts less generous than mild wet years',()=>{
    let harsh=1,mild=0,harshFactor=1,mildFactor=0;
    for(let year=0;year<40;year++){
      const anomaly=weatherAnomaly(5,year,0,0);
      const winter=annualGrowthFactor('taiga',.32,.5,5,year,0,0);
      if(anomaly<-.64&&winter<harshFactor){harshFactor=winter;harsh=year;}
      if(anomaly>.72&&winter>mildFactor){mildFactor=winter;mild=year;}
    }
    expect(harsh).not.toBe(mild);
    expect(mildFactor).toBeGreaterThan(harshFactor);
    expect(annualGrowthFactor('savanna',.7,.25,5,harsh,0,0))
      .toBeLessThan(annualGrowthFactor('forest',.5,.6,5,mild,0,0));
    let snow=false,drought=false;
    for(let x=0;x<40;x++){
      if(weatherAt(.2,.6,300,x,4,9,2)==='snow')snow=true;
      if(weatherAt(.75,.2,140,x,4,9,2)==='drought')drought=true;
    }
    expect(snow).toBe(true);
    expect(drought).toBe(true);
    expect(herdDelta('grazer',-1,true,.45,28)).toBeLessThan(0);
    expect(herdDelta('grazer',1,true,1.2,16)).toBeGreaterThan(0);
    expect(herdDelta('fish',0,true,1,20)).toBeGreaterThanOrEqual(0);
    expect(herdDelta('browser',-1,false,.4,24)).toBeLessThan(0);
  });

  it('keeps older worlds on the previous rules and saves the new herds',()=>{
    const legacy=createWorld({seed:11,size:'small',starting:empty});
    expect(legacy.settings.climateEcology).toBeUndefined();
    expect(legacy.wildlife).toBeUndefined();
    const once=stepWorld(legacy);
    expect(once.wildlife).toBeUndefined();
    expect(stepWorld(legacy)).toEqual(once);
    const enabled=enableClimateEcology(legacy);
    expect(enabled.tiles).toEqual(legacy.tiles);
    expect(enabled.rngState).toBe(legacy.rngState);
    expect(enabled.agents).toEqual(legacy.agents);
    expect(enabled.wildlife?.length).toBeGreaterThan(0);
    expect(isWorld({...legacy,settings:{...legacy.settings,climateEcology:'yes' as unknown as boolean}}))
      .toBe(false);
    expect(isWorld({...legacy,wildlife:[{kind:'fish',index:0,size:4}]})).toBe(true);
    expect(validWildlife([{kind:'nope',index:0,size:4}],legacy.tiles.length)).toBe(false);

    const world=settled();
    expect(world.wildlife?.some(herd=>herd.kind==='fish')).toBe(true);
    expect(world.wildlife?.every(herd=>fitsHabitat(herd.kind,world.tiles[herd.index].biome))).toBe(true);
    const restored=readSavedWorld(compactWorld(world));
    expect(restored?.settings.climateEcology).toBe(true);
    expect(restored?.wildlife).toEqual(world.wildlife);
    expect(restored?.tiles.map(tile=>tile.biome)).toEqual(world.tiles.map(tile=>tile.biome));
    const again=stepWorld(world);
    expect(stepWorld(world)).toEqual(again);
    expect(again.wildlife?.every(herd=>fitsHabitat(herd.kind,again.tiles[herd.index].biome))).toBe(true);
    const quiet=stepWorld({...world,wildlife:[]});
    const eaten=world.wildlife!.some(herd=>herd.kind!=='fish');
    expect(eaten).toBe(true);
    const stock=(value:World)=>value.tiles.reduce((sum,tile)=>sum+tile.food,0);
    expect(stock(again)).toBeLessThan(stock(quiet));
    const [width]=WORLD_SIZES.small;
    const field=climateField(again);
    const snow=again.tiles.findIndex((_,index)=>{
      const next=index+1<again.tiles.length&&index%width<width-1?index+1:-1;
      if(next<0)return false;
      return weatherAt(field.temperature[next],field.moisture[next],300,
        next%width,Math.floor(next/width),world.settings.seed,again.year)==='snow'&&
        weatherAt(field.temperature[next],field.moisture[next],140,
          next%width,Math.floor(next/width),world.settings.seed,again.year)==='clear';
    });
    expect(snow).toBeGreaterThanOrEqual(0);
    const winter={...again,dayOfYear:300},summer={...again,dayOfYear:140};
    expect(terrainStepEffort(winter,snow,snow+1)).toBeGreaterThan(terrainStepEffort(summer,snow,snow+1));
    const populated=createWorld({...geography,seed:77,starting:{human:8,elf:8,dwarf:8,demon:8}});
    expect(population(populated)).toEqual({human:8,elf:8,dwarf:8,demon:8});
    expect(populated.agents.every(agent=>populated.tiles[agent.y*populated.width+agent.x].biome!=='water'))
      .toBe(true);
    const december={...world,dayOfYear:363};
    expect(advanceWorldDays(december,2).settings.climateEcology).toBe(true);
  });

  it('updates canopy when a mismatched stand succeeds',()=>{
    const [width,height]=WORLD_SIZES.small;
    const landscape=generateWorldLandscape(width,height,geography);
    const tiles=landscape.biomes.map(biome=>({biome,food:4}));
    const world={width,height,tiles,topography:landscape.topography,year:0,
      settings:geography,settlements:[],transport:{roads:[],bridges:[]}} as unknown as World;
    world.woodland=initialWoodland(world);
    const field=climateField(world);
    const heights=landscape.topography.heights;
    const index=tiles.findIndex((_,at)=>preferredHabitat(field,at,width,height,heights)==='savanna');
    tiles[index]={biome:'taiga',food:4};
    world.year=((index%5)+5)%5;
    advanceClimateEcology(world);
    expect(tiles[index].biome).toBe('forest');
    expect(woodlandCover(world.woodland,index)).toBe(1);
  });
});
