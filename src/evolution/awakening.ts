/** v2.1.3 — natural awakening follows the *individual's* effective lifespan.
 * The schedule uses a separate seeded hash and never draws from simulation
 * randomness. Some people never awaken naturally, regardless of trait rank.
 */
import type {Ancestry,Genes} from './engine';
import {traitProfile} from './family';

export type AwakeningRecord={kind:'natural';age:number;year:number};
export type AwakeningPhase='early'|'adult'|'late'|'never';
export type AwakeningPlan={age:number|null;phase:AwakeningPhase};

const mix=(n:number)=>{
  n=Math.imul(n^(n>>>16),0x7feb352d);
  n=Math.imul(n^(n>>>15),0x846ca68b);
  return (n^(n>>>16))>>>0;
};
const chance=(n:number)=>mix(n)/4294967296;

export function awakeningWindow(ancestry:Ancestry):{earliest:number;latest:number}{
  const {maturity,lifespan}=traitProfile(ancestry);
  const remaining=Math.max(1,lifespan-maturity);
  return {earliest:Math.max(1,Math.round(maturity*.6)),
    latest:Math.max(2,Math.round(maturity+remaining*.7))};
}

/** Most people may awaken, but ~18% have no scheduled natural awakening.
 * Early, ordinary and late timing scale to mixed ancestry as well as to
 * full-blooded human, elf, dwarf and demon lifespans. Neither rarity nor
 * species guarantees an outcome; meaningful deeds can matter in v2.3. */
export function naturalAwakeningPlan(seed:number,id:number,genes:Genes,
  ancestry:Ancestry):AwakeningPlan{
  const genetic=Math.imul(Math.round(genes.vigor*1000),0x27d4eb2d)^
    Math.imul(Math.round(genes.curiosity*1000),0x165667b1)^
    Math.imul(Math.round(genes.social*1000),0x85ebca6b)^
    Math.imul(Math.round(genes.fertility*1000),0x9e3779b1);
  const identity=seed^Math.imul(id,0x61c88647)^genetic;
  const fate=chance(identity^0x25e88a31);
  if(fate>=.82)return {age:null,phase:'never'};
  const timing=chance(identity^0x7f4a7c15);
  const {maturity,lifespan}=traitProfile(ancestry);
  const remaining=Math.max(1,lifespan-maturity);
  if(fate<.18)return {age:Math.max(1,Math.round(maturity*(.6+.4*timing))),
    phase:'early'};
  if(fate<.68)return {age:Math.max(1,Math.round(maturity+
      remaining*(.04+.26*timing))),phase:'adult'};
  return {age:Math.max(1,Math.round(maturity+
    remaining*(.32+.38*timing))),phase:'late'};
}

export function isAwakeningRecord(value:unknown,born:number,year:number):
  value is AwakeningRecord{
  if(!value||typeof value!=='object')return false;
  const v=value as Partial<AwakeningRecord>;
  return v.kind==='natural'&&typeof v.age==='number'&&
    Number.isInteger(v.age)&&v.age>=1&&typeof v.year==='number'&&
    Number.isInteger(v.year)&&v.year>=0&&v.year>=born&&v.year<=year;
}
