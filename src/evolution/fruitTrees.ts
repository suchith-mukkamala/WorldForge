import {terrainHash} from './biomeGeneration';
import type {World} from './engine';
import {visualSeason,VISUAL_SEASONS,type VisualSeason} from './sceneAtmosphere';

export type FruitKind='mulberry'|'cherry'|'apple'|'baobab';
export type FruitStage='dormant'|'bloom'|'green'|'ripe'|'picked';
export type FruitHarvest={year:number;trees:number[]};
export const FRUIT={
  mulberry:{tree:'River mulberry',fruit:'mulberries',season:'Bloom',energy:8,
    color:'#ae537d',light:'#e28ea3',flower:'#edced4'},
  cherry:{tree:'Wild cherry',fruit:'cherries',season:'Highsun',energy:10,
    color:'#c84053',light:'#ff8077',flower:'#efb8cd'},
  apple:{tree:'Wild apple',fruit:'wild apples',season:'Harvest',energy:12,
    color:'#db6346',light:'#ffbe62',flower:'#f6e4cf'},
  baobab:{tree:'Baobab',fruit:'baobab pods',season:'Frost',energy:14,
    color:'#be8f4f',light:'#f2cc82',flower:'#ece2c1'},
} as const satisfies Record<FruitKind,{tree:string;fruit:string;season:VisualSeason;
  energy:number;color:string;light:string;flower:string}>;

type Terrain=Pick<World,'width'|'height'|'tiles'|'settings'>;
type Clock=Pick<World,'year'|'dayOfYear'|'fruitHarvest'>;
export type FruitTree={index:number;x:number;y:number;kind:FruitKind;variant:number};

const SPACING=4;
const RIPEN_AFTER=14;
const START=[0,92,183,274] as const;
const picked=new WeakMap<readonly number[],ReadonlySet<number>>();

/** One seeded candidate per small square keeps wild fruit local and sparse.
 * The habitat determines the kind, independently of the current season. */
export function fruitTreeAt(world:Terrain,index:number):FruitTree|undefined{
  const biome=world.tiles[index]?.biome;
  if(biome!=='forest'&&biome!=='plains'&&biome!=='wetland'&&biome!=='savanna')return;
  const x=index%world.width,y=Math.floor(index/world.width),seed=world.settings.seed;
  const col=Math.floor(x/SPACING),row=Math.floor(y/SPACING);
  if(x%SPACING!==Math.min(SPACING-1,Math.floor(terrainHash(col,row,seed+7119)*SPACING))||
    y%SPACING!==Math.min(SPACING-1,Math.floor(terrainHash(col,row,seed+8167)*SPACING)))return;
  const roll=terrainHash(x,y,seed+9143);
  if(biome==='plains'&&roll<.46)return;
  const kind:FruitKind=biome==='wetland'?'mulberry':biome==='savanna'?'baobab':
    roll<.52?'cherry':'apple';
  return {index,x,y,kind,variant:Math.floor(terrainHash(x,y,seed+9121)*4)&3};
}

export function fruitCycle(world:Pick<World,'dayOfYear'>){
  const day=world.dayOfYear??0,season=visualSeason(day);
  return {season,ripe:day-START[VISUAL_SEASONS.indexOf(season)]>=RIPEN_AFTER};
}

function isPicked(harvest:FruitHarvest|undefined,year:number,index:number){
  if(!harvest||harvest.year!==year)return false;
  let sites=picked.get(harvest.trees);
  if(!sites){sites=new Set(harvest.trees);picked.set(harvest.trees,sites);}
  return sites.has(index);
}

export function fruitStage(world:Clock,tree:FruitTree,cycle=fruitCycle(world)):FruitStage{
  const growing=FRUIT[tree.kind].season;
  if(cycle.season===growing){
    if(isPicked(world.fruitHarvest,world.year,tree.index))return 'picked';
    return cycle.ripe?'ripe':'green';
  }
  return growing===VISUAL_SEASONS[(VISUAL_SEASONS.indexOf(cycle.season)+1)%4]?'bloom':'dormant';
}

export function fruitStatus(world:Clock,tree:FruitTree):string{
  const {season}=FRUIT[tree.kind],stage=fruitStage(world,tree);
  if(stage==='ripe')return 'Ripe fruit';
  if(stage==='picked')return 'Picked this season';
  if(stage==='green')return 'Fruit is still green';
  return (stage==='bloom'?'In bloom · ':'')+'Ripens in '+season;
}

export function validFruitHarvest(value:unknown,year:number,tileCount:number):boolean{
  if(!value||typeof value!=='object')return false;
  const harvest=value as FruitHarvest;
  return Number.isInteger(harvest.year)&&harvest.year>=0&&harvest.year<=year&&
    Array.isArray(harvest.trees)&&harvest.trees.length<=tileCount&&
    new Set(harvest.trees).size===harvest.trees.length&&
    harvest.trees.every(i=>Number.isInteger(i)&&i>=0&&i<tileCount);
}
