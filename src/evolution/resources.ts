/** Renewable, spatial resources. Deposits are sparse and persist in world saves.
 * Each tile has at most one deposit. Every harvest removes real stock, and
 * regeneration takes place once per simulated year, regardless of visibility.
 */
import type {Biome,World} from './engine';

export const RESOURCE_KINDS=['tree','stone','clay','coal','copper','iron','gold'] as const;
export type ResourceKind=typeof RESOURCE_KINDS[number];
export type ResourceDeposit={index:number;kind:ResourceKind;amount:number;capacity:number};
export const RESOURCE_LABELS:Record<ResourceKind,string>={
  tree:'Trees',stone:'Stone',clay:'Clay',coal:'Coal',copper:'Copper ore',
  iron:'Iron ore',gold:'Gold ore',
};
export const RESOURCE_COLORS:Record<ResourceKind,string>={
  tree:'#88d5a0',stone:'#c1c1c9',clay:'#d9a17e',coal:'#474454',
  copper:'#dc976d',iron:'#a6b2cd',gold:'#f2cf71',
};
// Geological replenishment is an intentional sandbox abstraction. Ore renews
// much more slowly than trees; it is not an unlimited yearly harvest.
export const REGENERATION:Record<ResourceKind,number>={
  tree:.58,stone:.13,clay:.4,coal:.08,copper:.07,iron:.06,gold:.023,
};
const CAPACITY:Record<ResourceKind,number>={
  tree:12,stone:18,clay:14,coal:9,copper:8,iron:8,gold:5,
};
const WEIGHTS:Record<Biome,Partial<Record<ResourceKind,number>>>={
  plains:{tree:.12,stone:.26,clay:.21,coal:.015,copper:.015,iron:.009,gold:.002},
  forest:{tree:.53,stone:.22,clay:.13,coal:.015,copper:.01,iron:.008,gold:.002},
  mountain:{tree:.02,stone:.52,clay:.05,coal:.08,copper:.11,iron:.085,gold:.015},
  cave:{stone:.48,clay:.025,coal:.13,copper:.10,iron:.11,gold:.018},
  wasteland:{tree:.02,stone:.40,clay:.20,coal:.085,copper:.065,iron:.045,gold:.008},
  volcanic:{stone:.42,clay:.09,coal:.10,copper:.09,iron:.12,gold:.025},
  water:{},
};
const round=(n:number)=>Math.round(n*100)/100;
// Stable per-tile pseudo-noise. Resource generation consumes no world RNG and
// cannot change the sequence of births, partnerships, or divine decisions.
function noise(seed:number,index:number,salt:number):number{
  let n=(Math.imul(seed^salt,747796405)+Math.imul(index+1,2891336453))>>>0;
  n=Math.imul(n^(n>>>16),2246822519)>>>0;
  n=Math.imul(n^(n>>>13),3266489917)>>>0;
  return ((n^(n>>>16))>>>0)/4294967296;
}
export function depositAt(seed:number,index:number,biome:Biome):ResourceDeposit|undefined{
  const choice=noise(seed,index,0x751a),weights=WEIGHTS[biome];
  let threshold=0;
  for(const kind of RESOURCE_KINDS){
    threshold+=weights[kind]??0;
    if(choice>=threshold)continue;
    const factor=.75+noise(seed,index,0xc072)*.5;
    const capacity=round(CAPACITY[kind]*factor);
    return {index,kind,capacity,
      amount:round(capacity*(.65+noise(seed,index,0xb793)*.35))};
  }
  return undefined;
}
export function createDeposits(w:Pick<World,'tiles'|'settings'>):ResourceDeposit[]{
  const result:ResourceDeposit[]=[];
  for(let index=0;index<w.tiles.length;index++){
    const deposit=depositAt(w.settings.seed,index,w.tiles[index].biome);
    if(deposit)result.push(deposit);
  }
  return result;
}
export function prepareDeposits(w:World):void{
  w.deposits??=createDeposits(w);
}
export function regrowDeposits(w:World):void{
  prepareDeposits(w);
  for(const deposit of w.deposits!){
    deposit.amount=round(Math.min(deposit.capacity,
      deposit.amount+REGENERATION[deposit.kind]*w.settings.resourceLevel));
  }
}
export function harvestDeposit(d:ResourceDeposit,request:number):number{
  const taken=round(Math.min(d.amount,Math.max(0,request)));
  d.amount=round(Math.max(0,d.amount-taken));
  return taken;
}
export function editDeposit(w:World,index:number):void{
  if(!w.deposits)return; // Older saves start depositing on their first tick.
  w.deposits=w.deposits.filter(d=>d.index!==index);
  const d=depositAt(w.settings.seed,index,w.tiles[index].biome);
  if(d)w.deposits.push(d);
}
export function validDeposits(w:World):boolean{
  if(w.deposits===undefined)return true; // Pre-v0.7.1 saves.
  const list=w.deposits;
  return Array.isArray(list)&&list.length<=w.tiles.length&&
    new Set(list.map(d=>d?.index)).size===list.length&&
    list.every(d=>d&&Number.isInteger(d.index)&&d.index>=0&&
      d.index<w.tiles.length&&w.tiles[d.index].biome!=='water'&&
      RESOURCE_KINDS.includes(d.kind)&&Number.isFinite(d.capacity)&&
      d.capacity>.01&&d.capacity<=30&&Number.isFinite(d.amount)&&
      d.amount>=0&&d.amount<=d.capacity);
}
