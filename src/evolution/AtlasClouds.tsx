import {useEffect,useRef} from 'react';
import {blockCloud} from './blockModels';
import {blockBuildingArt,depthBlockView,placeBlockArt,type BlockStamp} from './blockScenery';
import type {Point} from './motion';
import {cloudPoses,CLOUD_SHAPES,type CloudPose} from './surfaceClouds';

type Props={seed:number;columns:number;rows:number;width:number;unit:number;
  view:ReturnType<typeof depthBlockView>;project:(cloud:CloudPose)=>Point};
const stamps=new Map<string,BlockStamp>();

/** Draw translucent voxel sprites on the visible part of the atlas only.
 * Cloud frames share neither the terrain canvas nor its picking buffer. */
export function AtlasClouds(props:Props){
  const ref=useRef<HTMLCanvasElement>(null),current=useRef(props);
  const refresh=useRef<(()=>void)|null>(null);
  current.current=props;

  useEffect(()=>{
    const canvas=ref.current,ctx=canvas?.getContext('2d'),sheet=canvas?.parentElement;
    const viewport=sheet?.closest<HTMLElement>('.atlas-viewport');
    if(!canvas||!ctx||!sheet||!viewport)return;
    const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame=0,last=-Infinity,visible=true;
    let left=0,top=0,width=0,height=0,scale=1,density=1;

    const draw=(now:number)=>{
      const {seed,columns,rows,unit,view,project}=current.current;
      ctx.setTransform(density,0,0,density,0,0);
      ctx.clearRect(0,0,width,height);
      ctx.imageSmoothingEnabled=false;
      const paint=(shape:number,p:Point,alpha:number)=>{
        const stamp=blockBuildingArt(stamps,blockCloud(shape),view,unit);
        if(!stamp)return;
        const sprite=placeBlockArt(stamp,p,scale),size=sprite.scale;
        ctx.globalAlpha=alpha;
        ctx.drawImage(stamp.image,Math.round(sprite.x*density)/density,
          Math.round(sprite.y*density)/density,stamp.image.width*size,stamp.image.height*size);
      };
      const clouds=cloudPoses(seed,columns,rows,now);
      for(const cloud of clouds){
        const point=project(cloud),x=point.x*scale-left,y=point.y*scale-top;
        const margin=38*unit*scale;
        if(x<-margin||x>width+margin||y<-margin||y>height+margin)continue;
        if(cloud.tail){
          const tail=project({...cloud,x:cloud.x-2.7,y:cloud.y+.65,height:cloud.height-5});
          paint((cloud.shape+3)%CLOUD_SHAPES,{x:tail.x*scale-left,y:tail.y*scale-top},cloud.alpha*.57);
        }
        paint(cloud.shape,{x,y},cloud.alpha);
      }
      ctx.globalAlpha=1;
    };
    const tick=(now:number)=>{
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
  useEffect(()=>{refresh.current?.();},[props.seed,props.width,props.view.key,props.project]);
  return <canvas ref={ref} className="atlas-clouds" aria-hidden="true"/>;
}
