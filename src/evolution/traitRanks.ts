/** v2.1.1 — rank vocabulary shared by innate gifts and future disciplines.
 * Potential is a birth fact, not a measure of virtue, guaranteed power or
 * mastery. None of these calculations consumes the world's simulation RNG.
 */
import type {Genes} from './engine';

export const TRAIT_RANKS=[
  'F','E','D','C','B','A','S','S+','SS','SS+','SSS',
] as const;
export type TraitRank=typeof TRAIT_RANKS[number];
export const TRAIT_RANK_INFO:Record<TraitRank,{
  title:string;color:string;potency:number;birthRate:number;
}>={
  F:{title:'Ordinary',color:'#8eabb6',potency:1,birthRate:28},
  E:{title:'Developing',color:'#85baa8',potency:1.3,birthRate:22},
  D:{title:'Promising',color:'#7abed0',potency:1.7,birthRate:17},
  C:{title:'Uncommon',color:'#90ca8b',potency:2.2,birthRate:12},
  B:{title:'Gifted',color:'#d8cb88',potency:2.9,birthRate:9},
  A:{title:'Exceptional',color:'#f0bd79',potency:3.8,birthRate:6},
  S:{title:'Extraordinary',color:'#e998aa',potency:5,birthRate:3},
  'S+':{title:'Mythic',color:'#e7a4e4',potency:6.4,birthRate:1.5},
  SS:{title:'Legendary',color:'#c4b4fa',potency:8.2,birthRate:.9},
  'SS+':{title:'Transcendent',color:'#a3d9f6',potency:10.5,birthRate:.45},
  SSS:{title:'World-changing',color:'#f4e6a7',potency:13.5,birthRate:.15},
};

export const isTraitRank=(rank:unknown):rank is TraitRank=>
  typeof rank==='string'&&(TRAIT_RANKS as readonly string[]).includes(rank);

/** A fixed, world-seed-independent-from-RNG hash. Genes contribute to the
 * outcome without making any species automatically superior. Later ancestry
 * inheritance can use these fixed birth records without rerolling elders. */
const mix=(n:number)=>{
  n=Math.imul(n^(n>>>16),0x7feb352d);
  n=Math.imul(n^(n>>>15),0x846ca68b);
  return (n^(n>>>16))>>>0;
};
export function rankForRoll(roll:number):TraitRank{
  const value=Math.max(0,Math.min(1,Number.isFinite(roll)?roll:0));
  let percentile=0;
  for(const rank of TRAIT_RANKS){
    percentile+=TRAIT_RANK_INFO[rank].birthRate/100;
    if(value<percentile)return rank;
  }
  return 'SSS';
}
export function birthPotentialRank(seed:number,id:number,genes:Genes):TraitRank{
  const genetic=Math.imul(Math.round(genes.vigor*1000),0x27d4eb2d)^
    Math.imul(Math.round(genes.curiosity*1000),0x165667b1)^
    Math.imul(Math.round(genes.social*1000),0x9e3779b1)^
    Math.imul(Math.round(genes.fertility*1000),0x85ebca6b);
  const roll=mix(seed^Math.imul(id,0x9e3779b1)^genetic)/4294967296;
  return rankForRoll(roll);
}
export function potentialRank(seed:number,person:{
  id:number;genes:Genes;potentialRank?:TraitRank;
}):TraitRank{
  return isTraitRank(person.potentialRank)?person.potentialRank:
    birthPotentialRank(seed,person.id,person.genes);
}

/** A separate *trained proficiency* scale. F-level practice can be mastered
 * without ever implying an S-rank supernatural gift; the highest stages are
 * intentionally very difficult to reach under the existing skill engine. */
export function proficiencyRank(mastery:number):TraitRank{
  const thresholds=[0,9,18,29,41,54,67,77,86,93,98];
  const value=Math.max(0,Math.min(100,Number.isFinite(mastery)?mastery:0));
  for(let i=thresholds.length-1;i>=0;i--)
    if(value>=thresholds[i])return TRAIT_RANKS[i];
  return 'F';
}

/** Future trait effects scale nonlinearly with both quality and investment.
 * At equal mastery an F gift cannot match S or SSS, but an F gift can still
 * be more useful than an untrained high-rank gift in a particular situation. */
export function traitPotency(rank:TraitRank,mastery:number):number{
  const m=Math.max(0,Math.min(100,Number.isFinite(mastery)?mastery:0));
  const fraction=(1-Math.exp(-3*m/100))/(1-Math.exp(-3));
  return TRAIT_RANK_INFO[rank].potency*(.08+.92*fraction);
}
