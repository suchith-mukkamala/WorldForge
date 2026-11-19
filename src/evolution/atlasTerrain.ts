import type {Biome,World} from './engine';
import {terrainHash,terrainNoise} from './biomeGeneration';
import {coastalDepth} from './oceanDepth';
import {hydrologyForWorld,riverBanks,type Hydrology} from './hydrology';
import {topographyForWorld,type Topography} from './topography';
import {woodlandCover,woodlandHabitat} from './woodland';
import type {Point} from './motion';

export const ATLAS_SEA='#142c40';
const waterTones=['#397d81','#316d76','#285a6a','#204858',ATLAS_SEA] as const;
const landTones:Record<Exclude<Biome,'water'>,number>={
  plains:0x799161,forest:0x346a54,mountain:0x818e93,
  cave:0x657584,wasteland:0x947b70,volcanic:0x8c5e62,
};
const clamp=(value:number,low:number,high:number)=>Math.min(high,Math.max(low,value));
function blend(a:number,b:number,amount:number):number{
  const channel=(shift:number)=>Math.round((a>>shift&255)*(1-amount)+(b>>shift&255)*amount);
  return channel(16)<<16|channel(8)<<8|channel(0);
}
const color=(rgb:number)=>'#'+rgb.toString(16).padStart(6,'0');

export type AtlasLand=Pick<World,'width'|'height'|'tiles'|'settings'|'woodland'|'topography'>;
type Landscape={tiles:World['tiles'];woodland:World['woodland'];seed:number;
  regional:boolean;colors:string[]};
const landscapeCache=new WeakMap<Topography,Landscape>();

/** World-scale color uses broad fields, with the same light in both views. */
export function atlasTerrainColors(w:AtlasLand):string[]{
  const {width,height,tiles,woodland}=w,seed=w.settings.seed,regional=!!w.settings.regionalGeography;
  const topography=topographyForWorld(w),saved=landscapeCache.get(topography);
  if(saved?.seed===seed&&saved.regional===regional&&saved.woodland===woodland&&
    (saved.tiles===tiles||saved.tiles.every((tile,i)=>tile.biome===tiles[i]?.biome)))
    return saved.colors;
  const heights=topography.heights;
  const water=coastalDepth(width,height,i=>tiles[i].biome==='water');
  const wet=riverBanks(hydrologyForWorld(w),width,height);
  const material=Uint32Array.from(tiles,(tile,i)=>{
    if(tile.biome==='water')return 0;
    const canopy=woodlandHabitat(tile.biome)?woodlandCover(woodland,i):undefined;
    return canopy===undefined?landTones[tile.biome]:blend(landTones.plains,landTones.forest,canopy);
  });
  const colors=tiles.map((tile,i)=>{
    if(tile.biome==='water')return waterTones[water[i]-1];
    const x=i%width,y=Math.floor(i/width);
    let red=(material[i]>>16)*5,green=(material[i]>>8&255)*5;
    let blue=(material[i]&255)*5,weight=5;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      if((!dx&&!dy)||x+dx<0||x+dx>=width||y+dy<0||y+dy>=height)continue;
      const tone=material[i+dx+dy*width];
      if(!tone)continue;
      red+=tone>>16;
      green+=tone>>8&255;
      blue+=tone&255;
      weight++;
    }
    let tone=Math.round(red/weight)<<16|Math.round(green/weight)<<8|Math.round(blue/weight);
    const elevation=(dx:number,dy:number)=>{
      const nx=x+dx,ny=y+dy,at=ny*width+nx;
      return nx>=0&&nx<width&&ny>=0&&ny<height&&material[at]?heights[at]:heights[i];
    };
    const light=elevation(2,0)+elevation(0,2)-elevation(-2,0)-elevation(0,-2);
    const variation=terrainNoise(x,y,11,seed+1907)*.15+
      terrainNoise(x,y,4,seed+2111)*.044;
    const shade=clamp(light/420+variation,-.31,.28);
    if(woodlandHabitat(tile.biome)){
      tone=blend(tone,0x73967a,wet[i]*.31);
    }else if(tile.biome==='mountain'||tile.biome==='cave'){
      tone=blend(tone,0xc4c1ab,clamp((heights[i]-120)/240,0,.3));
    }
    return color(blend(tone,shade<0?0x233b43:0xbfc8a9,Math.abs(shade)));
  });
  landscapeCache.set(topography,{tiles,woodland,seed,regional,colors});
  return colors;
}

/** Sparse close-up details cluster in patches so repeating sprites recede. */
export function showAtlasScenery(biome:Biome,x:number,y:number,seed:number,
  street:boolean,cover?:number):boolean{
  const patch=terrainNoise(x,y,8,seed+2049)*.14;
  const density=cover!==undefined?.08+.17*cover:
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
