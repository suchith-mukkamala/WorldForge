/** Mind Engine III — lightweight experiential preference learning.
 * Outcomes are already durable in Cognition.history. Derive a small,
 * deterministic preference from those records instead of introducing a
 * parallel mutable memory table or running inference for every agent/day.
 */
import type {Cognition,Purpose} from './mindII';

export function experiencePreference(c:Cognition|undefined,
  purpose:Purpose,year:number):number{
  if(!c)return 0;
  let weight=0;
  // Recent, repeated outcomes matter; old experiences gradually fade.
  for(const event of c.history){
    if(event.purpose!==purpose)continue;
    const age=Math.max(0,year-event.year);
    if(age>25)continue;
    const recency=Math.max(.15,1-age/26);
    const signal=event.outcome==='completed'?3:
      event.outcome==='abandoned'?-5:-1;
    weight+=signal*recency;
  }
  return Math.round(Math.max(-12,Math.min(12,weight))*100)/100;
}
