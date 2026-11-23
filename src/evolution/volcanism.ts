import {terrainHash} from './biomeGeneration';
import type {Biome,World} from './engine';
import {editDeposit} from './resources';
import {seaNeighbors,seaPoint} from './shipSave';
import {TERRAIN_CELL_SIDE,TERRAIN_ELEVATION_UNITS,clearTerrainTiles} from './terrainCells';
import {tidalApproach} from './tidalCaves';
import {SEA_LEVEL,topographyForWorld} from './topography';
import {volcanicCoastBiome,ventHasGround,type Volcano} from './volcanicGeography';
import {rewriteWoodland} from './woodland';
import {worldTreeBlocksBuilding} from './worldTree';

const SIDE=TERRAIN_CELL_SIDE,UNIT=TERRAIN_ELEVATION_UNITS,SEA=SEA_LEVEL*UNIT;
const STEPS=7,MAX_FLOOR=255*UNIT;
export const ERUPTION_DAYS=10;
const PIONEER_DAYS=365*2,SOIL_DAYS=365*6;
/** Index, original bed elevation, molten depth and solidified depth. The bed
 * stays fixed when a tile emerges, so the same basalt is never counted twice. */
export type LavaCell=[index:number,bed:number,molten:number,basalt:number];
export type Volcanism={cells:LavaCell[];shelves:[tile:number,formed:number][]};
export type VolcanoPhase='Erupting'|'Cooling'|'Dormant';
type VolcanoWorld=Pick<World,'width'|'height'|'volcanism'|'tiles'>;
export const volcanicDay=(world:Pick<World,'year'|'dayOfYear'>)=>world.year*365+(world.dayOfYear??0);
const erupting=(vent:Volcano,day:number)=>day>0&&(day+vent.offset)%vent.period<ERUPTION_DAYS;
const tileOf=(index:number,width:number)=>Math.floor(index/(width*SIDE*SIDE))*width+
  Math.floor(index%(width*SIDE)/SIDE);
const cellHeight=(cell:LavaCell)=>cell[1]+cell[2]+cell[3];

type LavaField={byTile:Map<number,LavaCell[]>;hot:Set<number>};
const fields=new WeakMap<LavaCell[],LavaField>();
const emptyField:LavaField={byTile:new Map(),hot:new Set()};
export function lavaField(world:Pick<VolcanoWorld,'width'|'volcanism'>):LavaField{
  const cells=world.volcanism?.cells;
  if(!cells?.length)return emptyField;
  const saved=fields.get(cells);
  if(saved)return saved;
  const field:LavaField={byTile:new Map(),hot:new Set()};
  for(const cell of cells){
    const tile=tileOf(cell[0],world.width);
    const patches=field.byTile.get(tile);
    if(patches)patches.push(cell);
    else field.byTile.set(tile,[cell]);
    if(cell[2]>=3)field.hot.add(tile);
  }
  fields.set(cells,field);
  return field;
}

export function volcanoPhase(world:World,vent:Volcano):VolcanoPhase{
  if(world.year<9999&&erupting(vent,volcanicDay(world))&&ventHasGround(world,vent))return 'Erupting';
  const {hot}=lavaField(world);
  return hot.has(vent.index)||seaNeighbors(vent.index,world.width,world.tiles.length).some(i=>hot.has(i))?
    'Cooling':'Dormant';
}

function protectedGround(world:World){
  const {width}=world;
  const reserved=new Set<number>();
  for(const vent of world.volcanicLayout?.vents??[])reserved.add(vent.rim);
  for(const link of world.underworld?.links??[])reserved.add(link.surface);
  if(world.underworld?.outpost!==undefined)reserved.add(world.underworld.outpost);
  for(const town of world.settlements){
    reserved.add(town.y*width+town.x);
    for(const plot of town.infrastructure?.buildings??[])
      if(plot.stage!=='ruin'&&plot.stage!=='abandoned')reserved.add(plot.y*width+plot.x);
  }
  for(const crossing of world.transport?.bridges??[])reserved.add(crossing.index);
  for(const site of world.ancientSites??[])reserved.add(site.y*width+site.x);
  return (i:number)=>reserved.has(i)||tidalApproach(world,i)||
    worldTreeBlocksBuilding(world.worldTree,i%width,Math.floor(i/width));
}

function eruption(world:World,vents:readonly Volcano[],cells:readonly LavaCell[]):LavaCell[]{
  const {width,height,tiles}=world,columns=width*SIDE,rows=height*SIDE;
  const heights=topographyForWorld(world).heights,seed=world.settings.seed;
  const blocked=protectedGround(world),magma=new Map<number,LavaCell>();
  const active=new Set<number>(),blockedTiles=new Map<number,boolean>();
  for(const saved of cells){
    magma.set(saved[0],[...saved]);
    if(saved[2]>0)active.add(saved[0]);
  }
  const sources=vents.flatMap(vent=>{
    const {x,y}=seaPoint(width,vent.index),at=(y*SIDE+1)*columns+x*SIDE+1;
    return [at,at+1,at+columns,at+columns+1];
  });
  const ranges=world.volcanicLayout!.vents.map(vent=>({...seaPoint(width,vent.index),radius:vent.radius}));
  const canFlow=(index:number)=>{
    if(index<0)return false;
    const tile=tileOf(index,width);
    const checked=blockedTiles.get(tile);
    if(checked!==undefined)return !checked;
    const x=tile%width,y=Math.floor(tile/width);
    const deny=blocked(tile)||!ranges.some(p=>(p.x-x)**2+(p.y-y)**2<=p.radius**2);
    blockedTiles.set(tile,deny);
    return !deny;
  };
  const floor=(index:number)=>{
    const tile=tileOf(index,width),x=tile%width,y=Math.floor(tile/width);
    const [n,e,s,w]=seaNeighbors(tile,width,tiles.length).map(i=>heights[i]??heights[tile]);
    const sx=(index%SIDE+.5)/SIDE-.5,sy=(Math.floor(index/columns)%SIDE+.5)/SIDE-.5;
    const grain=terrainHash(index,417,seed)*3-1;
    const sea=tiles[tile].biome==='water';
    const deeper=sea&&seaNeighbors(tile,width,tiles.length).every(i=>i<0||tiles[i].biome==='water');
    const bed=sea?Math.min(SEA_LEVEL-1,heights[tile])-(deeper?10:0):
      Math.max(SEA_LEVEL,heights[tile]+sx*(e-w)*.43+sy*(s-n)*.43);
    return Math.max(0,Math.min(MAX_FLOOR,Math.round(bed*UNIT+grain)));
  };
  const obtain=(i:number)=>{
    const existing=magma.get(i);
    if(existing)return existing;
    const cell:LavaCell=[i,floor(i),0,0];
    magma.set(i,cell);
    return cell;
  };
  const cool=(cell:LavaCell,amount:number)=>{
    const room=Math.max(0,MAX_FLOOR-cell[1]-cell[3]);
    const freeze=Math.min(amount,cell[2]);
    cell[2]-=freeze;
    cell[3]+=Math.min(room,freeze);
    if(!cell[2])active.delete(cell[0]);
  };
  const add=(delta:Map<number,number>,index:number,amount:number)=>
    delta.set(index,(delta.get(index)??0)+amount);
  // Resolve transfers from the same previous step. Neighbors receive exactly
  // the depth that the sending cell loses, including where two streams meet.
  for(let iteration=0;iteration<STEPS;iteration++){
    for(const index of sources){
      if(!canFlow(index))continue;
      const source=obtain(index);
      source[2]+=Math.max(0,Math.min(52,MAX_FLOOR-cellHeight(source)));
      if(source[2])active.add(index);
    }
    if(!active.size)break;
    const delta=new Map<number,number>();
    for(const index of active){
      const source=magma.get(index)!;
      if(source[2]<2)continue;
      const level=cellHeight(source);
      const slopes=seaNeighbors(index,columns,columns*rows).filter(canFlow)
        .map(next=>({next,drop:level-(magma.has(next)?cellHeight(magma.get(next)!):floor(next))}))
        .filter(option=>option.drop>2)
        .sort((a,b)=>b.drop-a.drop||a.next-b.next);
      // Viscous lava leaves a film in the sending cell. Draining every
      // square in a single step makes adjoining pools oscillate.
      let available=Math.max(1,Math.floor(source[2]*.68));
      for(const {next,drop} of slopes.slice(0,2)){
        const amount=Math.min(available,Math.floor(drop*.27),29);
        if(amount<1)break;
        available-=amount;
        add(delta,index,-amount);add(delta,next,amount);
      }
    }
    for(const [index,amount] of delta){
      const cell=obtain(index);
      cell[2]+=amount;
      if(cell[2])active.add(index);
      else active.delete(index);
    }
    // Water quenches lava nearly immediately. Subsequent pulses have to pile
    // above the submerged basement before the surface becomes dry land.
    for(const index of active){
      const cell=magma.get(index)!;
      if(tiles[tileOf(index,width)].biome==='water'&&cell[1]+cell[3]<SEA)
        cool(cell,Math.ceil(cell[2]*.8));
    }
  }
  for(const index of active){
    const cell=magma.get(index)!;
    cool(cell,Math.max(1,Math.ceil(cell[2]*(sources.length?.14:.31))));
  }
  return [...magma.values()].filter(cell=>cell[2]||cell[3]).sort((a,b)=>a[0]-b[0]);
}

function exposedLand(world:World,cells:readonly LavaCell[]){
  const heights=topographyForWorld(world).heights,counts=new Map<number,{dry:number;thickness:number}>();
  const blocked=protectedGround(world);
  // Keep existing mortal moorings and the tile under the active boat water.
  const berth=world.descent?.ship?.at;
  for(const [index,bed,,basalt] of cells){
    const tile=tileOf(index,world.width);
    if(world.tiles[tile].biome!=='water'||tile===berth||heights[tile]>SEA_LEVEL||
      bed+basalt<SEA+2||blocked(tile))continue;
    const patch=counts.get(tile)??{dry:0,thickness:0};
    patch.dry++;patch.thickness+=Math.min(12,bed+basalt-SEA);
    counts.set(tile,patch);
  }
  return [...counts].flatMap(([index,patch])=>patch.dry>=SIDE*SIDE*.625?
    [{index,elevation:SEA_LEVEL+Math.max(1,Math.round(patch.thickness/patch.dry/UNIT))}]:[]);
}

function drainCaldera(world:World,day:number):World{
  const layout=world.volcanicLayout,caldera=layout?.caldera;
  if(!layout||!caldera||caldera.drainedAt!==undefined||day<caldera.breachDay)return world;
  const {lake,outflow}=caldera,{tiles}=world;
  const center=lake[0],shore=outflow[outflow.length-1],cut=outflow.slice(1,-1);
  const heights=topographyForWorld(world).heights;
  const upper=heights[center];
  if(upper<SEA_LEVEL+13||lake.some(i=>tiles[i].biome!=='water'||heights[i]!==upper)||
    tiles[shore].biome!=='water'||heights[shore]>SEA_LEVEL)return world;
  const basin=new Set(lake);
  if(cut.some(i=>!basin.has(i)&&tiles[i].biome==='water'))return world;
  const ship=world.descent?.ship;
  if(ship&&basin.has(ship.at)||world.shipments?.some(ship=>ship.mode==='sea'&&
    ship.route.some(i=>basin.has(i))))return world;

  const changed=new Set([...lake,...cut]),blocked=protectedGround(world);
  const lava=lavaField(world).byTile;
  if([...changed].some(i=>blocked(i)||lava.has(i)))return world;
  const lower=SEA_LEVEL+Math.max(6,Math.floor((upper-SEA_LEVEL)*.34));
  const elevations=heights.slice();
  const next:World={...world,tiles:tiles.slice(),topography:{version:1,heights:elevations},
    volcanicLayout:{...layout,caldera:{...caldera,drainedAt:day}},
    nextEventId:world.nextEventId+1,events:[...world.events,{
      id:world.nextEventId,year:Math.floor(day/365),type:'world' as const,
      message:'The caldera rim gave way. A new river cuts through the old volcanic island.',
    }].slice(-90)};
  const origin=seaPoint(world.width,center),edits:[number,Biome][]=[];
  elevations[center]=lower;
  for(const i of lake.slice(1)){
    const p=seaPoint(world.width,i);
    elevations[i]=Math.min(upper-1,lower+Math.ceil(Math.hypot(p.x-origin.x,p.y-origin.y))*3);
    next.tiles[i]={biome:'wasteland',food:.15};
    edits.push([i,'wasteland']);
    editDeposit(next,i);
  }
  let upstream=lower;
  for(const [step,i] of cut.entries()){
    const grade=Math.round(lower-(lower-SEA_LEVEL-1)*(step+1)/(cut.length+1));
    elevations[i]=upstream=Math.max(SEA_LEVEL+1,Math.min(upstream-1,grade,elevations[i]));
  }
  clearTerrainTiles(next,[...changed]);
  if(world.woodland)next.woodland=rewriteWoodland(world.woodland,edits);
  return next;
}

/** Each calendar day is deterministic regardless of playback speed. World
 * topology changes when a basalt shelf clears sea level or a caldera drains. */
export function advanceVolcanism(world:World,day:number):World{
  world=drainCaldera(world,day);
  const layout=world.volcanicLayout;
  if(!layout?.vents.length)return world;
  const previous=world.volcanism,old=previous?.cells??[];
  const closedCalendar=day>=9999*365;
  const vents=closedCalendar?[]:layout.vents.filter(vent=>erupting(vent,day)&&ventHasGround(world,vent));
  const moves=vents.length>0||old.some(cell=>cell[2]>0);
  const cells=moves?(closedCalendar?old.map(([index,bed,molten,basalt]):LavaCell=>
    [index,bed,0,Math.min(MAX_FLOOR-bed,molten+basalt)]):eruption(world,vents,old)):old;
  const emerging=moves||world.descent?.ship?exposedLand(world,cells):[];
  const shelves=previous?.shelves??[],seed=world.settings.seed;
  const growth=day%30===0?shelves.flatMap(([index,formed])=>{
    const elapsed=day-formed,biome=world.tiles[index].biome;
    if(elapsed>=SOIL_DAYS&&biome==='wasteland'){
      return [[index,volcanicCoastBiome(world.width,world.height,index,seed)] satisfies [number,Biome]];
    }
    return elapsed>=PIONEER_DAYS&&biome==='volcanic'?[[index,'wasteland'] satisfies [number,Biome]]:[];
  }):[];
  if(!moves&&!emerging.length&&!growth.length)return world;
  const next:World={...world,volcanism:{cells,
    shelves:emerging.length?[...shelves,...emerging.map(({index}):[number,number]=>[index,day])]:shelves}};
  if(!emerging.length&&!growth.length)return next;
  next.tiles=world.tiles.slice();
  const edits:[number,Biome][]=[...growth,...emerging.map(({index}):[number,Biome]=>[index,'volcanic'])];
  for(const [index,biome] of edits){
    next.tiles[index]={biome,food:biome==='volcanic'?0:biome==='wasteland'?.15:1};
    editDeposit(next,index);
  }
  if(emerging.length){
    const heights=topographyForWorld(world).heights.slice();
    for(const {index,elevation} of emerging)heights[index]=elevation;
    next.topography={version:1,heights};
    clearTerrainTiles(next,emerging.map(({index})=>index));
  }
  if(world.woodland)next.woodland=rewriteWoodland(world.woodland,edits);
  return next;
}

export function resetVolcanicTile(world:World,index:number):void{
  const before=world.volcanism;
  if(!before||!lavaField(world).byTile.has(index)&&!before.shelves.some(entry=>entry[0]===index))return;
  world.volcanism={cells:before.cells.filter(cell=>tileOf(cell[0],world.width)!==index),
    shelves:before.shelves.filter(entry=>entry[0]!==index)};
}

export function validVolcanism(value:unknown,width:number,height:number):value is Volcanism{
  if(!value||typeof value!=='object')return false;
  const {cells,shelves}=value as Volcanism,count=width*height;
  const integer=(n:number,max:number)=>Number.isInteger(n)&&n>=0&&n<=max;
  return Array.isArray(cells)&&cells.length<=count*SIDE*SIDE&&cells.every((cell,i)=>
    Array.isArray(cell)&&cell.length===4&&integer(cell[0],count*SIDE*SIDE-1)&&
    (!i||cells[i-1][0]<cell[0])&&integer(cell[1],MAX_FLOOR)&&
    integer(cell[2],MAX_FLOOR*2)&&integer(cell[3],MAX_FLOOR-cell[1]))&&
    Array.isArray(shelves)&&shelves.length<=count&&shelves.every(entry=>
      Array.isArray(entry)&&entry.length===2&&integer(entry[0],count-1)&&integer(entry[1],3650000));
}
