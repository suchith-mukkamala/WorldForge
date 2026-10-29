import type {Familiarity} from './dailyLife';

/** Every person judges a neighbor from their own remembered encounters.
 * Repeated hostility can outweigh proximity, while friendship is valuable
 * only when both people remember one another positively.
 */
export function relationshipScore(
  own:Familiarity[],other:Familiarity[],ownId:number,otherId:number,
):number{
  const a=own.find(c=>c.personId===otherId);
  const b=other.find(c=>c.personId===ownId);
  const regard=Math.min(a?.regard??0,b?.regard??0);
  const history=Math.min(a?.meetings??0,b?.meetings??0);
  return Math.max(-32,Math.min(18,regard*.45))+
    (regard>0?Math.min(7,history*.6):0);
}

/** Strong remembered hostility can make people decline an optional chat. */
export function refusesConversation(
  own:Familiarity[],other:Familiarity[],ownId:number,otherId:number,
):boolean{
  return relationshipScore(own,other,ownId,otherId)<-12;
}
