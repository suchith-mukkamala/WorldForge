import {terrainHash} from './biomeGeneration';
import type {Weather} from './climate';
import type {Point} from './motion';

export function isPrecipitation(kind:Weather):kind is 'rain'|'storm'|'snow'{
  return kind==='rain'||kind==='storm'||kind==='snow';
}

/** A brief, local strike with a short branch. Snap each step to squares. */
export function paintLightning(ctx:CanvasRenderingContext2D,start:Point,end:Point,
  pixel:number,seed:number):void{
  const dx=end.x-start.x,dy=end.y-start.y;
  const length=Math.hypot(dx,dy),steps=Math.max(4,Math.min(64,Math.ceil(length/pixel)));
  const side=(terrainHash(3,18,seed)>.5?1:-1)*Math.min(length*.16,pixel*6);
  const draw=(progress:number,branch:number)=>{
    const x=start.x+dx*progress+Math.sin(progress*Math.PI*4)*side+branch;
    const y=start.y+dy*progress;
    ctx.fillRect(Math.round(x/pixel)*pixel,Math.round(y/pixel)*pixel,pixel*1.5,pixel*1.5);
  };
  ctx.fillStyle='#dfedfc';
  for(let i=0;i<=steps;i++)draw(i/steps,0);
  ctx.fillStyle='#abc5e5';
  for(let i=Math.floor(steps*.28);i<steps*.64;i++)draw(i/steps,(i/steps-.28)*side*4.5);
}
