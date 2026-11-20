import type {World} from './engine';
import {terrainRenderGrid,TERRAIN_CELL_SIDE,TERRAIN_ELEVATION_UNITS,
  type TerrainGrid,type TerrainSource} from './terrainCells';
import {floodplains,riverLinks,waterSeason} from './riverSeasons';
import {SEA_LEVEL,topographyForWorld} from './topography';

export const VISUAL_TERRAIN_SIDE=8;
export const Shore={ground:0,wetSand:1,drySand:2,shallows:3,channel:4,
  gravel:5,mud:6,ice:7,flood:8,foam:9} as const;
export type SurfaceGrid=TerrainGrid&{shore:Uint8Array};
export type SurfaceWorld=TerrainSource&Pick<World,'dayOfYear'>;
const SIDE=VISUAL_TERRAIN_SIDE,UNITS=TERRAIN_ELEVATION_UNITS,SEA=(SEA_LEVEL-9)*UNITS;
const clamp=(value:number,low:number,high:number)=>Math.min(high,Math.max(low,value));
const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;
const cache=new WeakMap<TerrainGrid,{season:string;riverlands:boolean;grid:SurfaceGrid}>();

/** Every tile has the same 8×8 visual lattice. Four-by-four simulation
 * samples are interpolated here so saves and erosion retain their grid. */
export function surfaceGrid(world:SurfaceWorld):SurfaceGrid{
  const base=terrainRenderGrid(world),season=waterSeason(world),riverlands=!!world.settings.riverlands;
  const previous=cache.get(base);
  if(previous?.season===season&&previous.riverlands===riverlands)return previous.grid;
  const {width,height,tiles}=world,heights=topographyForWorld(world).heights;
  const columns=width*SIDE,rows=height*SIDE,count=columns*rows;
  const ground=new Uint16Array(count),water=new Uint8Array(count);
  const material=new Uint8Array(count),shore=new Uint8Array(count);
  const links=riverLinks(world),flood=riverlands&&season==='Bloom'?floodplains(world):null;
  const land=Uint8Array.from(tiles,t=>+(t.biome!=='water'));
  const neighbour=(x:number,y:number)=>clamp(y,0,height-1)*width+clamp(x,0,width-1);
  const offset=Array.from({length:SIDE},(_,i)=>(i+.5)/SIDE-.5);
  const fractions=offset.map(dx=>Math.abs(dx));
  const source=offset.map((_,i)=>{
    const at=(i+.5)*TERRAIN_CELL_SIDE/SIDE-.5,lo=Math.floor(at);
    return {lo,weight:at-lo,nearest:Math.round(at)};
  });
  for(let tile=0;tile<tiles.length;tile++){
    const x=tile%width,y=Math.floor(tile/width),biome=tiles[tile].biome;
    let waterline=SEA,coastal=false,closest=Infinity;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      const n=neighbour(x+dx,y+dy);
      if(land[n]!==land[tile])coastal=true;
      const distance=dx*dx+dy*dy;
      if(!land[n]&&distance<closest){
        waterline=heights[n]*UNITS;closest=distance;
      }
    }
    const valley=biome==='wetland',cliff=heights[tile]*UNITS-waterline>26*UNITS;
    const channels=links.get(tile);
    const mouth=!land[tile]&&waterline===SEA?channels?.find(link=>
      link.tier>=2&&land[link.other]&&heights[link.other]<=SEA_LEVEL+18):undefined;
    const bx=x*TERRAIN_CELL_SIDE,by=y*TERRAIN_CELL_SIDE;
    for(let row=0;row<SIDE;row++){
      const ry=source[row],dy=offset[row],ny=y+Math.sign(dy),ty=fractions[row];
      const j0=clamp(by+ry.lo,0,base.rows-1)*base.columns;
      const j1=clamp(by+ry.lo+1,0,base.rows-1)*base.columns;
      for(let col=0;col<SIDE;col++){
        const rx=source[col],dx=offset[col],nx=x+Math.sign(dx),tx=fractions[col];
        const i=(y*SIDE+row)*columns+x*SIDE+col;
        const nearest=(by+ry.nearest)*base.columns+bx+rx.nearest;
        material[i]=base.material[nearest];
        water[i]=base.water[nearest];
        const i0=clamp(bx+rx.lo,0,base.columns-1),i1=clamp(bx+rx.lo+1,0,base.columns-1);
        const slope=lerp(lerp(base.ground[j0+i0],base.ground[j0+i1],rx.weight),
          lerp(base.ground[j1+i0],base.ground[j1+i1],rx.weight),ry.weight);
        ground[i]=land[tile]?Math.round(slope):waterline;
        if(coastal){
          const blend=lerp(lerp(land[tile],land[neighbour(nx,y)],tx),
            lerp(land[neighbour(x,ny)],land[neighbour(nx,ny)],tx),ty);
          // Keep the macro shore in place and bevel the corners in small steps.
          if(blend<.46){
            ground[i]=waterline;water[i]=0;
            if(blend>.15)shore[i]=Shore.shallows;
            if(mouth){
              const inward=dx*mouth.dx+dy*mouth.dy,lateral=Math.abs(dx*mouth.dy-dy*mouth.dx);
              if(inward>.02&&lateral>.17&&lateral<.38&&inward+lateral>.44)
                shore[i]=season==='Highsun'?Shore.wetSand:Shore.shallows;
            }
            continue;
          }
          const edge=clamp((blend-.46)/.42,0,1);
          if(!cliff)ground[i]=Math.round(lerp(waterline+1,
            Math.max(waterline+1,ground[i]),edge));
          if(!cliff&&blend<.77)shore[i]=valley?Shore.mud:
            blend<.62?Shore.wetSand:Shore.drySand;
        }
        if(flood?.[tile]&&!cliff){
          shore[i]=Shore.flood;
          water[i]=Math.max(water[i],3);
        }
        if(!channels)continue;
        let layer:number=Shore.ground,foam=false;
        for(const {dx:u,dy:v,tier,other} of channels){
          const t=clamp((dx*u+dy*v)/(u*u+v*v),0,.58);
          const distance=(dx-t*u)**2+(dy-t*v)**2;
          const full=(tier===3?.24:tier===2?.17:.10)+(land[other]?0:.028);
          const current=full*(season==='Bloom'?1.25:season==='Highsun'?.76:1);
          if(distance<current*current){
            layer=Shore.channel;
            foam=heights[tile]-heights[other]>6&&t>.24;
            if(foam)break;
          }
          if(layer===Shore.ground&&distance<(full+.10)**2)layer=Shore.gravel;
        }
        if(layer===Shore.channel){
          shore[i]=foam?Shore.foam:season==='Frost'&&biome==='taiga'?Shore.ice:Shore.channel;
          ground[i]=Math.max(waterline,ground[i]-(cliff?6:2));
          water[i]=0;
        }else if(layer===Shore.gravel&&shore[i]!==Shore.flood){
          shore[i]=valley?Shore.mud:layer;
        }
      }
    }
  }
  const grid={columns,rows,ground,water,material,shore};
  cache.set(base,{season,riverlands,grid});
  return grid;
}
