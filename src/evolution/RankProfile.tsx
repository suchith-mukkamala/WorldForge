import {SKILLS,type Skill} from './development';
import type {Agent} from './engine';
import {potentialRank,proficiencyRank,TRAIT_RANK_INFO,TRAIT_RANKS,
  type TraitRank} from './traitRanks';
import {innateTrait,INNATE_TRAIT_INFO,TRAIT_DOMAIN_INFO} from './innateTraits';
import {awakeningWindow} from './awakening';
import {activeTraitEffect} from './traitEffects';
import {TRAIT_DOMAIN_INFO as HERITAGE_DOMAIN_INFO} from './innateTraits';

const SKILL_NAMES:Record<Skill,string>={
  foraging:'Foraging',navigation:'Navigation',craft:'Craft',
  knowledge:'Knowledge',care:'Care',diplomacy:'Diplomacy',
};
type Person=Pick<Agent,'id'|'genes'|'potentialRank'|'innateTrait'|
  'ancestry'|'born'|'awakening'|'traitHeritage'> &
  Partial<Pick<Agent,'development'|'age'>> & {died?:number};

export function RankBadge({rank}:{rank:TraitRank}){
  const info=TRAIT_RANK_INFO[rank];
  return <b className="evo-rank-badge" style={{color:info.color,
    borderColor:info.color}} title={rank+' · '+info.title}>{rank}</b>;
}

/** The innate rank is durable from birth; trained ability comes only from
 * real skill values, never from a guessed mastery or mythical awakening. */
export function RankProfile({seed,person,compact=false}:{
  seed:number;person:Person;compact?:boolean;
}){
  const rank=potentialRank(seed,person);
  const gift=INNATE_TRAIT_INFO[innateTrait(seed,person)];
  const domain=TRAIT_DOMAIN_INFO[gift.domain];
  const active=activeTraitEffect(seed,person);
  const window=awakeningWindow(person.ancestry);
  const age=person.age??(person.died===undefined?null:person.died-person.born);
  const progress=person.awakening?100:age===null?0:Math.min(100,Math.max(0,
    Math.round((age-window.earliest)/Math.max(1,window.latest-window.earliest)*100)));
  const skills=person.development?.skills;
  const lead=skills?SKILLS.reduce((best,skill)=>
    skills[skill]>skills[best]?skill:best,SKILLS[0]):null;
  const mastery=lead&&skills?skills[lead]:0;
  return <div className={'evo-rank-profile'+(compact?' is-compact':'')}
    aria-label="Innate potential and lifetime training ranks">
    <div className="evo-rank-facts">
      <span><small>LATENT POTENTIAL</small><strong>
        <RankBadge rank={rank}/> {TRAIT_RANK_INFO[rank].title}</strong></span>
      <span><small>STRONGEST TRAINING</small><strong>
        {lead?<><RankBadge rank={proficiencyRank(mastery)}/>{' '}
          {SKILL_NAMES[lead]} · {Math.round(mastery)}/100</>:
          'Not recorded'}</strong></span>
    </div>
    <div className={'evo-innate-gift'+(person.awakening?' is-awakened':'')}
      style={{borderColor:domain.color}}>
      <span className="evo-overline" style={{color:domain.color}}>
        ✦ ONE INNATE GIFT · {domain.name.toUpperCase()}</span>
      <strong>{gift.name}</strong>
      <small>Possible affinity: {gift.possibility}</small>
      <em>{person.awakening?
        '✦ NATURALLY AWAKENED · AGE '+person.awakening.age+
          ' · YEAR '+person.awakening.year:
        '◇ DORMANT · LATENT AT BIRTH · NATURAL AWAKENING NOT GUARANTEED'}</em>
    </div>
    {active&&<div className="evo-awakening-timeline evo-active-gift"
      aria-label="Active trait benefits">
      <div className="evo-awakening-labels"><span>✦ ACTIVE GIFT</span>
        <span>+{Math.round(active.strength*1000)/10}% EFFICIENCY</span></div>
      <strong style={{color:domain.color}}>{active.label}</strong>
      <small>Awakened {active.name} now influences real daily routines,
        Mind Engine priorities and relevant actions. Practice improves its impact.</small>
    </div>}
    {person.traitHeritage&&<div className="evo-awakening-timeline"
      aria-label="Inherited affinity and family resonance">
      <div className="evo-awakening-labels"><span>INHERITED AFFINITY</span>
        <span>{person.traitHeritage.resonance.toUpperCase()} RESONANCE</span></div>
      <strong>{HERITAGE_DOMAIN_INFO[person.traitHeritage.affinity].name}</strong>
      <small>Parental gifts: {person.traitHeritage.parentDomains.map(d=>
        HERITAGE_DOMAIN_INFO[d].name).join(' · ')}. A family tendency, not
        a guaranteed gift, rank, or ability.</small>
    </div>}
    <div className="evo-awakening-timeline" aria-label="Species-scaled awakening timeline">
      <div className="evo-awakening-labels"><span>
        {person.awakening?'AWAKENED':'NATURAL AWAKENING WINDOW'}</span>
        <span>{person.awakening?'Y'+person.awakening.year+' · '+
          person.awakening.age+' years old':'AGES '+window.earliest+'–'+window.latest}
        </span></div>
      <div className="evo-awakening-track" role="progressbar" aria-valuemin={0}
        aria-valuemax={100} aria-valuenow={progress}
        aria-label="Progress across the typical awakening window">
        <span style={{width:progress+'%',backgroundColor:domain.color}}/>
      </div>
      <small>{person.awakening?'An irreversible life milestone, preserved in the archive.':
        person.died!==undefined?'No natural awakening recorded during this lifetime.':
        'Current age '+(age??'unknown')+' · Timing differs by ancestry and chance.'}
      </small>
    </div>
    <p>Potential is not destiny. Awakened gifts now give modest, specialized
      benefits; trained proficiency and real choices still shape the outcome.
      Dormant gifts grant no bonuses.</p>
    {!compact&&<small className="evo-rank-ladder">RANKS · {TRAIT_RANKS.join(' · ')}</small>}
  </div>;
}
