/** Hunting, fishing and herding.
 * People draw meat, fish, hides and wool from herds and from water near
 * towns. Quotas use a seeded hash only for the first fish stock; yearly
 * takes are fixed limits, so the world RNG keeps its existing sequence.
 * `harvested` on a herd is how many animals people took this year.
 */
import type {Agent,Settlement,World} from './engine';
import {traitProfile} from './family';
import {terrainHash} from './biomeGeneration';
import {coastalLife} from './coastalLife';
import type {Herd,WildlifeKind} from './wildlife';

export const LIVESTOCK_KINDS=['grazer','browser','flock'] as const;
export type LivestockKind=typeof LIVESTOCK_KINDS[number];
export type LivestockHolding={kind:LivestockKind;size:number};
export type FishStock={index:number;stock:number;harvested:number};
export const LIVELIHOOD_JOBS=['hunter','fisher','herder'] as const;
export type LivelihoodJob=typeof LIVELIHOOD_JOBS[number];
export const LIVELIHOOD_WORK:Record<LivelihoodJob,string>={
  hunter:'Hunts herds near town for meat and hides. A thin herd is left alone.',
  fisher:'Fishes shoals and nearby water. Heavy fishing thins the stock.',
  herder:'Keeps pasture livestock for wool, hides, milk and meat.',
};

const HUNT_RANGE=8,FISH_RANGE=6,PASTURE_CAP=12;
const round=(n:number)=>Math.round(n*100)/100;
const dist=(a:{x:number;y:number},b:{x:number;y:number})=>
  Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
const point=(width:number,index:number)=>({x:index%width,y:Math.floor(index/width)});
const HUNTABLE:readonly WildlifeKind[]=['grazer','browser','flock','wader'];
const TAMEABLE:readonly LivestockKind[]=LIVESTOCK_KINDS;

type Yields={food:number;meat:number;fish:number;hides:number;wool:number};
const HUNT_YIELD:Record<WildlifeKind,Yields>={
  grazer:{food:1.05,meat:.55,fish:0,hides:.35,wool:.12},
  browser:{food:.9,meat:.5,fish:0,hides:.4,wool:0},
  flock:{food:.5,meat:.3,fish:0,hides:.05,wool:.28},
  wader:{food:.35,meat:.22,fish:0,hides:.08,wool:0},
  fish:{food:.7,meat:0,fish:.45,hides:0,wool:0},
};
const HERD_YIELD:Record<LivestockKind,Yields>={
  grazer:{food:.11,meat:.04,fish:0,hides:.035,wool:.03},
  browser:{food:.08,meat:.035,fish:0,hides:.05,wool:0},
  flock:{food:.05,meat:.02,fish:0,hides:0,wool:.08},
};

/** Animals that can be taken from a herd this year. Below eight, it is left alone. */
export function harvestQuota(size:number):number{
  if(size<8)return 0;
  return Math.min(3,Math.floor(size*.2));
}

function pasturesOf(town:Settlement):number{
  return town.infrastructure?.buildings.filter(b=>
    b.type==='pasture'&&b.stage==='complete').length??0;
}
function workers(world:World,town:Settlement,job:LivelihoodJob):Agent[]{
  return world.agents.filter(a=>a.work?.job===job&&a.work.settlementId===town.id)
    .sort((a,b)=>a.id-b.id);
}
export function herdsNear(world:World,at:{x:number;y:number},range=HUNT_RANGE):Herd[]{
  return (world.wildlife??[]).filter(herd=>
    dist(point(world.width,herd.index),at)<=range).sort((a,b)=>a.index-b.index);
}
function bestHerd(world:World,town:Settlement,kinds:readonly WildlifeKind[],
  quotaLeft:ReadonlyMap<number,number>):Herd|undefined{
  let best:Herd|undefined;
  for(const herd of world.wildlife??[]){
    if(!kinds.includes(herd.kind)||(quotaLeft.get(herd.index)??0)<=0||herd.size<1)continue;
    if(dist(point(world.width,herd.index),town)>HUNT_RANGE)continue;
    if(!best||herd.size>best.size||herd.size===best.size&&herd.index<best.index)best=herd;
  }
  return best;
}
function takeHerd(herd:Herd,quotaLeft:Map<number,number>,count:number):number{
  const left=quotaLeft.get(herd.index)??0;
  const take=Math.min(count,left,herd.size);
  if(take<=0)return 0;
  herd.size-=take;
  herd.harvested=(herd.harvested??0)+take;
  quotaLeft.set(herd.index,left-take);
  return take;
}

export function livelihoodOpenings(world:World,town:Settlement):
  Record<LivelihoodJob,number>{
  const herds=herdsNear(world,town,HUNT_RANGE);
  const huntable=herds.some(herd=>HUNTABLE.includes(herd.kind)&&herd.size>=8);
  const rich=herds.some(herd=>HUNTABLE.includes(herd.kind)&&herd.size>=18);
  const school=herds.some(herd=>herd.kind==='fish'&&herd.size>=8);
  const water=nearestWater(world,town)>=0;
  const pastures=pasturesOf(town);
  return {
    hunter:huntable?rich?2:1:0,
    fisher:water||school?water&&school?2:1:0,
    herder:Math.min(2,pastures),
  };
}
export function wantsPasture(world:World,town:Settlement):boolean{
  return herdsNear(world,town,HUNT_RANGE).some(herd=>
    TAMEABLE.includes(herd.kind as LivestockKind)&&herd.size>=10);
}

function foodCap(town:Settlement):number{
  const buildings=town.infrastructure?.buildings??[];
  const count=(type:string)=>buildings.filter(b=>b.type===type&&b.stage==='complete').length;
  return Math.min(760,360+count('storage')*80+count('granary')*130);
}
function addGood(town:Settlement,good:'food'|'meat'|'fish'|'hides'|'wool',
  amount:number):number{
  const economy=town.economy;
  if(!economy||amount<=0)return 0;
  const cap=good==='food'?foodCap(town):120;
  const current=economy[good]??0;
  const stored=round(Math.min(amount,Math.max(0,cap-current)));
  economy[good]=round(current+stored);
  if(good==='food')economy.produced=round(economy.produced+stored);
  return stored;
}
function addYield(town:Settlement,yields:Yields,scale=1):number{
  addGood(town,'meat',yields.meat*scale);
  addGood(town,'fish',yields.fish*scale);
  addGood(town,'hides',yields.hides*scale);
  addGood(town,'wool',yields.wool*scale);
  return addGood(town,'food',yields.food*scale);
}

function nearestWater(world:World,town:Settlement):number{
  const reefs=coastalLife(world).reefs;
  let best=-1,score=-1;
  for(let dy=-FISH_RANGE;dy<=FISH_RANGE;dy++)for(let dx=-FISH_RANGE;dx<=FISH_RANGE;dx++){
    const x=town.x+dx,y=town.y+dy;
    if(x<0||y<0||x>=world.width||y>=world.height)continue;
    const index=y*world.width+x;
    if(world.tiles[index].biome!=='water')continue;
    const value=FISH_RANGE-Math.max(Math.abs(dx),Math.abs(dy))+(reefs[index]?6:0);
    if(value>score||value===score&&(best<0||index<best)){score=value;best=index;}
  }
  return best;
}
function fishCapacity(world:World,index:number):number{
  return Math.min(28,12+(coastalLife(world).reefs[index]?8:0));
}
function refreshFishStocks(world:World,towns:readonly Settlement[]):void{
  const previous=new Map((world.fishStocks??[]).map(stock=>[stock.index,stock]));
  const next:FishStock[]=[];
  const seen=new Set<number>();
  for(const town of towns){
    const index=nearestWater(world,town);
    if(index<0||seen.has(index))continue;
    seen.add(index);
    const cap=fishCapacity(world,index),old=previous.get(index);
    if(!old){
      const seeded=8+Math.floor(terrainHash(index,41,world.settings.seed)*8);
      next.push({index,stock:Math.min(cap,seeded),harvested:0});
    }else{
      const regen=old.harvested>=4?1:old.harvested>=2?2:3;
      next.push({index,stock:Math.min(cap,old.stock+regen),harvested:0});
    }
  }
  if(next.length)world.fishStocks=next;
  else if(world.fishStocks)world.fishStocks=[];
}
export function fishStockNear(world:World,at:{x:number;y:number},
  range=FISH_RANGE):FishStock|undefined{
  let best:FishStock|undefined,score=Infinity;
  for(const stock of world.fishStocks??[]){
    const distance=dist(point(world.width,stock.index),at);
    if(distance>range||distance>score)continue;
    if(distance===score&&best&&stock.index>best.index)continue;
    score=distance;best=stock;
  }
  return best;
}

function tendLivestock(world:World,town:Settlement):number{
  const pastures=pasturesOf(town),herders=workers(world,town,'herder');
  const holdings=(town.livestock??[]).map(holding=>({...holding}));
  let food=0;
  if(herders.length>0&&pastures>0){
    for(const holding of holdings){
      if(holding.size<pastures*PASTURE_CAP)holding.size+=1;
      const tended=Math.min(holding.size,herders.length*8);
      food+=addYield(town,HERD_YIELD[holding.kind],tended);
    }
    for(const person of herders)
      person.energy=round(Math.max(1,person.energy-.25));
  }else{
    for(const holding of holdings)holding.size-=1;
  }
  const kept=holdings.filter(holding=>holding.size>0);
  town.livestock=kept.length?kept:undefined;
  return food;
}
function tameOne(world:World,town:Settlement,quotaLeft:Map<number,number>):void{
  if(!pasturesOf(town))return;
  const herd=bestHerd(world,town,TAMEABLE,quotaLeft);
  if(!herd||herd.size<10)return;
  const holdings=town.livestock??[];
  const kind=herd.kind as LivestockKind;
  const current=holdings.find(holding=>holding.kind===kind);
  if((current?.size??0)>=pasturesOf(town)*PASTURE_CAP)return;
  if(!takeHerd(herd,quotaLeft,1))return;
  if(current)current.size+=1;
  else holdings.push({kind,size:1});
  town.livestock=holdings;
}

function shareNewFood(world:World,town:Settlement,added:number):void{
  const economy=town.economy;
  if(!economy||added<.12)return;
  let left=added;
  const people=world.agents.filter(a=>dist(a,town)<=5)
    .sort((a,b)=>a.energy-b.energy||a.id-b.id);
  for(const person of people){
    if(left<.12||economy.food<.12)break;
    const mature=person.age>=traitProfile(person.ancestry).maturity;
    const need=person.energy<60?.4:mature?.08:.16;
    const take=Math.min(economy.food,left,need);
    economy.food=round(economy.food-take);
    economy.consumed=round(economy.consumed+take);
    left=round(left-take);
    if(person.energy<90)person.energy=round(Math.min(100,person.energy+take*5));
  }
}

/** After jobs are assigned. Thins herds and fish stocks, fills pastures,
 * and adds the resulting food to the town pantry. */
export function advanceLivelihood(world:World):void{
  const quotaLeft=new Map<number,number>();
  for(const herd of world.wildlife??[]){
    herd.harvested=0;
    quotaLeft.set(herd.index,harvestQuota(herd.size));
  }
  const towns=[...world.settlements].sort((a,b)=>a.id-b.id);
  refreshFishStocks(world,towns);
  for(const town of towns){
    if(!town.economy)continue;
    let food=tendLivestock(world,town);
    tameOne(world,town,quotaLeft);
    for(const person of workers(world,town,'hunter')){
      const herd=bestHerd(world,town,HUNTABLE,quotaLeft);
      if(!herd||!takeHerd(herd,quotaLeft,1))break;
      food+=addYield(town,HUNT_YIELD[herd.kind]);
      person.energy=round(Math.max(1,person.energy-.35));
    }
    for(const person of workers(world,town,'fisher')){
      const school=bestHerd(world,town,['fish'],quotaLeft);
      if(school&&takeHerd(school,quotaLeft,1)){
        food+=addYield(town,HUNT_YIELD.fish);
      }else{
        const stock=fishStockNear(world,town);
        const reef=stock&&coastalLife(world).reefs[stock.index]?1.12:1;
        if(!stock||stock.stock<3)continue;
        stock.stock-=1;stock.harvested+=1;
        food+=addYield(town,{food:.62*reef,meat:0,fish:.4,hides:0,wool:0});
      }
      person.energy=round(Math.max(1,person.energy-.3));
    }
    shareNewFood(world,town,food);
  }
  if(world.wildlife)world.wildlife=world.wildlife.filter(herd=>herd.size>=1);
}

export function validLivelihood(world:World):boolean{
  if(world.fishStocks!==undefined){
    if(!Array.isArray(world.fishStocks)||world.fishStocks.length>80)return false;
    const seen=new Set<number>();
    for(const stock of world.fishStocks){
      if(!stock||!Number.isInteger(stock.index)||stock.index<0||
        stock.index>=world.tiles.length||seen.has(stock.index)||
        !Number.isInteger(stock.stock)||stock.stock<0||stock.stock>40||
        !Number.isInteger(stock.harvested)||stock.harvested<0||
        stock.harvested>40)return false;
      seen.add(stock.index);
    }
  }
  for(const town of world.settlements){
    if(town.livestock===undefined)continue;
    if(!Array.isArray(town.livestock)||town.livestock.length>LIVESTOCK_KINDS.length)
      return false;
    const kinds=new Set<string>();
    for(const holding of town.livestock){
      if(!holding||!LIVESTOCK_KINDS.includes(holding.kind)||kinds.has(holding.kind)||
        !Number.isInteger(holding.size)||holding.size<1||holding.size>48)return false;
      kinds.add(holding.kind);
    }
  }
  return true;
}
