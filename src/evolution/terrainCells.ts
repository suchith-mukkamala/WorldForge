import type {World} from './engine';
import {terrainHash} from './biomeGeneration';
import {hydrologyForWorld} from './hydrology';
import {SEA_LEVEL,topographyForWorld,type Topography} from './topography';

export const TERRAIN_CELL_SIDE=4;
const SIDE=TERRAIN_CELL_SIDE,CELLS_PER_TILE=SIDE*SIDE;
const UNITS=4,SEA=SEA_LEVEL*UNITS,MAX_DEPTH=15;
const ROCK=0,SOIL=1,SAND=2;
const MATERIALS=['stone','soil','sand'] as const;
export type TerrainMaterial=typeof MATERIALS[number];
export type TerrainCells={version:1;packed:string};
export type TerrainCell={height:number;material:TerrainMaterial;coverDepth:number;waterDepth:number;eroded:number};

const ALPHABET='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_';
const digits=new Int8Array(128).fill(-1);
for(let i=0;i<ALPHABET.length;i++)digits[ALPHABET.charCodeAt(i)]=i;
const digit=(text:string,i:number)=>digits[text.charCodeAt(i)]??-1;

/** A byte packs surface water and lost ground cover. Long dry stretches
 * compress to a skip, and the original terrain is regenerated from the seed. */
function packCells(cells:Uint8Array):string{
  let packed='';
  for(let i=0;i<cells.length;){
    const value=cells[i++];
    if(value){
      packed+=ALPHABET[value>>>6]+ALPHABET[value&63];
      continue;
    }
    const start=i-1;
    while(i<cells.length&&!cells[i])i++;
    if(i===cells.length)break;
    packed+='4';
    let skip=i-start;
    while(skip>=32){packed+=ALPHABET[(skip&31)+32];skip>>>=5;}
    packed+=ALPHABET[skip];
  }
  return packed;
}

function unpackCells(packed:string,count:number):Uint8Array|null{
  if(packed.length>count*2)return null;
  const cells=new Uint8Array(count);
  let index=0;
  for(let read=0;read<packed.length;){
    const high=digit(packed,read++);
    if(high<0||high>4||index>=count)return null;
    if(high<4){
      const low=digit(packed,read++);
      if(low<0)return null;
      cells[index++]=high*64+low;
      continue;
    }
    let skip=0,complete=false;
    for(let shift=0;shift<=20;shift+=5){
      const part=digit(packed,read++);
      if(part<0)return null;
      skip+=(part&31)*2**shift;
      if(part<32){complete=true;break;}
    }
    if(!complete||skip===0||index+skip>count)return null;
    index+=skip;
  }
  return cells;
}

type TerrainBase={seed:number;regional:boolean;columns:number;rows:number;
  ground:Uint16Array;material:Uint8Array;cover:Uint8Array;reservoir:Uint8Array;
  runoff:{index:number;tier:number}[];rainSpots:number[]};
const bases=new WeakMap<Topography,TerrainBase>();
const clamp=(value:number,low:number,high:number)=>Math.min(high,Math.max(low,value));

function baseTerrain(w:World):TerrainBase{
  const topography=topographyForWorld(w);
  const {width,height,tiles}=w,{seed}=w.settings,regional=!!w.settings.regionalGeography;
  const cached=bases.get(topography);
  if(cached?.seed===seed&&cached.regional===regional)return cached;
  const columns=width*SIDE,rows=height*SIDE,count=columns*rows;
  const ground=new Uint16Array(count),material=new Uint8Array(count);
  const cover=new Uint8Array(count),reservoir=new Uint8Array(count);
  const runoff:TerrainBase['runoff']=[],rainSpots:number[]=[];
  const drainage=hydrologyForWorld(w),heights=topography.heights;
  const beds=new Uint8Array(count);
  const lowPoint=new Uint32Array(tiles.length);
  for(let tile=0;tile<tiles.length;tile++){
    const x=tile%width,y=Math.floor(tile/width),biome=tiles[tile].biome;
    const water=biome==='water',rocky=biome==='mountain'||biome==='cave'||biome==='volcanic'||
      !!w.settings.landforms&&heights[tile]>=169;
    const neighbors=[x>0?tile-1:tile,x<width-1?tile+1:tile,
      y>0?tile-width:tile,y<height-1?tile+width:tile];
    const shore=neighbors.some(i=>tiles[i].biome==='water');
    const [west,east,north,south]=neighbors;
    const slopeX=clamp((heights[east]-heights[west])/2,-22,22);
    const slopeY=clamp((heights[south]-heights[north])/2,-22,22);
    let basin=Infinity;
    for(let row=0;row<SIDE;row++)for(let col=0;col<SIDE;col++){
      const sx=x*SIDE+col,sy=y*SIDE+row,index=sy*columns+sx;
      const grain=terrainHash(sx,sy,seed+1199);
      const layer=water?(grain<.7?SAND:ROCK):
        (rocky&&grain<.76)||grain<.075?ROCK:(shore&&grain<.68)||biome==='wasteland'?SAND:SOIL;
      reservoir[index]=+water;
      material[index]=layer;
      cover[index]=layer===ROCK?0:Math.round(3+grain*9);
      const slope=(col+.5-SIDE/2)/SIDE*slopeX+(row+.5-SIDE/2)/SIDE*slopeY;
      const altitude=heights[tile]+(water?0:slope)+(grain-.5)*3;
      ground[index]=Math.round(clamp(altitude*UNITS,
        water?4:SEA+cover[index],water?SEA-2:255*UNITS));
      if(ground[index]<basin){basin=ground[index];lowPoint[tile]=index;}
    }
  }

  // Runoff from a regional catchment feeds narrow cuts in the cell grid.
  // Flow inside and between the cuts is resolved from actual surface heights.
  const course=(tile:number,neighbor:number,tier:number)=>{
    if(tiles[tile].biome==='water')return;
    const tx=tile%width,ty=Math.floor(tile/width);
    const dx=Math.sign(neighbor%width-tx),dy=Math.sign(Math.floor(neighbor/width)-ty);
    const x=tx*SIDE+SIDE/2,y=ty*SIDE+SIDE/2;
    for(let step=0;step<=SIDE/2;step++){
      const sx=x+clamp(dx*step,-SIDE/2,SIDE/2-1);
      const sy=y+clamp(dy*step,-SIDE/2,SIDE/2-1);
      const index=sy*columns+sx;
      beds[index]=Math.max(beds[index],tier);
    }
  };
  for(let tile=0;tile<tiles.length;tile++){
    const tier=drainage.channel[tile],receiver=drainage.flowTo[tile];
    if(tier&&receiver>=0){
      course(tile,receiver,tier);
      course(receiver,tile,tier);
      const center=(Math.floor(tile/width)*SIDE+SIDE/2)*columns+tile%width*SIDE+SIDE/2;
      runoff.push({index:center,tier});
    }else if(tiles[tile].biome!=='water'&&terrainHash(tile%width,Math.floor(tile/width),seed+1097)<.10){
      rainSpots.push(lowPoint[tile]);
    }
  }
  for(let i=0;i<count;i++){
    if(!beds[i])continue;
    if(material[i]===SOIL)material[i]=SAND;
    ground[i]=Math.max(SEA+cover[i],ground[i]-4-beds[i]*2);
  }
  const base={seed,regional,columns,rows,ground,material,cover,reservoir,runoff,rainSpots};
  bases.set(topography,base);
  return base;
}

type Surface={base:TerrainBase;cells:Uint8Array;summaries:(TerrainCellSummary|undefined)[]};
const surfaces=new WeakMap<TerrainCells,Surface>();
const decoded=new WeakMap<TerrainCells,Uint8Array>();

function terrainSurface(w:World):Surface|undefined{
  if(!w.terrainCells)return;
  const base=baseTerrain(w),saved=surfaces.get(w.terrainCells);
  if(saved?.base===base)return saved;
  const cells=decoded.get(w.terrainCells)??unpackCells(w.terrainCells.packed,base.ground.length)!;
  decoded.set(w.terrainCells,cells);
  const surface={base,cells,summaries:new Array<TerrainCellSummary|undefined>(w.tiles.length)};
  surfaces.set(w.terrainCells,surface);
  return surface;
}

function saveCells(w:World,cells:Uint8Array):void{
  const packed=packCells(cells);
  if(w.terrainCells?.packed===packed)return;
  w.terrainCells={version:1,packed};
  decoded.set(w.terrainCells,cells);
}

/** Each pass moves existing water down a surface gradient. A fixed body of
 * water receives runoff at sea level. Two buffers bound how far water can
 * travel in one pass and keep each source from transferring the same water twice. */
export function routeTerrainWater(columns:number,rows:number,ground:Uint16Array,
  depth:Uint8Array,reservoir:Uint8Array,passes=8):{water:Uint8Array;flow:Uint8Array}{
  const count=columns*rows,flow=new Uint8Array(count);
  let water=depth.slice(),next=new Uint8Array(count);
  for(let pass=0;pass<passes;pass++){
    next.set(water);
    for(let j=0;j<count;j++){
      const i=pass%2?count-1-j:j;
      if(!water[i]||reservoir[i])continue;
      const x=i%columns,y=Math.floor(i/columns),head=ground[i]+water[i];
      let receiver=-1,bestGrade=0,drop=0;
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        if((!dx&&!dy)||x+dx<0||x+dx>=columns||y+dy<0||y+dy>=rows)continue;
        const other=i+dy*columns+dx;
        if(!reservoir[other]&&next[other]>=MAX_DEPTH)continue;
        const difference=head-(reservoir[other]?SEA:ground[other]+water[other]);
        const grade=difference*(dx&&dy?.7071:1);
        if(difference>=2&&grade>bestGrade){receiver=other;bestGrade=grade;drop=difference;}
      }
      if(receiver<0)continue;
      const amount=Math.min(water[i],Math.floor(drop/2),
        reservoir[receiver]?MAX_DEPTH:MAX_DEPTH-next[receiver]);
      next[i]-=amount;
      if(!reservoir[receiver])next[receiver]+=amount;
      flow[i]=Math.min(255,flow[i]+amount);
    }
    [water,next]=[next,water];
  }
  return {water,flow};
}

export function advanceTerrainCells(w:World):void{
  w.topography??=topographyForWorld(w);
  const base=baseTerrain(w);
  const before=terrainSurface(w)?.cells,ground=base.ground.slice();
  const depth=new Uint8Array(ground.length),erosion=new Uint8Array(ground.length);
  for(let i=0;i<ground.length;i++){
    const previous=before?.[i]??0;
    const removed=Math.min(base.cover[i],previous&15);
    erosion[i]=removed;
    ground[i]-=removed;
    if(!base.reservoir[i]){
      const sand=base.material[i]===SAND&&removed<base.cover[i];
      depth[i]=Math.max(0,(previous>>>4)-(sand?2:1));
    }
  }
  for(const {index,tier} of base.runoff)
    depth[index]=Math.min(MAX_DEPTH,depth[index]+5+tier*2);
  for(const index of base.rainSpots){
    if(terrainHash(index,w.year,base.seed+1373)<.65)
      depth[index]=Math.min(MAX_DEPTH,depth[index]+3);
  }
  const {water,flow}=routeTerrainWater(base.columns,base.rows,ground,depth,base.reservoir);
  for(let i=0;i<erosion.length;i++){
    const resistance=base.material[i]===SAND?6:14;
    if(!base.reservoir[i]&&erosion[i]<base.cover[i]&&flow[i]>=resistance)erosion[i]++;
    erosion[i]|=water[i]<<4;
  }
  saveCells(w,erosion);
}

export function enableTerrainCells(w:World):World{
  if(w.terrainCells)return w;
  const next={...w,settings:{...w.settings,terrainCells:true},topography:topographyForWorld(w)};
  advanceTerrainCells(next);
  return next;
}

function firstCell(w:World,tile:number,columns:number):number{
  return Math.floor(tile/w.width)*SIDE*columns+tile%w.width*SIDE;
}

export function clearTerrainTile(w:World,tile:number):void{
  const surface=terrainSurface(w);
  if(!surface)return;
  const cells=surface.cells.slice(),{columns}=surface.base,first=firstCell(w,tile,columns);
  for(let row=0;row<SIDE;row++)cells.fill(0,first+row*columns,first+row*columns+SIDE);
  saveCells(w,cells);
}

export function terrainCellsIn(w:World,tile:number):TerrainCell[]|undefined{
  const surface=terrainSurface(w);
  if(!surface)return;
  const {base,cells}=surface,first=firstCell(w,tile,base.columns);
  return Array.from({length:CELLS_PER_TILE},(_,offset)=>{
    const index=first+Math.floor(offset/SIDE)*base.columns+offset%SIDE;
    const eroded=Math.min(base.cover[index],cells[index]&15);
    const remaining=base.cover[index]-eroded;
    const ground=base.ground[index]-eroded;
    const water=base.reservoir[index]?SEA-ground:cells[index]>>>4;
    return {height:ground/UNITS,material:MATERIALS[remaining?base.material[index]:ROCK],
      coverDepth:remaining/UNITS,waterDepth:water/UNITS,eroded:eroded/UNITS};
  });
}

type TerrainCellSummary={footing:number;fertility:number;moistSoil:number};
export function terrainCellSummary(w:World,tile:number):TerrainCellSummary|undefined{
  const surface=terrainSurface(w);
  if(!surface||w.tiles[tile].biome==='water')return;
  const cached=surface.summaries[tile];
  if(cached)return cached;
  const {base,cells}=surface,{columns}=base,first=firstCell(w,tile,columns);
  let footing=0,fertility=0,moistSoil=0,low=Infinity,high=-Infinity;
  for(let row=0;row<SIDE;row++)for(let col=0;col<SIDE;col++){
    const i=first+row*columns+col,value=cells[i],depth=value>>>4;
    const eroded=Math.min(base.cover[i],value&15);
    const material=eroded<base.cover[i]?base.material[i]:ROCK;
    const height=base.ground[i]-eroded;
    low=Math.min(low,height);high=Math.max(high,height);
    footing+=(material===SAND?.18:material===SOIL?.04:0)+depth*.036;
    fertility+=material===SOIL?.15:material===SAND?-.12:-.17;
    if(material!==SOIL)continue;
    const x=i%columns,y=Math.floor(i/columns);
    const neighbors=[x>0?i-1:i,x<columns-1?i+1:i,y>0?i-columns:i,y<base.rows-1?i+columns:i];
    const nearby=neighbors.reduce((sum,index)=>sum+(base.reservoir[index]?0:cells[index]>>>4),0);
    const moisture=Math.min(1,depth*.07+nearby*.037);
    moistSoil+=moisture;
    fertility+=depth>=10?-.17:moisture*.24;
  }
  const summary={footing:1+footing/CELLS_PER_TILE+Math.min(.18,(high-low)*.004),
    fertility:1+fertility/CELLS_PER_TILE,
    moistSoil:moistSoil/CELLS_PER_TILE};
  surface.summaries[tile]=summary;
  return summary;
}

export function validTerrainCells(w:World):boolean{
  const state=w.terrainCells;
  if(state===undefined)return true;
  if(!w.settings.terrainCells||!state||state.version!==1||typeof state.packed!=='string')return false;
  const cells=unpackCells(state.packed,w.tiles.length*CELLS_PER_TILE);
  if(!cells)return false;
  decoded.set(state,cells);
  return true;
}
