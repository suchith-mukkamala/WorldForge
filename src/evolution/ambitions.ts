/** Mind Engine III: ambitions emerge from repeated achievements, never from
 * a fixed destiny or a random assigned career. Temperament and a settlement
 * custom may break a tie. They cannot create an ambition from one success.
 * Existing history is enough to reconstruct eligibility; a chosen intention
 * is persisted separately. */
import type {Cognition,DateStamp,Purpose} from './mindII';

export type PersonalAmbition={purpose:Purpose;since:DateStamp;
  commitment:number;reason:string};
const eligible=['learn','explore','connect','care','work','create',
  'reflect'] as const;
export const AMBITION_PURPOSES=eligible;
export type AmbitionPurpose=typeof eligible[number];
export type AmbitionBias=Partial<Record<AmbitionPurpose,number>>;
const REASONS:Record<AmbitionPurpose,string>={
  learn:'Finished studies made learning the pursuit worth keeping.',
  explore:'Finished journeys made unfamiliar places feel necessary.',
  connect:'Repeated efforts to know people became the point.',
  care:'Looking after others, again and again, became the aim.',
  work:'Finished labor made a useful contribution feel essential.',
  create:'Things actually finished gave this life a craft to keep.',
  reflect:'Time spent on belief settled into a lasting inward aim.',
};
function leanOf(bias:AmbitionBias|undefined,purpose:AmbitionPurpose):number{
  const n=bias?.[purpose];
  return typeof n==='number'&&Number.isFinite(n)?Math.max(0,Math.min(1,n)):0;
}
function ambitionReason(purpose:AmbitionPurpose,lean:number):string{
  const base=REASONS[purpose];
  return lean>=.62?base+' It already fit their temperament.':base;
}

export function developAmbition(c:Cognition,at:DateStamp,
  mature:boolean,bias?:AmbitionBias):PersonalAmbition|undefined{
  if(!mature)return c.ambition;
  const counts=new Map<AmbitionPurpose,number>();
  for(const h of c.history){
    if(h.outcome!=='completed'||!eligible.includes(h.purpose as AmbitionPurpose)||
      at.year-h.year>20)continue;
    const purpose=h.purpose as AmbitionPurpose;
    counts.set(purpose,(counts.get(purpose)??0)+1);
  }
  const candidates=[...counts].filter(([,count])=>count>=2)
    .sort((a,b)=>b[1]-a[1]||leanOf(bias,b[0])-leanOf(bias,a[0])||
      eligible.indexOf(a[0])-eligible.indexOf(b[0]));
  const strongest=candidates[0];
  if(!strongest)return c.ambition;
  if(c.ambition){
    const current=counts.get(c.ambition.purpose as AmbitionPurpose)??0;
    // Don't flip ambitions weekly. Only a sufficiently stronger history of
    // success can change a settled direction after five years.
    if(at.year-c.ambition.since.year<5||strongest[1]<current+2)
      return c.ambition;
  }
  const lean=leanOf(bias,strongest[0]);
  const bonus=lean>=.72?2:lean>=.45?1:0;
  return {purpose:strongest[0],since:{...at},
    commitment:Math.min(12,4+strongest[1]*2+bonus),
    reason:ambitionReason(strongest[0],lean)};
}
