import {SKILLS,type Skill} from './development';
import type {Agent} from './engine';
import {potentialRank,proficiencyRank,TRAIT_RANK_INFO,TRAIT_RANKS,
  type TraitRank} from './traitRanks';
import {innateTrait,INNATE_TRAIT_INFO,TRAIT_DOMAIN_INFO} from './innateTraits';

const SKILL_NAMES:Record<Skill,string>={
  foraging:'Foraging',navigation:'Navigation',craft:'Craft',
  knowledge:'Knowledge',care:'Care',diplomacy:'Diplomacy',
};
type Person=Pick<Agent,'id'|'genes'|'potentialRank'|'innateTrait'> &
  Partial<Pick<Agent,'development'>>;

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
    <div className="evo-innate-gift" style={{borderColor:domain.color}}>
      <span className="evo-overline" style={{color:domain.color}}>
        ✦ ONE INNATE GIFT · {domain.name.toUpperCase()}</span>
      <strong>{gift.name}</strong>
      <small>Possible affinity: {gift.possibility}</small>
      <em>LATENT AT BIRTH · AWAKENING FOLLOWS IN V2.1.3</em>
    </div>
    <p>Potential is not power or destiny. Rank describes this gift's possible
      strength; training rank reflects practiced skills. Gifts are
      visible but grant no simulation bonuses before v2.1.5.</p>
    {!compact&&<small className="evo-rank-ladder">RANKS · {TRAIT_RANKS.join(' · ')}</small>}
  </div>;
}
