/** Stable personal leanings. They are derived from the world seed, identity
 * and genes, so older saves gain them without a migration or an RNG draw.
 * Temperament colors spare hours and which proven ambition sticks. It never
 * overrides hunger, illness, or a duty already chosen. */
import type {Genes} from './engine';
import type {CustomId} from './customs';

export const TEMPERAMENT_AXES=['warmth','drive','openness','steadiness'] as const;
export type TemperamentAxis=typeof TEMPERAMENT_AXES[number];
export type Temperament=Record<TemperamentAxis,number>;
const AMBITION_PURPOSES=['learn','explore','connect','care','work','create',
  'reflect'] as const;
type AmbitionPurpose=typeof AMBITION_PURPOSES[number];

const mix=(n:number)=>{
  n=Math.imul(n^(n>>>16),0x7feb352d);
  n=Math.imul(n^(n>>>15),0x846ca68b);
  return (n^(n>>>16))>>>0;
};
function axis(seed:number,id:number,salt:number,gene:number):number{
  const roll=mix(seed^Math.imul(id,salt))/4294967296;
  const base=16+roll*68;
  const pull=(gene-1)*28;
  return Math.max(0,Math.min(100,Math.round(base+pull)));
}
export function birthTemperament(seed:number,id:number,genes:Genes):Temperament{
  const steady=genes.vigor*.4+(2-genes.curiosity)*.6;
  return {
    warmth:axis(seed,id,0x51ed2c1b,genes.social),
    drive:axis(seed,id,0x27d4eb2d,genes.vigor),
    openness:axis(seed,id,0x165667b1,genes.curiosity),
    steadiness:axis(seed,id,0x85ebca6b,steady),
  };
}
export function temperamentOf(seed:number,person:{id:number;genes:Genes}):Temperament{
  return birthTemperament(seed,person.id,person.genes);
}

const POLES:Record<TemperamentAxis,[string,string]>={
  warmth:['reserved','warm'],
  drive:['content','driven'],
  openness:['rooted','curious'],
  steadiness:['restless','steady'],
};
export function temperamentPoles(t:Temperament):string[]{
  const bits:string[]=[];
  for(const axis of TEMPERAMENT_AXES){
    const [low,high]=POLES[axis];
    if(t[axis]>=67)bits.push(high);
    else if(t[axis]<=33)bits.push(low);
  }
  return bits;
}
export function temperamentPhrase(t:Temperament):string{
  const bits=temperamentPoles(t);
  if(!bits.length)return 'even-tempered';
  if(bits.length===1)return bits[0];
  return bits.slice(0,-1).join(', ')+' and '+bits[bits.length-1];
}
export function temperamentSummary(t:Temperament):string{
  return 'This person is '+temperamentPhrase(t)+
    '. The leaning is fixed at birth. It only colors spare time and which '+
    'proven ambition sticks; hunger, illness and accepted duties come first.';
}

/** Fractional preference used to break ties between equally proven ambitions.
 * A value below 1 cannot invent an ambition from a single success. */
function leanWeight(t:Temperament,purpose:string):number{
  const w=t.warmth/100,d=t.drive/100,o=t.openness/100,s=t.steadiness/100;
  let weight:number;
  switch(purpose){
    case 'learn':weight=o*.75+d*.25;break;
    case 'explore':weight=o*.55+(1-s)*.45;break;
    case 'connect':weight=w*.8+(1-s)*.1;break;
    case 'care':weight=w*.6+s*.3;break;
    case 'work':weight=d*.5+s*.45;break;
    case 'create':weight=d*.45+o*.45;break;
    case 'reflect':weight=s*.4+(1-d)*.35+(1-o)*.15;break;
    default:return 0;
  }
  return Math.round(weight*1000)/1000;
}
export function ambitionLean(t:Temperament):Record<AmbitionPurpose,number>{
  return {
    learn:leanWeight(t,'learn'),explore:leanWeight(t,'explore'),
    connect:leanWeight(t,'connect'),care:leanWeight(t,'care'),
    work:leanWeight(t,'work'),create:leanWeight(t,'create'),reflect:leanWeight(t,'reflect'),
  };
}
export function temperamentNudge(t:Temperament,purpose:string):number{
  return Math.round(leanWeight(t,purpose)*3*100)/100;
}

export type SpareActivity='rest'|'work'|'forage'|'study'|'care'|'socialize'|
  'travel'|'craft'|'reflect';
/** A free hour's preference. Callers decide whether the hour is actually free. */
export function spareLean(t:Temperament,options?:{
  custom?:CustomId;hasWork?:boolean;canCare?:boolean;
}):{activity:SpareActivity;reason:string}|null{
  const custom=options?.custom;
  let choice:{activity:SpareActivity;reason:string}|null=null;
  if(t.warmth>=68)choice={activity:'socialize',
    reason:'A warm temperament spends an open hour with people.'};
  else if(t.openness>=68&&t.steadiness<=40)choice={activity:'travel',
    reason:'A restless curiosity turns a free hour into wandering.'};
  else if(t.openness>=68)choice={activity:'study',
    reason:'Curiosity claims a free hour for learning.'};
  else if(t.drive>=68&&t.openness>=50)choice={activity:'craft',
    reason:'A driven temperament uses a free hour to make something.'};
  else if(t.drive>=68&&t.steadiness>=60)choice={activity:'work',
    reason:'A steady drive spends a free hour on useful work.'};
  else if(t.warmth<=30&&t.openness<=36)choice={activity:'reflect',
    reason:'A reserved temperament keeps a free hour for reflection.'};
  else if(custom==='hearth')choice={activity:'care',
    reason:'The town\'s hearth custom asks for an hour of care.'};
  else if(custom==='workshop')choice={activity:'craft',
    reason:'Workshop pride fills a free hour with making.'};
  else if(custom==='road')choice={activity:'travel',
    reason:'The custom of open roads invites a short wandering.'};
  else if(custom==='archive')choice={activity:'study',
    reason:'Shared learning fills a free hour with study.'};
  else if(custom==='ancestors')choice={activity:'reflect',
    reason:'Ancestor keeping asks for a quiet hour of memory.'};
  else if(custom==='liberty')choice={activity:'work',
    reason:'Personal liberty spends an hour on chosen work.'};
  if(!choice)return null;
  if(choice.activity==='work'&&options?.hasWork===false)
    return {activity:'craft',
      reason:'With no assigned job, a free hour goes to personal making.'};
  if(choice.activity==='care'&&options?.canCare===false)
    return {activity:'socialize',
      reason:'No child is home, so the free hour goes to company instead.'};
  return choice;
}
