/** A finer world clock without accelerating births, aging, or the economy.
 * All playback rates cross the same month/year boundaries in the same order.
 * The annual simulation remains authoritative; monthly steps allow people to
 * pursue an already chosen destination between those larger life events.
 */
import {biomeSuitability,stepWorld,type World} from './engine';
import {traitProfile} from './family';
import {knows} from './knowledge';
import {addResident,removeResident,residentIndex,tileCapacity} from './density';
import {advanceWeeklyLife} from './dailyLife';

export const DAYS_PER_YEAR=365;
export const MONTH_LENGTHS=[31,28,31,30,31,30,31,31,30,31,30,31] as const;
export const MONTH_NAMES=['January','February','March','April','May','June',
  'July','August','September','October','November','December'] as const;

export type CalendarDate={year:number;month:number;day:number};
export function calendarDate(world:Pick<World,'year'|'dayOfYear'>):CalendarDate{
  let day=world.dayOfYear??0;
  for(let month=0;month<12;month++){
    if(day<MONTH_LENGTHS[month])return {year:world.year,month,day:day+1};
    day-=MONTH_LENGTHS[month];
  }
  return {year:world.year,month:11,day:31};
}
const monthEnd=(day:number)=>{
  let end=0;
  for(let month=0;month<MONTH_LENGTHS.length;month++){
    end+=MONTH_LENGTHS[month];
    if(end>day)return {end,month};
  }
  return {end:DAYS_PER_YEAR,month:11};
};
const distance=(a:{x:number;y:number},b:{x:number;y:number})=>
  Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));

/** Light-weight, real in-world travel on the last day of each month.
 * Only people with a valid existing goal move; this does not invent new goals,
 * age mortals, forage, or silently deliver merchant shipments.
 */
function advanceMonthlyTravel(w:World,month:number):World{
  const residents=residentIndex(w.agents,w.width),capacity=tileCapacity(w);
  const bridge=new Set(w.transport?.bridges.filter(b=>b.condition>25)
    .map(b=>b.index)??[]);
  // Share unchanged agent objects; only travelers need fresh immutable records.
  const agents=[...w.agents];
  let moved=false;
  for(let i=0;i<agents.length;i++){
    const a=agents[i];
    const speed=traitProfile(a.ancestry).speed*
      (knows(a,'navigation')?1.2:1);
    if(a.work?.tradeId||!a.mind||
      // Swift peoples travel on more months than slower peoples. All movement
      // remains on the real grid and respects bridges and neighborhood space.
      (a.id*5+month+w.year)%6>=Math.round(Math.min(5,2*speed)))continue;
    const target=a.mind.target;
    const exploring=!target&&a.mind.goal==='explore'&&
      a.age>=traitProfile(a.ancestry).maturity;
    if(!target&&!exploring||target&&distance(a,target)===0)continue;
    const old=a.y*w.width+a.x;
    if(exploring){
      let best=-Infinity,next:{x:number;y:number}|undefined;
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        if(!dx&&!dy)continue;
        const x=a.x+dx,y=a.y+dy;
        if(x<0||y<0||x>=w.width||y>=w.height)continue;
        const index=y*w.width+x;
        if((residents.get(index)?.length??0)>=capacity[index]||
          w.tiles[index].biome==='water'&&!bridge.has(index))continue;
        const variation=((a.id*7919+x*131+y*73+w.year*17+month*31)>>>0)%19;
        const score=biomeSuitability(a.ancestry,w.tiles[index].biome)*12+
          w.tiles[index].food*.55+variation*.35;
        if(score>best){best=score;next={x,y};}
      }
      if(!next)continue;
      removeResident(residents,old,a.id);
      addResident(residents,next.y*w.width+next.x,a.id);
      agents[i]={...a,x:next.x,y:next.y};moved=true;continue;
    }
    if(!target)continue;
    const dx=Math.sign(target.x-a.x),dy=Math.sign(target.y-a.y);
    const possible=[{x:a.x+dx,y:a.y+dy},{x:a.x+dx,y:a.y},
      {x:a.x,y:a.y+dy}];
    let next:{x:number;y:number}|undefined;
    for(const p of possible){
      if(p.x===a.x&&p.y===a.y||p.x<0||p.y<0||p.x>=w.width||p.y>=w.height)
        continue;
      const index=p.y*w.width+p.x;
      if((residents.get(index)?.length??0)>=capacity[index]||
        w.tiles[index].biome==='water'&&!bridge.has(index))
        continue;
      if(distance(p,target)>=distance(a,target))continue;
      next=p;break;
    }
    if(!next)continue;
    removeResident(residents,old,a.id);
    addResident(residents,next.y*w.width+next.x,a.id);
    agents[i]={...a,x:next.x,y:next.y};moved=true;
  }
  return moved?{...w,agents}:w;
}

/** Advance an exact number of simulated days, independent of UI playback rate.
 * Yearly biology/economy still runs once at the boundary; social choices run
 * weekly, while movement happens at month boundaries. Older saves with no
 * dayOfYear start on Jan 1. Every time rate crosses identical boundaries.
 */
export function advanceWorldDays(start:World,days:number):World{
  const count=Math.max(0,Math.min(365*200,Math.trunc(days)));
  if(!count||start.year>=9999)return start;
  let w=start,remaining=count;
  while(remaining>0&&w.year<9999){
    const day=w.dayOfYear??0;
    const {end,month}=monthEnd(day);
    const nextWeek=Math.min(364,(Math.floor(day/7)+1)*7);
    const boundary=Math.min(end,nextWeek>day?nextWeek:DAYS_PER_YEAR);
    const elapsed=Math.min(remaining,boundary-day);
    remaining-=elapsed;
    const nextDay=day+elapsed;
    w={...w,dayOfYear:nextDay===DAYS_PER_YEAR?0:nextDay};
    if(nextDay===DAYS_PER_YEAR){
      w=stepWorld(w);
    }else{
      if(nextDay%7===0)w=advanceWeeklyLife(w,nextDay);
      if(nextDay===end)w=advanceMonthlyTravel(w,month);
    }
  }
  return w;
}

export const TIME_RATES=[
  {id:'day',label:'1 day / sec',days:1,interval:1000},
  {id:'week',label:'1 week / sec',days:7,interval:1000},
  {id:'month',label:'1 month / sec',days:30,interval:1000},
  {id:'season',label:'1 season / sec',days:91,interval:1000},
  {id:'year',label:'1 year / sec',days:365,interval:1000},
  {id:'four',label:'4 years / sec',days:365,interval:250},
  {id:'sixteen',label:'16 years / sec',days:365,interval:62.5},
] as const;
export type TimeRate=typeof TIME_RATES[number]['id'];
