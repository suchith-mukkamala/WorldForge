/** Real practice has diminishing returns. The old additive skill system made
 * routine weekly activity sufficient to reach 98/100 (displayed as SSS).
 * This is pure and uses the learner's effective biological lifespan; shorter-
 * lived people can progress faster without reaching effortless mastery.
 */
export function trainedSkillGain(current:number,base:number,lifespan:number):number{
  if(!Number.isFinite(base)||base<=0)return 0;
  const skill=Math.max(0,Math.min(100,current));
  const remaining=Math.max(0,1-skill/100);
  const lifespanScale=Math.max(.5,Math.min(1.2,
    Math.sqrt(79/Math.max(1,lifespan))));
  return base*Math.pow(remaining,1.8)*lifespanScale;
}

/** Distinct vocabulary keeps normal proficiency separate from birth rarity. */
export function trainingTitle(skill:number):string{
  return skill>=90?'Grandmaster':skill>=75?'Master':skill>=55?'Expert':
    skill>=30?'Practiced':skill>=10?'Apprentice':'Novice';
}
