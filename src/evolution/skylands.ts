import {terrainHash,terrainNoise} from './biomeGeneration';
import type {World} from './engine';
import type {Point} from './motion';
import {VISUAL_TERRAIN_SIDE as SIDE} from './terrainCells';
import {topographyForWorld} from './topography';

type SkyTerrain='grove'|'heath'|'frost';
const terrains:readonly SkyTerrain[]=['grove','heath','frost'];
export type SkyIsland=Point&{rx:number;ry:number;height:number;depth:number;seed:number;terrain:SkyTerrain};
export type Skyland={id:number;spill:number;islands:SkyIsland[]};
export type Skyfall={x:number;y:number;height:number;direction:Point;width:number;land:Point};
export type IslandMesh={island:SkyIsland;left:number;top:number;width:number;rows:number;
  surface:Uint16Array;underside:Uint16Array;cover:Uint8Array;water:Uint8Array};

const compass:readonly Point[]=[{x:1,y:0},{x:0,y:1},{x:-1,y:0},{x:0,y:-1}];
const names=['Windglass Reach','Cloudpine Shelf','Driftstone Crown','Rimewater Steps',
  'Rainveil Heights','Hallowmist Rise','The Silver Shards','Mosslight Reach',
  'Highwater Steps','Galesong Shelf'];
const radiusLimit=1.42;
export const skylandName=(site:Skyland)=>names[(site.id-1)*2+site.islands[0].seed%2];
export const skylandCeiling=(skylands?:readonly Skyland[])=>Math.max(255,
  ...(skylands??[]).flatMap(group=>group.islands.map(i=>i.height+64)));
const origin=(n:number)=>Math.round((n+.5)*SIDE);
const cellCenter=(n:number)=>(n+.5)/SIDE-.5;

type SiteWorld=Pick<World,'width'|'height'|'tiles'|'settings'|'topography'>;

/** Place a handful of permanent groups above broad shores and valleys. The
 * generator uses a separate seed stream, so lifting an island leaves the
 * world simulation's starting conditions intact. */
export function generateSkylands(world:SiteWorld):Skyland[]{
  const {width,height,tiles}=world,{seed}=world.settings;
  const heights=topographyForWorld(world).heights;
  const border=11,shortSide=Math.min(width,height),candidates:{x:number;y:number;score:number}[]=[];
  for(let y=border;y<height-border;y+=2)for(let x=border;x<width-border;x+=2){
    const i=y*width+x,biome=tiles[i].biome;
    const around=[i-4,i+4,i-4*width,i+4*width];
    const slope=Math.max(...around.map(j=>Math.abs(heights[i]-heights[j])));
    const site=biome==='forest'||biome==='wetland'||biome==='plains'?2.3:
      biome==='water'?(around.some(j=>tiles[j].biome!=='water')?1.2:-2):.1;
    const score=terrainHash(x,y,seed^0x47f9aa)*4+site-slope*.015;
    candidates.push({x,y,score});
  }
  candidates.sort((a,b)=>b.score-a.score);
  const count=Math.min(5,1+Math.ceil(shortSide/65)),spacing=Math.max(19,shortSide*.43);
  const groups:Skyland[]=[];
  for(const {x,y} of candidates){
    if(groups.length>=count)break;
    if(groups.some(({islands:[a]})=>Math.hypot(x-a.x,y-a.y)<spacing))continue;
    const id=groups.length+1,random=(n:number)=>terrainHash(x+n*19,y-n*7,seed+39841);
    const mainSeed=(Math.floor(random(1)*2147483647)+id)%2147483647;
    const main:SkyIsland={x,y,rx:3.1+random(2)*1.2,ry:2.65+random(3)*.7,
      height:376+Math.floor(random(4)*32),depth:63+Math.floor(random(5)*18),
      seed:mainSeed,terrain:random(6)<.25?'heath':'grove'};
    // Each cardinal outlet follows a gentle bank when the ground offers one.
    let spill=0,best=-Infinity;
    for(const [d,{x:dx,y:dy}] of compass.entries()){
      const i=(y+dy*3)*width+x+dx*3,biome=tiles[i].biome;
      const score=random(8+d)*3+(biome==='wetland'?2:biome==='water'?-.4:1)-
        Math.abs(heights[i]-heights[(y+dy*4)*width+x+dx*4])*.06;
      if(score>best){spill=d;best=score;}
    }
    const satellites=compass.filter((_,d)=>d!==spill)
      .map(side=>({side,order:random(15+compass.indexOf(side))})).sort((a,b)=>a.order-b.order);
    const islands=[main];
    for(const [n,{side}] of satellites.slice(0,random(12)<.32&&shortSide>=42?3:2).entries()){
      const sideways=(random(21+n)-.5)*2.4,offset=6.55+random(25+n)*.65;
      islands.push({x:Math.round((x+side.x*offset-side.y*sideways)*SIDE)/SIDE,
        y:Math.round((y+side.y*offset+side.x*sideways)*SIDE)/SIDE,
        rx:1.05+random(31+n)*.6,ry:.85+random(35+n)*.6,
        height:(n===0?338:n===1?440:392)+Math.floor(random(38+n)*21),
        depth:27+Math.floor(random(44+n)*16),seed:Math.floor(random(51+n)*2147483647),
        terrain:n===1?'frost':terrains[Math.floor(random(56+n)*2)]});
    }
    groups.push({id,spill,islands});
  }
  return groups;
}

export function enableSkylands(world:World):World{
  if(world.skylands?.length)return world;
  const skylands=generateSkylands(world);
  return skylands.length?{...world,settings:{...world.settings,floatingIslands:true},skylands}:world;
}

export function validSkylands(value:unknown,width:number,height:number):boolean{
  if(!Array.isArray(value)||value.length>5)return false;
  const ids=new Set<number>();
  for(const group of value as Skyland[]){
    if(!group||!Number.isInteger(group.id)||group.id<1||group.id>5||ids.has(group.id)||
      !Number.isInteger(group.spill)||group.spill<0||group.spill>=compass.length||
      !Array.isArray(group.islands)||group.islands.length<2||group.islands.length>4)return false;
    ids.add(group.id);
    for(const i of group.islands){
      if(!i||!Number.isFinite(i.x)||!Number.isFinite(i.y)||
        !Number.isFinite(i.rx)||i.rx<.75||i.rx>4.5||!Number.isFinite(i.ry)||i.ry<.75||i.ry>3.5||
        i.x-i.rx*radiusLimit<-.5||i.x+i.rx*radiusLimit>width-.5||
        i.y-i.ry*radiusLimit<-.5||i.y+i.ry*radiusLimit>height-.5||
        !Number.isInteger(i.height)||i.height>480||!Number.isInteger(i.depth)||i.depth<20||
        i.depth>82||i.height-i.depth<284||
        !Number.isInteger(i.seed)||i.seed<0||i.seed>=2147483647||!terrains.includes(i.terrain))return false;
    }
  }
  return true;
}

function islandMesh(island:SkyIsland):IslandMesh{
  const {x,y,rx,ry,height,depth,seed}=island;
  const left=Math.floor((x-rx*radiusLimit+.5)*SIDE),top=Math.floor((y-ry*radiusLimit+.5)*SIDE);
  const width=Math.ceil((x+rx*radiusLimit+.5)*SIDE)-left;
  const rows=Math.ceil((y+ry*radiusLimit+.5)*SIDE)-top;
  const surface=new Uint16Array(width*rows),underside=new Uint16Array(surface.length);
  const cover=new Uint8Array(surface.length),water=new Uint8Array(surface.length);
  const phase=terrainHash(32,9,seed)*Math.PI*2;
  for(let row=0;row<rows;row++)for(let col=0;col<width;col++){
    const i=row*width+col,u=left+col,v=top+row;
    const dx=(cellCenter(u)-x)/rx,dy=(cellCenter(v)-y)/ry;
    const angle=Math.atan2(dy,dx),rough=terrainNoise(u,v,7,seed);
    const edge=1+Math.sin(angle*3+phase)*.15+Math.cos(angle*5+phase*.7)*.1+
      Math.sin(angle*9+phase*1.2)*.042+rough*.09;
    const core=1-Math.hypot(dx,dy)/edge;
    if(core<=0)continue;
    const ridge=terrainNoise(u,v,16,seed+845),grain=terrainHash(u,v,seed+581);
    surface[i]=height+Math.max(0,Math.floor(core*3+ridge*2))*5;
    underside[i]=height-Math.min(depth,9+Math.floor((Math.pow(core,.82)*depth*.88+
      (rough+.8)*9)/5)*5);
    cover[i]=core<.09||core<.2&&grain>.55?0:1+Math.floor((grain+1)*4)%4;
  }
  return {island,left,top,width,rows,surface,underside,cover,water};
}

const meshes=new WeakMap<Skyland,{islands:IslandMesh[];fall:Skyfall}>();
export function skylandMesh(group:Skyland){
  const cached=meshes.get(group);
  if(cached)return cached;
  const islands=group.islands.map(islandMesh),main=islands[0];
  const direction=compass[group.spill],{x:dx,y:dy}=direction;
  const {left,top,width,rows,surface,water}=main;
  const x=origin(main.island.x)-left,y=origin(main.island.y)-top;
  const channel=(col:number,row:number,lake:boolean)=>{
    if(col<0||row<0||col>=width||row>=rows)return;
    const i=row*width+col;
    if(!surface[i])return;
    surface[i]=main.island.height+(lake?5:2);
    water[i]=lake?1:2;
  };
  for(let oy=-8;oy<=8;oy++)for(let ox=-8;ox<=8;ox++){
    if((ox+dx*5)**2+(oy+dy*5)**2>38+terrainNoise(ox,oy,4,main.island.seed)*6)continue;
    channel(x+ox,y+oy,true);
  }
  let step=0;
  while(surface[(y+dy*(step+1))*width+x+dx*(step+1)])step++;
  const lipX=x+dx*step,lipY=y+dy*step;
  for(let advance=0;advance<=step;advance++){
    for(let bank=-1;bank<=1;bank++){
      channel(x+dx*advance-dy*bank,y+dy*advance+dx*bank,advance<2);
    }
  }
  const lip=lipY*width+lipX;
  water[lip]=3;
  const fallX=cellCenter(left+lipX)+dx*.5/SIDE,fallY=cellCenter(top+lipY)+dy*.5/SIDE;
  const fall={x:fallX,y:fallY,height:surface[lip],direction,width:2.5/SIDE,
    land:{x:Math.floor(fallX+.5+dx*.001),y:Math.floor(fallY+.5+dy*.001)}};
  const result={islands,fall};
  meshes.set(group,result);
  return result;
}

const shadows=new WeakMap<readonly Skyland[],Uint8Array>();
/** A fixed, offset sun direction keeps the shadow on the same ground
 * squares when the viewer rotates the camera. */
export function skylandShadows(skylands:readonly Skyland[],columns:number,rows:number):Uint8Array{
  const cached=shadows.get(skylands);
  if(cached)return cached;
  const mask=new Uint8Array(columns*rows);
  for(const group of skylands)for(const mesh of skylandMesh(group).islands){
    const {island,left,top,width,rows:span,surface}=mesh;
    const sx=Math.round(island.height/34),sy=Math.round(island.height/41);
    for(let row=0;row<span;row++)for(let col=0;col<width;col++){
      const index=row*width+col,x=left+col+sx,y=top+row+sy;
      if(!surface[index]||x<0||y<0||x>=columns||y>=rows)continue;
      const edge=!surface[index-width]||!surface[index+width]||
        !surface[index-1]||!surface[index+1];
      const ground=y*columns+x;
      mask[ground]=Math.max(mask[ground],edge?1:2);
    }
  }
  shadows.set(skylands,mask);
  return mask;
}
