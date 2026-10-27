/** Evolution Lab v0.7 — deterministic settlement construction.
 * Every change is driven by the world tick, not by map zoom or UI visibility.
 */
import type {Agent,Settlement,Species,World} from './engine';
import {traitProfile} from './family';
import {harvestDeposit,type ResourceDeposit,
  type ResourceKind} from './resources';
import {hasHarbor} from './shipping';

export const BUILDING_TYPES=['shelter','house','farm','storage','well',
  'workshop','market','dock','communal'] as const;
export type BuildingType=typeof BUILDING_TYPES[number];
export type BuildingStage='foundation'|'frame'|'finishing'|'complete'|
  'abandoned'|'ruin';
export const BUILDING_STAGES:BuildingStage[]=['foundation','frame','finishing',
  'complete','abandoned','ruin'];
export type Material='wood'|'stone'|'clay';
export const MATERIALS:Material[]=['wood','stone','clay'];
export type MaterialStock=Record<Material,number>;
export const ORES=['coal','copper','iron','gold'] as const;
export type Ore=typeof ORES[number];
export type OreStock=Record<Ore,number>;
export type Building={id:number;type:BuildingType;x:number;y:number;
  culture:Species;stage:BuildingStage;progress:number;condition:number;
  started:number;finished?:number;abandoned?:number;
  spent:MaterialStock;labor:number;householdId?:number};
export type SettlementInfrastructure={land:number[];buildings:Building[];
  roads:number[];stock:MaterialStock;oreStock?:OreStock;nextBuildingId:number;
  foundedWithResidents:number};
export type RuinSite={id:number;name:string;species:Species;x:number;y:number;
  collapsed:number;buildings:Building[];roads:number[]};
export type Trail={index:number;wear:number};
export type SettlementStage='encampment'|'hamlet'|'village'|'town'|'city';
export const COSTS:Record<BuildingType,{materials:MaterialStock;labor:number}>={
  shelter:{materials:{wood:5,stone:1,clay:2},labor:7},
  house:{materials:{wood:12,stone:5,clay:6},labor:18},
  farm:{materials:{wood:5,stone:2,clay:3},labor:11},
  storage:{materials:{wood:10,stone:6,clay:5},labor:16},
  well:{materials:{wood:4,stone:10,clay:5},labor:17},
  workshop:{materials:{wood:12,stone:11,clay:6},labor:22},
  market:{materials:{wood:11,stone:8,clay:7},labor:19},
  dock:{materials:{wood:14,stone:5,clay:4},labor:18},
  communal:{materials:{wood:11,stone:9,clay:9},labor:21},
};
export const BUILDING_LABELS:Record<BuildingType,string>={
  shelter:'Shelter',house:'Residence',farm:'Farm',storage:'Storehouse',
  well:'Well',workshop:'Workshop',communal:'Communal hall',
  market:'Marketplace',
  dock:'Harbor dock',
};
export const ARCHITECTURE:Record<Species,{name:string;wall:string;
  roof:string;trim:string}>={
  human:{name:'Timber and clay',wall:'#c99b77',roof:'#9e6853',trim:'#f2d4aa'},
  elf:{name:'Living wood and leaf',wall:'#75b895',roof:'#32775f',trim:'#a9e9bf'},
  dwarf:{name:'Carved masonry',wall:'#9399b7',roof:'#515b81',trim:'#dde2f8'},
  demon:{name:'Basalt and ember',wall:'#766779',roof:'#482e54',trim:'#da879c'},
};
const clamp=(v:number,a=0,b=100)=>Math.max(a,Math.min(b,v));
const round=(v:number)=>Math.round(v*100)/100;
const distance=(a:{x:number;y:number},b:{x:number;y:number})=>
  Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
const position=(w:World,x:number,y:number)=>y*w.width+x;
const inWorld=(w:World,x:number,y:number)=>x>=0&&y>=0&&x<w.width&&y<w.height;
const complete=(b:Building)=>b.stage==='complete';
const stock=():MaterialStock=>({wood:0,stone:0,clay:0});
const oreStock=():OreStock=>({coal:0,copper:0,iron:0,gold:0});
const materialFor=(kind:ResourceKind):Material|Ore=>kind==='tree'?'wood':kind;

export function cloneInfrastructure(i:SettlementInfrastructure):SettlementInfrastructure{
  return {...i,land:[...i.land],roads:[...i.roads],stock:{...i.stock},
    oreStock:{...oreStock(),...i.oreStock},
    buildings:i.buildings.map(b=>({...b,spent:{...b.spent}}))};
}
export function settlementStage(s:Settlement):SettlementStage{
  const buildings=s.infrastructure?.buildings.filter(complete).length??0;
  if(buildings>=24&&s.population>=65)return 'city';
  if(buildings>=12&&s.population>=30)return 'town';
  if(buildings>=6&&s.population>=12)return 'village';
  if(buildings>=2)return 'hamlet';
  return 'encampment';
}
/** Land is physically attached to a settlement, never a viewport region. */
function landClaim(w:World,s:Settlement,radius:number):number[]{
  const owned=new Set(w.settlements.filter(other=>other.id!==s.id)
    .flatMap(other=>other.infrastructure?.land??[]));
  const land:number[]=[],seen=new Set<number>();
  const queue=[{x:s.x,y:s.y}];
  for(let cursor=0;cursor<queue.length&&land.length<300;cursor++){
    const {x,y}=queue[cursor];
    if(!inWorld(w,x,y)||distance({x,y},s)>radius)continue;
    const id=position(w,x,y);
    if(seen.has(id)||owned.has(id)||w.tiles[id].biome==='water')continue;
    seen.add(id);land.push(id);
    // Claim only land connected to the settlement by walkable steps.
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      if(dx||dy)queue.push({x:x+dx,y:y+dy});
    }
  }
  return land;
}
export function prepareInfrastructure(w:World):void{
  w.ruins??=[];w.trails??=[];
  for(const s of w.settlements){
    s.infrastructure??={land:landClaim(w,s,5),buildings:[],roads:[],
      stock:{wood:8,stone:5,clay:6},oreStock:oreStock(),nextBuildingId:1,
      foundedWithResidents:s.population};
    s.infrastructure.oreStock??=oreStock();
  }
}

/** Available workers still have competing goals, health needs and careers. */
function willingBuilders(w:World,s:Settlement,residents:Agent[]):Agent[]{
  return residents.filter(a=>a.age>=traitProfile(a.ancestry).maturity&&
    a.energy>=58&&a.health>=48&&
    (s.economy?a.work?.job==='builder'&&a.work.settlementId===s.id:
    (a.mind?.goal==='build'||a.development?.career==='artisan'||
      ((a.id*13+w.year)%7===0&&
        (a.development?.values.community??50)>=43))));
}

/** Population needs and the preferences of actual residents select projects. */
function chooseProject(w:World,s:Settlement,residents:Agent[]):BuildingType|null{
  const buildings=s.infrastructure!.buildings.filter(b=>b.stage!=='ruin'&&
    b.stage!=='abandoned');
  const count=(type:BuildingType)=>buildings.filter(b=>b.type===type).length;
  const adultCount=residents.filter(a=>a.age>=traitProfile(a.ancestry).maturity).length;
  const families=new Set(residents.map(a=>a.development?.householdId)
    .filter((v):v is number=>v!==undefined));
  const unhomed=[...families].filter(id=>!w.households?.find(h=>h.id===id)?.residence);
  const votes=residents.reduce((score,a)=>score+
    ((a.development?.values.community??50)-50)*.008,0);
  const farmTarget=Math.max(1,Math.ceil(s.population/20));
  const homeNeed=Math.max(0,unhomed.length);
  const unmet:Record<BuildingType,number>={
    shelter:count('shelter')+count('house')===0?18:0,
    house:homeNeed?Math.min(22,6+homeNeed*2.1):0,
    farm:count('farm')<farmTarget?
      Math.min(20,5+(farmTarget-count('farm'))*2+
        (s.economy?.shortages.includes('food')?8:s.stores<25?3:0)):0,
    storage:count('storage')<Math.max(1,Math.ceil(s.population/55))?8:0,
    well:count('well')<Math.max(1,Math.ceil(s.population/35))?10:0,
    workshop:adultCount>=5&&count('workshop')<Math.max(1,Math.ceil(adultCount/40))?9:0,
    market:adultCount>=8&&(s.population>=18||
      (s.economy?.imports??0)+(s.economy?.exports??0)>=3)&&
      count('market')<Math.max(1,Math.ceil(s.population/65))?8.5:0,
    dock:adultCount>=5&&hasHarbor(w,s)&&
      count('dock')<Math.max(1,Math.ceil(s.population/120))?9.2:0,
    communal:residents.length>=6&&count('communal')<
      Math.max(1,Math.ceil(s.population/45))?8+Math.max(-2,Math.min(2,votes)):0,
  };
  // Worker guilds can advocate for public needs, never directly place sites.
  for(const g of w.institutions?.guilds??[]){
    if(g.settlementId!==s.id||g.members.length<3)continue;
    if(g.job==='farmer'&&unmet.farm>0)unmet.farm+=1.3;
    if(g.job==='artisan'&&unmet.workshop>0)unmet.workshop+=1.4;
    if(g.job==='trader'&&unmet.market>0)unmet.market+=1.6;
    if(g.job==='trader'&&unmet.dock>0)unmet.dock+=1.2;
  }
  // A preference is a vote, not a player-placed blueprint.
  for(const a of residents){
    const d=a.development;
    if(unmet.workshop>0&&d?.career==='artisan')unmet.workshop+=.8;
    if(unmet.farm>0&&d?.career==='forager')unmet.farm+=.45;
    if(unmet.well>0&&d?.career==='healer')unmet.well+=.6;
    if(unmet.communal>0&&d?.career==='scholar')unmet.communal+=.35;
    if(homeNeed&&(d?.values.tradition??0)>62)unmet.house+=.13;
  }
  // No artificial building quota: a community may choose to wait when its
  // real needs are met instead of endlessly constructing more farms.
  const ranked=[...BUILDING_TYPES].sort((a,b)=>unmet[b]-unmet[a]||
    BUILDING_TYPES.indexOf(a)-BUILDING_TYPES.indexOf(b));
  return unmet[ranked[0]]>=2?ranked[0]:null;
}

/** Site selection is based on safety, biome suitability and real routes. */
function chooseLocation(w:World,s:Settlement,type:BuildingType):{x:number;y:number}|null{
  const infra=s.infrastructure!,used=new Set(infra.buildings.map(b=>position(w,b.x,b.y)));
  const roads=new Set(infra.roads);
  let best=-Infinity,target:null|{x:number;y:number}=null;
  for(const id of infra.land){
    if(used.has(id))continue;
    const x=id%w.width,y=Math.floor(id/w.width),tile=w.tiles[id];
    if(tile.biome==='water')continue;
    if(type==='dock'&&![-1,0,1].some(dx=>[-1,0,1].some(dy=>
      (dx||dy)&&inWorld(w,x+dx,y+dy)&&
      w.tiles[position(w,x+dx,y+dy)].biome==='water')))continue;
    const near=distance({x,y},s),hazard=tile.biome==='volcanic'?4:
      tile.biome==='wasteland'?2:0;
    const nearbyRoad=[id-1,id+1,id-w.width,id+w.width].some(n=>roads.has(n));
    const productive=type==='farm'?
      (tile.biome==='plains'?11:tile.biome==='forest'?8:-5):
      type==='well'?([id-1,id+1,id-w.width,id+w.width]
        .some(n=>w.tiles[n]?.biome==='water')?9:1):
      type==='workshop'?(['mountain','cave'].includes(tile.biome)?7:2):
      type==='storage'?Math.max(0,7-near):Math.max(0,6-near);
    const score=productive-near*.8-hazard+(nearbyRoad?4:0)+
      // Stable tie breaker: site choice is independent of rendering.
      ((s.id*97+x*17+y*43)%31)*.01;
    if(score>best){best=score;target={x,y};}
  }
  return target;
}

function beginProject(w:World,s:Settlement,residents:Agent[]):void{
  const i=s.infrastructure!,live=i.buildings.filter(b=>
    !['ruin','abandoned'].includes(b.stage));
  const underway=live.filter(b=>!complete(b));
  if(underway.length>=2||live.length>=76||residents.length<3)return;
  // No automatic blueprint spam if too little community interest or material.
  if(i.stock.wood+i.stock.stone+i.stock.clay<3)return;
  const type=chooseProject(w,s,residents);
  if(!type)return;
  // Severe food shortages draw available labor toward survival, not luxuries.
  if(s.economy?.shortages.includes('food')&&
    !['farm','shelter','house','well'].includes(type)&&s.economy.food<4)return;
  const at=chooseLocation(w,s,type);
  if(!at)return;
  const b:Building={id:i.nextBuildingId++,type,x:at.x,y:at.y,
    culture:s.species,stage:'foundation',progress:0,condition:100,
    started:w.year,spent:stock(),labor:0};
  i.buildings.push(b);
  if(i.buildings.length>90){
    const old=i.buildings.findIndex(v=>v.stage==='ruin');
    if(old>=0)i.buildings.splice(old,1);
  }
}

function gather(w:World,s:Settlement,residents:Agent[],
  deposits:Map<number,ResourceDeposit>):void{
  const i=s.infrastructure!;
  const candidates=i.land.map(id=>deposits.get(id)).filter(
    (d):d is ResourceDeposit=>!!d&&d.amount>.05);
  if(!candidates.length)return;
  const capacity=Math.min(500,90+i.buildings.filter(b=>
    complete(b)&&b.type==='storage').length*55);
  const workers=residents.filter(a=>
    a.age>=traitProfile(a.ancestry).maturity&&a.energy>=54&&
    (s.economy? a.work?.settlementId===s.id&&
      (a.work.job==='woodcutter'||a.work.job==='miner'):
    (['forager','scout','artisan'].includes(a.development?.career??'')||
      (a.development?.values.community??50)>55&&
        (a.id*11+w.year)%5===0)))
    .sort((a,b)=>((a.id+w.year*13)%997)-((b.id+w.year*13)%997))
    .slice(0,Math.min(48,16+i.buildings.filter(b=>complete(b)&&
      b.type==='storage').length*8));
  for(const a of workers){
    let best:ResourceDeposit|undefined,bestScore=-Infinity;
    for(const d of candidates){
      if(d.amount<=.05)continue;
      if(s.economy&&a.work?.job==='woodcutter'&&
        !['tree','clay'].includes(d.kind))continue;
      if(s.economy&&a.work?.job==='miner'&&
        ['tree','clay'].includes(d.kind))continue;
      const at={x:d.index%w.width,y:Math.floor(d.index/w.width)};
      const proximity=distance(a,at);
      if(proximity>5)continue;
      const material=materialFor(d.kind);
      const held=material==='wood'||material==='stone'||material==='clay'?
        i.stock[material]:i.oreStock![material];
      const limit=material==='wood'||material==='stone'||material==='clay'?
        capacity:Math.min(140,40+i.buildings.filter(b=>complete(b)&&
          b.type==='storage').length*20);
      if(held>=limit-1)continue;
      const desired={wood:31,stone:30,clay:24,coal:13,copper:12,iron:16,gold:7}[material];
      const score=(desired-held)*.3+Math.min(3,d.amount)*.4-
        proximity*.7+(a.development?.career==='artisan'&&
          ['iron','copper','coal'].includes(material)?3:0);
      if(score>bestScore){best=d;bestScore=score;}
    }
    if(!best)continue;
    const kind=materialFor(best.kind);
    const quota=kind==='wood'||kind==='stone'||kind==='clay'?capacity:140;
    const available=kind==='wood'||kind==='stone'||kind==='clay'?
      i.stock[kind]:i.oreStock![kind];
    const expertise=s.economy?.specialty==='forestry'&&kind==='wood'||
      s.economy?.specialty==='mining'&&kind!=='wood'&&kind!=='clay';
    const yieldAmount=harvestDeposit(best,Math.min(quota-available,
      (1.05+(a.development?.skills.foraging??0)*.015)*(expertise?1.18:1)));
    if(kind==='wood'||kind==='stone'||kind==='clay')
      i.stock[kind]=round(i.stock[kind]+yieldAmount);
    else i.oreStock![kind]=round(i.oreStock![kind]+yieldAmount);
    if(yieldAmount>0)a.energy=round(Math.max(1,a.energy-.45));
  }
}

function build(w:World,s:Settlement,residents:Agent[]):void{
  const i=s.infrastructure!,workers=willingBuilders(w,s,residents);
  const workshop=i.buildings.some(b=>b.type==='workshop'&&complete(b));
  const employed=new Set<number>();
  for(const b of i.buildings){
    if(['ruin','abandoned','complete'].includes(b.stage))continue;
    const crew=workers.filter(a=>!employed.has(a.id)&&distance(a,b)<=2);
    if(!crew.length)continue; // Nobody builds remotely from the town center.
    const laborPool=crew.reduce((total,a)=>total+
      (a.mind?.goal==='build'?1.65:.7)+
      (a.development?.skills.craft??0)*.018,0)*(workshop?1.3:1)*
      ((s.economy?.tools??0)>=.1?1.18:1);
    if(s.economy&&s.economy.tools>=.1)
      s.economy.tools=round(Math.max(0,s.economy.tools-.12));
    for(const worker of crew){
      employed.add(worker.id);
      worker.energy=round(Math.max(1,worker.energy-
        (worker.mind?.goal==='build'?1.1:.35)));
    }
    const cost=COSTS[b.type];
    for(const material of MATERIALS){
      const need=cost.materials[material]-b.spent[material];
      const take=round(Math.max(0,Math.min(need,i.stock[material],
        Math.max(.5,crew.length*.7))));
      b.spent[material]=round(b.spent[material]+take);
      i.stock[material]=round(i.stock[material]-take);
    }
    const delivered=MATERIALS.every(m=>b.spent[m]>=cost.materials[m]-.01);
    if(delivered&&laborPool>0){
      const effort=Math.min(cost.labor-b.labor,laborPool);
      b.labor=round(b.labor+effort);
    }
    const costSum=MATERIALS.reduce((t,m)=>t+cost.materials[m],0);
    const paid=MATERIALS.reduce((t,m)=>t+b.spent[m],0);
    b.progress=round(clamp((paid/costSum*.55+b.labor/cost.labor*.45)*100));
    if(delivered&&b.labor>=cost.labor-.01){
      b.stage='complete';b.progress=100;b.finished=w.year;
    }else b.stage=b.progress<34?'foundation':b.progress<72?'frame':'finishing';
  }
}

/** Residences are occupied by households, not abstract settlement capacity. */
function assignHomes(w:World,s:Settlement,residents:Agent[]):void{
  const i=s.infrastructure!,families=new Set(residents.map(a=>a.development?.householdId)
    .filter((id):id is number=>id!==undefined));
  const localHouses=(w.households??[]).filter(h=>families.has(h.id)||
    h.residence?.settlementId===s.id);
  for(const h of localHouses){
    if(h.residence?.settlementId!==s.id)continue;
    const home=i.buildings.find(b=>b.id===h.residence!.buildingId);
    if(!families.has(h.id)||!home||!complete(home))h.residence=undefined;
  }
  for(const b of i.buildings){
    if(!complete(b)||!['house','shelter'].includes(b.type))continue;
    if(b.householdId&&localHouses.some(h=>h.id===b.householdId&&
      h.residence?.settlementId===s.id&&h.residence.buildingId===b.id))continue;
    const unassigned=localHouses.filter(h=>families.has(h.id)&&!h.residence);
    unassigned.sort((a,c)=>distance(a.home,b)-distance(c.home,b)||a.id-c.id);
    const chosen=unassigned.find(h=>distance(h.home,b)<=10);
    if(chosen){chosen.residence={settlementId:s.id,buildingId:b.id};
      chosen.home={x:b.x,y:b.y};b.householdId=chosen.id;}
    else b.householdId=undefined;
  }
}

function maintain(w:World,s:Settlement):void{
  const i=s.infrastructure!;
  const occupiedHomes=new Set((w.households??[]).filter(h=>
    h.residence?.settlementId===s.id).map(h=>h.residence!.buildingId));
  for(const b of i.buildings){
    if(!['complete','abandoned'].includes(b.stage))continue;
    const occupied=occupiedHomes.has(b.id);
    const needed=s.population>0&&(occupied||!['house','shelter'].includes(b.type));
    b.condition=round(clamp(b.condition+(needed?.38:-2.3)-
      (w.tiles[position(w,b.x,b.y)].biome==='water'?14:0)));
    if(b.condition<=37){
      b.stage=b.condition<=10?'ruin':'abandoned';b.abandoned??=w.year;
      for(const h of w.households??[])
        if(h.residence?.settlementId===s.id&&h.residence.buildingId===b.id)
          h.residence=undefined;
      b.householdId=undefined;
    }
    else if(b.stage==='abandoned'&&needed){b.stage='complete';b.abandoned=undefined;}
  }
}

/** Actual movement leaves wear; unused traces decay. A road follows repeated travel. */
function updateRoutes(w:World,moved:number[]):void{
  const wear=new Map((w.trails??[]).map(t=>[t.index,t.wear*.88]));
  for(const index of moved)wear.set(index,Math.min(100,(wear.get(index)??0)+1.8));
  w.trails=[...wear.entries()].filter(([,v])=>v>=.4)
    .sort((a,b)=>b[1]-a[1]).slice(0,4000)
    .map(([index,v])=>({index,wear:round(v)}));
  const established=new Set(w.trails.filter(t=>t.wear>=4).map(t=>t.index));
  for(const s of w.settlements){
    const i=s.infrastructure;if(!i)continue;
    i.roads=i.land.filter(idx=>established.has(idx)).slice(0,300);
  }
}

/** Physical farms improve local food supply, and wells strengthen communities. */
function applyBenefits(w:World,s:Settlement):void{
  const finished=s.infrastructure?.buildings.filter(complete)??[];
  for(const farm of finished.filter(b=>b.type==='farm')){
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      const x=farm.x+dx,y=farm.y+dy;
      if(!inWorld(w,x,y))continue;
      const t=w.tiles[position(w,x,y)];
      if(t.biome==='water')continue;
      const original={plains:7.5,forest:9.5,mountain:5,cave:4.5,
        wasteland:4.7,volcanic:4.1}[t.biome];
      // Cultivation speeds replenishment of harvested tiles without creating
      // food above the land's ecological carrying capacity.
      t.food=round(Math.min(original*w.settings.resourceLevel,t.food+.16));
    }
  }
}

export function archiveRuins(w:World,s:Settlement):void{
  if(!s.infrastructure)return;
  for(const household of w.households??[])
    if(household.residence?.settlementId===s.id)household.residence=undefined;
  w.ruins??=[];
  w.ruins.push({id:s.id,name:s.name,species:s.species,x:s.x,y:s.y,
    collapsed:w.year,buildings:s.infrastructure.buildings.map(b=>({...b,
      spent:{...b.spent},stage:b.stage==='ruin'?'ruin':'abandoned',
      abandoned:b.abandoned??w.year})),roads:[...s.infrastructure.roads]});
  if(w.ruins.length>80)w.ruins=w.ruins.slice(-80);
}

/** Run exactly once per simulated year, regardless of UI, zoom, or open tab. */
export function advanceConstruction(w:World,moved:number[]):void{
  prepareInfrastructure(w);
  const deposits=new Map((w.deposits??[]).map(d=>[d.index,d]));
  for(const s of w.settlements){
    const i=s.infrastructure!;
    const residents=w.agents.filter(a=>distance(a,s)<=7);
    const targetRadius=Math.min(9,5+Math.floor(i.buildings.filter(complete).length/8));
    if(targetRadius>5&&w.year%4===0){
      const additional=landClaim(w,s,targetRadius);
      i.land=[...new Set([...i.land,...additional])].slice(0,300);
    }
    gather(w,s,residents,deposits);
    if(residents.length>0){beginProject(w,s,residents);build(w,s,residents);}
    assignHomes(w,s,residents);maintain(w,s);applyBenefits(w,s);
  }
  updateRoutes(w,moved);
  for(const ruin of w.ruins??[]){
    for(const b of ruin.buildings){
      if(b.stage==='ruin')continue;
      b.condition=round(Math.max(0,b.condition-3));
      if(b.condition<=10)b.stage='ruin';
    }
  }
}

export function validConstruction(w:World):boolean{
  const validId=(n:number)=>Number.isSafeInteger(n)&&n>0;
  const validPlace=(x:number,y:number)=>Number.isInteger(x)&&Number.isInteger(y)&&
    x>=0&&x<w.width&&y>=0&&y<w.height;
  const validStock=(s:MaterialStock)=>!!s&&MATERIALS.every(m=>
    Number.isFinite(s[m])&&s[m]>=0&&s[m]<=500);
  const validOres=(s:OreStock)=>!!s&&ORES.every(m=>
    Number.isFinite(s[m])&&s[m]>=0&&s[m]<=140);
  const validBuilding=(b:Building)=>!!b&&validId(b.id)&&
    BUILDING_TYPES.includes(b.type)&&validPlace(b.x,b.y)&&
    ['human','elf','dwarf','demon'].includes(b.culture)&&
    BUILDING_STAGES.includes(b.stage)&&Number.isFinite(b.progress)&&
    b.progress>=0&&b.progress<=100&&Number.isFinite(b.condition)&&
    b.condition>=0&&b.condition<=100&&Number.isInteger(b.started)&&
    b.started<=w.year&&b.started>=0&&
    (b.finished===undefined||Number.isInteger(b.finished)&&b.finished>=b.started&&
      b.finished<=w.year)&&
    (b.abandoned===undefined||Number.isInteger(b.abandoned)&&
      b.abandoned>=b.started&&b.abandoned<=w.year)&&
    (b.householdId===undefined||validId(b.householdId))&&validStock(b.spent)&&
    Number.isFinite(b.labor)&&b.labor>=0&&b.labor<=1000;
  const validTileIds=(ids:number[],limit:number)=>Array.isArray(ids)&&
    ids.length<=limit&&new Set(ids).size===ids.length&&
    ids.every(n=>Number.isInteger(n)&&n>=0&&n<w.width*w.height);
  const validBuildings=(list:Building[])=>Array.isArray(list)&&list.length<=90&&
    list.every(validBuilding)&&new Set(list.map(b=>b.id)).size===list.length;
  for(const s of w.settlements){
    const i=s.infrastructure;if(i===undefined)continue;
    if(!i||!validTileIds(i.land,300)||!validTileIds(i.roads,300)||
      !i.roads.every(n=>i.land.includes(n))||!validStock(i.stock)||
      (i.oreStock!==undefined&&!validOres(i.oreStock))||
      !validId(i.nextBuildingId)||!Number.isInteger(i.foundedWithResidents)||
      i.foundedWithResidents<0||!validBuildings(i.buildings)||
      !i.buildings.every(b=>i.land.includes(position(w,b.x,b.y))))return false;
  }
  if(w.ruins!==undefined){
    if(!Array.isArray(w.ruins)||w.ruins.length>80||
      !w.ruins.every(s=>s&&validId(s.id)&&typeof s.name==='string'&&
        s.name.length<=100&&['human','elf','dwarf','demon'].includes(s.species)&&
        validPlace(s.x,s.y)&&Number.isInteger(s.collapsed)&&
        s.collapsed>=0&&s.collapsed<=w.year&&validBuildings(s.buildings)&&
        validTileIds(s.roads,300)))return false;
  }
  if(w.trails!==undefined){
    if(!Array.isArray(w.trails)||w.trails.length>4000||
      !w.trails.every(t=>t&&Number.isInteger(t.index)&&t.index>=0&&
        t.index<w.width*w.height&&Number.isFinite(t.wear)&&
        t.wear>=0&&t.wear<=100)||
      new Set(w.trails.map(t=>t.index)).size!==w.trails.length)return false;
  }
  if(w.households?.some(h=>{
    if(!h.residence)return false;
    const residence=h.residence;
    return !validId(residence.settlementId)||!validId(residence.buildingId)||
      !w.settlements.some(s=>s.id===residence.settlementId&&
        s.infrastructure?.buildings.some(b=>b.id===residence.buildingId&&complete(b)));
  }))return false;
  return true;
}
