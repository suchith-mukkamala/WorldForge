import type {Biome} from './engine';

export const TREE_KINDS=['oak','pine','birch','spruce','larch','willow','acacia','baobab'] as const;
export type TreeKind=typeof TREE_KINDS[number];
const kinds=new Set<string>(TREE_KINDS);
export const isTreeKind=(kind:string|undefined):kind is TreeKind=>!!kind&&kinds.has(kind);

/** The same seeded species selection works in the atlas and on foot. */
export function biomeTreeAt(biome:Biome,variant:number,elevation:number):TreeKind{
  if(biome==='taiga')return variant%3===1?'larch':'spruce';
  if(biome==='wetland')return 'willow';
  if(biome==='savanna')return variant%4===2?'baobab':'acacia';
  if(elevation>=140||variant%4===3)return 'pine';
  return variant%4===1?'birch':'oak';
}
