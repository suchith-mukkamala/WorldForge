import {RealmBiome} from './realmGeography';
import {realmScenery} from './realmScenery';
import type {RealmMap} from './underworld';

type Glow={stride:number;values:Float32Array};
const cachedLights=new WeakMap<RealmMap,Glow>();
const mineral=[0xab9de9,0x8ce1e1,0xf2c98c];
const fungus=[0x75e1bc,0xe0a3d7,0xbbdfa5];

/** Bake light on tile corners so a lava glow continues across the adjoining
 * squares. Rock barriers attenuate light and dense groups share a color cap. */
export function realmLight(map:RealmMap):Glow{
  const cached=cachedLights.get(map);
  if(cached)return cached;
  const {width,height,biomes,heights}=map,stride=width+1;
  const values=new Float32Array(stride*(height+1)*4),scene=realmScenery(map);
  function cast(cell:number,dx:number,dy:number,radius:number,tint:number,power:number){
    const cx=cell%width+.5+dx,cy=Math.floor(cell/width)+.5+dy;
    const red=tint>>>16&255,green=tint>>>8&255,blue=tint&255;
    for(let y=Math.max(0,Math.ceil(cy-radius));y<=Math.min(height,Math.floor(cy+radius));y++){
      for(let x=Math.max(0,Math.ceil(cx-radius));x<=Math.min(width,Math.floor(cx+radius));x++){
        const falloff=1-Math.hypot(x-cx,y-cy)/radius;
        if(falloff<=0)continue;
        const corner=Math.min(y,height-1)*width+Math.min(x,width-1);
        const wall=Math.max(0,heights[corner]-heights[cell]-3);
        const weight=power*falloff*(.56+falloff*.44)/(1+wall*.16);
        const i=(y*stride+x)*4;
        values[i]+=red*weight;values[i+1]+=green*weight;values[i+2]+=blue*weight;values[i+3]+=weight;
      }
    }
  }
  for(let i=0;i<biomes.length;i++)if(biomes[i]===RealmBiome.lava&&!map.bridges.has(i))
    cast(i,0,0,3.15,0xffa467,.62);
  for(const [i,p] of scene.formations){
    if(p.kind==='crystal')cast(i,p.dx,p.dy,2.45,mineral[p.variant],.35+p.size*.045);
    else if(p.kind==='fungus')cast(i,p.dx,p.dy,2.7,fungus[p.variant],.29+p.size*.05);
    else if(p.kind==='vent')cast(i,p.dx,p.dy,1.7,0xa5ded0,.23);
  }
  for(const i of map.houses.keys())cast(i,0,0,1.75,0xefbb83,.34);
  const fall=map.water?.fall;
  if(fall)cast(fall.outlet,0,0,2,0x98dcd4,fall.flow===2?.32:.19);
  for(let i=0;i<values.length;i+=4){
    if(values[i+3]<=.48)continue;
    const cap=.48/values[i+3];
    for(let channel=0;channel<4;channel++)values[i+channel]*=cap;
  }
  const baked={stride,values};
  cachedLights.set(map,baked);
  return baked;
}

export function litCavernPixel(glow:Glow,ink:number,x:number,y:number,u:number,v:number):number{
  const {stride,values}=glow;
  const tl=(y*stride+x)*4,tr=tl+4,bl=tl+stride*4,br=bl+4;
  const a=(1-u)*(1-v),b=u*(1-v),c=(1-u)*v,d=u*v;
  const sample=(k:number)=>values[tl+k]*a+values[tr+k]*b+values[bl+k]*c+values[br+k]*d;
  const exposure=sample(3);
  if(exposure<.008)return ink;
  const keep=1-exposure;
  const r=Math.min(255,Math.round((ink&255)*keep+sample(0)));
  const g=Math.min(255,Math.round((ink>>>8&255)*keep+sample(1)));
  const bColor=Math.min(255,Math.round((ink>>>16&255)*keep+sample(2)));
  return (255<<24|bColor<<16|g<<8|r)>>>0;
}
