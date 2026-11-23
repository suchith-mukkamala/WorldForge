import {describe,expect,it} from 'vitest';
import {createDepthProjector} from './depthProjection';
import {rasterFace} from './depthTerrain';
import {treeCovers} from './worldTreeOcclusion';
import {CONTACT_SHADE,footShadowRect,insetEdge,RIM_LIGHT,stampSegment,
  waterCrest} from './depthForm';
import {shadeTerrainPixel,terrainPixel} from './terrainCellArt';

describe('depth presentation',()=>{
  it('keeps the nearer surface when tree and scenery overlap the same pixel',()=>{
    const surface={width:2,height:2};
    const square=[{x:0,y:0},{x:2,y:0},{x:2,y:2},{x:0,y:2}];
    const pixels=new Uint32Array(4),values=new Float32Array(4).fill(-Infinity);
    rasterFace(surface,square,pixels,1,undefined,0,{values,origin:4,dx:-2,dy:0});
    rasterFace(surface,square,pixels,2,undefined,0,{values,origin:2,dx:0,dy:0});
    expect([...pixels]).toEqual([1,2,1,2]);
    const art={image:surface as HTMLCanvasElement,pixels:new Uint8ClampedArray(16),depth:values,
      bounds:{left:0,top:0,right:2,bottom:2}};
    const tree={sprite:{art,x:20.3,y:11,scale:.5},order:10};
    expect(treeCovers(tree,20.25,11.25,11.2)).toBe(true);
    expect(treeCovers(tree,20.75,11.25,11.2)).toBe(false);
    expect(treeCovers(tree,21.25,11.25,0)).toBe(false);
  });

  it('lights a lip and shades a contact from the same pixel',()=>{
    const base=terrainPixel('#7a9b75');
    const rim=shadeTerrainPixel(base,RIM_LIGHT);
    const contact=shadeTerrainPixel(base,CONTACT_SHADE);
    expect(rim&255).toBeGreaterThan(base&255);
    expect(contact&255).toBeLessThan(base&255);
    expect(RIM_LIGHT).toBeGreaterThan(1);
    expect(CONTACT_SHADE).toBeLessThan(1);
  });

  it('insets an edge toward the tile center and stamps only that face',()=>{
    expect(insetEdge(0,0,10,0,5,5,1)).toEqual({ax:0,ay:1,bx:10,by:1});
    const pixels=new Uint32Array(8*8);
    pixels.fill(4);
    pixels[1]=9;
    stampSegment(pixels,8,8,0,0,3,0,2,4);
    expect(pixels[0]).toBe(2);
    expect(pixels[3]).toBe(2);
    expect(pixels[1]).toBe(9);
    stampSegment(pixels,8,8,0,2,0,2,7);
    expect(pixels[2*8]).toBe(7);
  });

  it('keeps water glints sparse and stable',()=>{
    let marks=0;
    for(let y=0;y<160;y++)for(let x=0;x<160;x++)if(waterCrest(9,x,y))marks++;
    expect(marks).toBeGreaterThan(4);
    expect(marks).toBeLessThan(40);
    expect(waterCrest(9,1,8)).toBe(0);
    expect(waterCrest(9,4,5)).toBe(waterCrest(9,4,5));
  });

  it('grounds only sprites tall enough to need a contact shadow',()=>{
    expect(footShadowRect({left:0,top:0,right:10,bottom:5})).toBeUndefined();
    expect(footShadowRect({left:0,top:0,right:20,bottom:30})).toEqual({x:6,y:29,w:8,h:2});
  });

  it('fits terrain elevations at every angle and reserves airspace when islands are shown',()=>{
    const ground={width:40,height:32};
    const heights=Array<number>(ground.width*ground.height).fill(39);heights[16*ground.width+20]=253;
    const plain=createDepthProjector(ground,2.5,undefined,heights);
    expect(plain.size.height).toBeLessThan(createDepthProjector(ground,2.5).size.height);
    for(const yaw of [0,45,90,135,180,225,270,315])for(const pitch of [18,30,55]){
      const frame=createDepthProjector(ground,4,{yaw,pitch},heights);
      for(const [x,y] of [[0,0],[20,16],[39,31]])for(const p of frame.tileCorners(x,y,heights[y*40+x])){
        expect(p.y).toBeGreaterThanOrEqual(20);
        expect(p.y).toBeLessThan(frame.size.height-20);
      }
    }
    expect(plain.skyBand).toBeGreaterThan(20);
    expect(plain.skyBand).toBeLessThan(plain.size.height);
    const lifted=createDepthProjector({...ground,skylands:[{
      id:1,spill:0,islands:[{x:1,y:1,rx:2,ry:2,height:520,depth:8,seed:3,terrain:'grove'}],
    }]},2.5,undefined,heights);
    expect(lifted.skyBand).toBeGreaterThan(plain.skyBand);
    expect(lifted.size.height).toBeGreaterThan(plain.size.height);
  });
});
