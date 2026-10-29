/** v2.1.5 — active gifts have small, observable, bounded consequences.
 * A latent gift is identity only; awakened gifts change behavior and outcomes.
 * These pure calculations never draw from or mutate the world's RNG.
 */
import type {Agent} from './engine';
import type {Skill} from './development';
import {innateTrait,type InnateTraitId,INNATE_TRAIT_INFO} from './innateTraits';
import {potentialRank,TRAIT_RANKS} from './traitRanks';

export const TRAIT_EFFECT_KINDS=[
  'movement','foraging','recovery','learning','craft','social','care',
  'exploration','resolve','reflection',
] as const;
export type TraitEffectKind=typeof TRAIT_EFFECT_KINDS[number];
export const TRAIT_EFFECT_LABELS:Record<TraitEffectKind,string>={
  movement:'Travel and terrain efficiency',
  foraging:'Food-gathering efficiency',
  recovery:'Rest and recovery',
  learning:'Studying and knowledge growth',
  craft:'Craft practice and skilled work',
  social:'Conversation and relationships',
  care:'Helping and caring for others',
  exploration:'Curiosity and investigation',
  resolve:'Resilience and resolve',
  reflection:'Introspection and reflection',
};
/** Every catalog gift has its own thematic specialty; none grants magic or
 * immunity. Effects are extensions of existing real actions, not free rewards. */
export const TRAIT_EFFECT_KIND:Record<InnateTraitId,TraitEffectKind>={
  steady_footing:'movement',quickstep:'movement',deep_breath:'recovery',
  sure_grip:'craft',supple_frame:'movement',unshaken_stance:'resolve',
  keen_sight:'exploration',echo_hearing:'exploration',scent_memory:'foraging',
  direction_sense:'movement',night_eyes:'exploration',detail_hunter:'learning',
  pattern_seeker:'learning',lucid_dreamer:'reflection',
  unyielding_focus:'learning',swift_comprehension:'learning',
  quiet_observer:'learning',inventive_spark:'craft',
  green_thumb:'foraging',beast_whisper:'care',weather_feel:'exploration',
  stone_kinship:'craft',river_ear:'exploration',ember_affinity:'craft',
  artisan_eye:'craft',patient_hands:'craft',material_instinct:'craft',
  rhythm_keeper:'craft',fault_finder:'craft',resourceful_tinker:'craft',
  silver_tongue:'social',calming_presence:'care',oath_keeper:'social',
  shared_joy:'social',heart_reader:'social',rallying_voice:'social',
  dream_echo:'reflection',inner_flame:'resolve',tranquil_core:'recovery',
  old_soul:'learning',omen_sense:'exploration',unbroken_will:'resolve',
  pathfinder:'movement',winter_blood:'recovery',oasis_sense:'foraging',
  cliffwalker:'movement',last_reserve:'recovery',foragers_luck:'foraging',
};
type Person=Pick<Agent,'id'|'genes'|'potentialRank'|'innateTrait'|'awakening'> &
  Partial<Pick<Agent,'development'>>;
export type ActiveTraitEffect={kind:TraitEffectKind;gift:InnateTraitId;
  strength:number;label:string;name:string};
/** F gives a modest 2.5% efficiency, SSS can approach 14% after real
 * training. Rank alone is not mastery; this is intentionally capped. */
export function activeTraitEffect(seed:number,person:Person):ActiveTraitEffect|null{
  if(!person.awakening)return null;
  const gift=innateTrait(seed,person),kind=TRAIT_EFFECT_KIND[gift];
  const rank=potentialRank(seed,person);
  const index=TRAIT_RANKS.indexOf(rank);
  const skill:Skill=kind==='movement'||kind==='exploration'?'navigation':
    kind==='foraging'?'foraging':kind==='craft'?'craft':
    kind==='learning'||kind==='reflection'?'knowledge':
    kind==='care'||kind==='recovery'?'care':'diplomacy';
  const trained=person.development?.skills?.[skill]??0;
  const strength=Math.min(.14,(.025+.008*index)*
    (1+Math.max(0,Math.min(100,trained))*.003));
  return {gift,kind,strength,label:TRAIT_EFFECT_LABELS[kind],
    name:INNATE_TRAIT_INFO[gift].name};
}
export function activeTraitBonus(seed:number,person:Person,
  kind:TraitEffectKind):number{
  const effect=activeTraitEffect(seed,person);
  return effect?.kind===kind?effect.strength:0;
}
/** These are soft priorities, not commands: hunger, sickness, caregiving and
 * existing commitments remain able to outweigh a gift's preference. */
export function activeTraitPurposeBonus(seed:number,person:Person,
  purpose:string):number{
  const effect=activeTraitEffect(seed,person);
  if(!effect)return 0;
  const associated:Record<TraitEffectKind,string>={
    movement:'explore',foraging:'survive',recovery:'recover',
    learning:'learn',craft:'create',social:'connect',care:'care',
    exploration:'explore',resolve:'recover',reflection:'reflect',
  };
  return associated[effect.kind]===purpose?Math.round(effect.strength*125):0;
}
