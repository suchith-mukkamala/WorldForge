import {terrainHash,terrainNoise} from './biomeGeneration';
import type {Point} from './motion';

export const RealmBiome={basalt:0,ember:1,lava:2,steam:3,glowroot:4,crystal:5,chalk:6,sea:7} as const;
export type RealmBiome=typeof RealmBiome[keyof typeof RealmBiome];
export const REALM_LAYOUT_NAMES={rift:'Rift Sea',lakes:'Twin Basins',isles:'Flooded Archipelago'} as const;
export type RealmLayout=keyof typeof REALM_LAYOUT_NAMES;

const {basalt,ember,lava,steam,glowroot,crystal,chalk,sea}=RealmBiome;
const layouts:readonly RealmLayout[]=['rift','lakes','isles'];
type Basin=Point&{rx:number;ry:number;cos:number;sin:number};

function ellipsoid(x:number,y:number,rx:number,ry:number,angle=0):Basin{
  return {x,y,rx,ry,cos:Math.cos(angle),sin:Math.sin(angle)};
}

function basinDistance(x:number,y:number,basins:readonly Basin[]){
  let distance=Infinity;
  for(const b of basins){
    const dx=x-b.x,dy=y-b.y;
    const u=(dx*b.cos+dy*b.sin)/b.rx,v=(dy*b.cos-dx*b.sin)/b.ry;
    distance=Math.min(distance,u*u+v*v);
  }
  return Math.sqrt(distance);
}

function basinsFor(layout:RealmLayout,seed:number){
  const u=terrainHash(19,50,seed),v=terrainHash(27,59,seed),k=terrainHash(36,63,seed);
  const sx=(u-.5)*.075,sy=(v-.5)*.058,angle=(k-.5)*.65;
  if(layout==='rift')return {
    basins:[
      ellipsoid(sx,sy,.365+u*.032,.091+v*.032,angle*.35),
      ellipsoid(-.196+sx,sy+.052,.151,.105+v*.02,-.38+angle),
      ellipsoid(.205+sx,sy-.045,.15,.109+k*.035,.38-angle),
    ],
    islands:[ellipsoid(sx+.099,sy+.019,.053+u*.02,.037+k*.014,-.32),
      ellipsoid(sx-.142,sy+.049,.035+v*.017,.033,.25)],
  };
  if(layout==='lakes')return {
    basins:[
      ellipsoid(-.208+sx,sy-.076,.139+u*.033,.143+k*.040,-.27+angle),
      ellipsoid(.167+sx,sy+.092,.155+v*.037,.170+u*.025,.44+angle),
      ellipsoid(.218+sx,sy-.227,.077+u*.016,.057+k*.023,-angle),
    ],
    islands:[ellipsoid(-.213+sx,sy-.085,.054+u*.014,.051+v*.014,angle),
      ellipsoid(.158+sx,sy+.097,.058+k*.024,.061+u*.014,-angle)],
  };
  return {
    basins:[
      ellipsoid(sx,sy,.272+u*.046,.208+v*.045,angle),
      ellipsoid(-.166+sx,sy-.065,.158+v*.024,.114+k*.045,-.70-angle),
      ellipsoid(.168+sx,sy+.071,.148,.115+u*.040,.80+angle),
    ],
    islands:[ellipsoid(sx-.074,sy-.052,.055+u*.028,.050+v*.018,angle),
      ellipsoid(sx+.109,sy+.061,.060+k*.015,.057+u*.014,-.46),
      ellipsoid(sx+.17,sy-.081,.040+v*.015,.044,.50)],
  };
}

/** Lake bodies, island chains, lava seams and uplands use independent
 * seeded coordinate frames. Rebuilding a saved realm never advances the RNG. */
export function generateRealmGeography(w:number,h:number,seed:number,wet:readonly number[]){
  const layout=layouts[Math.min(layouts.length-1,Math.floor(terrainHash(29,17,seed)*layouts.length))];
  const {basins,islands}=basinsFor(layout,seed);
  const waterAngle=terrainHash(77,10,seed)*Math.PI*2,heatAngle=terrainHash(38,81,seed)*Math.PI*2;
  const cw=Math.cos(waterAngle),sw=Math.sin(waterAngle),ch=Math.cos(heatAngle),sh=Math.sin(heatAngle);
  const bend=terrainHash(51,17,seed)*Math.PI*2,trend=(terrainHash(12,62,seed)-.5)*.24;
  const cells=new Uint8Array(w*h),heights=new Uint8Array(cells.length);
  const minSide=Math.min(w,h),riftWidth=Math.max(.010,1.10/minSide);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=y*w+x,u=x/(w-1)-.5,v=y/(h-1)-.5;
    const grain=terrainNoise(x,y,5,seed),rock=terrainNoise(x,y,13,seed+9113);
    const shelf=terrainNoise(x,y,Math.max(8,minSide*.38),seed+909);
    const dx=u*cw+v*sw+rock*.047;
    const dy=v*cw-u*sw+grain*.039+(layout==='rift'?Math.sin(dx*11+bend)*.035:0);
    const pool=basinDistance(dx,dy,basins),isle=basinDistance(dx,dy,islands);
    const shore=1+grain*.12,inside=pool<shore;
    const hx=u*ch+v*sh,hy=v*ch-u*sh;
    const main=Math.abs(hx-trend-Math.sin(hy*8+bend)*.077-Math.sin(hy*19)*.021);
    const fork=hx<trend+.066?Math.abs(hy-.136-Math.sin(hx*10+bend)*.063)*1.15:1;
    const seam=Math.min(main,fork),heat=Math.max(0,1-seam/.169);
    let seep=0;
    for(const at of wet)seep=Math.max(seep,1-Math.hypot(x-at%w,y-Math.floor(at/w))/Math.max(6,minSide*.18));
    const moistField=terrainNoise(x,y,Math.max(7,minSide*.24),seed+1543);
    const humidity=.29+moistField*.28+Math.max(0,1-Math.abs(pool-1)*3)*.18+seep*.48;
    const relief=Math.max(0,.25+rock*.50+shelf*.55);
    let type:RealmBiome=basalt;
    if(inside&&isle<1+grain*.15)type=isle>.69+rock*.24?chalk:crystal;
    else if(inside)type=sea;
    else if(pool<shore+.112+rock*.029)type=chalk;
    else if(seam<riftWidth*(.83+rock*.33+grain*.18))type=lava;
    else if(heat>.48&&humidity>.38)type=steam;
    else if(humidity>.436+grain*.065)type=glowroot;
    else if(heat>.22)type=ember;
    else if(rock>.13||shelf>.32||grain>.46)type=crystal;
    cells[i]=type;
    const tier=Math.floor(relief*5)*3;
    heights[i]=type===sea?0:type===lava?2:type===chalk?4+Math.round(relief*11):
      Math.min(28,Math.max(4,5+tier+Math.round(grain*4)+(type===ember?2:0)+(type===crystal?2:0)));
  }
  return {cells,heights,layout};
}
