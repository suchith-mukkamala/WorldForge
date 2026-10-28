import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {advanceWorldDays} from './calendar';
import {createWorld,editWorld} from './engine';
import {hydrologyForWorld} from './hydrology';
import {MapLayerLegend} from './MapLayerLegend';
import {compactWorld,readSavedWorld} from './storage';
import {buildTerrainDetailAtlas,paintTerrainDetail,
  paintTerrainDetailFromAtlas,terrainDetailAt,type TerrainDetail,
  type TerrainMotif} from './terrainDetails';
import {topographyForWorld} from './topography';
import {sceneryZoomTier,type MapOverlay} from './WorldCanvas';

describe('v1.9.5 — polished, economical, compatible rendering',()=>{
  it('rasterizes every atlas sprite with exactly the legacy painter pixels',()=>{
    type Pixel=string|null;
    const pixels=new Map<string,string>();
    let painted=0;
    const canvas={width:0,height:0,getContext:()=>atlasPainter};
    const atlasPainter={fillStyle:'',fillRect(x:number,y:number,w:number,h:number){
      painted++;
      for(let row=y;row<y+h;row++)for(let col=x;col<x+w;col++)
        pixels.set(col+','+row,String(atlasPainter.fillStyle));
    }} as unknown as CanvasRenderingContext2D;
    expect(buildTerrainDetailAtlas(canvas as unknown as HTMLCanvasElement)).toBe(true);
    expect(canvas.height).toBe(6);
    expect(canvas.width).toBe(17*4*6);
    expect(painted).toBeGreaterThan(17*4);
    const motifs:TerrainMotif[]=['oak','pine','fern','grass','flowers',
      'pebbles','reeds','boulder','scree','snowstone','crystal','stalagmite',
      'scrub','basalt','embers','ripples','shorefoam','none'];
    for(const motif of motifs)for(const variant of [0,1,2,3] as const){
      const detail:TerrainDetail={motif,variant};
      const direct:Pixel[]=Array(36).fill(null);
      const directPainter={fillStyle:'',fillRect(x:number,y:number,w:number,h:number){
        for(let row=y;row<y+h;row++)for(let col=x;col<x+w;col++)
          direct[row*6+col]=String(directPainter.fillStyle);
      }} as unknown as CanvasRenderingContext2D;
      paintTerrainDetail(directPainter,detail,0,0);
      const cached:Pixel[]=Array(36).fill(null);
      let blits=0;
      const target={drawImage(_sheet:HTMLCanvasElement,sx:number,sy:number,
        sw:number,sh:number,dx:number,dy:number,dw:number,dh:number){
        blits++;
        expect(_sheet).toBe(canvas);
        expect([sy,sw,sh,dx,dy,dw,dh]).toEqual([0,6,6,0,0,6,6]);
        for(let row=0;row<6;row++)for(let col=0;col<6;col++)
          cached[row*6+col]=pixels.get((sx+col)+','+row)??null;
      }} as unknown as CanvasRenderingContext2D;
      paintTerrainDetailFromAtlas(target,canvas as unknown as HTMLCanvasElement,
        detail,0,0);
      expect(cached).toEqual(direct);
      expect(blits).toBe(motif==='none'?0:1);
    }
  });

  it('falls back safely without canvas support and avoids redundant redraw tiers',()=>{
    const unavailable={width:0,height:0,getContext:()=>null};
    expect(buildTerrainDetailAtlas(unavailable as unknown as HTMLCanvasElement))
      .toBe(false);
    expect([1,1.5,1.9,2,2.4,2.5,4,8].map(sceneryZoomTier))
      .toEqual([0,0,0,1,1,2,2,2]);
  });

  it('keeps map legends legible and faithful to the visual-only contracts',()=>{
    const labels:Record<MapOverlay,string>={
      terrain:'LIVING LANDSCAPE',resources:'FOOD AVAILABILITY',
      deposits:'HARVESTABLE DEPOSITS',
      elevation:'HEIGHTMAP',watersheds:'DRAINAGE & CATCHMENTS',
    };
    for(const [overlay,label] of Object.entries(labels) as [MapOverlay,string][]){
      const html=renderToStaticMarkup(createElement(MapLayerLegend,{overlay}));
      expect(html).toContain(label.replaceAll('&','&amp;'));
      expect(html.match(/aria-hidden="true"/g)).toHaveLength(3);
      expect(html).toContain('role="note"');
    }
    expect(renderToStaticMarkup(createElement(MapLayerLegend,{overlay:'watersheds'})))
      .toContain('routes stay unchanged');
  });

  it('does not alter saves, legacy elevation, hydrology or simulation results',()=>{
    const initial=createWorld({seed:1955,size:'small'});
    const saved=compactWorld(initial),before=JSON.stringify(initial);
    const heights=topographyForWorld(initial).heights;
    const drainage=hydrologyForWorld(initial);
    initial.tiles.forEach((tile,i)=>terrainDetailAt(tile.biome,
      i%initial.width,Math.floor(i/initial.width),initial.settings.seed,
      heights[i],drainage.channel[i]>0));
    expect(compactWorld(initial)).toBe(saved);
    expect(JSON.stringify(initial)).toBe(before);
    expect(readSavedWorld(saved)).toEqual(initial);
    const legacy={...initial};delete legacy.topography;
    const legacyRaw=JSON.stringify(legacy);
    expect(topographyForWorld(legacy).heights).toEqual(heights);
    expect(hydrologyForWorld(legacy)).toEqual(drainage);
    expect(JSON.stringify(legacy)).toBe(legacyRaw);
    const editedIndex=initial.tiles.findIndex(t=>t.biome==='plains');
    const edited=editWorld(initial,editedIndex%initial.width,
      Math.floor(editedIndex/initial.width),{kind:'terrain',biome:'mountain'});
    expect(edited.topography).not.toBe(initial.topography);
    expect(advanceWorldDays(initial,44)).toEqual(
      advanceWorldDays(createWorld({seed:1955,size:'small'}),44));
  });
});
