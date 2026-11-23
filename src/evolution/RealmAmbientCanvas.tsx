import {useEffect,useRef} from 'react';
import {paintRealmAmbient,paintRealmWildlife,REALM_AMBIENT_STEP,type RealmGlimmer,type RealmTrack} from './realmAmbient';

export function RealmAmbientCanvas({points,tracks,width,height,unit,hidden}:{points:readonly RealmGlimmer[];
  tracks:readonly RealmTrack[];width:number;height:number;unit:number;hidden:boolean}){
  const ref=useRef<HTMLCanvasElement>(null);
  const scale=Math.min(1,720/width);
  useEffect(()=>{
    const canvas=ref.current,ctx=canvas?.getContext('2d');
    if(!canvas||!ctx||hidden||!(points.length||tracks.length))return;
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
    const glimmers=points.map(point=>point.kind==='cascade'?
      {...point,x:point.x*scale,y:point.y*scale,dx:point.dx*scale,dy:point.dy*scale}:
      {...point,x:point.x*scale,y:point.y*scale});
    const wildlife=tracks.map(track=>({...track,points:track.points.map(point=>
      point&&{x:point.x*scale,y:point.y*scale})}));
    let request=0,visible=true,last=-Infinity;
    const draw=(now:number)=>{
      ctx.clearRect(0,0,canvas.width,canvas.height);
      paintRealmAmbient(ctx,glimmers,now,unit*scale);
      paintRealmWildlife(ctx,wildlife,now,unit*scale);
    };
    const tick=(now:number)=>{
      if(now-last>=REALM_AMBIENT_STEP){draw(now);last=now;}
      request=requestAnimationFrame(tick);
    };
    const sync=()=>{
      cancelAnimationFrame(request);
      if(document.hidden||!visible)return;
      if(reduced.matches)draw(1600);
      else request=requestAnimationFrame(tick);
    };
    const observer=new IntersectionObserver(([entry])=>{
      visible=entry.isIntersecting;sync();
    });
    observer.observe(canvas);
    document.addEventListener('visibilitychange',sync);
    reduced.addEventListener('change',sync);
    sync();
    return ()=>{
      cancelAnimationFrame(request);observer.disconnect();
      document.removeEventListener('visibilitychange',sync);
      reduced.removeEventListener('change',sync);
    };
  },[points,tracks,width,height,unit,scale,hidden]);
  if(!(points.length||tracks.length))return null;
  return <canvas ref={ref} className="strata-life" aria-hidden="true" hidden={hidden} data-wildlife={tracks.length}
    width={Math.ceil(width*scale)} height={Math.ceil(height*scale)}/>;
}
