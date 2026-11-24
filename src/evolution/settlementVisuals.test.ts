import {describe,expect,it,vi} from 'vitest';
import {buildingSiteClear,type Building} from './construction';
import {buildingVisualScale,depthRenderDensity,depthSceneryDensity,
  DEPTH_PERSON_SIZE,paintDepthPerson}
  from './depthSprites';
import {uncrowdedDistrictBuildings} from './depthPerformance';
import {createWorld} from './engine';
import {depthBlockView} from './blockScenery';

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
    const homes=Array.from({length:45},(_,i)=>{
      const x=100+i%9*2,y=90+Math.floor(i/9)*2;
      return {building:residence(i+1,3+i%9,4+Math.floor(i/9)),x,y,
        bounds:{left:x-5,top:y-10,right:x+5,bottom:y+2}};
    });
    const project={building:{...residence(99,9,9),stage:'foundation' as const,
      type:'workshop' as const},x:107,y:93,bounds:{left:102,top:89,right:112,bottom:95}};
    const drawn=uncrowdedDistrictBuildings([...homes,project]);
    expect(drawn.length).toBeLessThan(homes.length/2);
    expect(drawn.some(e=>e.building.id===99)).toBe(true);
    expect(uncrowdedDistrictBuildings([...homes,project]).map(e=>e.building.id))
      .toEqual(drawn.map(e=>e.building.id));
    const neighbor={...homes[0],bounds:{left:99,top:81,right:110,bottom:91}};
    expect(uncrowdedDistrictBuildings([neighbor,project])).toHaveLength(2);
  });

  it('resolves source pixels at close zoom without enlarging world footprints',()=>{
    const size={width:650,height:480};
    expect(depthRenderDensity(1,size)).toBe(2);
    expect(depthRenderDensity(2,size)).toBe(3);
    expect(depthRenderDensity(4,size)).toBe(5);
    expect(depthRenderDensity(6,size)).toBe(7);
    expect(depthRenderDensity(8,{width:2000,height:2000})).toBe(2);
    expect(depthSceneryDensity(1,size)).toBe(2);
    expect(depthSceneryDensity(4,size)).toBe(5);
    expect(depthSceneryDensity(6,{width:2000,height:2000})).toBe(1);
    expect(depthSceneryDensity(4,{width:1000,height:1000})).toBe(3);
    expect(DEPTH_PERSON_SIZE).toEqual({width:3,height:5});
  });

  it('keeps fractional walking positions in the high-resolution sprite layer',()=>{
    const agent=createWorld({seed:91,size:'small'}).agents[0];
    const makeCanvas=vi.fn(()=>{
      const canvas={width:0,height:0};
      return {...canvas,getContext(){return {canvas:this,
        createImageData:(width:number,height:number)=>({width,height,data:new Uint8ClampedArray(width*height*4)}),
        putImageData:()=>{},
      };}};
    });
    vi.stubGlobal('document',{createElement:makeCanvas});
    const args:number[][]=[],view=depthBlockView({yaw:18,pitch:30});
    const ctx={imageSmoothingEnabled:true,fillRect:()=>{},
      drawImage:(_image:HTMLCanvasElement,...coords:number[])=>args.push(coords),
    } as unknown as CanvasRenderingContext2D;
    try{
      paintDepthPerson(ctx,agent,{x:12.25,y:17.75},true,false,view,'east',1);
      paintDepthPerson(ctx,agent,{x:12.50,y:17.875},true,false,view,'east',1);
    }finally{vi.unstubAllGlobals();}
    expect(makeCanvas).toHaveBeenCalledTimes(1);
    expect(args).toHaveLength(2);
    expect(args[1][0]-args[0][0]).toBeCloseTo(.25);
    expect(args[1][1]-args[0][1]).toBeCloseTo(.125);
    expect(args[1].slice(2)).toEqual(args[0].slice(2));
    expect(ctx.imageSmoothingEnabled).toBe(false);
  });
});
