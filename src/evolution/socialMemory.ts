import type {Familiarity,Encounter} from './dailyLife';
import type {Development,MemoryKind} from './development';

/** Second-hand reputation is never omniscient: only personally trusted
 * friends' own remembered encounters count. It is weaker than firsthand
 * experience and bounded so gossip cannot dominate nearby daily decisions. */
export function heardReputation(
  observerId:number,targetId:number,contacts:Familiarity[],friends:number[],
  acquaintancesOf:(id:number)=>Familiarity[]|undefined,
):number{
  let sum=0,count=0;
  for(const friendId of friends.slice(0,4)){
    const trusted=contacts.find(c=>c.personId===friendId);
    if(!trusted||trusted.meetings<3||(trusted.regard??0)<4)continue;
    const report=acquaintancesOf(friendId)?.find(c=>c.personId===targetId);
    if(!report||report.meetings<2||friendId===targetId||friendId===observerId)
      continue;
    sum+=Math.max(-100,Math.min(100,report.regard??0));count++;
  }
  return count?Math.max(-12,Math.min(10,sum/count*.18)):0;
}

const SIGNIFICANT:Partial<Record<Encounter['kind'],[MemoryKind,string]>>={
  comfort:['support','Someone offered comfort during a difficult time.'],
  disagreement:['conflict','A disagreement strained this relationship.'],
  reconciliation:['reconciliation','We chose to rebuild a strained relationship.'],
  shared_goal:['collaboration','We discovered a shared purpose.'],
};

/** Keep a few consequential lived social episodes, not a weekly diary.
 * Deduplicate each relationship and experience category within three years. */
export function rememberSocialEpisode(development:Development,
  kind:Encounter['kind'],otherId:number,year:number):void{
  const episode=SIGNIFICANT[kind];
  if(!episode)return;
  const [memoryKind,detail]=episode;
  if(development.memories.some(m=>m.kind===memoryKind&&m.otherId===otherId&&
    year-m.year<3))return;
  development.memories.push({year,kind:memoryKind,otherId,detail});
  if(development.memories.length>18)
    development.memories=development.memories.slice(-18);
}
