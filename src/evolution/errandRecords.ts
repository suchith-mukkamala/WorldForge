export const SUPPLY_GOODS=['wood','stone'] as const;
export type SupplyGood=typeof SUPPLY_GOODS[number];
export const ERRAND_AMOUNT=3;
export const TREASURY_LIMIT=10000;
export const ERRAND_HISTORY_LIMIT=12;

export type Errand={kind:'forage';from:number}|
  {kind:'delivery';from:number;to:number;good:SupplyGood};
export type ActiveErrand={errand:Errand;carrying:boolean};
export type ErrandReceipt={errand:Errand;at:number;coins:number};
export type MortalJournal={coins:number;active?:ActiveErrand;history:ErrandReceipt[]};

export const errandKey=(errand:Errand)=>errand.kind==='forage'?
  'forage:'+errand.from:'delivery:'+errand.from+':'+errand.to+':'+errand.good;
export const errandReward=(errand:Errand)=>errand.kind==='forage'?3:6;
export const coinLabel=(coins:number)=>coins+' coin'+(coins===1?'':'s');
export const errandDestination=(errand:Errand)=>
  errand.kind==='forage'?errand.from:errand.to;

const record=(value:unknown):value is Record<string,unknown>=>
  !!value&&typeof value==='object'&&!Array.isArray(value);
const id=(value:unknown):value is number=>
  typeof value==='number'&&Number.isSafeInteger(value)&&value>=1;
const whole=(value:unknown,limit:number):value is number=>
  typeof value==='number'&&Number.isInteger(value)&&value>=0&&value<=limit;

function validErrand(value:unknown):value is Errand{
  if(!record(value)||!id(value.from))return false;
  return value.kind==='forage'||value.kind==='delivery'&&id(value.to)&&
    value.to!==value.from&&SUPPLY_GOODS.includes(value.good as SupplyGood);
}

export function validMortalJournal(value:unknown,day:number):value is MortalJournal{
  if(!record(value)||!whole(value.coins,TREASURY_LIMIT)||!Array.isArray(value.history)||
    value.history.length>ERRAND_HISTORY_LIMIT)return false;
  const active=value.active;
  if(active!==undefined&&(!record(active)||!validErrand(active.errand)||
    typeof active.carrying!=='boolean'||active.errand.kind==='delivery'&&!active.carrying))
    return false;
  let previous=0;
  for(const entry of value.history){
    if(!record(entry)||!validErrand(entry.errand)||!whole(entry.at,day)||
      entry.at<previous||!whole(entry.coins,errandReward(entry.errand)))return false;
    previous=entry.at;
  }
  return true;
}
