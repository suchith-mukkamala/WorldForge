/** Mind Engine III: ambitions emerge from repeated achievements, never from
 * a fixed destiny or a random assigned career. Existing history is enough
 * to reconstruct eligibility; a chosen intention is persisted separately. */
import type {Cognition,DateStamp,Purpose} from './mindII';

export type PersonalAmbition={purpose:Purpose;since:DateStamp;
  commitment:number;reason:string};
const eligible:readonly Purpose[]=['learn','explore','connect','care',
  'work','create','reflect'];

export function developAmbition(c:Cognition,at:DateStamp,
  mature:boolean):PersonalAmbition|undefined{
  if(!mature)return c.ambition;
  const counts=new Map<Purpose,number>();
  for(const h of c.history){
    if(h.outcome!=='completed'||!eligible.includes(h.purpose)||
      at.year-h.year>20)continue;
    counts.set(h.purpose,(counts.get(h.purpose)??0)+1);
  }
  const candidates=[...counts].filter(([,count])=>count>=2)
    .sort((a,b)=>b[1]-a[1]||eligible.indexOf(a[0])-eligible.indexOf(b[0]));
  const strongest=candidates[0];
  if(!strongest)return c.ambition;
  if(c.ambition){
    const current=counts.get(c.ambition.purpose)??0;
    // Don't flip ambitions weekly. Only a sufficiently stronger history of
    // success can change a settled direction after five years.
    if(at.year-c.ambition.since.year<5||strongest[1]<current+2)
      return c.ambition;
  }
  return {purpose:strongest[0],since:{...at},
    commitment:Math.min(12,4+strongest[1]*2),
    reason:'Repeated personal accomplishments made this pursuit meaningful.'};
}
