/** Worldforge v0.9 — roads and bridges are investments made by settlements.
 * They belong to the world, not to the camera, and consume real local stock.
 */
import type {Settlement,World} from './engine';

export type TransportSegment={index:number;sponsorId:number;built:number;condition:number};
export type TransportNetwork={roads:TransportSegment[];bridges:TransportSegment[]};

const dist=(a:{x:number;y:number},b:{x:number;y:number})=>
  Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
const round=(n:number)=>Math.round(n*100)/100;
const id=(w:World,x:number,y:number)=>y*w.width+x;
const within=(w:World,x:number,y:number)=>x>=0&&y>=0&&x<w.width&&y<w.height;
const live=(s:TransportSegment)=>s.condition>25;

export function prepareTransport(w:World):void{
  w.transport??={roads:[],bridges:[]};
}
export function cloneTransport(n:TransportNetwork):TransportNetwork{
  return {roads:n.roads.map(s=>({...s})),bridges:n.bridges.map(s=>({...s}))};
}
export function roadTiles(w:World):Set<number>{
  return new Set(w.transport?.roads.filter(live).map(s=>s.index)??[]);
}
export function bridgeTiles(w:World):Set<number>{
  return new Set(w.transport?.bridges.filter(live).map(s=>s.index)??[]);
}
export function caravanPace(w:World,current:number,next:number):number{
  const roads=roadTiles(w),bridges=bridgeTiles(w);
  return roads.has(current)&&roads.has(next)||
    (roads.has(current)||roads.has(next))&&bridges.has(next)?2:1;
}

/** A reproducible shortest walkable route, with established roads preferred
 * over equally short unimproved alternatives. Bridges preserve water terrain.
 */
export function findTradeRoute(w:World,from:{x:number;y:number},
  to:{x:number;y:number},prospectiveBridge?:number):number[]|null{
  if(dist(from,to)>35)return null;
  const start=id(w,from.x,from.y),end=id(w,to.x,to.y);
  const parents=new Int32Array(w.tiles.length).fill(-1);
  const seen=new Uint8Array(w.tiles.length),queue=[start];seen[start]=1;
  const roads=roadTiles(w),bridges=bridgeTiles(w);
  const minX=Math.max(0,Math.min(from.x,to.x)-7),maxX=Math.min(w.width-1,
    Math.max(from.x,to.x)+7);
  const minY=Math.max(0,Math.min(from.y,to.y)-7),maxY=Math.min(w.height-1,
    Math.max(from.y,to.y)+7);
  for(let head=0;head<queue.length&&head<6500;head++){
    const here=queue[head];if(here===end)break;
    const x=here%w.width,y=Math.floor(here/w.width);
    // Fixed-order visits avoid sorting thousands of tiny neighbor arrays on
    // every trade query. First pass favors paved lanes at equal distance.
    for(let pass=0;pass<(roads.size?2:1);pass++){
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      if(!dx&&!dy)continue;
      const nx=x+dx,ny=y+dy;
      if(nx<minX||nx>maxX||ny<minY||ny>maxY)continue;
      const next=id(w,nx,ny);
      if(seen[next]||(w.tiles[next].biome==='water'&&
        !bridges.has(next)&&next!==prospectiveBridge))continue;
      if(roads.size&&(pass===0)!==roads.has(next))continue;
      seen[next]=1;parents[next]=here;queue.push(next);
      }
    }
  }
  if(!seen[end])return null;
  const route:number[]=[];
  for(let at=end;at!==start;at=parents[at]){
    route.push(at);if(route.length>90||at<0)return null;
  }
  route.push(start);return route.reverse();
}

/** Only a narrow river channel qualifies: the water tile must have land on
 * opposite banks. One prospective bridge may be considered per new route.
 */
function narrowChannel(w:World,index:number):boolean{
  const x=index%w.width,y=Math.floor(index/w.width);
  const land=(x:number,y:number)=>within(w,x,y)&&
    w.tiles[id(w,x,y)].biome!=='water';
  return land(x-1,y)&&land(x+1,y)||land(x,y-1)&&land(x,y+1);
}
function prospectiveCrossing(w:World,from:Settlement,to:Settlement):number|null{
  if(dist(from,to)>24)return null;
  const start=id(w,from.x,from.y),end=id(w,to.x,to.y);
  const length=w.tiles.length*2,parents=new Int32Array(length).fill(-1);
  const seen=new Uint8Array(length),queue=[start*2];seen[start*2]=1;
  const bridges=bridgeTiles(w);
  const minX=Math.max(0,Math.min(from.x,to.x)-5),maxX=Math.min(w.width-1,
    Math.max(from.x,to.x)+5);
  const minY=Math.max(0,Math.min(from.y,to.y)-5),maxY=Math.min(w.height-1,
    Math.max(from.y,to.y)+5);
  for(let head=0;head<queue.length&&head<9000;head++){
    const state=queue[head],at=Math.floor(state/2),used=state%2;
    if(at===end&&used===1)break;
    const x=at%w.width,y=Math.floor(at/w.width);
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      if(!dx&&!dy)continue;
      const nx=x+dx,ny=y+dy;
      if(nx<minX||nx>maxX||ny<minY||ny>maxY)continue;
      const next=id(w,nx,ny),river=w.tiles[next].biome==='water'&&
        !bridges.has(next);
      if(river&&(used||!narrowChannel(w,next)))continue;
      const nextState=next*2+(used||river?1:0);
      if(seen[nextState])continue;
      seen[nextState]=1;parents[nextState]=state;queue.push(nextState);
    }
  }
  if(!seen[end*2+1])return null;
  let crossing:number|null=null,steps=0;
  for(let at=end*2+1;at!==start*2;at=parents[at]){
    if(++steps>89||at<0)return null;
    const index=Math.floor(at/2);
    if(w.tiles[index].biome==='water'&&!bridges.has(index))crossing=index;
  }
  return crossing;
}

/** Prospective bridges are paid for by the community that wants the trade,
 * and require available builders rather than appearing as free terrain edits.
 */
export function considerTradeBridge(w:World,origin:Settlement,
  destination:Settlement):boolean{
  prepareTransport(w);
  if(w.year%6!==0||w.transport!.bridges.length>=80||
    origin.economy?.shortages.includes('food')||
    (origin.economy?.coins??0)<14)return false;
  const stock=origin.infrastructure?.stock;
  if(!stock||stock.stone<9||stock.wood<6||
    !w.agents.some(a=>a.work?.job==='builder'&&
      a.work.settlementId===origin.id&&dist(a,origin)<=6))return false;
  const crossing=prospectiveCrossing(w,origin,destination);
  if(crossing===null||!findTradeRoute(w,origin,destination,crossing))return false;
  stock.stone=round(stock.stone-9);stock.wood=round(stock.wood-6);
  origin.economy!.coins=round(origin.economy!.coins-14);
  w.transport!.bridges.push({index:crossing,sponsorId:origin.id,
    built:w.year,condition:100});
  w.events.push({id:w.nextEventId++,year:w.year,type:'trade',
    message:origin.name+' built a bridge to reach '+destination.name+'.'});
  if(w.events.length>90)w.events=w.events.slice(-90);
  return true;
}

/** Traffic inspires paved roads, but stone, wood, labor and treasury compete
 * with homes, farms and industrial projects. Infrastructure is maintained.
 */
export function advanceTransport(w:World):number[]{
  prepareTransport(w);
  const formerlyOpen=bridgeTiles(w);
  const network=w.transport!,byId=new Map(w.settlements.map(s=>[s.id,s]));
  for(const segment of [...network.roads,...network.bridges]){
    const sponsor=byId.get(segment.sponsorId),stock=sponsor?.infrastructure?.stock;
    segment.condition=round(Math.max(0,segment.condition-.35));
    if(segment.condition<60&&stock&&stock.stone>=.3&&
      (sponsor?.economy?.coins??0)>=.5){
      stock.stone=round(stock.stone-.3);
      sponsor!.economy!.coins=round(sponsor!.economy!.coins-.5);
      segment.condition=Math.min(100,round(segment.condition+12));
    }
    // An occupied bridge cannot disappear out from under a mortal. Keep it
    // barely serviceable until its last traveler has stepped onto dry land.
    if(w.tiles[segment.index].biome==='water'&&segment.condition<=25&&
      w.agents.some(a=>a.y*w.width+a.x===segment.index))
      segment.condition=25.01;
  }
  network.roads=network.roads.filter(s=>s.condition>0&&
    w.tiles[s.index].biome!=='water');
  network.bridges=network.bridges.filter(s=>s.condition>0&&
    w.tiles[s.index].biome==='water');
  const navigable=bridgeTiles(w);
  const closed=[...formerlyOpen].filter(index=>!navigable.has(index));
  if(w.year%8!==0||network.roads.length>=900)return closed;
  const established=new Set(network.roads.map(s=>s.index));
  for(const s of w.settlements){
    if(network.roads.length>=900)break;
    const stock=s.infrastructure?.stock;
    if(!stock||!s.economy||s.economy.coins<8||
      s.economy.shortages.includes('food')||
      !w.agents.some(a=>a.work?.job==='builder'&&
        a.work.settlementId===s.id&&dist(a,s)<=7))continue;
    const worn=(w.trails??[]).filter(t=>t.wear>=4.5&&
      !established.has(t.index)&&w.tiles[t.index].biome!=='water'&&
      dist({x:t.index%w.width,y:Math.floor(t.index/w.width)},s)<=11)
      .sort((a,b)=>b.wear-a.wear||a.index-b.index)
      .slice(0,Math.min(2,900-network.roads.length));
    for(const t of worn){
      if(stock.stone<1.5||stock.wood<1||s.economy.coins<2)break;
      stock.stone=round(stock.stone-1.5);stock.wood=round(stock.wood-1);
      s.economy.coins=round(s.economy.coins-2);
      network.roads.push({index:t.index,sponsorId:s.id,
        built:w.year,condition:100});established.add(t.index);
    }
  }
  return closed;
}

export function reconcileTransportTerrain(w:World,index:number):void{
  if(!w.transport)return;
  const water=w.tiles[index].biome==='water';
  w.transport=cloneTransport(w.transport);
  if(water)w.transport.roads=w.transport.roads.filter(s=>s.index!==index);
  else w.transport.bridges=w.transport.bridges.filter(s=>s.index!==index);
}

export function validTransport(w:World):boolean{
  if(w.transport===undefined)return true;
  const n=w.transport;
  if(!n||!Array.isArray(n.roads)||!Array.isArray(n.bridges)||
    n.roads.length>900||n.bridges.length>80)return false;
  const valid=(segments:TransportSegment[],water:boolean)=>
    new Set(segments.map(s=>s.index)).size===segments.length&&
    segments.every(s=>s&&Number.isInteger(s.index)&&s.index>=0&&
      s.index<w.tiles.length&&
      (w.tiles[s.index].biome==='water')===water&&
      Number.isInteger(s.sponsorId)&&s.sponsorId>0&&
      Number.isInteger(s.built)&&s.built>=0&&s.built<=w.year&&
      Number.isFinite(s.condition)&&s.condition>0&&s.condition<=100);
  return valid(n.roads,false)&&valid(n.bridges,true);
}
