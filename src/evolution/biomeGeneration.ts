/** Seeded climate and habitat zones. These use a stable hash, never world RNG,
 * and only run at world creation. Old worlds keep their saved biomes. */
import type {Biome,Species} from './engine';

const fract=(n:number)=>n-Math.floor(n);
const hash=(x:number,y:number,seed:number)=>{
  let v=(seed^Math.imul(x,374761393)^Math.imul(y,668265263))>>>0;
  v=Math.imul(v^(v>>>13),1274126177);
  return ((v^(v>>>16))>>>0)/4294967295;
};
const smooth=(v:number)=>v*v*(3-2*v);
function noise(x:number,y:number,scale:number,seed:number):number{
  const fx=x/scale,fy=y/scale,ix=Math.floor(fx),iy=Math.floor(fy);
  const u=smooth(fx-ix),v=smooth(fy-iy);
  const a=hash(ix,iy,seed),b=hash(ix+1,iy,seed),
    c=hash(ix,iy+1,seed),d=hash(ix+1,iy+1,seed);
  return ((a+(b-a)*u)*(1-v)+(c+(d-c)*u)*v)*2-1;
}
const climatePhase=(seed:number)=>hash(seed,11,2077)*Math.PI*2;
/** Rotate regional cultures around the continent by seed, not by species ID. */
export function biomeHome(seed:number,species:Species):[number,number]{
  if(species==='human')return [.5,.5];
  const offset=species==='elf'?0:species==='dwarf'?2*Math.PI/3:4*Math.PI/3;
  const theta=climatePhase(seed)+offset;
  return [.5+.27*Math.cos(theta),.5+.27*Math.sin(theta)];
}
const distance=(u:number,v:number,p:[number,number])=>
  Math.hypot(u-p[0],v-p[1]);
export function seededBiome(x:number,y:number,w:number,h:number,seed:number):Biome{
  const u=(x+.5)/w,v=(y+.5)/h;
  const elf=distance(u,v,biomeHome(seed,'elf'));
  const dwarf=distance(u,v,biomeHome(seed,'dwarf'));
  const demon=distance(u,v,biomeHome(seed,'demon'));
  const scale=Math.max(6,Math.min(w,h));
  const broad=noise(x,y,scale*.31,seed+17);
  const patches=noise(x,y,scale*.12,seed+83);
  const detail=noise(x,y,scale*.042,seed+139);
  const humidity=noise(x+31,y-17,scale*.26,seed+241)*.68+
    noise(x,y,scale*.09,seed+307)*.32;
  const ridge=Math.abs(noise(x+11,y-19,scale*.34,seed+401))*.55+
    patches*.38+detail*.15;
  const temperature=.53+.24*Math.sin((v+fract(seed*.00071)) * Math.PI*2)+
    noise(x-7,y+41,scale*.29,seed+619)*.21;
  // Small archipelagos have different river directions and meanders.
  const angle=climatePhase(seed),river=
    .5+.18*Math.sin(u*5+angle)+.06*Math.sin(u*14-angle)+
    .08*broad;
  if(Math.abs(v-river)<.009&&elf>.095&&dwarf>.1&&demon>.1)
    return 'water';
  if(demon<.095)return 'volcanic';
  if(demon<.155)return 'wasteland';
  if(dwarf<.085)return detail>.03?'cave':'mountain';
  if(dwarf<.155)return patches>.4?'cave':'mountain';
  if(elf<.135)return 'forest';
  if(elf<.18&&humidity>-.45)return 'forest';
  if(ridge>.46)return detail>.44?'cave':'mountain';
  if(temperature>.63&&humidity<-.15||humidity<-.5)return 'wasteland';
  if(humidity>.08||broad>.45)return 'forest';
  return 'plains';
}
