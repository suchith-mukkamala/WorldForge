/** v2.1.4 — A bounded, deterministic family influence on innate gifts.
 * Parent gifts inform a child's affinity, without directly copying gifts or
 * predetermining potential. This deliberately uses no world RNG draws.
 */
import type {Genes} from './engine';
import {TRAIT_DOMAINS,INNATE_TRAIT_INFO,innateTrait,traitDomainWeight,
  type TraitDomain,type InnateTraitId} from './innateTraits';
import {potentialRank,TRAIT_RANKS,type TraitRank} from './traitRanks';

export type TraitResonance='aligned'|'complementary'|'diverse';
export type TraitHeritage={
  parentDomains:[TraitDomain,TraitDomain];
  affinity:TraitDomain;
  resonance:TraitResonance;
  /** 0–10: a bounded echo of parental potential, not a copied rank. */
  potentialEcho:number;
};
type Parent= {id:number;genes:Genes;innateTrait?:InnateTraitId;
  potentialRank?:TraitRank};
const paired=[['body','survival'],['senses','nature'],
  ['mind','craft'],['social','spirit']] as const;
const mix=(n:number)=>{
  n=Math.imul(n^(n>>>16),0x7feb352d);
  n=Math.imul(n^(n>>>15),0x846ca68b);
  return (n^(n>>>16))>>>0;
};
export function traitResonance(a:TraitDomain,b:TraitDomain):TraitResonance{
  if(a===b)return 'aligned';
  return paired.some(([x,y])=>(a===x&&b===y)||(a===y&&b===x))?
    'complementary':'diverse';
}
/** All domains remain possible, even when both parents share a gift family. */
export function heritageDomainWeight(domain:TraitDomain,genes:Genes,
  heritage:Pick<TraitHeritage,'parentDomains'|'affinity'|'resonance'>):number{
  const [a,b]=heritage.parentDomains;
  return traitDomainWeight(domain,genes)+
    (domain===a?.95:0)+(domain===b?.95:0)+
    (domain===heritage.affinity?.42:0);
}
/** Stable result for a particular birth: independent of bond iteration order
 * and simulation RNG. Parents may be any species or ancestry mixture. */
export function inheritedTraitHeritage(seed:number,id:number,genes:Genes,
  first:Parent,second:Parent):TraitHeritage{
  const a=INNATE_TRAIT_INFO[innateTrait(seed,first)].domain;
  const b=INNATE_TRAIT_INFO[innateTrait(seed,second)].domain;
  const resonance=traitResonance(a,b);
  const weights=TRAIT_DOMAINS.map(domain=>traitDomainWeight(domain,genes)+
    (domain===a?1.25:0)+(domain===b?1.25:0));
  let draw=mix(seed^Math.imul(id,0x72ec6b45)^0x29f18a35)/4294967296*
    weights.reduce((sum,weight)=>sum+weight,0);
  let affinity:TraitDomain=TRAIT_DOMAINS.at(-1)!;
  for(let i=0;i<TRAIT_DOMAINS.length;i++){
    draw-=weights[i];
    if(draw<0){affinity=TRAIT_DOMAINS[i];break;}
  }
  const aRank=TRAIT_RANKS.indexOf(potentialRank(seed,first));
  const bRank=TRAIT_RANKS.indexOf(potentialRank(seed,second));
  return {parentDomains:[a,b],affinity,resonance,
    potentialEcho:Math.max(0,Math.min(10,Math.round(
      .6*Math.max(aRank,bRank)+.4*Math.min(aRank,bRank))))};
}
export function isTraitHeritage(value:unknown):value is TraitHeritage{
  if(!value||typeof value!=='object')return false;
  const h=value as Partial<TraitHeritage>;
  return Array.isArray(h.parentDomains)&&h.parentDomains.length===2&&
    h.parentDomains.every(d=>TRAIT_DOMAINS.includes(d))&&
    TRAIT_DOMAINS.includes(h.affinity as TraitDomain)&&
    (h.resonance==='aligned'||h.resonance==='complementary'||
      h.resonance==='diverse')&&
    Number.isInteger(h.potentialEcho)&&
    (h.potentialEcho as number)>=0&&(h.potentialEcho as number)<=10&&
    h.resonance===traitResonance(h.parentDomains[0],h.parentDomains[1]);
}
/** Parental potential creates a *small* one-tier opportunity up to rank A.
 * The S+ to SSS tail remains solely the child's independent rare birth roll. */
export function inheritedPotentialUpgrade(seed:number,id:number,
  rank:TraitRank,heritage:TraitHeritage):TraitRank{
  const index=TRAIT_RANKS.indexOf(rank);
  if(index>=TRAIT_RANKS.indexOf('A')||heritage.potentialEcho===0)return rank;
  const chance=Math.min(.16,.01*heritage.potentialEcho+
    (heritage.resonance==='aligned'?.025:
      heritage.resonance==='complementary'?.012:0));
  const roll=mix(seed^Math.imul(id,0x6ec51ae1)^0x13a4c829)/4294967296;
  return roll<chance?TRAIT_RANKS[index+1]:rank;
}
