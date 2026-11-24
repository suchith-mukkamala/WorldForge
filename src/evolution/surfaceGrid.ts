import type {World} from './engine';
import {calderaRiver} from './caldera';
import {terrainRenderGrid,TERRAIN_CELL_SIDE,TERRAIN_ELEVATION_UNITS,VISUAL_TERRAIN_SIDE,
  type TerrainGrid,type TerrainSource} from './terrainCells';
import {floodplains,riverLinks,waterSeason} from './riverSeasons';
import {cavernFlow,cavernFlowKey,divertedRiverLinks,type CavernFlow} from './realmWater';
import {SEA_LEVEL,topographyForWorld} from './topography';
import {coastalLife,coralTone} from './coastalLife';
import {terrainHash,terrainNoise} from './biomeGeneration';
import {WORLD_TREE_ROOT_REACH,WORLD_TREE_TRUNK_CLEARANCE,worldTreeClearings,worldTreeRootHeight,worldTreeRoots} from './worldTree';
import {skylandMesh,skylandShadows} from './skylands';

export {VISUAL_TERRAIN_SIDE};
export const Shore={ground:0,wetSand:1,drySand:2,shallows:3,channel:4,
  gravel:5,mud:6,ice:7,flood:8,foam:9,reefBase:10,reefPink:11,reefGold:12,pool:13,spray:14,rootTrail:15,rootBark:16,rootMoss:17,rootWet:18,rootSubmerged:19} as const;
export type SurfaceGrid=TerrainGrid&{shore:Uint8Array;openWater?:Uint8Array;coast?:Uint8Array;shadow?:Uint8Array;rootRise?:Uint8Array;treeCover?:ReadonlySet<number>};
export type SurfaceWorld=TerrainSource&Pick<World,'dayOfYear'|'skylands'|'worldTree'|'volcanism'|'underworld'|'volcanicLayout'>&
  Partial<Pick<World,'settlements'|'ancientSites'|'ruins'>>&{rootClearings?:readonly number[];feeder?:CavernFlow};
const SIDE=VISUAL_TERRAIN_SIDE,UNITS=TERRAIN_ELEVATION_UNITS,SEA=(SEA_LEVEL-9)*UNITS;
const clamp=(value:number,low:number,high:number)=>Math.min(high,Math.max(low,value));
const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;
const cache=new WeakMap<TerrainGrid,{season:string;riverlands:boolean;feederKey:string;outflow?:readonly number[];
  skylands:World['skylands'];worldTree:World['worldTree'];clearings:string;grid:SurfaceGrid}>();

export const surfaceHasWater=(grid:Pick<SurfaceGrid,'openWater'|'shore'>,index:number)=>{
  const shore=grid.shore[index];
  return !!grid.openWater?.[index]||shore===Shore.channel||shore===Shore.foam||
    shore===Shore.ice||shore===Shore.shallows||shore>=Shore.reefBase&&shore<=Shore.spray;
};

/** Every tile has the same 8×8 visual lattice. Four-by-four simulation
 * samples are interpolated here so saves and erosion retain their grid. */
export function surfaceGrid(world:SurfaceWorld):SurfaceGrid{
  const base=terrainRenderGrid(world),season=waterSeason(world),riverlands=!!world.settings.riverlands;
  const {skylands,worldTree}=world,outflow=calderaRiver(world);
  const feeder=world.feeder??cavernFlow(world),feederKey=cavernFlowKey(feeder);
  const cleared=world.rootClearings??worldTreeClearings(world),clearings=cleared.join(',');
  const previous=cache.get(base);
  if(previous?.season===season&&previous.riverlands===riverlands&&previous.feederKey===feederKey&&previous.skylands===skylands&&
    previous.worldTree===worldTree&&previous.outflow===outflow&&previous.clearings===clearings)
    return previous.grid;
  const {width,height,tiles}=world,heights=topographyForWorld(world).heights;
  const columns=width*SIDE,rows=height*SIDE,count=columns*rows;
  const ground=new Uint16Array(count),water=new Uint8Array(count);
  const material=new Uint8Array(count),shore=new Uint8Array(count),openWater=new Uint8Array(count);
  const links=divertedRiverLinks(riverLinks(world),width,feeder),flood=riverlands&&season==='Bloom'?floodplains(world):null;
  const {reefs,depths:coast}=coastalLife(world),seed=world.settings.seed;
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
        waterline=heights[n]>SEA_LEVEL?heights[n]*UNITS:SEA;closest=distance;
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
        openWater[i]=1-land[tile];
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
            openWater[i]=+(shore[i]!==Shore.wetSand);
            if(reefs[tile]&&blend<.31&&shore[i]!==Shore.wetSand){
              const coral=coralTone(x*SIDE+col,y*SIDE+row,seed);
              if(coral)shore[i]=Shore.reefBase+coral-1;
            }
            continue;
          }
          openWater[i]=0;
          const edge=clamp((blend-.46)/.42,0,1);
          if(!cliff)ground[i]=Math.round(lerp(waterline+1,
            Math.max(waterline+1,ground[i]),edge));
          if(!cliff&&blend<.77)shore[i]=valley?Shore.mud:
            blend<.62?Shore.wetSand:Shore.drySand;
        }
        if(reefs[tile]&&!coastal){
          const coral=coralTone(x*SIDE+col,y*SIDE+row,seed);
          if(coral){shore[i]=Shore.reefBase+coral-1;water[i]=0;}
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
  for(const group of skylands??[]){
    const {fall}=skylandMesh(group),{direction}=fall;
    const cx=Math.floor((fall.x+.5)*SIDE+direction.x*.0001);
    const cy=Math.floor((fall.y+.5)*SIDE+direction.y*.0001);
    const level=ground[cy*columns+cx];
    for(let y=Math.max(0,cy-7);y<=Math.min(rows-1,cy+7);y++){
      for(let x=Math.max(0,cx-7);x<=Math.min(columns-1,cx+7);x++){
        const i=y*columns+x,dx=x-cx,dy=y-cy;
        const down=dx*direction.x+dy*direction.y,across=dx*direction.y-dy*direction.x;
        const basin=(down-1)**2+across*across*1.35;
        if(basin>32||Math.abs(ground[i]-level)>12||openWater[i]&&basin>15)continue;
        const splash=Math.abs(down)+Math.abs(across);
        if(!openWater[i]){
          ground[i]=Math.max(0,level-2);water[i]=Math.min(2,level);
        }
        shore[i]=splash<3||(splash===3&&(x+y)%2===0)?Shore.spray:Shore.pool;
      }
    }
  }
  for(const tile of worldTree?.pools??[]){
    const cx=(tile%width)*SIDE+SIDE/2,cy=Math.floor(tile/width)*SIDE+SIDE/2;
    const level=ground[cy*columns+cx];
    for(let y=cy-3;y<=cy+2;y++)for(let x=cx-3;x<=cx+2;x++){
      const index=y*columns+x;
      if((x-cx+.5)**2+(y-cy+.5)**2>8||openWater[index]||
        Math.abs(ground[index]-level)>6||shore[index]!==Shore.ground)continue;
      ground[index]=Math.max(0,level-2);water[index]=Math.min(2,level);shore[index]=Shore.pool;
    }
  }
  if(worldTree){
    const trail=[worldTree.approach??worldTree.y*width+worldTree.x,...worldTree.trail];
    for(let step=1;step<trail.length;step++){
      const from=trail[step-1],to=trail[step];
      const cx=from%width*SIDE+SIDE/2,cy=Math.floor(from/width)*SIDE+SIDE/2;
      const dx=to%width-from%width,dy=Math.floor(to/width)-Math.floor(from/width);
      for(let n=0;n<SIDE;n++)for(let across=-1;across<=0;across++){
        const index=(cy+dy*n+dx*across)*columns+cx+dx*n+dy*across;
        if(!surfaceHasWater({openWater,shore},index))shore[index]=Shore.rootTrail;
      }
    }
  }
  let rootRise:Uint8Array|undefined;
  const treeCover=worldTree?new Set<number>():undefined;
  if(worldTree&&treeCover){
    rootRise=new Uint8Array(count);
    const tree=worldTree,roots=worldTreeRoots(tree),blocked=new Set(cleared);
    const reach=WORLD_TREE_ROOT_REACH;
    for(let y=Math.max(0,tree.y-reach);y<=Math.min(height-1,tree.y+reach);y++){
      for(let x=Math.max(0,tree.x-reach);x<=Math.min(width-1,tree.x+reach);x++){
        const id=y*width+x,dx=x-tree.x,dy=y-tree.y;
        if(dx*dx+dy*dy<WORLD_TREE_TRUNK_CLEARANCE**2)treeCover.add(id);
        if(blocked.has(id)||!worldTreeRootHeight(roots,dx,dy,1))continue;
        const biome=tiles[id].biome;
        for(let v=0;v<SIDE;v++)for(let u=0;u<SIDE;u++){
          const col=x*SIDE+u,row=y*SIDE+v,index=row*columns+col;
          if(shore[index]===Shore.rootTrail||shore[index]===Shore.pool||shore[index]===Shore.spray)continue;
          const peak=worldTreeRootHeight(roots,dx+offset[u],dy+offset[v]);
          const heightAboveSurface=peak-(openWater[index]?1.8:0);
          const amount=Math.round(heightAboveSurface*UNITS);
          if(amount<2){
            if(openWater[index]&&peak>1&&shore[index]===Shore.ground)shore[index]=Shore.rootSubmerged;
            continue;
          }
          rootRise[index]=amount;
          // Scenery sits at the middle of a tile. Allow plants beside roots
          // while keeping their feet and small contact shadows off the bark.
          if(Math.abs(offset[u])<=.25&&Math.abs(offset[v])<=.25)treeCover.add(id);
          const grain=terrainNoise(col,row,6,seed+113);
          shore[index]=openWater[index]?Shore.rootWet:
            (biome==='forest'||biome==='taiga'||biome==='wetland')&&grain>-.13?
              Shore.rootMoss:Shore.rootBark;
        }
      }
    }
  }
  const skyShadow=skylands?.length?skylandShadows(skylands,columns,rows):undefined;
  const shadow=worldTree?(skyShadow?.slice()??new Uint8Array(count)):skyShadow;
  if(worldTree&&shadow){
    const seed=world.settings.seed+worldTree.variant;
    const cx=(worldTree.x+.5)*SIDE+2,cy=(worldTree.y+.5)*SIDE+3;
    const radius=SIDE*9;
    for(let y=Math.max(0,cy-radius);y<=Math.min(rows-1,cy+radius);y++){
      for(let x=Math.max(0,cx-radius);x<=Math.min(columns-1,cx+radius);x++){
        const i=y*columns+x;
        if(shadow[i]||openWater[i])continue;
        const fade=Math.hypot(x-cx,(y-cy)*1.15)/radius;
        const canopy=terrainNoise(x,y,7,seed)*.25+terrainHash(x,y,seed)*.16;
        if(fade<.5+canopy)shadow[i]=1;
        else if(fade<.83+canopy)shadow[i]=3;
      }
    }
  }
  const grid={columns,rows,ground,water,material,shore,openWater,coast,shadow,rootRise,treeCover};
  cache.set(base,{season,riverlands,feederKey,outflow,skylands,worldTree,clearings,grid});
  return grid;
}
