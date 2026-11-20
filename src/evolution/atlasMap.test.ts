import {describe,expect,it} from 'vitest';
import {atlasLabelSides,atlasLevel} from './atlasMap';
import {atlasBuildingAt,type AtlasBuilding} from './atlasBuildingArt';
import type {Building} from './construction';

describe('atlas detail and picking',()=>{
  it('reveals buildings before residents',()=>{
    expect([1,2.49,2.5,3.5,4,8].map(atlasLevel))
      .toEqual(['world','world','town','town','street','street']);
  });

  it('leaves crowded pins available without putting text over other pins',()=>{
    const markers=[
      {id:1,name:'Riverwatch',x:15,y:48},
      {id:2,name:'Cinderhold',x:74,y:48},
      {id:3,name:'Ironhollow',x:205,y:77},
      {id:4,name:'Silvanor',x:55,y:48},
    ];
    const sides=atlasLabelSides(markers,{x:275,y:130});
    expect(sides.get(1)).toBeUndefined();
    expect(sides.get(2)).toBe('right');
    expect(sides.get(3)).toBe('left');
    expect(sides.get(4)).toBeUndefined();
  });

  it('picks the topmost building and passes through empty sprite pixels',()=>{
    const place=(id:number,alpha:readonly number[]):AtlasBuilding=>({
      building:{id} as Building,x:10,y:20,scale:2,
      art:{image:{width:2,height:1} as HTMLCanvasElement,
        bounds:{left:0,top:0,right:2,bottom:1},
        pixels:new Uint8ClampedArray(alpha.flatMap(value=>[0,0,0,value]))},
    });
    const rear=place(1,[255,255]),front=place(2,[0,255]);
    expect(atlasBuildingAt([rear,front],10.5,21)?.id).toBe(1);
    expect(atlasBuildingAt([rear,front],12.5,21)?.id).toBe(2);
    expect(atlasBuildingAt([rear,front],14,21)).toBeUndefined();
  });
});
