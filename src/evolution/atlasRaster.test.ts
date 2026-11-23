import {describe,expect,it} from 'vitest';
import {closeAtlasCrop,cropContains,cropTileAt,type RasterCrop} from './atlasRaster';
import {orderedDepthTiles,paintDepthBackdrop,type BackdropWorld} from './depthBackdrop';
import {createDepthProjector} from './depthProjection';
import type {DepthPicking} from './depthTerrain';
import {DEFAULT_SETTINGS} from './engine';
import {prepareRealmRelief,rasterizeRealm} from './realmRelief';
import {stackedProjection} from './stackedProjection';
import {RealmBiome,type RealmMap} from './underworld';

function rasterWindow({width,height}:RasterCrop):DepthPicking{
  return {width,height,ids:new Uint32Array(width*height)};
}

function matchesWindow(full:DepthPicking,local:DepthPicking,crop:RasterCrop,
  fullPixels:Uint32Array,localPixels:Uint32Array){
  let visible=0,differentTiles=0,differentColors=0;
  for(let y=0;y<crop.height;y++)for(let x=0;x<crop.width;x++){
    const i=y*crop.width+x,original=(y+crop.top)*full.width+x+crop.left;
    if(local.ids[i])visible++;
    if(full.ids[original]!==local.ids[i])differentTiles++;
    if(fullPixels[original]!==localPixels[i])differentColors++;
  }
  expect(visible).toBeGreaterThan(100);
  expect({differentTiles,differentColors}).toEqual({differentTiles:0,differentColors:0});
}

describe('Atlas close-up raster',()=>{
  it('keeps the buffer bounded and reuses it through a short pan',()=>{
    const size={width:2200,height:1500};
    const sheet={left:-8100,top:-2100,width:22_000,height:15_000};
    const view={left:0,top:0,width:3840,height:2160};
    const first=closeAtlasCrop(size,sheet,view,2,1.55)!;
    expect(first.crop.width*first.crop.height).toBeLessThan(1_850_000);
    expect(cropContains(first.crop,first.visible)).toBe(true);
    const near=closeAtlasCrop(size,{...sheet,left:sheet.left-20},view,2,1.55)!;
    const far=closeAtlasCrop(size,{...sheet,left:sheet.left-150},view,2,1.55)!;
    expect(cropContains(first.crop,near.visible)).toBe(true);
    expect(cropContains(first.crop,far.visible)).toBe(false);
    expect(closeAtlasCrop(size,{...size,left:0,top:0},view,1,1.55)).toBeUndefined();
    expect(closeAtlasCrop(size,{...sheet,top:view.height+10},view,2,1.55)).toBeUndefined();
  });

  it('converts absolute atlas coordinates into the cropped picking buffer',()=>{
    const crop={left:84,top:105,width:3,height:2,density:4.25};
    const hit={...rasterWindow(crop),ids:Uint32Array.of(0,4,5,2,7,6)};
    expect(cropTileAt(crop,hit,{x:85.5/crop.density,y:106.5/crop.density})).toBe(6);
    expect(cropTileAt(crop,hit,{x:84.5/crop.density,y:105.5/crop.density})).toBe(-1);
    expect(cropTileAt(crop,hit,{x:87.5/crop.density,y:105.5/crop.density})).toBeUndefined();
  });

  it('draws and picks the same Surface squares and terraces inside the window',()=>{
    const width=10,height=8;
    const heights=Array.from({length:width*height},(_,i)=>i<20?46:65+(i*17)%76);
    const world:BackdropWorld={width,height,settings:DEFAULT_SETTINGS,
      tiles:heights.map((_,i)=>({biome:i<20?'water':i%6===0?'forest':'plains',food:0})),
      topography:{version:1,heights}};
    const draw=(crop:RasterCrop,projector:ReturnType<typeof createDepthProjector>)=>{
      const hit=rasterWindow(crop),pixels=new Uint32Array(hit.ids.length);
      const context={
        createImageData:(w:number,h:number)=>({data:new Uint8ClampedArray(w*h*4)}),
        putImageData:(image:ImageData)=>pixels.set(new Uint32Array(image.data.buffer)),
      } as unknown as CanvasRenderingContext2D;
      paintDepthBackdrop(context,hit,world,projector,crop.density,
        orderedDepthTiles(world,projector,true),undefined,1,true,crop);
      return {hit,pixels};
    };
    for(const yaw of [0,90,225]){
      const projector=createDepthProjector(world,1,{yaw,pitch:32},heights),density=2.75;
      const full={left:0,top:0,width:Math.ceil(projector.size.width*density),
        height:Math.ceil(projector.size.height*density),density};
      const crop={left:Math.floor(full.width*.38),top:Math.floor(full.height*.34),width:150,height:180,density};
      const reference=draw(full,projector),patch=draw(crop,projector);
      matchesWindow(reference.hit,patch.hit,crop,reference.pixels,patch.pixels);
    }
  });

  it('draws the same cave floor, cliff colors, and rock in a rotated window',()=>{
    const width=10,height=8,count=width*height;
    const map:RealmMap={width,height,seed:41,towns:[],links:[],houses:new Map(),
      roads:new Set(),fords:new Set(),bridges:new Set(),
      biomes:Uint8Array.from({length:count},(_,i)=>i<20?RealmBiome.sea:
        i%4===0?RealmBiome.crystal:i%5===0?RealmBiome.lava:RealmBiome.basalt),
      heights:Uint8Array.from({length:count},(_,i)=>i<20?3:5+(i*7)%13)};
    const terrain=prepareRealmRelief(map),density=3.25;
    for(const yaw of [0,90,225]){
      const {lower:projection}=stackedProjection({width:15,height:12},map,{yaw,pitch:32},18);
      const full={left:0,top:0,width:Math.ceil(projection.width*density),
        height:Math.ceil(projection.height*density),density};
      const crop={left:Math.floor(full.width*.38),top:Math.floor(full.height*.45),width:145,height:225,density};
      const reference=rasterizeRealm({id:1,projection,crop:full},terrain);
      const patch=rasterizeRealm({id:2,projection,crop},terrain);
      matchesWindow(reference.hit,patch.hit,crop,reference.pixels,patch.pixels);
    }
  });
});
