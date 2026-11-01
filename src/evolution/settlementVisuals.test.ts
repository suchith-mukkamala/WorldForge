import {describe,expect,it} from 'vitest';
import {buildingSiteClear,type Building} from './construction';
import {buildingVisualScale,depthRenderDensity,depthSceneryDensity,
  DEPTH_PERSON_SIZE,paintDepthPerson}
  from './depthSprites';
import {uncrowdedDistrictBuildings} from './depthPerformance';
import {createWorld} from './engine';
import {spriteKey} from './pixelArt';

const residence=(id:number,x:number,y:number):Building=>({
  id,x,y,type:'house',culture:'human',stage:'complete',progress:100,
  condition:100,started:0,spent:{wood:0,stone:0,clay:0},labor:0,
});

describe('v2.4.4 — readable settlements and close-up mortals',()=>{
  it('keeps new house lots apart and reserves a civic center',()=>{
    const center={x:10,y:10};
    const buildings=[residence(1,12,10),residence(2,14,14)];
    expect(buildingSiteClear({x:10,y:10},'house',[],center)).toBe(false);
    expect(buildingSiteClear({x:13,y:10},'house',buildings,center))
      .toBe(false);
    expect(buildingSiteClear({x:12,y:11},'house',buildings,center))
      .toBe(false);
    expect(buildingSiteClear({x:14,y:10},'house',buildings,center))
      .toBe(true);
    expect(buildingSiteClear({x:14,y:12},'communal',buildings,center))
      .toBe(false);
    expect(buildingSiteClear({x:5,y:5},'communal',buildings,center))
      .toBe(true);
  });

  it('draws homes substantially smaller than civic buildings',()=>{
    expect(buildingVisualScale('house')).toBeLessThan(.65);
    expect(buildingVisualScale('shelter')).toBe(buildingVisualScale('house'));
    expect(buildingVisualScale('communal')).toBeGreaterThan(
      buildingVisualScale('house'));
  });

  it('declutters existing saves while keeping priority projects visible',()=>{
    const homes=Array.from({length:45},(_,i)=>({
      building:residence(i+1,3+i%9,4+Math.floor(i/9)),
      x:100+i%9*2,y:90+Math.floor(i/9)*2,
    }));
    const project={building:{...residence(99,9,9),stage:'foundation' as const,
      type:'workshop' as const},x:107,y:93};
    const drawn=uncrowdedDistrictBuildings([...homes,project]);
    expect(drawn.length).toBeLessThan(homes.length/2);
    expect(drawn.some(e=>e.building.id===99)).toBe(true);
    expect(uncrowdedDistrictBuildings([...homes,project]).map(e=>e.building.id))
      .toEqual(drawn.map(e=>e.building.id));
  });

  it('resolves source pixels at close zoom without enlarging world footprints',()=>{
    const size={width:650,height:480};
    expect(depthRenderDensity(1,size)).toBe(1);
    expect(depthRenderDensity(2,size)).toBe(2);
    expect(depthRenderDensity(4,size)).toBe(4);
    expect(depthRenderDensity(6,size)).toBe(6);
    expect(depthRenderDensity(8,{width:2000,height:2000})).toBe(2);
    expect(depthSceneryDensity(1,size)).toBe(1);
    expect(depthSceneryDensity(4,size)).toBe(4);
    expect(depthSceneryDensity(6,{width:2000,height:2000})).toBe(1);
    expect(depthSceneryDensity(4,{width:1000,height:1000})).toBe(2);
    expect(DEPTH_PERSON_SIZE).toEqual({width:2,height:3});
  });

  it('keeps fractional walking positions in the high-resolution sprite layer',()=>{
    const agent=createWorld({seed:91,size:'small'}).agents[0];
    const sprite={} as HTMLCanvasElement;
    const cached=new Map([[spriteKey(agent)+':south:idle',sprite]]);
    const args:number[][]=[];
    const ctx={imageSmoothingEnabled:true,
      drawImage:(_image:HTMLCanvasElement,...coords:number[])=>args.push(coords),
    } as unknown as CanvasRenderingContext2D;
    paintDepthPerson(ctx,agent,{x:12.25,y:17.75},false,false,cached);
    expect(args).toEqual([[11.25,15.75,2,3]]);
    expect(ctx.imageSmoothingEnabled).toBe(false);
  });
});
