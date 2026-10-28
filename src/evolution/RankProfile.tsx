import {SKILLS,type Skill} from './development';
import type {Agent} from './engine';
import {potentialRank,proficiencyRank,TRAIT_RANK_INFO,TRAIT_RANKS,
  type TraitRank} from './traitRanks';

const SKILL_NAMES:Record<Skill,string>={
  foraging:'Foraging',navigation:'Navigation',craft:'Craft',
  knowledge:'Knowledge',care:'Care',diplomacy:'Diplomacy',
};
type Person=Pick<Agent,'id'|'genes'|'potentialRank'> &
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
    <p>Potential is not power or destiny. Training rank reflects actual
      practiced skills, not an awakened trait. Individual innate traits
      and age-based awakenings will follow in v2.1.2–v2.1.3.</p>
    {!compact&&<small className="evo-rank-ladder">RANKS · {TRAIT_RANKS.join(' · ')}</small>}
  </div>;
}
