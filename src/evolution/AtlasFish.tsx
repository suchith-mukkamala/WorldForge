import {useEffect,useRef} from 'react';
import {coastalLife,fishPose,paintFish} from './coastalLife';
import type {World} from './engine';
import type {Point} from './motion';

type Props={world:World;width:number;height:number;square:number;
  project:(point:Point)=>Point|undefined};

/** Animate the visible water on a small transparent canvas. The atlas
 * terrain and its picking surface never repaint for a fish frame. */
export function AtlasFish(props:Props){
  const ref=useRef<HTMLCanvasElement>(null),current=useRef(props);
  const refresh=useRef<(()=>void)|null>(null);
  current.current=props;
  const {fish}=coastalLife(props.world);
  useEffect(()=>{
    const canvas=ref.current,context=canvas?.getContext('2d'),sheet=canvas?.parentElement;
    const viewport=sheet?.closest<HTMLElement>('.atlas-viewport');
    if(!canvas||!context||!sheet||!viewport)return;
    const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
    let handle=0,last=-Infinity;
    let x=0,y=0,width=0,height=0,scale=1,density=1;
    const draw=(now:number)=>{
      if(!motion.matches)handle=requestAnimationFrame(draw);
      else handle=0;
      if(now-last<50||width<=0||height<=0)return;
      last=now;
      const {project,square}=current.current;
      context.setTransform(density,0,0,density,0,0);
      context.clearRect(0,0,width,height);
      for(const fishy of fish){
        const pose=fishPose(fishy,motion.matches?0:now),point=project(pose);
        if(!point)continue;
        const px=point.x*scale-x,py=point.y*scale-y;
        if(px<-12||px>width+12||py<-12||py>height+12)continue;
        paintFish(context,fishy,{x:px,y:py},Math.max(1.6,square*scale),
          motion.matches?0:pose.lift,1/density);
      }
    };
    const schedule=()=>{
      last=-Infinity;
      if(!handle)handle=requestAnimationFrame(draw);
    };
    refresh.current=()=>{if(motion.matches)schedule();};
    const position=()=>{
      const sheetBox=sheet.getBoundingClientRect(),view=viewport.getBoundingClientRect();
      const left=view.left+viewport.clientLeft,top=view.top+viewport.clientTop;
      x=Math.max(0,left-sheetBox.left);y=Math.max(0,top-sheetBox.top);
      width=Math.max(0,Math.min(sheetBox.width-x,left+viewport.clientWidth-sheetBox.left-x));
      height=Math.max(0,Math.min(sheetBox.height-y,top+viewport.clientHeight-sheetBox.top-y));
      scale=sheetBox.width/current.current.width;
      density=Math.min(2,window.devicePixelRatio||1);
      canvas.style.left=x+'px';canvas.style.top=y+'px';
      canvas.style.width=width+'px';canvas.style.height=height+'px';
      const pixelsWide=Math.max(1,Math.ceil(width*density));
      const pixelsHigh=Math.max(1,Math.ceil(height*density));
      if(canvas.width!==pixelsWide)canvas.width=pixelsWide;
      if(canvas.height!==pixelsHigh)canvas.height=pixelsHigh;
      schedule();
    };
    const observer=new ResizeObserver(position);
    observer.observe(viewport);observer.observe(sheet);
    viewport.addEventListener('scroll',position,{passive:true});
    motion.addEventListener('change',position);
    position();
    return ()=>{
      refresh.current=null;
      observer.disconnect();
      viewport.removeEventListener('scroll',position);
      motion.removeEventListener('change',position);
      cancelAnimationFrame(handle);
    };
  },[fish,props.width,props.height]);
  useEffect(()=>{refresh.current?.();},[props.project]);
  return fish.length?<canvas ref={ref} className="atlas-fish" aria-hidden="true"/>:null;
}
