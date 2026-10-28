import {describe,expect,it} from 'vitest';
import {createWorld,editWorld,stepWorld,type Biome} from './engine';
import {advanceWorldDays} from './calendar';
import {intervene} from './divine';
import {generateHydrology,hydrologyForWorld} from './hydrology';
import {paintHydrologyStream} from './pixelArt';
import {compactWorld,readSavedWorld} from './storage';

describe('v1.9.3 — rivers, drainage and compatible water foundations',()=>{
  it('builds deterministic, cached drainages from existing elevations',()=>{
    const a=createWorld({seed:319,size:'small'});
    const b=createWorld({seed:319,size:'small'});
    const before=JSON.stringify(a),rng=a.rngState;
    const drainage=hydrologyForWorld(a);
    expect(hydrologyForWorld(a)).toBe(drainage);
    expect(Array.from(drainage.flowTo)).toEqual(
      Array.from(hydrologyForWorld(b).flowTo));
    expect(Array.from(drainage.channel)).toEqual(
      Array.from(hydrologyForWorld(b).channel));
    expect(drainage.channel.some(c=>c>0)).toBe(true);
    expect(a.rngState).toBe(rng);
    expect(JSON.stringify(a)).toBe(before);
    expect(hydrologyForWorld(stepWorld(a))).toBe(drainage);
  });

  it('routes every cell to water or the world boundary without cycles',()=>{
    const world=createWorld({seed:1439,size:'medium'});
    const data=hydrologyForWorld(world),n=world.tiles.length;
    for(let i=0;i<n;i++){
      const to=data.flowTo[i];
      if(to<0){
        const x=i%world.width,y=Math.floor(i/world.width);
        expect(world.tiles[i].biome==='water'||x===0||y===0||
          x===world.width-1||y===world.height-1).toBe(true);
      }else{
        expect(Math.abs(i%world.width-to%world.width)).toBeLessThanOrEqual(1);
        expect(Math.abs(Math.floor(i/world.width)-Math.floor(to/world.width)))
          .toBeLessThanOrEqual(1);
        expect(data.basin[i]).toBe(data.basin[to]);
        expect(data.catchment[to]).toBeGreaterThan(data.catchment[i]);
      }
      if(data.channel[i]){
        expect(world.tiles[i].biome).not.toBe('water');
        expect(to).toBeGreaterThanOrEqual(0);
      }
      // A strict descending rank can be inferred from cumulative drainage:
      // following the flow direction must never return to the same cell.
      if(i%997===0){
        let pointer=i,steps=0;
        while(data.flowTo[pointer]>=0){
          pointer=data.flowTo[pointer];
          expect(++steps).toBeLessThanOrEqual(n);
        }
        expect(data.basin[i]).toBe(data.basin[pointer]);
      }
    }
  });

  it('fills a closed depression for routing without painting actual water',()=>{
    const width=21,height=21;
    const heights=Array.from({length:width*height},(_,i)=>{
      const x=i%width,y=Math.floor(i/width);
      return 80+Math.abs(x-10)*5+(20-y)*2;
    });
    const tiles:{biome:Biome}[]=Array.from({length:width*height},
      ()=>({biome:'plains'}));
    const basinCell=10+10*width;
    heights[basinCell]=30; // Land depression that must spill to an outlet.
    const waterIndex=10+20*width;
    tiles[waterIndex]={biome:'water'};
    heights[waterIndex]=39;
    const before=heights.slice();
    const data=generateHydrology(width,height,heights,tiles,89);
    expect(data.pondDepth[basinCell]).toBeGreaterThan(0);
    expect(data.flowTo[basinCell]).toBeGreaterThanOrEqual(0);
    expect(tiles[basinCell].biome).toBe('plains');
    expect(heights).toEqual(before);
    expect(data.basin[basinCell]).toBe(data.basin[waterIndex]);
  });

  it('regenerates after terrain paint, survives saves and reads legacy worlds',()=>{
    const world=createWorld({seed:924,size:'small'});
    const initial=hydrologyForWorld(world);
    const i=world.tiles.findIndex(t=>t.biome==='plains');
    const edited=editWorld(world,i%world.width,Math.floor(i/world.width),
      {kind:'terrain',biome:'water'});
    const changed=hydrologyForWorld(edited);
    expect(changed).not.toBe(initial);
    expect(changed.channel[i]).toBe(0);
    expect(changed.flowTo[i]).toBe(-1);
    expect(hydrologyForWorld(readSavedWorld(compactWorld(edited))!))
      .toEqual(changed);
    const old={...world};delete old.topography;
    const oldJson=JSON.stringify(old);
    const fromOld=hydrologyForWorld(old);
    expect(JSON.stringify(old)).toBe(oldJson);
    expect(fromOld).toEqual(initial);
    const legacyTick={...old,tiles:old.tiles.map(t=>({...t}))};
    expect(hydrologyForWorld(legacyTick)).toBe(fromOld);
  });

  it('never changes agent decisions, existing waterways or calendar outcomes',()=>{
    const observed=createWorld({seed:715,size:'small'});
    const baseline=createWorld({seed:715,size:'small'});
    const landAndWater=observed.tiles.map(t=>t.biome);
    hydrologyForWorld(observed);
    expect(observed.tiles.map(t=>t.biome)).toEqual(landAndWater);
    expect(advanceWorldDays(observed,48)).toEqual(advanceWorldDays(baseline,48));
  });

  it('refreshes elevation and drainage after a God Mode terrain change',()=>{
    const world=createWorld({seed:512,size:'small'});
    const occupied=new Set(world.agents.map(a=>a.y*world.width+a.x));
    const index=world.tiles.findIndex((t,i)=>t.biome==='plains'&&!occupied.has(i));
    const changed=intervene(world,{kind:'terrain',biome:'water',
      x:index%world.width,y:Math.floor(index/world.width)});
    expect(changed.topography).not.toBe(world.topography);
    expect(changed.topography!.heights[index]).toBeLessThan(
      world.topography!.heights[index]);
    expect(hydrologyForWorld(changed).channel[index]).toBe(0);
    expect(hydrologyForWorld(changed).flowTo[index]).toBe(-1);
    expect(world.tiles[index].biome).toBe('plains');
  });

  it('draws crisp continuous rivers without changing any world state',()=>{
    const rectangles:{x:number;y:number;color:string}[]=[];
    const recorder={fillStyle:'',fillRect(x:number,y:number){
      rectangles.push({x,y,color:String(recorder.fillStyle)});
    }} as unknown as CanvasRenderingContext2D;
    paintHydrologyStream(recorder,3,4,4,5,2);
    expect(rectangles.length).toBeGreaterThan(10);
    expect(rectangles.some(p=>p.x>=4*6&&p.y>=5*6)).toBe(true);
    const count=rectangles.length;
    paintHydrologyStream(recorder,3,4,4,5,3,true);
    expect(rectangles.length).toBeGreaterThan(count);
  });
});
