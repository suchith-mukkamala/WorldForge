import type {World} from './engine';
import {adventureDistance,adventureMapFor,adventureRegion,
  type AdventureGate,type AdventureMap,type AdventureRegion} from './adventureMap';
import {exchangeSettlementStock,settlementStockRoom,stockOf} from './economy';
import {terrainHash} from './biomeGeneration';
import {personName} from './identity';
import {ERRAND_AMOUNT,ERRAND_HISTORY_LIMIT,SUPPLY_GOODS,TREASURY_LIMIT,
  coinLabel,errandDestination,errandKey,errandReward,type ActiveErrand,type Errand,
  type MortalJournal} from './errandRecords';
import type {Point} from './motion';

export const MEAL_PRICE=2;
export const MEAL_ENERGY=18;
const ERRAND_COOLDOWN_DAYS=7;
const EMPTY_JOURNAL:MortalJournal={coins:0,history:[]};
const today=(world:World)=>world.year*365+(world.dayOfYear??0);
const pointAt=(width:number,index:number)=>({x:index%width,y:Math.floor(index/width)});
const indexAt=(world:World,point:Point)=>point.y*world.width+point.x;
const within=(world:World,point:Point)=>
  point.x>=0&&point.x<world.width&&point.y>=0&&point.y<world.height;

export type ErrandResult={world:World;message:string};
export type ErrandObjective={text:string;point?:Point;action?:'gather'|'deliver'};

export const journalFor=(world:World):MortalJournal=>world.descent?.journal??EMPTY_JOURNAL;
function withJournal(world:World,journal:MortalJournal):World{
  return {...world,descent:{...world.descent!,journal}};
}
const settlementAt=(world:World,id:number)=>world.settlements.find(town=>town.id===id);
export const errandTownName=(world:World,id:number)=>settlementAt(world,id)?.name??
  world.codex?.settlements.find(town=>town.id===id)?.name??'the settlement';
const cargo=(errand:Errand)=>errand.kind==='forage'?'food':errand.good;
export const errandTitle=(world:World,errand:Errand)=>errand.kind==='forage'?
  'Forage for '+errandTownName(world,errand.from):
  (errand.good==='wood'?'Timber':'Stone')+' for '+errandTownName(world,errand.to);
export const errandCargo=(errand:Errand)=>ERRAND_AMOUNT+' '+cargo(errand);

export function noticeBoard(world:World,region:AdventureRegion):Point|undefined{
  if(!region.settlement)return undefined;
  const {x,y}=region.focus;
  const candidates=[{x:x+1,y:y-1},{x:x-1,y:y-1},{x,y:y+1},{x,y}];
  const isBoardSite=(point:Point)=>within(world,point)&&region.area.has(indexAt(world,point))&&
    world.tiles[indexAt(world,point)].biome!=='water'&&
    !world.ancientSites?.some(site=>adventureDistance(site,point)===0)&&
    !region.gates.some(g=>adventureDistance(g.point,point)===0);
  return candidates.find(isBoardSite)??[...region.area].map(i=>pointAt(world.width,i))
    .find(isBoardSite);
}

function foragePatch(world:World,region:AdventureRegion,board:Point):Point|undefined{
  let best:Point|undefined,score=Infinity;
  for(const index of region.area){
    const tile=world.tiles[index];
    if(tile.biome==='water'||tile.food<ERRAND_AMOUNT)continue;
    const point=pointAt(world.width,index),distance=adventureDistance(board,point);
    if(distance<2||distance>6||region.gates.some(g=>adventureDistance(g.point,point)===0)||
      world.ancientSites?.some(site=>adventureDistance(site,point)===0))
      continue;
    const rank=Math.abs(distance-4)+(tile.biome==='forest'?0:.25)+
      terrainHash(point.x,point.y,world.settings.seed)*.17;
    if(rank<score){best=point;score=rank;}
  }
  return best;
}

function townBeyond(gate:AdventureGate,townId:number|undefined):number|undefined{
  const place=gate.destination;
  if(place.kind==='town')return place.id;
  if(place.kind==='wild')return;
  if(place.to.id!==townId)return place.to.id;
  return place.from.kind==='town'?place.from.id:undefined;
}

export function availableErrands(world:World,region:AdventureRegion):Errand[]{
  const town=region.settlement&&settlementAt(world,region.settlement.id);
  const journal=journalFor(world),board=noticeBoard(world,region);
  if(!town?.economy||!board||journal.active)return [];
  const ready=(errand:Errand)=>!journal.history.some(entry=>
    today(world)-entry.at<ERRAND_COOLDOWN_DAYS&&errandKey(entry.errand)===errandKey(errand));
  const errands:Errand[]=[],forage:Errand={kind:'forage',from:town.id};
  if(town.economy.coins>=errandReward(forage)&&ready(forage)&&
    settlementStockRoom(town,'food')>=ERRAND_AMOUNT&&foragePatch(world,region,board))
    errands.push(forage);
  // A courier gets one nearby offer based on actual shortages and spare stock.
  for(const gate of region.gates){
    const id=townBeyond(gate,town.id),target=id&&settlementAt(world,id);
    if(!target||!target.economy||!town.infrastructure||!target.infrastructure)continue;
    for(const good of SUPPLY_GOODS){
      const delivery:Errand={kind:'delivery',from:town.id,to:target.id,good};
      if(target.economy.coins>=errandReward(delivery)&&target.economy.shortages.includes(good)&&
        stockOf(town,good)>=ERRAND_AMOUNT+4&&settlementStockRoom(target,good)>=ERRAND_AMOUNT&&
        ready(delivery))return [...errands,delivery];
    }
  }
  return errands;
}

function nextGate(map:AdventureMap,region:AdventureRegion,target:number):AdventureGate|undefined{
  const neighbors=new Map<number,Set<number>>();
  const link=(a:number,b:number)=>{
    const list=neighbors.get(a)??new Set<number>();list.add(b);neighbors.set(a,list);
  };
  for(const {place} of map.routes.values()){
    if(place.from.kind==='town'){
      link(place.from.id,place.to.id);
      link(place.to.id,place.from.id);
    }
  }
  for(const [id,gates] of map.ferries){
    for(const gate of gates)if(gate.destination.kind==='town')link(id,gate.destination.id);
  }
  const queue=[target],distance=new Map([[target,0]]);
  for(let i=0;i<queue.length;i++){
    const at=queue[i];
    for(const town of neighbors.get(at)??[]){
      if(distance.has(town))continue;
      distance.set(town,distance.get(at)!+1);queue.push(town);
    }
  }
  const here=region.settlement?.id;
  let best=here===undefined?Infinity:distance.get(here)??Infinity;
  let exit:AdventureGate|undefined;
  for(const gate of region.gates){
    const to=townBeyond(gate,here),steps=to===undefined?Infinity:distance.get(to)??Infinity;
    if(steps<best){best=steps;exit=gate;}
  }
  return exit;
}

export function errandObjective(world:World,map:AdventureMap,region:AdventureRegion,
  active:ActiveErrand):ErrandObjective{
  const {errand,carrying}=active,target=errandDestination(errand);
  if(!settlementAt(world,target))
    return {text:'The settlement has closed. You can abandon this errand.'};
  if(region.settlement?.id!==target){
    const exit=nextGate(map,region,target);
    return {point:exit?.point,text:exit?
      (exit.ferry?'Sail to ':'Head toward ')+exit.label+'.':
      'No route reaches '+errandTownName(world,target)+' right now.'};
  }
  const board=noticeBoard(world,region);
  if(!board)return {text:'The town board is inaccessible.'};
  if(carrying)return {text:'Bring the '+cargo(errand)+' to the town board.',
    point:board,action:'deliver'};
  const patch=foragePatch(world,region,board);
  return patch?{text:'Gather food at the marked patch.',point:patch,action:'gather'}:
    {text:'The local patches are low. Try again when food grows back.'};
}

function context(world:World){
  const actor=world.descent?.mode==='mortal'&&world.agents.find(a=>a.id===world.descent?.agentId);
  if(!actor)return null;
  const map=adventureMapFor(world),region=adventureRegion(world,map,actor);
  const board=noticeBoard(world,region);
  const town=region.settlement&&settlementAt(world,region.settlement.id);
  return {actor,map,region,town,atBoard:!!board&&adventureDistance(actor,board)<=1,
    journal:journalFor(world)};
}
const replaceTown=(world:World,town:World['settlements'][number])=>({...world,
  settlements:world.settlements.map(s=>s.id===town.id?town:s)});

export function acceptErrand(world:World,order:Errand):ErrandResult{
  const player=context(world);
  if(!player?.atBoard||!player.town)return {world,message:'Read the board in town to accept an errand.'};
  const errand=availableErrands(world,player.region).find(e=>errandKey(e)===errandKey(order));
  if(!errand)return {world,message:'This errand is no longer available.'};
  if(errand.kind==='delivery'){
    const source=exchangeSettlementStock(player.town,errand.good,-ERRAND_AMOUNT,0);
    if(!source)return {world,message:'The supplies have already been used.'};
    world=replaceTown(world,source);
  }
  return {world:withJournal(world,{...player.journal,active:{
    errand,carrying:errand.kind==='delivery'}}),message:'Accepted. '+errandTitle(world,errand)+'.'};
}

export function gatherErrand(world:World):ErrandResult{
  const player=context(world),active=player?.journal.active;
  if(!player||!active||active.carrying)return {world,message:'You have no gathering errand.'};
  const goal=errandObjective(world,player.map,player.region,active);
  if(goal.action!=='gather'||!goal.point||adventureDistance(player.actor,goal.point)>1)
    return {world,message:goal.action==='gather'?'Walk to the marked patch.':goal.text};
  const index=indexAt(world,goal.point),tiles=world.tiles.slice(),tile=tiles[index];
  tiles[index]={...tile,food:Math.round((tile.food-ERRAND_AMOUNT)*100)/100};
  return {world:withJournal({...world,tiles},{...player.journal,active:{...active,carrying:true}}),
    message:'Gathered '+errandCargo(active.errand)+'. Bring it back to the town board.'};
}

export function deliverErrand(world:World):ErrandResult{
  const player=context(world),active=player?.journal.active;
  if(!player||!active?.carrying)return {world,message:'Gather your supplies first.'};
  const {errand}=active,town=player.town;
  if(!player.atBoard||!town||town.id!==errandDestination(errand)||!town.economy)
    return {world,message:'Bring the supplies to the destination’s town board.'};
  const coins=Math.min(errandReward(errand),Math.floor(town.economy.coins),
    TREASURY_LIMIT-player.journal.coins);
  const updated=exchangeSettlementStock(town,cargo(errand),ERRAND_AMOUNT,-coins);
  if(!updated)return {world,message:'The town’s stockroom is full. Try again later.'};
  const record={errand,coins,at:today(world)};
  const author=personName(world,world.lineage.find(r=>r.id===player.actor.id)??player.actor);
  const event={id:world.nextEventId,year:world.year,type:'trade' as const,
    message:author+' brought '+errandCargo(errand)+' to '+town.name+'.'};
  return {world:withJournal({...replaceTown(world,updated),
    events:[...world.events,event].slice(-90),nextEventId:world.nextEventId+1},{
    coins:player.journal.coins+coins,
    history:[...player.journal.history,record].slice(-ERRAND_HISTORY_LIMIT),
  }),message:'Delivered '+errandCargo(errand)+' to '+town.name+
    (coins?' · +'+coinLabel(coins)+'.':'.')};
}

function canReturnAt(world:World,region:AdventureRegion,actor:Point,active:ActiveErrand){
  const town=region.settlement&&settlementAt(world,region.settlement.id);
  const board=noticeBoard(world,region);
  return !!town?.economy&&active.carrying&&town.id===active.errand.from&&
    !!board&&adventureDistance(actor,board)<=1&&
    settlementStockRoom(town,cargo(active.errand))>=ERRAND_AMOUNT;
}
export function abandonErrandLabel(world:World,region:AdventureRegion,actor:Point,
  active:ActiveErrand){
  if(!active.carrying)return 'Abandon errand';
  return canReturnAt(world,region,actor,active)?'Return supplies and abandon':'Drop supplies and abandon';
}
export function abandonErrand(world:World):ErrandResult{
  const player=context(world),active=player?.journal.active;
  if(!player||!active)return {world,message:'You have no current errand.'};
  if(player.town&&canReturnAt(world,player.region,player.actor,active)){
    const town=exchangeSettlementStock(player.town,cargo(active.errand),ERRAND_AMOUNT,0);
    if(town)world=replaceTown(world,town);
  }
  return {world:withJournal(world,{...player.journal,active:undefined}),message:'Errand ended.'};
}

export function buyMeal(world:World):ErrandResult{
  const player=context(world);
  if(!player?.atBoard||!player.town?.economy)
    return {world,message:'Visit the town board for a meal.'};
  if(player.journal.coins<MEAL_PRICE)return {world,message:'A meal costs '+coinLabel(MEAL_PRICE)+'.'};
  if(player.actor.energy>=100)return {world,message:'Your energy is already full.'};
  const town=exchangeSettlementStock(player.town,'food',-1,MEAL_PRICE);
  if(!town)return {world,message:'The town cannot serve a meal right now.'};
  const energy=Math.min(100,player.actor.energy+MEAL_ENERGY);
  const agents=world.agents.map(a=>a.id===player.actor.id?{...a,energy}:a);
  return {world:withJournal({...replaceTown(world,town),agents},{
    ...player.journal,coins:player.journal.coins-MEAL_PRICE,
  }),message:'You shared a meal and recovered '+Math.round(energy-player.actor.energy)+' energy.'};
}
