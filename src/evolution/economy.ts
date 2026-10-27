/** Worldforge v0.8 — work, production, scarcity and physical trade routes.
 * Every decision happens during the world tick, irrespective of camera zoom.
 * Construction materials and ores remain in the existing authoritative stocks.
 */
import type {Agent,Settlement,World} from './engine';
import {traitProfile} from './family';
import {MATERIALS,prepareInfrastructure,type Material,type Ore} from './construction';
import {bridgeTiles,caravanPace,considerTradeBridge,findTradeRoute} from './transport';

export const JOBS=['farmer','woodcutter','miner','builder','artisan','trader'] as const;
export type Job=typeof JOBS[number];
export const JOB_LABELS:Record<Job,string>={farmer:'Farmer',woodcutter:'Forester',
  miner:'Miner',builder:'Builder',artisan:'Artisan',trader:'Trader'};
export const GOODS=['food','wood','stone','clay','coal','copper','iron','gold','tools'] as const;
export type Good=typeof GOODS[number];
export type WorkAssignment={job:Job;settlementId:number;tradeId?:number};
export const SPECIALTIES=['agriculture','forestry','mining','industry','commerce'] as const;
export type Specialty=typeof SPECIALTIES[number];
export const SPECIALTY_LABELS:Record<Specialty,string>={
  agriculture:'Breadbasket',forestry:'Timberlands',mining:'Mining hub',
  industry:'Craft center',commerce:'Trading post',
};
export type TradeRelation={a:number;b:number;completed:number;failures:number;
  trust:number;lastYear:number;disputeUntil?:number};
export type SettlementEconomy={food:number;tools:number;coins:number;
  jobs:Record<Job,number>;prices:Record<Good,number>;shortages:Good[];
  produced:number;consumed:number;imports:number;exports:number;
  specialty?:Specialty};
export type Shipment={id:number;originId:number;destinationId:number;
  carrierId:number;good:Good;quantity:number;payment:number;started:number;
  route:number[];progress:number;lastAdvance?:number};

const rounded=(v:number)=>Math.round(v*100)/100;
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
const distance=(a:{x:number;y:number},b:{x:number;y:number})=>
  Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
const emptyJobs=():Record<Job,number>=>({farmer:0,woodcutter:0,miner:0,
  builder:0,artisan:0,trader:0});
const prices=():Record<Good,number>=>({food:1,wood:1,stone:1,clay:1,
  coal:1,copper:1,iron:1,gold:1,tools:1});
export function createEconomy():SettlementEconomy{
  return {food:18,tools:0,coins:70,jobs:emptyJobs(),prices:prices(),
    shortages:[],produced:0,consumed:0,imports:0,exports:0};
}
export function cloneEconomy(e:SettlementEconomy):SettlementEconomy{
  return {...e,jobs:{...e.jobs},prices:{...e.prices},shortages:[...e.shortages]};
}
export function prepareEconomy(w:World):void{
  w.shipments??=[];w.nextShipmentId??=1;
  w.tradeRelations??=[];
  for(const s of w.settlements)s.economy??=createEconomy();
}

/** The old materials inventory is the same stock used by builders and traders. */
export function stockOf(s:Settlement,good:Good):number{
  const i=s.infrastructure;
  if(good==='food'||good==='tools')return s.economy?.[good]??0;
  if(!i)return 0;
  if((MATERIALS as readonly string[]).includes(good))
    return i.stock[good as keyof typeof i.stock];
  return i.oreStock?.[good as keyof NonNullable<typeof i.oreStock>]??0;
}
function stockLimit(good:Good):number{
  return good==='food'?360:good==='tools'?80:
    (MATERIALS as readonly string[]).includes(good)?500:140;
}
function capacity(s:Settlement,good:Good):number{
  if(good==='food')return Math.min(760,360+buildings(s,'storage')*80);
  return stockLimit(good);
}
function setStock(s:Settlement,good:Good,amount:number):void{
  const value=rounded(clamp(amount,0,capacity(s,good)));
  if(good==='food'||good==='tools'){
    s.economy![good]=value;return;
  }
  const i=s.infrastructure!;
  if((MATERIALS as readonly string[]).includes(good))
    i.stock[good as Material]=value;
  else i.oreStock![good as Ore]=value;
}
const targetStock=(s:Settlement,g:Good):number=>{
  if(g==='food')return clamp(s.population*.75+12,22,180);
  if(g==='tools')return 5;
  if(g==='wood')return 32;
  if(g==='stone')return 29;
  if(g==='clay')return 24;
  if(g==='iron')return 11;
  return g==='gold'?4:8;
};
function openProjects(s:Settlement):number{
  return s.infrastructure?.buildings.filter(b=>
    ['foundation','frame','finishing'].includes(b.stage)).length??0;
}
function buildings(s:Settlement,type:string):number{
  return s.infrastructure?.buildings.filter(b=>
    b.type===type&&b.stage==='complete').length??0;
}

/** A town's identity comes from its deposits, workforce and investments.
 * A specialty improves relevant work but does not force citizens into jobs.
 */
export function inferSpecialty(w:World,s:Settlement,
  deposits:Map<number,{kind:string;amount:number}>):Specialty|undefined{
  const e=s.economy!,land=s.infrastructure?.land??[];
  let trees=0,ores=0,plains=0;
  for(const idx of land){
    const d=deposits.get(idx);
    if(d&&d.amount>.3){if(d.kind==='tree')trees++;
      else if(d.kind!=='clay')ores++;}
    if(w.tiles[idx].biome==='plains')plains++;
  }
  const scores:Record<Specialty,number>={
    agriculture:buildings(s,'farm')*5+Math.min(8,plains*.13)+
      e.jobs.farmer*.8,
    forestry:Math.min(14,trees*.8)+e.jobs.woodcutter*1.4,
    mining:Math.min(14,ores*1.1)+e.jobs.miner*1.6,
    industry:buildings(s,'workshop')*8+e.jobs.artisan*2.5+
      Math.min(5,e.tools*.25),
    commerce:buildings(s,'market')*11+e.jobs.trader*1.5+
      Math.min(11,(e.imports+e.exports)*.18),
  };
  const ranked=[...SPECIALTIES].sort((a,b)=>scores[b]-scores[a]||
    SPECIALTIES.indexOf(a)-SPECIALTIES.indexOf(b));
  return scores[ranked[0]]>=3?ranked[0]:undefined;
}

/** Real work slots compete for the same capable adults. No double shifts. */
function allocateJobs(w:World,s:Settlement,residents:Agent[],travelling:Set<number>):void{
  const e=s.economy!,adults=residents.filter(a=>!travelling.has(a.id)&&
    a.age>=traitProfile(a.ancestry).maturity&&a.energy>=52&&a.health>=49);
  for(const a of adults)a.work=undefined;
  const scarce=stockOf(s,'food')<targetStock(s,'food')*.7;
  const projects=openProjects(s);
  const materials=s.infrastructure?.stock;
  const roadNeed=w.year%8===0&&!!materials&&materials.stone>=1.5&&
    materials.wood>=1&&(e.coins>=8)&&
    (w.trails??[]).some(t=>t.wear>=4.5&&
      distance({x:t.index%w.width,y:Math.floor(t.index/w.width)},s)<=11);
  const bridgeNeed=w.year%6===0&&!!materials&&materials.stone>=9&&
    materials.wood>=6&&e.coins>=14&&w.settlements.some(other=>
      other.id!==s.id&&distance(other,s)<=24);
  const publicWorks=roadNeed||bridgeNeed;
  const activeSite=s.infrastructure?.buildings.find(b=>
    ['foundation','frame','finishing'].includes(b.stage));
  const caps:Record<Job,number>={
    farmer:Math.min(adults.length,buildings(s,'farm')*3),
    builder:projects?Math.min(adults.length,Math.max(4,projects*6,
      Math.ceil(adults.length*.18))):publicWorks?1:0,
    woodcutter:Math.max(1,Math.ceil(adults.length*.19)),
    miner:Math.max(1,Math.ceil(adults.length*.17)),
    artisan:buildings(s,'workshop')*2,
    trader:Math.min(4,Math.ceil(adults.length/8),
      2+buildings(s,'market')*2),
  };
  const priorities:Record<Job,number>={
    farmer:scarce?17:10,builder:projects?16:publicWorks?12:0,
    woodcutter:stockOf(s,'wood')<18?15:8,
    miner:stockOf(s,'stone')<17?14:7,
    artisan:stockOf(s,'tools')<3?13:8,trader:5,
  };
  if(e.specialty==='agriculture')priorities.farmer+=1.5;
  if(e.specialty==='forestry')priorities.woodcutter+=1.5;
  if(e.specialty==='mining')priorities.miner+=1.5;
  if(e.specialty==='industry')priorities.artisan+=1.5;
  if(e.specialty==='commerce')priorities.trader+=2;
  const assigned=new Set<number>();e.jobs=emptyJobs();
  const slots=JOBS.flatMap(job=>Array.from({length:caps[job]},(_,index)=>({job,
    priority:priorities[job]-index*.75}))).sort((a,b)=>b.priority-a.priority||
      JOBS.indexOf(a.job)-JOBS.indexOf(b.job));
  for(const slot of slots){
    let selected:Agent|undefined,best=-Infinity;
    for(const a of adults){
      if(assigned.has(a.id))continue;
      const d=a.development,skill=d?.skills;
      const bonus={farmer:(skill?.foraging??0)*.07+(d?.career==='forager'?9:0),
        woodcutter:(skill?.foraging??0)*.055+(d?.career==='forager'?7:0),
        miner:(skill?.craft??0)*.06+(d?.career==='artisan'?8:0),
        builder:(skill?.craft??0)*.08+(d?.career==='artisan'?11:0)+
          (activeSite?Math.max(0,19-distance(a,activeSite)*4):0),
        artisan:(skill?.craft??0)*.09+(d?.career==='artisan'?14:0),
        trader:(skill?.diplomacy??0)*.09+(d?.career==='trader'?16:0),
      }[slot.job];
      const score=bonus+a.energy*.03+(d?.values.community??50)*.008+
        ((a.id*17+w.year*7)%13)*.001;
      if(score>best){best=score;selected=a;}
    }
    if(!selected)break;
    selected.work={job:slot.job,settlementId:s.id};
    assigned.add(selected.id);e.jobs[slot.job]++;
  }
}

/** The farm building alone does not generate food: citizens must work it. */
function farmAndFeed(w:World,s:Settlement,residents:Agent[]):void{
  const e=s.economy!,farms=s.infrastructure?.buildings.filter(b=>
    b.type==='farm'&&b.stage==='complete')??[];
  let produced=0;
  for(const a of residents){
    if(a.work?.job!=='farmer'||a.work.settlementId!==s.id)continue;
    const farm=farms.find(b=>distance(a,b)<=3);
    if(!farm)continue;
    const tile=w.tiles[farm.y*w.width+farm.x];
    const fertile=tile.biome==='plains'?1.2:tile.biome==='forest'?1:
      ['wasteland','volcanic'].includes(tile.biome)?.55:.8;
    produced+=Math.min(4.6,(1.25+(a.development?.skills.foraging??0)*.018)*
      fertile*w.settings.resourceLevel*
      (e.specialty==='agriculture'?1.2:1));
    a.energy=rounded(Math.max(1,a.energy-.4));
  }
  produced=rounded(Math.min(produced,Math.max(0,capacity(s,'food')-e.food)));
  e.food=rounded(e.food+produced);e.produced=produced;
  // Stored provisions feed dependents and struggling workers. The rest of the
  // population still gathers local food, so farming supports—not replaces—the ecology.
  let eaten=0;
  for(const a of residents){
    if(distance(a,s)>5||e.food<.12)continue;
    const need=a.energy<60?.55:a.age<traitProfile(a.ancestry).maturity?.24:.10;
    const take=Math.min(e.food,need);
    e.food=rounded(e.food-take);eaten+=take;
    if(a.energy<78)a.energy=rounded(clamp(a.energy+take*5,0,100));
  }
  e.consumed=rounded(eaten);
}

/** Artisans turn mined ore and timber into reusable productive tools. */
function makeTools(s:Settlement,residents:Agent[]):void{
  if(!buildings(s,'workshop'))return;
  for(const a of residents){
    if(a.work?.job!=='artisan'||a.work.settlementId!==s.id||
      distance(a,s)>5||stockOf(s,'tools')>=80)continue;
    const ore=stockOf(s,'iron'),wood=stockOf(s,'wood');
    if(ore<.3||wood<.5)continue;
    setStock(s,'iron',ore-.3);setStock(s,'wood',wood-.5);
    setStock(s,'tools',stockOf(s,'tools')+
      (1+(a.development?.skills.craft??0)*.012)*
      (s.economy?.specialty==='industry'?1.2:1));
    a.energy=rounded(Math.max(1,a.energy-.45));
  }
}

export function relationBetween(w:World,a:number,b:number):TradeRelation|undefined{
  const lo=Math.min(a,b),hi=Math.max(a,b);
  return w.tradeRelations?.find(r=>r.a===lo&&r.b===hi);
}
export function activePartnership(r:TradeRelation|undefined,year:number):boolean{
  return !!r&&r.completed>=3&&r.trust>=47&&
    (r.disputeUntil??0)<=year;
}
function ensureRelation(w:World,a:number,b:number):TradeRelation|undefined{
  const existing=relationBetween(w,a,b);
  if(existing)return existing;
  w.tradeRelations??=[];
  if(w.tradeRelations.length>=500)return undefined;
  const newRelation:TradeRelation={a:Math.min(a,b),b:Math.max(a,b),
    completed:0,failures:0,trust:35,lastYear:w.year};
  w.tradeRelations.push(newRelation);return newRelation;
}
function relationSuccess(w:World,origin:Settlement,target:Settlement):void{
  const r=ensureRelation(w,origin.id,target.id);if(!r)return;
  const was=activePartnership(r,w.year);
  r.completed=Math.min(100000,r.completed+1);
  r.trust=Math.min(100,r.trust+6);r.lastYear=w.year;
  if(!was&&activePartnership(r,w.year))record(w,origin.name+' and '+
    target.name+' established a trusted trading partnership.');
}
function relationFailure(w:World,originId:number,targetId:number):void{
  const r=ensureRelation(w,originId,targetId);if(!r)return;
  r.failures=Math.min(100000,r.failures+1);
  r.trust=Math.max(0,r.trust-17);r.lastYear=w.year;
  if(r.trust<20)r.disputeUntil=w.year+18;
}

function record(w:World,message:string):void{
  w.events.push({id:w.nextEventId++,year:w.year,type:'trade',message});
  if(w.events.length>90)w.events=w.events.slice(-90);
}
/** Terraforming may sever a route. Cancel safely without corrupting saves. */
export function reconcileTradeTerrain(w:World,index:number):void{
  if(w.tiles[index]?.biome!=='water')return;
  const stranded=(w.shipments??[]).filter(t=>t.route.includes(index));
  if(!stranded.length)return;
  for(const t of stranded)relationFailure(w,t.originId,t.destinationId);
  const carriers=new Set(stranded.map(t=>t.carrierId));
  w.shipments=w.shipments!.filter(t=>!stranded.includes(t));
  w.agents=w.agents.map(a=>carriers.has(a.id)?{...a,work:undefined}:a);
  w.settlements=w.settlements.map(s=>{
    const refund=stranded.filter(t=>t.destinationId===s.id)
      .reduce((sum,t)=>sum+t.payment,0);
    if(!refund||!s.economy)return s;
    const economy=cloneEconomy(s.economy);
    economy.coins=rounded(clamp(economy.coins+refund,0,10000));
    return {...s,economy};
  });
  w.events=[...w.events];
  record(w,'A transformed landscape severed '+stranded.length+
    ' caravan route'+(stranded.length===1?'':'s')+'.');
}
function resolveShipments(w:World,moved:number[]):Set<number>{
  const travelling=new Set<number>(),byId=new Map(w.agents.map(a=>[a.id,a]));
  const byPlace=new Map(w.settlements.map(s=>[s.id,s]));
  const occupied=new Map(w.agents.map(a=>[a.y*w.width+a.x,a]));
  const active:Shipment[]=[];
  for(const shipment of w.shipments??[]){
    const a=byId.get(shipment.carrierId),origin=byPlace.get(shipment.originId),
      destination=byPlace.get(shipment.destinationId);
    if(!a||!origin||!destination){
      if(destination)destination.economy!.coins=rounded(clamp(
        destination.economy!.coins+shipment.payment,0,10000));
      if(origin&&destination)relationFailure(w,origin.id,destination.id);
      record(w,'A caravan failed to reach its destination; cargo was lost.');
      continue;
    }
    travelling.add(a.id);
    // Paved routes enable an extra physical tile of travel per year. Every
    // intermediate tile remains occupied in sequence, never teleported over.
    const here=a.y*w.width+a.x;
    const nextIdx=shipment.route[shipment.progress+1];
    const pace=nextIdx===undefined?1:caravanPace(w,here,nextIdx);
    for(let step=0;step<pace&&distance(a,destination)>2&&a.energy>=35&&
      shipment.progress<shipment.route.length-1;step++){
      const idx=shipment.route[shipment.progress+1];
      const next={x:idx%w.width,y:Math.floor(idx/w.width)};
      const other=occupied.get(idx);
      const yields=other&&other.id!==a.id&&!other.work?.tradeId&&
        other.age>=traitProfile(other.ancestry).maturity&&
        (other.development?.values.community??50)>=43;
      if(distance(a,next)!==1||other&&!yields)break;
      const old=a.y*w.width+a.x;
      if(other){
        other.x=a.x;other.y=a.y;occupied.set(old,other);
        moved.push(old);
      }else occupied.delete(old);
      a.x=next.x;a.y=next.y;occupied.set(idx,a);
      moved.push(idx);
      a.energy=rounded(Math.max(1,a.energy-.7));
      shipment.progress++;shipment.lastAdvance=w.year;
    }
    if(distance(a,destination)<=2){
      setStock(destination,shipment.good,
        stockOf(destination,shipment.good)+shipment.quantity);
      origin.economy!.coins=rounded(clamp(origin.economy!.coins+
        shipment.payment,0,10000));
      origin.economy!.exports++;destination.economy!.imports++;
      relationSuccess(w,origin,destination);
      record(w,origin.name+' delivered '+shipment.quantity+' '+shipment.good+
        ' to '+destination.name+'.');
      a.work=undefined;travelling.delete(a.id);
    }else if(w.year-(shipment.lastAdvance??shipment.started)>14){
      // Dynamic traffic can strand a courier; never leave 16 stalled trades
      // blocking the entire economy forever. Refund the buyer, and recover
      // inventory only if the carrier is still physically near the origin.
      destination.economy!.coins=rounded(clamp(destination.economy!.coins+
        shipment.payment,0,10000));
      if(distance(a,origin)<=4)setStock(origin,shipment.good,
        stockOf(origin,shipment.good)+shipment.quantity);
      relationFailure(w,origin.id,destination.id);
      record(w,'A caravan from '+origin.name+' abandoned its delayed journey.');
      a.work=undefined;travelling.delete(a.id);
    }else{
      a.work={job:'trader',settlementId:shipment.originId,tradeId:shipment.id};
      active.push(shipment);
    }
  }
  w.shipments=active;
  return travelling;
}

function updatePrices(s:Settlement):void{
  const e=s.economy!;
  e.shortages=[];
  for(const good of GOODS){
    const desired=targetStock(s,good),onHand=stockOf(s,good);
    if(onHand<desired*.45)e.shortages.push(good);
    e.prices[good]=rounded(clamp(.75+desired/(onHand+desired*.35),.5,4));
  }
}

/** A shipment subtracts source inventory now and adds it only on arrival. */
function dispatchTrade(w:World):void{
  if(w.year%3!==0||w.shipments!.length>=16)return;
  const busy=new Set(w.shipments!.map(t=>t.carrierId));
  let departures=0;
  for(const origin of [...w.settlements].sort((a,b)=>a.id-b.id)){
    if(departures>=3||w.shipments!.length>=16)break;
    const candidates=w.agents.filter(a=>a.work?.job==='trader'&&
      a.work.settlementId===origin.id&&!busy.has(a.id)&&
      distance(a,origin)<=3&&a.energy>=65&&a.health>=60);
    if(!candidates.length)continue;
    const destinations=w.settlements.filter(s=>s.id!==origin.id&&
      distance(s,origin)<=35&&s.economy!.coins>=5&&
      (relationBetween(w,s.id,origin.id)?.disputeUntil??0)<=w.year)
      .sort((a,b)=>{
        const priority=(s:Settlement)=>distance(origin,s)-
          (activePartnership(relationBetween(w,origin.id,s.id),w.year)?7:0);
        return priority(a)-priority(b)||a.id-b.id;
      });
    let dispatched=false;
    for(const target of destinations){
      const good=GOODS.find(g=>g!=='gold'&&
        target.economy!.shortages.includes(g)&&
        stockOf(origin,g)>targetStock(origin,g)*1.5+5&&
        stockOf(target,g)+3<capacity(target,g));
      if(!good)continue;
      let onward=findTradeRoute(w,origin,target);
      if(!onward&&considerTradeBridge(w,origin,target))
        onward=findTradeRoute(w,origin,target);
      if(!onward)continue;
      let trader:Agent|undefined,route:number[]|undefined;
      for(const person of candidates){
        // A merchant must be able to physically reach the warehouse before
        // accepting its cargo; straight-line proximity is not enough at rivers.
        const pickup=findTradeRoute(w,person,origin);
        if(!pickup||pickup.length>7)continue;
        const journey=[...pickup,...onward.slice(1)];
        if(journey.length>91||person.age+journey.length*1.4>=
          traitProfile(person.ancestry).lifespan*1.1)continue;
        trader=person;route=journey;break;
      }
      if(!trader||!route)continue;
      const surplus=stockOf(origin,good)-targetStock(origin,good)*1.25;
      const deficit=targetStock(target,good)-stockOf(target,good);
      const partner=activePartnership(relationBetween(w,origin.id,target.id),w.year);
      const unitPrice=rounded(target.economy!.prices[good]*(partner?0.9:1)*
        (buildings(target,'market')?0.96:1));
      const quantity=Math.floor(Math.min(12,surplus,deficit,
        capacity(target,good)-stockOf(target,good),
        target.economy!.coins/unitPrice));
      if(quantity<2)continue;
      const payment=rounded(quantity*unitPrice);
      setStock(origin,good,stockOf(origin,good)-quantity);
      target.economy!.coins=rounded(target.economy!.coins-payment);
      const shipment:Shipment={id:w.nextShipmentId!++,originId:origin.id,
        destinationId:target.id,carrierId:trader.id,good,quantity,payment,
        started:w.year,route,progress:0,lastAdvance:w.year};
      w.shipments!.push(shipment);busy.add(trader.id);
      ensureRelation(w,origin.id,target.id);
      trader.work={job:'trader',settlementId:origin.id,tradeId:shipment.id};
      record(w,origin.name+' sent '+quantity+' '+good+' toward '+target.name+'.');
      dispatched=true;departures++;break;
    }
    if(dispatched)continue;
  }
}

/** Once per year, after mortal movement and before building consumes stock. */
export function advanceEconomy(w:World,moved:number[]=[]):void{
  prepareInfrastructure(w);
  prepareEconomy(w);
  const travelling=resolveShipments(w,moved);
  for(const a of w.agents)if(!travelling.has(a.id))a.work=undefined;
  const assigned=new Set<number>();
  const deposits=new Map((w.deposits??[]).map(d=>[d.index,d]));
  for(const s of w.settlements){
    // A burned-out or abandoned warehouse may reduce capacity between ticks.
    // Excess provisions are lost on the next economic update, never duplicated.
    s.economy!.food=rounded(Math.min(s.economy!.food,capacity(s,'food')));
    const residents=w.agents.filter(a=>distance(a,s)<=6&&!assigned.has(a.id));
    s.economy!.specialty=inferSpecialty(w,s,deposits);
    allocateJobs(w,s,residents,travelling);
    for(const a of residents){if(a.work?.settlementId===s.id)assigned.add(a.id);}
    farmAndFeed(w,s,residents);makeTools(s,residents);updatePrices(s);
  }
  dispatchTrade(w);
}

export function validEconomy(w:World):boolean{
  if(w.tradeRelations!==undefined){
    if(!Array.isArray(w.tradeRelations)||w.tradeRelations.length>500)return false;
    const pairs=new Set<string>();
    for(const r of w.tradeRelations){
      if(!r||!Number.isSafeInteger(r.a)||!Number.isSafeInteger(r.b)||
        r.a<1||r.b<=r.a||!Number.isInteger(r.completed)||
        r.completed<0||r.completed>100000||
        !Number.isInteger(r.failures)||r.failures<0||r.failures>100000||
        !Number.isFinite(r.trust)||r.trust<0||r.trust>100||
        !Number.isInteger(r.lastYear)||r.lastYear<0||r.lastYear>w.year||
        r.disputeUntil!==undefined&&(!Number.isInteger(r.disputeUntil)||
          r.disputeUntil<0||r.disputeUntil>w.year+18))return false;
      const pair=r.a+':'+r.b;
      if(pairs.has(pair))return false;pairs.add(pair);
    }
  }
  if(w.nextShipmentId!==undefined&&(!Number.isSafeInteger(w.nextShipmentId)||
    w.nextShipmentId<1))return false;
  if(w.shipments!==undefined){
    if(!Array.isArray(w.shipments)||w.shipments.length>16)return false;
    const used=new Set<number>(),ids=new Set<number>();
    for(const t of w.shipments){
      const origin=w.settlements.find(s=>s.id===t?.originId);
      const destination=w.settlements.find(s=>s.id===t?.destinationId);
      if(!t||!Number.isSafeInteger(t.id)||t.id<=0||ids.has(t.id)||
        !Number.isSafeInteger(t.carrierId)||used.has(t.carrierId)||
        !w.agents.some(a=>a.id===t.carrierId)||
        !origin||!destination||
        t.originId===t.destinationId||!GOODS.includes(t.good)||
        !Number.isFinite(t.quantity)||t.quantity<2||t.quantity>12||
        !Number.isFinite(t.payment)||t.payment<0||t.payment>100||
        !Number.isInteger(t.started)||t.started<0||t.started>w.year||
        (t.lastAdvance!==undefined&&(!Number.isInteger(t.lastAdvance)||
          t.lastAdvance<t.started||t.lastAdvance>w.year))||
        !Array.isArray(t.route)||t.route.length<2||t.route.length>91||
        !t.route.every(n=>Number.isInteger(n)&&n>=0&&n<w.tiles.length&&
          (w.tiles[n].biome!=='water'||bridgeTiles(w).has(n)))||
        !Number.isInteger(t.progress)||
        t.progress<0||t.progress>=t.route.length||
        distance({x:t.route[0]%w.width,y:Math.floor(t.route[0]/w.width)},origin)>3||
        t.route.at(-1)!==destination.y*w.width+destination.x||
        !t.route.slice(1).every((n,i)=>distance(
          {x:n%w.width,y:Math.floor(n/w.width)},
          {x:t.route[i]%w.width,y:Math.floor(t.route[i]/w.width)})===1))return false;
      used.add(t.carrierId);ids.add(t.id);
    }
  }
  for(const s of w.settlements){
    const e=s.economy;if(!e)continue;
    if(!Number.isFinite(e.food)||e.food<0||e.food>760||
      !Number.isFinite(e.tools)||e.tools<0||e.tools>80||
      !Number.isFinite(e.coins)||e.coins<0||e.coins>10000||
      !JOBS.every(k=>Number.isInteger(e.jobs[k])&&e.jobs[k]>=0&&
        e.jobs[k]<=w.agents.length)||
      !GOODS.every(k=>Number.isFinite(e.prices[k])&&e.prices[k]>=.5&&
        e.prices[k]<=4)||!Array.isArray(e.shortages)||
      e.shortages.length>GOODS.length||
      !e.shortages.every(g=>GOODS.includes(g))||
      (e.specialty!==undefined&&!SPECIALTIES.includes(e.specialty))||
      ![e.produced,e.consumed,e.imports,e.exports].every(v=>
        Number.isFinite(v)&&v>=0&&v<=100000))return false;
  }
  return w.agents.every(a=>a.work===undefined||
    (JOBS.includes(a.work.job)&&Number.isSafeInteger(a.work.settlementId)&&
      a.work.settlementId>0&&(a.work.tradeId===undefined||
        Number.isSafeInteger(a.work.tradeId)&&a.work.tradeId>0)));
}
