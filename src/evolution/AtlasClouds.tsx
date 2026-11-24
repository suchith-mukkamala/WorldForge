import {useEffect,useMemo,useRef} from 'react';
import {terrainHash} from './biomeGeneration';
import {blockCloud} from './blockModels';
import {blockBuildingArt,depthBlockView,placeBlockArt,type BlockStamp} from './blockScenery';
import {weatherField,type WeatherField} from './climate';
import type {Point} from './motion';
import {cloudPoses,CLOUD_SHAPES,weatherCloudBanks,type CloudPose,type CloudTone} from './surfaceClouds';
import {isPrecipitation,paintLightning} from './weatherArt';

type Props={world:Parameters<typeof weatherField>[0];width:number;unit:number;
  view:ReturnType<typeof depthBlockView>;project:(cloud:CloudPose)=>Point;ground:(point:Point)=>Point};
type Drop={from:Point;to:Point;offset:number;period:number;snow:boolean};
const stamps=new Map<string,BlockStamp>();

function prepareBanks(weather:WeatherField,project:Props['project'],ground:Props['ground'],unit:number){
  return weatherCloudBanks(weather).map(bank=>{
    const start=project({...bank,height:bank.height-5}),floor=ground(bank);
    const drops:Drop[]=[];
    let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;
    if(isPrecipitation(bank.weather.kind)){
      const count=Math.round(12+bank.weather.intensity*24);
      for(let i=0;i<count;i++){
        const roll=(salt:number)=>terrainHash(i,salt,bank.key);
        const angle=roll(322)*Math.PI*2,radius=Math.sqrt(roll(951))*bank.spread;
        const x=bank.x+Math.cos(angle)*radius,y=bank.y+Math.sin(angle)*radius;
        if(x<0||y<0||x>=weather.width||y>=weather.height)continue;
        const kind=weather.at(x,y).kind;
        if(!isPrecipitation(kind))continue;
        const to=ground({x,y}),p=project({...bank,x,y,height:bank.height-8});
        const from={x:p.x-unit*(1.3+roll(417)),y:Math.min(p.y,to.y-unit*8)};
        drops.push({from,to,
          offset:roll(7)*2900,period:kind==='snow'?1900+roll(14)*1400:500+roll(14)*550,snow:kind==='snow'});
        left=Math.min(left,from.x,to.x);right=Math.max(right,from.x,to.x);
        top=Math.min(top,from.y,to.y);bottom=Math.max(bottom,from.y,to.y);
      }
    }
    const strike={from:start,to:{x:floor.x+unit*2,y:Math.max(floor.y,start.y+unit*8)}};
    return {bank,drops,strike,rainBounds:{left,right,top,bottom}};
  });
}

/** Storms and clouds share a bounded overlay. Weather animation leaves the
 * terrain raster, inhabitants and picking buffers free to be reused. */
export function AtlasClouds({world,...props}:Props){
  const weather=weatherField(world);
  const banks=useMemo(()=>prepareBanks(weather,props.project,props.ground,props.unit),
    [weather,props.project,props.ground,props.unit]);
  const ref=useRef<HTMLCanvasElement>(null),current=useRef({...props,weather,banks});
  const refresh=useRef<(()=>void)|null>(null);
  current.current={...props,weather,banks};

  useEffect(()=>{
    const canvas=ref.current,ctx=canvas?.getContext('2d'),sheet=canvas?.parentElement;
    const viewport=sheet?.closest<HTMLElement>('.atlas-viewport');
    if(!canvas||!ctx||!sheet||!viewport)return;
    const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame=0,last=-Infinity,visible=true;
    let left=0,top=0,width=0,height=0,scale=1,density=1;

    const draw=(now:number)=>{
      const {weather,banks,unit,view,project}=current.current,{seed,wind}=weather;
      ctx.setTransform(density,0,0,density,0,0);
      ctx.clearRect(0,0,width,height);
      ctx.imageSmoothingEnabled=false;
      const visible=(x:number,y:number,m:number)=>x>=-m&&x<=width+m&&y>=-m&&y<=height+m;
      const paint=(shape:number,tone:CloudTone,p:Point,alpha:number,span:number)=>{
        const stamp=blockBuildingArt(stamps,blockCloud(shape,tone),view,unit);
        if(!stamp)return;
        const sprite=placeBlockArt(stamp,p,scale*span),size=sprite.scale;
        ctx.globalAlpha=alpha;
        ctx.drawImage(stamp.image,Math.round(sprite.x*density)/density,
          Math.round(sprite.y*density)/density,stamp.image.width*size,stamp.image.height*size);
      };
      const drawCloud=(cloud:CloudPose,tone:CloudTone='fair',size=1)=>{
        const point=project(cloud),x=point.x*scale-left,y=point.y*scale-top;
        if(!visible(x,y,38*unit*scale*size))return;
        if(cloud.tail){
          const tail=project({...cloud,x:cloud.x-wind.x*2.3*size,y:cloud.y-wind.y*2.3*size,height:cloud.height-6});
          paint((cloud.shape+3)%CLOUD_SHAPES,tone,
            {x:tail.x*scale-left,y:tail.y*scale-top},cloud.alpha*.61,size*.81);
        }
        paint(cloud.shape,tone,{x,y},cloud.alpha,size);
      };
      const pixel=Math.min(3.4,Math.max(1/density,unit*scale*.44));
      const at=(x:number,y:number)=>({x:x*scale-left,y:y*scale-top});
      const square=(x:number,y:number,w:number,h:number)=>{
        ctx.fillRect(Math.round(x*density)/density,Math.round(y*density)/density,w,h);
      };
      for(const {bank,drops,rainBounds} of banks){
        // Projected drop paths stay inside their envelope. Include wobble and
        // the short trail when deciding whether a bank can enter the viewport.
        if(rainBounds.right*scale<left-16||rainBounds.left*scale>left+width+16||
          rainBounds.bottom*scale<top-16||rainBounds.top*scale>top+height+16)continue;
        ctx.globalAlpha=.47+bank.weather.intensity*.27;
        for(const {from,to,offset,period,snow} of drops){
          const t=((now+offset)%period)/period;
          const wobble=snow?Math.sin((now+offset)*.0038)*pixel*1.6:0;
          const x=(from.x+(to.x-from.x)*t)*scale-left+wobble;
          const y=(from.y+(to.y-from.y)*t)*scale-top;
          if(!visible(x,y,6))continue;
          ctx.fillStyle=snow?'#e4eff7':'#b4cee3';
          square(x,y,pixel,pixel*(snow?1.15:2.5));
          if(!snow&&t<.88)square(x-pixel,y-pixel*1.5,pixel,pixel*1.5);
        }
      }
      const strikeClock=now+1100;
      if(!motion.matches&&strikeClock%7100<160){
        const strikes=banks.filter(({bank,strike})=>{
          const point=at(strike.to.x,strike.to.y);
          return bank.weather.kind==='storm'&&visible(point.x,point.y,32);
        });
        const burst=Math.floor(strikeClock/7100),entry=strikes[burst%strikes.length];
        if(entry){
          const {from,to}=entry.strike;
          ctx.globalAlpha=.85;
          paintLightning(ctx,at(from.x,from.y),at(to.x,to.y),pixel,entry.bank.key+burst);
        }
      }
      for(const {bank} of banks){
        const drift=Math.sin(now*.0005+bank.key%32)*.9;
        drawCloud({...bank,x:bank.x+wind.x*drift,y:bank.y+wind.y*drift},bank.tone,bank.size);
      }
      for(const cloud of cloudPoses(seed,weather.width,weather.height,now,Math.atan2(wind.y,wind.x))){
        const here=weather.at(cloud.x,cloud.y);
        if(here.kind==='clear')drawCloud({...cloud,alpha:cloud.alpha*(.52+here.cover)});
      }
      ctx.globalAlpha=1;
    };
    const tick=(now:number)=>{
      if(motion.matches){draw(0);return;}
      if(now-last>=50){draw(now);last=now;}
      frame=requestAnimationFrame(tick);
    };
    const sync=()=>{
      cancelAnimationFrame(frame);
      if(document.hidden||!visible||width<=0||height<=0)return;
      last=-Infinity;
      if(motion.matches)draw(0);
      else frame=requestAnimationFrame(tick);
    };
    const position=()=>{
      const map=sheet.getBoundingClientRect(),view=viewport.getBoundingClientRect();
      const x=view.left+viewport.clientLeft,y=view.top+viewport.clientTop;
      left=Math.max(0,x-map.left);top=Math.max(0,y-map.top);
      width=Math.max(0,Math.min(map.width-left,x+viewport.clientWidth-map.left-left));
      height=Math.max(0,Math.min(map.height-top,y+viewport.clientHeight-map.top-top));
      scale=map.width/current.current.width;
      density=Math.min(1.5,window.devicePixelRatio||1,Math.sqrt(900_000/Math.max(1,width*height)));
      canvas.style.left=left+'px';canvas.style.top=top+'px';
      canvas.style.width=width+'px';canvas.style.height=height+'px';
      const pixelsWide=Math.max(1,Math.ceil(width*density)),pixelsHigh=Math.max(1,Math.ceil(height*density));
      if(canvas.width!==pixelsWide)canvas.width=pixelsWide;
      if(canvas.height!==pixelsHigh)canvas.height=pixelsHigh;
      sync();
    };
    const resize=new ResizeObserver(position);
    resize.observe(viewport);resize.observe(sheet);
    const intersection=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;sync();});
    intersection.observe(sheet);
    viewport.addEventListener('scroll',position,{passive:true});
    document.addEventListener('visibilitychange',sync);
    motion.addEventListener('change',sync);
    refresh.current=position;
    position();
    return ()=>{
      cancelAnimationFrame(frame);
      resize.disconnect();intersection.disconnect();
      viewport.removeEventListener('scroll',position);
      document.removeEventListener('visibilitychange',sync);
      motion.removeEventListener('change',sync);
      refresh.current=null;
    };
  },[]);
  useEffect(()=>{refresh.current?.();},[weather,props.width,props.view.key,banks]);
  return <canvas ref={ref} className="atlas-clouds" aria-hidden="true"/>;
}
