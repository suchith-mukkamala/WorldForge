import {useEffect,useRef} from 'react';
import {terrainHash} from './biomeGeneration';
import type {WeatherSample} from './climate';
import type {Point} from './motion';
import {isPrecipitation,paintLightning} from './weatherArt';

type Props={sample:WeatherSample;wind:Point;seed:number};
const shift=(position:number,span:number)=>((position%span)+span)%span;
const LIGHT={
  clear:'#8ca5b2',overcast:'#657988',rain:'#40556d',storm:'#263650',
  snow:'#a7c3d8',fog:'#a3b6b5',drought:'#ecc08b',
};

function paintLocalWeather(ctx:CanvasRenderingContext2D,{sample,wind,seed}:Props,time:number,
  width:number,height:number){
  const {kind,cover,intensity}=sample;
  ctx.clearRect(0,0,width,height);
  ctx.fillStyle=LIGHT[kind];
  ctx.globalAlpha=kind==='storm'?.17+.1*intensity:kind==='drought'?.07:.05+cover*.13;
  ctx.fillRect(0,0,width,height);
  const pixel=Math.max(1,Math.floor(width/320));
  const rain=isPrecipitation(kind),snow=kind==='snow',margin=8*pixel;
  if(rain){
    const count=Math.round((snow?51:82)+intensity*(snow?85:126));
    ctx.fillStyle=snow?'#ecf5ff':'#bed9e8';
    for(let i=0;i<count;i++){
      const phase=terrainHash(i,6,seed),speed=.64+terrainHash(i,12,seed)*.64;
      const x=terrainHash(i,78,seed)*(width+margin)+time*wind.x*(snow?.017:.047)*speed;
      const y=phase*(height+margin)+time*(snow?.022:.29)*speed;
      const px=Math.round((shift(x,width+margin)-margin*.5)/pixel)*pixel;
      const py=Math.round((shift(y,height+margin)-margin*.5)/pixel)*pixel;
      ctx.globalAlpha=.28+phase*.38;
      if(snow){
        const flake=phase>.83?pixel*2:pixel;
        ctx.fillRect(px+Math.round(Math.sin(time*.002+phase*6)*pixel*1.9),py,flake,flake);
      }else{
        ctx.fillRect(px,py,pixel,pixel*(kind==='storm'?5:4));
        ctx.fillRect(px+Math.sign(wind.x)*pixel,py+pixel*3,pixel,pixel*2);
        if(phase>.91){
          ctx.globalAlpha=.26;
          ctx.fillRect(shift(px+width*.34,width),height*.70+phase*height*.26,pixel*2,pixel);
        }
      }
    }
  }
  if(kind==='fog'){
    ctx.fillStyle='#d1e3d9';
    for(let i=0;i<8;i++){
      const length=width*(.2+terrainHash(i,316,seed)*.27);
      const x=shift(terrainHash(i,219,seed)*(width+length)+time*wind.x*.012,width+length)-length;
      const y=(.17+i*.092+terrainHash(i,21,seed)*.071)*height;
      const band=Math.max(3,Math.floor(height*.024));
      ctx.globalAlpha=.10+intensity*.18;
      ctx.fillRect(Math.round(x),Math.round(y),length,band);
      ctx.globalAlpha*=.55;
      ctx.fillRect(Math.round(x+length*.09),Math.round(y-band),length*.79,band);
      ctx.fillRect(Math.round(x+length*.18),Math.round(y+band),length*.71,band);
    }
  }
  const strikeClock=time+1720;
  if(kind==='storm'&&time>0&&strikeClock%7100<150){
    const flash=Math.floor(strikeClock/7100);
    const x=width*(.10+terrainHash(flash,713,seed)*.73);
    ctx.globalAlpha=.82;
    paintLightning(ctx,{x,y:-pixel*2},{x:x+width*.055,y:height*.28},pixel*1.5,seed+flash);
  }
  ctx.globalAlpha=1;
}

/** Keep weather on its own canvas, including when the explorer stands still. */
export function LocalWeather(props:Props){
  const ref=useRef<HTMLCanvasElement>(null),current=useRef(props);
  const restart=useRef<(()=>void)|undefined>(undefined);
  current.current=props;
  const enabled=props.sample.kind!=='clear';
  useEffect(()=>{
    const canvas=ref.current,ctx=canvas?.getContext('2d');
    if(!enabled||!canvas||!ctx)return;
    let frame=0,last=-Infinity,visible=true;
    const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
    const draw=(now:number)=>paintLocalWeather(ctx,current.current,now,canvas.width,canvas.height);
    const animate=(now:number)=>{
      if(motion.matches){draw(0);return;}
      if(now-last>=42){draw(now);last=now;}
      frame=requestAnimationFrame(animate);
    };
    const sync=()=>{
      cancelAnimationFrame(frame);
      if(document.hidden||!visible||!canvas.width||!canvas.height)return;
      const {kind}=current.current.sample;
      if(motion.matches||!(isPrecipitation(kind)||kind==='fog'))draw(0);
      else{last=-Infinity;frame=requestAnimationFrame(animate);}
    };
    const resize=()=>{
      const {width,height}=canvas.getBoundingClientRect();
      if(width<=0||height<=0)return;
      const density=Math.min(.86,Math.sqrt(270_000/(width*height)));
      canvas.width=Math.ceil(width*density);canvas.height=Math.ceil(height*density);
      sync();
    };
    const size=new ResizeObserver(resize);
    size.observe(canvas);
    const clip=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;sync();});
    clip.observe(canvas);
    document.addEventListener('visibilitychange',sync);
    motion.addEventListener('change',sync);
    restart.current=sync;resize();
    return ()=>{
      cancelAnimationFrame(frame);size.disconnect();clip.disconnect();
      restart.current=undefined;
      document.removeEventListener('visibilitychange',sync);
      motion.removeEventListener('change',sync);
    };
  },[enabled]);
  useEffect(()=>{restart.current?.();},[props.sample,props.seed,props.wind]);
  return enabled?<canvas ref={ref} className="adventure-weather" data-weather={props.sample.kind}
    aria-hidden="true"/>:null;
}
