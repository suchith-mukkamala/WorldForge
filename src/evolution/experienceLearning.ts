/** Mind Engine III — lightweight experiential preference learning.
 * Outcomes are already durable in Cognition.history. Derive a small,
 * deterministic preference from those records instead of introducing a
 * parallel mutable memory table or running inference for every agent/day.
 */
import type {Cognition,Purpose,StepKind} from './mindII';

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

/** Specific attempts are remembered when a real plan step completes or is
 * abandoned after obstruction. They influence later pursuits mildly without
 * rewarding mere passage of time or persisting unbounded daily events. */
export function stepExperiencePreference(c:Cognition|undefined,
  purpose:Purpose,year:number):number{
  if(!c?.lessons?.length)return 0;
  let weight=0;
  for(const lesson of c.lessons){
    if(lesson.purpose!==purpose)continue;
    const age=Math.max(0,year-lesson.year);
    if(age>20)continue;
    weight+=(lesson.result==='achieved'?1.5:-2.5)*(1-age/21);
  }
  return Math.round(Math.max(-8,Math.min(8,weight))*100)/100;
}

export type LearnedDisposition={habit?:StepKind;caution?:StepKind};
/** Habits and wariness emerge from repeated real outcomes. Neither genetics
 * nor morals are overwritten, and no trait is inferred from a single event. */
export function learnedDisposition(c:Cognition|undefined,
  year:number):LearnedDisposition{
  if(!c?.lessons?.length)return {};
  const counts=new Map<StepKind,{success:number;blocked:number}>();
  for(const lesson of c.lessons){
    if(year-lesson.year>18)continue;
    const count=counts.get(lesson.kind)??{success:0,blocked:0};
    if(lesson.result==='achieved')count.success++;
    else count.blocked++;
    counts.set(lesson.kind,count);
  }
  let habit:StepKind|undefined,caution:StepKind|undefined;
  let habitual=2,wariness=1;
  for(const [kind,count] of counts){
    const confidence=count.success-count.blocked;
    const risk=count.blocked-count.success;
    if(count.success>=3&&confidence>habitual){habit=kind;habitual=confidence;}
    if(count.blocked>=2&&risk>wariness){caution=kind;wariness=risk;}
  }
  return {...(habit?{habit}:{}),...(caution?{caution}:{})};
}
