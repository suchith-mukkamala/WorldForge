import {terrainHash} from './biomeGeneration';
import type {WeatherField,WeatherSample} from './climate';
import {SEA_LEVEL} from './topography';

export const CLOUD_SHAPES=8;
const cycle=68_000;

export type CloudPose={x:number;y:number;height:number;alpha:number;shape:number;tail:boolean};
export type CloudTone='fair'|'overcast'|'storm'|'snow'|'fog';
export type WeatherBank=CloudPose&{tone:CloudTone;size:number;key:number;spread:number;weather:WeatherSample};

/** A handful of air masses form and disperse on staggered clocks. Each
 * lifetime has a steady wind and its own place, shape and opacity. */
export function cloudPoses(seed:number,width:number,height:number,time:number,heading?:number):CloudPose[]{
  const count=Math.min(24,Math.max(8,Math.round(Math.sqrt(width*height)/8)));
  const wind=heading??terrainHash(29,11,seed+3217)*Math.PI*2;
  const clouds:CloudPose[]=[];
  for(let i=0;i<count;i++){
    const clock=Math.max(0,time)+cycle*(i+terrainHash(i,13,seed)) / count;
    const period=Math.floor(clock/cycle);
    const roll=(salt:number)=>terrainHash(i+salt,period,seed+6397);
    const age=clock%cycle-roll(17)*8_000;
    const lifetime=38_000+roll(29)*20_000;
    if(age<=0||age>=lifetime)continue;
    const progress=age/lifetime;
    const heading=wind+(roll(13)-.5)*.66;
    const drift=(.12+roll(8)*.15)*progress;
    const x=width*(.06+roll(5)*.88+Math.cos(heading)*(drift-.09));
    const y=height*(.06+roll(6)*.88+Math.sin(heading)*(drift-.09));
    const fade=Math.min(1,age/6_000,(lifetime-age)/8_000);
    clouds.push({x,y,height:SEA_LEVEL+80+roll(23)*67,
      alpha:fade*(.40+roll(43)*.17),shape:Math.floor(roll(49)*CLOUD_SHAPES)%CLOUD_SHAPES,
      tail:roll(38)>.35});
  }
  return clouds;
}

/** Sample cloud banks on a moving lattice. Their positions, coverage and
 * colors come from the same front as the weather on the ground below them. */
export function weatherCloudBanks(field:WeatherField):WeatherBank[]{
  const {width,height,shift,seed}=field,banks:WeatherBank[]=[];
  const spacing=Math.max(4.4,Math.sqrt(width*height/155));
  const left=Math.floor(-shift.x/spacing),right=Math.ceil((width-shift.x)/spacing);
  const top=Math.floor(-shift.y/spacing),bottom=Math.ceil((height-shift.y)/spacing);
  for(let row=top;row<bottom;row++)for(let col=left;col<right;col++){
    const roll=(salt:number)=>terrainHash(col,row,seed+salt);
    const x=(col+.25+roll(6148)*.5)*spacing+shift.x;
    const y=(row+.25+roll(514)*.5)*spacing+shift.y;
    if(x<0||y<0||x>=width||y>=height)continue;
    const weather=field.at(x,y),{kind,cover,intensity}=weather;
    if(kind==='clear'||kind==='drought'||kind==='overcast'&&roll(53)>.72)continue;
    const tone=kind==='rain'?'overcast':kind;
    const altitude=SEA_LEVEL+(tone==='fog'?18:tone==='storm'?86:76)+roll(63)*(tone==='fog'?12:43);
    const alpha=tone==='fog'?.20+intensity*.17:.25+cover*.41;
    const size=tone==='storm'?1.85+roll(219)*.39:tone==='fog'?1.52:1.10+cover*.67;
    banks.push({x,y,height:altitude,alpha,size,tone,weather,spread:spacing*.72,tail:tone!=='fog',
      key:Math.floor(roll(8992)*0x7fffffff),shape:Math.floor(roll(142)*CLOUD_SHAPES)%CLOUD_SHAPES});
  }
  return banks;
}
