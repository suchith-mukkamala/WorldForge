import {terrainHash} from './biomeGeneration';
import {SEA_LEVEL} from './topography';

export const CLOUD_SHAPES=8;
const cycle=68_000;

export type CloudPose={x:number;y:number;height:number;alpha:number;shape:number;tail:boolean};

/** A handful of air masses form and disperse on staggered clocks. Each
 * lifetime has a steady wind and its own place, shape and opacity. */
export function cloudPoses(seed:number,width:number,height:number,time:number):CloudPose[]{
  const count=Math.min(24,Math.max(8,Math.round(Math.sqrt(width*height)/8)));
  const wind=terrainHash(29,11,seed+3217)*Math.PI*2;
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
