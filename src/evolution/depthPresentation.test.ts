import {describe,expect,it} from 'vitest';
import {ATLAS_SEA} from './atlasTerrain';
import {createDepthProjector} from './depthProjection';
import {CLOUD_COLORS,GULL_LIGHT,GULL_SHADE,mixHex,paintDepthSky,skyColor,
  skyStamps,SKY_HAZE} from './depthSky';
import {CONTACT_SHADE,footShadowRect,insetEdge,RIM_LIGHT,stampSegment,
  waterCrest} from './depthForm';
import {shadeTerrainPixel,terrainPixel} from './terrainCellArt';

describe('depth presentation',()=>{
  it('mixes existing sea and haze without leaving hex range',()=>{
    expect(mixHex(ATLAS_SEA,SKY_HAZE,0)).toBe(ATLAS_SEA);
    expect(mixHex(ATLAS_SEA,SKY_HAZE,1)).toBe(SKY_HAZE);
    expect(mixHex('#102737','#e7f3ff',.5)).toBe('#7c8d9b');
    expect(mixHex(ATLAS_SEA,SKY_HAZE,-2)).toBe(ATLAS_SEA);
    expect(mixHex(ATLAS_SEA,SKY_HAZE,4)).toBe(SKY_HAZE);
  });

  it('keeps the sky in the current sea family and meets the ocean fill',()=>{
    const band=48;
    expect(skyColor(band,band)).toBe(ATLAS_SEA);
    expect(skyColor(0,band)).not.toBe(ATLAS_SEA);
    const top=terrainPixel(skyColor(0,band));
    const sea=terrainPixel(ATLAS_SEA);
    expect(top&255).toBeGreaterThan(sea&255);
    let previous=skyColor(0,band),changes=0;
    for(let row=1;row<band;row++){
      const color=skyColor(row,band);
      if(color!==previous)changes++;
      previous=color;
    }
    expect(changes).toBeGreaterThan(1);
    expect(changes).toBeLessThan(10);
  });

  it('places clouds and gulls inside the headroom using existing highlights',()=>{
    const stamps=skyStamps(104729,900,80);
    expect(stamps.length).toBeGreaterThan(6);
    expect(skyStamps(104729,900,80)).toEqual(stamps);
    const allowed=new Set<string>([...CLOUD_COLORS,GULL_LIGHT,GULL_SHADE]);
    for(const stamp of stamps){
      expect(allowed.has(stamp.color)).toBe(true);
      expect(stamp.x).toBeGreaterThanOrEqual(0);
      expect(stamp.y).toBeGreaterThanOrEqual(0);
      expect(stamp.y).toBeLessThan(80);
      expect(stamp.w).toBeGreaterThan(0);
    }
    expect(skyStamps(1,8,4)).toEqual([]);
  });

  it('paints a deterministic sky band and leaves the rows beneath it',()=>{
    const width=32,height=20,pixels=new Uint32Array(width*height);
    pixels.fill(1);
    paintDepthSky(pixels,width,height,7,6);
    expect(pixels[0]).toBe(terrainPixel(skyColor(0,6)));
    expect(pixels[5*width]).toBe(terrainPixel(skyColor(5,6)));
    expect(pixels[6*width]).toBe(1);
    const again=new Uint32Array(width*height);
    again.fill(1);
    paintDepthSky(again,width,height,7,6);
    expect(again).toEqual(pixels);
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

  it('reserves a sky band inside the canvas and raises it for taller islands',()=>{
    const plain=createDepthProjector({width:6,height:5},2.5);
    expect(plain.skyBand).toBeGreaterThan(20);
    expect(plain.skyBand).toBeLessThan(plain.size.height);
    const lifted=createDepthProjector({width:6,height:5,skylands:[{
      id:1,spill:0,islands:[{x:1,y:1,rx:2,ry:2,height:520,depth:8,seed:3,terrain:'grove'}],
    }]},2.5);
    expect(lifted.skyBand).toBeGreaterThan(plain.skyBand);
    expect(lifted.size.height).toBeGreaterThan(plain.size.height);
  });
});
