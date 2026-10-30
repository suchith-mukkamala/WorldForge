/** v2.4 — mortals gradually cut and fill real terrain while developing towns.
 * This is annual simulation state, never a camera/zoom effect or divine brush.
 */
import type {World} from './engine';
import {SEA_LEVEL,topographyForWorld} from './topography';

export type Earthwork={year:number;settlementId:number;cut:number;
  fill:number;volume:number};
const PERIOD=4,MAX_PROJECTS=2,MAX_HISTORY=64;
const near=(a:{x:number;y:number},b:{x:number;y:number})=>
  Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));

/** At most two towns reshape land every four years. The earth removed from a
 * high cell is deposited in the adjacent low cell: total elevation is conserved.
 * Actual builders, ongoing development and accessible land are prerequisites.
 */
export function advanceEarthworks(w:World):number{
  if(w.terrainPhysics?.version!==1||w.year<=0||w.year%PERIOD!==0)return 0;
  const source=topographyForWorld(w).heights;
  let heights:number[]|null=null,completed=0;
  for(const s of [...w.settlements].sort((a,b)=>a.id-b.id)){
    if(completed>=MAX_PROJECTS)break;
    const infra=s.infrastructure;
    if(!infra||infra.land.length<2||s.population<3)continue;
    const worker=w.agents.find(a=>a.health>=50&&a.energy>=58&&
      (a.work?.job==='builder'&&a.work.settlementId===s.id||
        a.mind?.goal==='build')&&near(a,s)<=7);
    if(!worker)continue;
    const owned=new Set(infra.land),occupied=new Set(infra.buildings
      .filter(b=>b.stage==='complete').map(b=>b.y*w.width+b.x));
    const priorities=new Map<number,number>();
    for(const road of infra.roads)priorities.set(road,18);
    for(const b of infra.buildings){
      if(b.stage==='complete'||b.stage==='ruin'||b.stage==='abandoned')continue;
      priorities.set(b.y*w.width+b.x,26);
    }
    // If construction has no active site, prepare steep nearby land for the
    // next generation. Never alter the ground under completed homes.
    for(const tile of infra.land){
      const x=tile%w.width,y=Math.floor(tile/w.width);
      if(near({x,y},s)<=3&&!priorities.has(tile))priorities.set(tile,5);
    }
    let best:{cut:number;fill:number;score:number}|null=null;
    const ground=heights??source;
    for(const [site,priority] of priorities){
      if(!owned.has(site)||occupied.has(site)||w.tiles[site].biome==='water')continue;
      const x=site%w.width,y=Math.floor(site/w.width);
      const neighbors=[...(x>0?[site-1]:[]),
        ...(x<w.width-1?[site+1]:[]),
        ...(y>0?[site-w.width]:[]),...(y<w.height-1?[site+w.width]:[])];
      for(const other of neighbors){
        if(!owned.has(other)||occupied.has(other)||w.tiles[other].biome==='water')
          continue;
        const high=ground[site]>=ground[other]?site:other;
        const low=high===site?other:site,difference=ground[high]-ground[low];
        if(difference<10||ground[high]<=SEA_LEVEL+3||ground[low]>=250)continue;
        const score=priority+difference*.35-near({x,y},s)*.2;
        if(!best||score>best.score||score===best.score&&high<best.cut)
          best={cut:high,fill:low,score};
      }
    }
    if(!best)continue;
    const work=best as {cut:number;fill:number;score:number};
    const volume=Math.min(2,Math.floor((ground[work.cut]-ground[work.fill])/4));
    if(volume<=0)continue;
    if(!heights)heights=[...source];
    heights[work.cut]-=volume;heights[work.fill]+=volume;
    worker.energy=Math.max(1,Math.round((worker.energy-volume*1.6)*100)/100);
    if(s.economy?.tools&&s.economy.tools>=.1)
      s.economy.tools=Math.max(0,Math.round((s.economy.tools-.1)*100)/100);
    w.earthworks??=[];
    w.earthworks.push({year:w.year,settlementId:s.id,
      cut:work.cut,fill:work.fill,volume});
    if(w.earthworks.length>MAX_HISTORY)w.earthworks=w.earthworks.slice(-MAX_HISTORY);
    completed++;
  }
  if(heights)w.topography={version:1,heights};
  return completed;
}

export function validEarthworks(w:World):boolean{
  if(w.earthworks===undefined)return true;
  return Array.isArray(w.earthworks)&&w.earthworks.length<=MAX_HISTORY&&
    w.earthworks.every(e=>e&&Number.isInteger(e.year)&&e.year>=0&&
      e.year<=w.year&&Number.isSafeInteger(e.settlementId)&&e.settlementId>0&&
      Number.isInteger(e.cut)&&e.cut>=0&&e.cut<w.width*w.height&&
      Number.isInteger(e.fill)&&e.fill>=0&&e.fill<w.width*w.height&&
      Number.isInteger(e.volume)&&e.volume>=1&&e.volume<=2&&
      e.cut!==e.fill&&Math.abs(e.cut%w.width-e.fill%w.width)+
        Math.abs(Math.floor(e.cut/w.width)-Math.floor(e.fill/w.width))===1);
}
