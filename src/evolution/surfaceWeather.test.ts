import {beforeAll,describe,expect,it} from 'vitest';
import {describeWeather,prevailingWind,travelStrainAt,weatherAt,weatherField} from './climate';
import {advanceWorld,createWorld,type World} from './engine';
import {compactWorld,readSavedWorld} from './storage';
import {weatherCloudBanks} from './surfaceClouds';

let world:World;
beforeAll(()=>{
  world=createWorld({seed:41,size:'small',layout:'archipelago',landforms:'varied',
    regionalGeography:true,regionalBiomes:true,riverlands:true,climateEcology:true,
    starting:{human:0,elf:0,dwarf:0,demon:0}});
});

describe('Surface weather fronts',()=>{
  it('keeps neighboring conditions coherent and moves the same band downwind the next day',()=>{
    const seed=41,year=4,wind=prevailingWind(seed);
    const at=(x:number,y:number,day:number)=>weatherAt(.71,.68,day,x,y,seed,year);
    let neighbors=0,storms=0;
    for(let y=0;y<64;y+=2)for(let x=0;x<96;x+=2){
      const kind=at(x,y,44);
      expect(at(x+wind.x*1.45,y+wind.y*1.45,45)).toBe(kind);
      if(at(x+1,y,44)===kind)neighbors++;
      if(kind==='storm')storms++;
    }
    expect(neighbors).toBeGreaterThan(.84*48*32);
    expect(storms).toBeGreaterThan(10);
  });

  it('reconstructs the same weather from existing save data and shares it with the inspector and travel',()=>{
    const dated={...advanceWorld(world,4),dayOfYear:45},rng=dated.rngState;
    const field=weatherField(dated);
    const restored=readSavedWorld(compactWorld(dated))!;
    expect(restored.rngState).toBe(rng);
    expect(weatherField(dated)).toBe(field);
    const forecast=weatherField(restored);
    let storm=-1,clear=-1;
    for(let y=0;y<world.height;y+=2)for(let x=0;x<world.width;x+=2){
      const expected=field.at(x,y),tile=y*world.width+x;
      expect(forecast.at(x,y)).toEqual(expected);
      if(expected.kind==='storm')storm=tile;
      if(expected.kind==='clear')clear=tile;
    }
    expect(storm).toBeGreaterThanOrEqual(0);
    expect(clear).toBeGreaterThanOrEqual(0);
    expect(describeWeather(dated,storm).kind).toBe('storm');
    expect(travelStrainAt(dated,storm)).toBeGreaterThan(travelStrainAt(dated,clear));
    expect(travelStrainAt({...dated,settings:{...dated.settings,climateEcology:false}},storm)).toBe(1);
    expect(weatherField({...dated,dayOfYear:52}).shift).not.toEqual(field.shift);
  });

  it('colors the cloud banks by the weather under them and drifts their centers with the field',()=>{
    const date={...world,year:4,dayOfYear:45},field=weatherField(date);
    const banks=weatherCloudBanks(field);
    expect(weatherCloudBanks(field)).toEqual(banks);
    const next=weatherCloudBanks(weatherField({...date,dayOfYear:46}));
    const climateNames=new Set<string>(),tones=new Set<string>();
    let moving=0;
    for(const bank of banks){
      expect(bank.weather).toBe(field.at(bank.x,bank.y));
      expect(bank.alpha).toBeLessThan(.7);
      climateNames.add(bank.weather.kind);
      tones.add(bank.tone);
      const drift=next.find(cloud=>cloud.key===bank.key);
      if(drift){
        expect(drift.x-bank.x).toBeCloseTo(field.wind.x*1.45,7);
        expect(drift.y-bank.y).toBeCloseTo(field.wind.y*1.45,7);
        moving++;
      }
    }
    expect(moving).toBeGreaterThan(15);
    expect(climateNames.has('storm')).toBe(true);
    expect(tones.has('storm')).toBe(true);
    expect(tones.has('overcast')).toBe(true);
    const winter=weatherCloudBanks(weatherField({...date,dayOfYear:307}));
    expect(winter.some(bank=>bank.weather.kind==='snow'&&bank.tone==='snow')).toBe(true);
  });
});
