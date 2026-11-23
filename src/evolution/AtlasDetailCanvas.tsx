import {useEffect,useRef} from 'react';
import type {AtlasDetailFrame,AtlasDetailRequest,AtlasDetailSource} from './atlasDetailTypes';
import {closeAtlasCrop,cropContains} from './atlasRaster';

export type AtlasDetailPatch={frame:AtlasDetailFrame;source:AtlasDetailSource;ctx:CanvasRenderingContext2D};
type Props={width:number;height:number;baseDensity:number;source?:AtlasDetailSource;
  onPatch:(patch:AtlasDetailPatch|undefined)=>void};

/** Render the visible portion of a close-up into a capped buffer. The
 * complete map sits underneath while a newer scroll or angle is rendering. */
export function AtlasDetailCanvas(props:Props){
  const ref=useRef<HTMLCanvasElement>(null),latest=useRef(props);
  const refresh=useRef<(()=>void)|undefined>(undefined);
  latest.current=props;
  const enabled=!!props.source;

  useEffect(()=>{
    const canvas=ref.current,ctx=canvas?.getContext('2d'),sheet=canvas?.parentElement;
    const viewport=sheet?.closest<HTMLElement>('.atlas-viewport');
    if(!enabled||!canvas||!ctx||!sheet||!viewport||typeof Worker==='undefined'||typeof OffscreenCanvas==='undefined')return;
    let worker:Worker|undefined,lastSource:AtlasDetailSource|undefined,serial=0,timer=0,failed=false;
    let pending:{id:number;source:AtlasDetailSource}|undefined;
    let shown:AtlasDetailPatch|undefined;
    function hide(){
      canvas!.hidden=true;
      delete canvas!.dataset.detailDensity;
      if(!shown)return;
      shown.frame.bitmap.close();
      shown=undefined;
      latest.current.onPatch(undefined);
    }
    function fail(){
      failed=true;pending=undefined;
      worker?.terminate();worker=undefined;hide();
    }
    function receive({data:frame}:MessageEvent<AtlasDetailFrame>){
      const job=pending;pending=undefined;
      const {source,width,height,onPatch}=latest.current;
      if(job?.id!==frame.id||source!==job.source){
        frame.bitmap.close();schedule();return;
      }
      const crop=frame.crop;
      shown?.frame.bitmap.close();
      canvas!.width=crop.width;canvas!.height=crop.height;
      canvas!.style.left=crop.left/crop.density/width*100+'%';
      canvas!.style.top=crop.top/crop.density/height*100+'%';
      canvas!.style.width=crop.width/crop.density/width*100+'%';
      canvas!.style.height=crop.height/crop.density/height*100+'%';
      shown={source,frame,ctx:ctx!};
      onPatch(shown);
      canvas!.dataset.detailDensity=String(crop.density);
      canvas!.hidden=false;
      schedule();
    }
    function start(){
      const {source,width,height,baseDensity}=latest.current;
      if(!source||failed||document.hidden)return;
      const box=viewport!.getBoundingClientRect();
      const requested=closeAtlasCrop({width,height},sheet!.getBoundingClientRect(),{
        left:box.left+viewport!.clientLeft,top:box.top+viewport!.clientTop,
        width:viewport!.clientWidth,height:viewport!.clientHeight,
      },window.devicePixelRatio||1,baseDensity);
      if(!requested){hide();return;}
      if(pending||shown?.source===source&&cropContains(shown.frame.crop,requested.visible))return;
      const id=++serial;
      const request:AtlasDetailRequest={id,crop:requested.crop,source:lastSource===source?undefined:source};
      try{
        if(!worker){
          worker=new Worker(new URL('./atlasDetail.worker.ts',import.meta.url),{type:'module'});
          worker.onmessage=receive;
          worker.onerror=fail;
          worker.onmessageerror=fail;
        }
        pending={id,source};
        worker.postMessage(request);lastSource=source;
      }catch{fail();}
    }
    function schedule(){
      if(shown?.source!==latest.current.source)hide();
      window.clearTimeout(timer);
      timer=window.setTimeout(start,55);
    }
    refresh.current=schedule;
    const resize=new ResizeObserver(schedule);
    resize.observe(viewport);resize.observe(sheet);
    viewport.addEventListener('scroll',schedule,{passive:true});
    document.addEventListener('visibilitychange',schedule);
    schedule();
    return ()=>{
      worker?.terminate();window.clearTimeout(timer);resize.disconnect();hide();refresh.current=undefined;
      viewport.removeEventListener('scroll',schedule);
      document.removeEventListener('visibilitychange',schedule);
    };
  },[enabled]);
  useEffect(()=>{refresh.current?.();},[props.source,props.width,props.height,props.baseDensity]);
  return enabled?<canvas ref={ref} className="atlas-close-raster" aria-hidden="true" hidden/>:null;
}
