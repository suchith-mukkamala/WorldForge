import {useEffect,useRef,useState,type RefObject} from 'react';
import type {Point} from './motion';

/** At street scale keep the four-by-four cells around the part of the map
 * on screen. Wait until a pan settles and reuse the patch within each area. */
export function useTerrainFocus(canvas:RefObject<HTMLCanvasElement|null>,enabled:boolean,
  width:number,height:number,locate:(x:number,y:number)=>Point|null,projection=''):Point|null{
  const [focus,setFocus]=useState<Point|null>(null);
  const latest=useRef(locate);
  latest.current=locate;
  useEffect(()=>{
    if(!enabled)return;
    const element=canvas.current,viewport=element?.closest('.atlas-viewport');
    if(!element||!viewport)return;
    let pending:number;
    const measure=()=>{
      const sheet=element.getBoundingClientRect(),panel=viewport.getBoundingClientRect();
      if(!sheet.width||!sheet.height)return;
      const x=(Math.max(sheet.left,panel.left)+Math.min(sheet.right,panel.right))/2;
      const y=(Math.max(sheet.top,panel.top)+Math.min(sheet.bottom,panel.bottom))/2;
      const point=latest.current((x-sheet.left)/sheet.width,(y-sheet.top)/sheet.height);
      if(!point)return;
      const grid=8;
      const col=Math.min(width-1,Math.floor(point.x/grid)*grid+grid/2);
      const row=Math.min(height-1,Math.floor(point.y/grid)*grid+grid/2);
      setFocus(previous=>previous?.x===col&&previous.y===row?previous:{x:col,y:row});
    };
    const schedule=()=>{
      window.clearTimeout(pending);
      pending=window.setTimeout(measure,160);
    };
    const observer=new ResizeObserver(schedule);
    observer.observe(element);
    observer.observe(viewport);
    viewport.addEventListener('scroll',schedule,{passive:true});
    schedule();
    return ()=>{
      window.clearTimeout(pending);
      observer.disconnect();
      viewport.removeEventListener('scroll',schedule);
    };
  },[canvas,enabled,width,height,projection]);
  return enabled?focus:null;
}
