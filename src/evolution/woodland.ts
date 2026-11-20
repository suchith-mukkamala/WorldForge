import type {Biome,World} from './engine';
import {terrainHumidity,terrainTemperature} from './biomeGeneration';
import {hydrologyForWorld,riverBanks} from './hydrology';
import {topographyForWorld,type Topography} from './topography';
import {roadTiles} from './transport';
import {terrainCellSummary} from './terrainCells';

// One printable character per tile keeps the cover field compact in saves.
const COVER='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_';
const MAX_COVER=COVER.length-1;
const FOREST_THRESHOLD=37;
const PLAINS_THRESHOLD=26;
const decode=new Uint8Array(128);
for(let i=0;i<COVER.length;i++)decode[COVER.charCodeAt(i)]=i;

export function woodlandHabitat(biome:Biome):boolean{
  return biome==='forest'||biome==='plains';
}

export function woodlandCover(woodland:string|undefined,index:number):number|undefined{
  return woodland===undefined?undefined:decode[woodland.charCodeAt(index)]/MAX_COVER;
}

function neighboringCover(cover:Uint8Array,width:number,height:number,x:number,y:number):number{
  let total=0,weight=0;
  for(let ny=Math.max(0,y-1);ny<=Math.min(height-1,y+1);ny++){
    for(let nx=Math.max(0,x-1);nx<=Math.min(width-1,x+1);nx++){
      if(nx===x&&ny===y)continue;
      const contribution=nx===x||ny===y?2:1;
      total+=contribution*cover[ny*width+nx];
      weight+=contribution;
    }
  }
  return weight?total/weight:0;
}

export function initialWoodland(w:Pick<World,'width'|'height'|'tiles'>):string{
  const {width,height,tiles}=w;
  const potential=Uint8Array.from(tiles,tile=>+woodlandHabitat(tile.biome));
  let cover=Uint8Array.from(tiles,tile=>tile.biome==='forest'?MAX_COVER:0);
  for(let pass=0;pass<3;pass++){
    cover=cover.map((current,index)=>potential[index]?Math.round(current*.25+
      neighboringCover(cover,width,height,index%width,Math.floor(index/width))*.75):0);
  }
  let woodland='';
  for(let i=0;i<tiles.length;i++){
    const initial=tiles[i].biome==='forest'?Math.max(35,cover[i]):Math.min(28,cover[i]);
    woodland+=COVER[initial];
  }
  return woodland;
}

export function enableLivingBiomes(w:World):World{
  if(w.settings.livingBiomes&&w.woodland!==undefined)return w;
  return {...w,settings:{...w.settings,livingBiomes:true},
    woodland:initialWoodland(w),topography:topographyForWorld(w)};
}

export function paintWoodland(w:World,index:number):void{
  if(w.woodland===undefined)return;
  const cover=w.tiles[index].biome==='forest'?COVER[MAX_COVER]:COVER[0];
  w.woodland=w.woodland.slice(0,index)+cover+w.woodland.slice(index+1);
}

const suitabilityCache=new WeakMap<Topography,{seed:number;regional:boolean;scores:Float32Array}>();
function woodlandSuitability(w:World,topography:Topography):Float32Array{
  const seed=w.settings.seed,cached=suitabilityCache.get(topography);
  const regional=!!w.settings.regionalGeography;
  if(cached?.seed===seed&&cached.regional===regional)return cached.scores;
  const {width,height}=w,drainage=hydrologyForWorld(w);
  const {channel,pondDepth}=drainage;
  const banks=regional?riverBanks(drainage,width,height):null;
  const scale=Math.max(6,Math.min(width,height)),scores=new Float32Array(w.tiles.length);
  for(let i=0;i<scores.length;i++){
    const x=i%width,y=Math.floor(i/width);
    const humidity=terrainHumidity(x,y,scale,seed);
    const temperature=terrainTemperature(x,y,scale,(y+.5)/height,seed);
    const wetGround=Math.max(channel[i]*.035,Math.min(.09,pondDepth[i]*.012),.24*(banks?.[i]??0));
    const altitude=Math.max(0,topography.heights[i]-105);
    scores[i]=.52+humidity*.58+wetGround-Math.abs(temperature-.53)*.25-altitude*.0031;
  }
  suitabilityCache.set(topography,{seed,regional,scores});
  return scores;
}

/** Advance all edges from the same canopy snapshot, once per simulated year. */
export function advanceWoodland(w:World):number[]{
  w.woodland??=initialWoodland(w);
  w.topography??=topographyForWorld(w);
  const {width,height,tiles}=w;
  const before=new Uint8Array(tiles.length);
  for(let i=0;i<before.length;i++)before[i]=decode[w.woodland.charCodeAt(i)];
  const suitability=woodlandSuitability(w,w.topography),managed=roadTiles(w);
  for(const settlement of w.settlements){
    managed.add(settlement.y*width+settlement.x);
    for(const index of settlement.infrastructure?.roads??[])managed.add(index);
    for(const building of settlement.infrastructure?.buildings??[]){
      if(building.stage!=='ruin'&&building.stage!=='abandoned')
        managed.add(building.y*width+building.x);
    }
  }

  let woodland='';
  const newForests:number[]=[];
  for(let i=0;i<tiles.length;i++){
    const tile=tiles[i],current=before[i];
    let next=current;
    if(woodlandHabitat(tile.biome)&&!managed.has(i)){
      const nearby=neighboringCover(before,width,height,i%width,Math.floor(i/width));
      if(current>0||nearby>=MAX_COVER*.08){
        const dampGround=(terrainCellSummary(w,i)?.moistSoil??0)*.28;
        const ideal=Math.round((suitability[i]+dampGround-.25)*.95*MAX_COVER+nearby*.61);
        const target=Math.max(0,Math.min(MAX_COVER,ideal));
        next=current+Math.max(-2,Math.min(2,target-current));
        if(tile.biome==='plains'&&next>=FOREST_THRESHOLD){
          tiles[i]={...tile,biome:'forest'};
          newForests.push(i);
        }else if(tile.biome==='forest'&&next<=PLAINS_THRESHOLD){
          tiles[i]={...tile,biome:'plains'};
        }
      }
    }
    woodland+=COVER[next];
  }
  w.woodland=woodland;
  return newForests;
}

export function validWoodland(w:World):boolean{
  if(w.woodland===undefined)return true;
  return w.settings.livingBiomes===true&&typeof w.woodland==='string'&&
    w.woodland.length===w.tiles.length&&/^[0-9A-Za-z_-]+$/.test(w.woodland)&&
    w.tiles.every((tile,i)=>woodlandHabitat(tile.biome)||w.woodland![i]===COVER[0]);
}
