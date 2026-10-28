/** v2.1.2 — one distinctive, visible birth gift per person.
 * A gift is a lifelong identity and a possible future aptitude, not an active
 * stat modifier. Awakening and actual Mind Engine effects arrive separately.
 * Selection never consumes the shared simulation RNG or privileges a species.
 */
import type {Genes} from './engine';

export const TRAIT_DOMAINS=[
  'body','senses','mind','nature','craft','social','spirit','survival',
] as const;
export type TraitDomain=typeof TRAIT_DOMAINS[number];
export const TRAIT_DOMAIN_INFO:Record<TraitDomain,{name:string;color:string}>= {
  body:{name:'Body',color:'#d5a183'},
  senses:{name:'Senses',color:'#99c9e8'},
  mind:{name:'Mind',color:'#c1a6ef'},
  nature:{name:'Nature',color:'#8cc69e'},
  craft:{name:'Craft',color:'#dcc08a'},
  social:{name:'Social',color:'#e3a8c4'},
  spirit:{name:'Spirit',color:'#bcafea'},
  survival:{name:'Survival',color:'#b8cd94'},
};
type TraitSpec={id:string;name:string;domain:TraitDomain;possibility:string};

/** Six possibilities in each of eight families. The wording deliberately
 * describes what a gift *might* support after awakening, never a free bonus. */
export const INNATE_TRAIT_CATALOG=[
  {id:'steady_footing',name:'Steady Footing',domain:'body',possibility:'Balance on unstable ground.'},
  {id:'quickstep',name:'Quickstep',domain:'body',possibility:'Sudden bursts of agile movement.'},
  {id:'deep_breath',name:'Deep Breath',domain:'body',possibility:'Endurance through prolonged effort.'},
  {id:'sure_grip',name:'Sure Grip',domain:'body',possibility:'Precise control of physical force.'},
  {id:'supple_frame',name:'Supple Frame',domain:'body',possibility:'Flexibility under physical strain.'},
  {id:'unshaken_stance',name:'Unshaken Stance',domain:'body',possibility:'Holding ground under pressure.'},
  {id:'keen_sight',name:'Keen Sight',domain:'senses',possibility:'Noticing distant or subtle details.'},
  {id:'echo_hearing',name:'Echo Hearing',domain:'senses',possibility:'Distinguishing faint sounds and echoes.'},
  {id:'scent_memory',name:'Scent Memory',domain:'senses',possibility:'Recognizing familiar places by scent.'},
  {id:'direction_sense',name:'Direction Sense',domain:'senses',possibility:'Keeping bearings in unfamiliar lands.'},
  {id:'night_eyes',name:'Night Eyes',domain:'senses',possibility:'Finding meaning in dim surroundings.'},
  {id:'detail_hunter',name:'Detail Hunter',domain:'senses',possibility:'Recognizing small changes others miss.'},
  {id:'pattern_seeker',name:'Pattern Seeker',domain:'mind',possibility:'Connecting seemingly unrelated clues.'},
  {id:'lucid_dreamer',name:'Lucid Dreamer',domain:'mind',possibility:'Finding ideas in unusual dreams.'},
  {id:'unyielding_focus',name:'Unyielding Focus',domain:'mind',possibility:'Concentrating through distraction.'},
  {id:'swift_comprehension',name:'Swift Comprehension',domain:'mind',possibility:'Grasping the structure of new ideas.'},
  {id:'quiet_observer',name:'Quiet Observer',domain:'mind',possibility:'Learning by watching closely.'},
  {id:'inventive_spark',name:'Inventive Spark',domain:'mind',possibility:'Imagining unfamiliar solutions.'},
  {id:'green_thumb',name:'Green Thumb',domain:'nature',possibility:'Recognizing a plant’s needs.'},
  {id:'beast_whisper',name:'Beast Whisper',domain:'nature',possibility:'Understanding animal behavior.'},
  {id:'weather_feel',name:'Weather Feel',domain:'nature',possibility:'Sensing changes in the air.'},
  {id:'stone_kinship',name:'Stone Kinship',domain:'nature',possibility:'Reading the character of rock and earth.'},
  {id:'river_ear',name:'River Ear',domain:'nature',possibility:'Following the movement of water.'},
  {id:'ember_affinity',name:'Ember Affinity',domain:'nature',possibility:'Understanding fire and its limits.'},
  {id:'artisan_eye',name:'Artisan Eye',domain:'craft',possibility:'Noticing fine details in workmanship.'},
  {id:'patient_hands',name:'Patient Hands',domain:'craft',possibility:'Sustaining careful repetitive work.'},
  {id:'material_instinct',name:'Material Instinct',domain:'craft',possibility:'Judging what materials can withstand.'},
  {id:'rhythm_keeper',name:'Rhythm Keeper',domain:'craft',possibility:'Working in measured, practiced rhythms.'},
  {id:'fault_finder',name:'Fault Finder',domain:'craft',possibility:'Spotting weaknesses before they break.'},
  {id:'resourceful_tinker',name:'Resourceful Tinker',domain:'craft',possibility:'Repurposing humble tools and scraps.'},
  {id:'silver_tongue',name:'Silver Tongue',domain:'social',possibility:'Finding the right words in tense moments.'},
  {id:'calming_presence',name:'Calming Presence',domain:'social',possibility:'Helping others feel safe and heard.'},
  {id:'oath_keeper',name:'Oath Keeper',domain:'social',possibility:'Inspiring trust through steady promises.'},
  {id:'shared_joy',name:'Shared Joy',domain:'social',possibility:'Bringing people together in celebration.'},
  {id:'heart_reader',name:'Heart Reader',domain:'social',possibility:'Understanding unspoken feelings.'},
  {id:'rallying_voice',name:'Rallying Voice',domain:'social',possibility:'Encouraging collective courage.'},
  {id:'dream_echo',name:'Dream Echo',domain:'spirit',possibility:'Remembering meaningful dreams.'},
  {id:'inner_flame',name:'Inner Flame',domain:'spirit',possibility:'Drawing resolve from strong convictions.'},
  {id:'tranquil_core',name:'Tranquil Core',domain:'spirit',possibility:'Remaining centered amid turmoil.'},
  {id:'old_soul',name:'Old Soul',domain:'spirit',possibility:'Seeking wisdom in old stories.'},
  {id:'omen_sense',name:'Omen Sense',domain:'spirit',possibility:'Giving meaning to strange coincidences.'},
  {id:'unbroken_will',name:'Unbroken Will',domain:'spirit',possibility:'Finding resolve after setbacks.'},
  {id:'pathfinder',name:'Pathfinder',domain:'survival',possibility:'Finding routes across difficult country.'},
  {id:'winter_blood',name:'Winter Blood',domain:'survival',possibility:'Enduring bitter environmental conditions.'},
  {id:'oasis_sense',name:'Oasis Sense',domain:'survival',possibility:'Noticing signs of shelter and water.'},
  {id:'cliffwalker',name:'Cliffwalker',domain:'survival',possibility:'Moving deliberately through steep terrain.'},
  {id:'last_reserve',name:'Last Reserve',domain:'survival',possibility:'Persevering when exhausted.'},
  {id:'foragers_luck',name:'Forager’s Luck',domain:'survival',possibility:'Spotting overlooked resources.'},
] as const satisfies readonly TraitSpec[];
export type InnateTraitId=typeof INNATE_TRAIT_CATALOG[number]['id'];
export const INNATE_TRAIT_INFO=Object.fromEntries(INNATE_TRAIT_CATALOG.map(t=>
  [t.id,t])) as Record<InnateTraitId,(typeof INNATE_TRAIT_CATALOG)[number]>;
const traitIds=new Set<string>(INNATE_TRAIT_CATALOG.map(t=>t.id));
const traitsByDomain=TRAIT_DOMAINS.reduce((groups,domain)=>{
  groups[domain]=INNATE_TRAIT_CATALOG.filter(t=>t.domain===domain);
  return groups;
},{} as Record<TraitDomain,readonly (typeof INNATE_TRAIT_CATALOG)[number][]>);
export const isInnateTrait=(value:unknown):value is InnateTraitId=>
  typeof value==='string'&&traitIds.has(value);

const mix=(n:number)=>{
  n=Math.imul(n^(n>>>16),0x7feb352d);
  n=Math.imul(n^(n>>>15),0x846ca68b);
  return (n^(n>>>16))>>>0;
};
/** Modest tendencies derived from genes; never a species lockout or a second
 * rank roll. Full parent/child affinity inheritance is reserved for v2.1.4. */
export function traitDomainWeight(domain:TraitDomain,genes:Genes):number{
  const {vigor,curiosity,fertility,social}=genes;
  const affinity:Record<TraitDomain,number>={
    body:vigor,senses:(vigor+curiosity)/2,mind:curiosity,
    nature:(curiosity+fertility)/2,craft:(vigor+curiosity)/2,
    social,spirit:(social+curiosity)/2,survival:(vigor+fertility)/2,
  };
  return .25+Math.max(.5,Math.min(1.5,affinity[domain]))**2;
}
export function birthInnateTrait(seed:number,id:number,genes:Genes):InnateTraitId{
  const genetic=Math.imul(Math.round(genes.vigor*1000),0x85ebca6b)^
    Math.imul(Math.round(genes.curiosity*1000),0x27d4eb2d)^
    Math.imul(Math.round(genes.fertility*1000),0x165667b1)^
    Math.imul(Math.round(genes.social*1000),0x9e3779b1);
  const roll=mix(seed^Math.imul(id,0x51ed2705)^genetic^0x5f3759df)/4294967296;
  const weights=TRAIT_DOMAINS.map(domain=>traitDomainWeight(domain,genes));
  const total=weights.reduce((n,weight)=>n+weight,0);
  let draw=roll*total;
  let domain:TraitDomain=TRAIT_DOMAINS.at(-1)!;
  for(let i=0;i<TRAIT_DOMAINS.length;i++){
    draw-=weights[i];
    if(draw<0){domain=TRAIT_DOMAINS[i];break;}
  }
  const options=traitsByDomain[domain];
  const variant=mix(seed^Math.imul(id,0x27d4eb2d)^genetic^0x1edc6f41)%options.length;
  return options[variant].id;
}
export function innateTrait(seed:number,person:{
  id:number;genes:Genes;innateTrait?:InnateTraitId;
}):InnateTraitId{
  return person.innateTrait??birthInnateTrait(seed,person.id,person.genes);
}
