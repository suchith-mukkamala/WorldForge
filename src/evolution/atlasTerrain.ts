import {BIOME_INFO,type Biome,type World} from './engine';
import {terrainHash,terrainNoise} from './biomeGeneration';
import {OCEAN_TONES} from './oceanDepth';
import type {Hydrology} from './hydrology';
import {woodlandPalette} from './terrainDetails';
import type {Point} from './motion';

export const ATLAS_SEA='#102737';
export const TILE_SHEEN='rgba(235,237,195,.12)';
export const TILE_SHADE='rgba(17,33,48,.17)';
const canopyColors=woodlandPalette(BIOME_INFO.plains.color,BIOME_INFO.forest.color);
const regionalCanopy:Partial<Record<Biome,string[]>>={
  taiga:woodlandPalette('#729184','#2e5c58'),
  wetland:woodlandPalette('#759682','#3e6c5a'),
  savanna:woodlandPalette('#ab925c','#65764f'),
};

export type AtlasLand=Pick<World,'width'|'height'|'tiles'|'settings'|'woodland'|'topography'|'skylands'|'worldTree'>;

export function overheadTerrainColor(biome:Biome,waterDepth:number,cover?:number):string{
  if(biome==='water')return OCEAN_TONES[waterDepth];
  return cover===undefined?BIOME_INFO[biome].color:
    (regionalCanopy[biome]??canopyColors)[Math.round(cover*63)];
}

const HIGH_GROUND=['#8d9b96','#a5aea6','#bdc7bf','#d5ded3'];
export function highlandColor(biome:Biome,height:number,grain:number):string|undefined{
  if(biome==='water'||biome==='volcanic'||biome==='wasteland')return;
  const band=Math.floor((height-153+(grain&7))/21);
  return band>=0?HIGH_GROUND[Math.min(HIGH_GROUND.length-1,band)]:undefined;
}

export function atlasTileGrain(biome:Biome,waterDepth:number,grain:number):number|undefined{
  return biome!=='water'||waterDepth<4||grain%6===0?grain:undefined;
}

/** Four half-size squares keep the terrain visible at atlas scale. */
export function paintOverheadTerrainTile(ctx:CanvasRenderingContext2D,x:number,y:number,
  size:number,color:string,grain?:number):void{
  const half=size/2,px=x*size,py=y*size;
  ctx.fillStyle=color;ctx.fillRect(px,py,size,size);
  if(grain===undefined)return;
  const light=grain&3,dark=light^3;
  ctx.fillStyle=TILE_SHEEN;
  ctx.fillRect(px+(light&1)*half,py+(light>>1)*half,half,half);
  ctx.fillStyle=TILE_SHADE;
  ctx.fillRect(px+(dark&1)*half,py+(dark>>1)*half,half,half);
}

/** Sparse close-up details cluster in patches so repeating sprites recede. */
export function showAtlasScenery(biome:Biome,x:number,y:number,seed:number,
  street:boolean,cover?:number):boolean{
  const patch=terrainNoise(x,y,8,seed+2049)*.14;
  const density=biome==='taiga'?.19+.18*(cover??.5):biome==='wetland'?.17:
    biome==='savanna'?.12:cover!==undefined?.08+.17*cover:
    biome==='forest'?.25:biome==='water'?.025:biome==='plains'?.12:.09;
  return terrainHash(x,y,seed+2187)<Math.max(.025,density+patch)*(street?1.25:1);
}

export function occupiedScenery(w:World):Set<number>{
  const occupied=new Set<number>();
  for(const town of w.settlements){
    occupied.add(town.y*w.width+town.x);
    for(const plot of town.infrastructure?.buildings??[])occupied.add(plot.y*w.width+plot.x);
    for(const road of town.infrastructure?.roads??[])occupied.add(road);
  }
  for(const road of w.transport?.roads??[])if(road.condition>25)occupied.add(road.index);
  for(const site of w.ancientSites??[])occupied.add(site.y*w.width+site.x);
  if(w.worldTree)occupied.add(w.worldTree.y*w.width+w.worldTree.x);
  return occupied;
}

type RiverLink={from:number;to:number;tier:number};
const riverCache=new WeakMap<Hydrology,{all:RiverLink[];large:RiverLink[]}>();
export function atlasRivers(drainage:Hydrology,detailed:boolean):RiverLink[]{
  let cached=riverCache.get(drainage);
  if(!cached){
    const all:RiverLink[]=[];
    for(let i=0;i<drainage.channel.length;i++){
      if(drainage.channel[i]&&drainage.flowTo[i]>=0)
        all.push({from:i,to:drainage.flowTo[i],tier:drainage.channel[i]});
    }
    // Keep one continuous headwater branch for each large river at world zoom.
    const feeder=new Map<number,RiverLink>();
    for(const link of all){
      const current=feeder.get(link.to);
      if(!current||drainage.catchment[link.from]>drainage.catchment[current.from])
        feeder.set(link.to,link);
    }
    const main=new Set<RiverLink>();
    for(const link of all){
      if(link.tier<2)continue;
      let upstream:RiverLink|undefined=link;
      while(upstream&&!main.has(upstream)){
        main.add(upstream);
        upstream=feeder.get(upstream.from);
      }
    }
    cached={all,large:all.filter(link=>main.has(link))};
    riverCache.set(drainage,cached);
  }
  return detailed?cached.all:cached.large;
}

const riverColors=['','#6d9c99','#72b3ba','#8ecbd0'];
const riverWidths=[0,.75,1.25,1.9];
export function paintRiverSegment(ctx:CanvasRenderingContext2D,a:Point,b:Point,
  tier:number,watersheds:boolean):void{
  ctx.lineCap='round';
  ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);
  ctx.strokeStyle='rgba(29,74,77,.68)';
  ctx.lineWidth=riverWidths[tier]+1.2;ctx.stroke();
  ctx.strokeStyle=watersheds?'#a3e5ee':riverColors[tier];
  ctx.lineWidth=riverWidths[tier];ctx.stroke();
  ctx.lineCap='butt';
}
