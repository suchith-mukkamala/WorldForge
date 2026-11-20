import {useEffect,useRef} from 'react';
import type {PointerEvent} from 'react';
import type {Point} from './motion';

const bindings:Readonly<Record<string,Direction>>={
  w:'north',arrowup:'north',a:'west',arrowleft:'west',
  s:'south',arrowdown:'south',d:'east',arrowright:'east',
};
export const WALK_DIRECTIONS=[
  {id:'north',label:'Move north',icon:'↑',x:0,y:-1},
  {id:'west',label:'Move west',icon:'←',x:-1,y:0},
  {id:'south',label:'Move south',icon:'↓',x:0,y:1},
  {id:'east',label:'Move east',icon:'→',x:1,y:0},
] as const;
type Direction=typeof WALK_DIRECTIONS[number]['id'];

export function useAdventureControls(callbacks:{
  move:(direction:Point)=>number;interact:()=>void;escape:()=>void;pause:()=>void;
}){
  const latest=useRef(callbacks);
  latest.current=callbacks;
  const keys=useRef(new Map<string,Direction>());
  const pointers=useRef(new Map<number,Direction>());
  const queued=useRef<Direction|null>(null);
  const nextMove=useRef(0);

  const move=()=>{
    const now=performance.now();
    if(now<nextMove.current)return;
    const direction=queued.current??[...pointers.current.values()].at(-1)??
      [...keys.current.values()].at(-1);
    queued.current=null;
    const step=WALK_DIRECTIONS.find(entry=>entry.id===direction);
    if(step)nextMove.current=now+latest.current.move(step);
  };
  useEffect(()=>{
    const down=(event:KeyboardEvent)=>{
      const target=event.target;
      if(event.altKey||event.ctrlKey||event.metaKey||target instanceof HTMLElement&&
        (target.isContentEditable||!!target.closest('input,textarea,select')))return;
      const key=event.key.toLowerCase(),direction=bindings[key];
      if(direction){
        event.preventDefault();
        if(!event.repeat)queued.current=direction;
        keys.current.set(key,direction);
        move();
      }else if(!event.repeat){
        if(key==='e'){event.preventDefault();latest.current.interact();}
        if(key==='p'){event.preventDefault();latest.current.pause();}
        if(key==='escape'){event.preventDefault();latest.current.escape();}
      }
    };
    const up=(event:KeyboardEvent)=>keys.current.delete(event.key.toLowerCase());
    const clear=()=>{keys.current.clear();pointers.current.clear();queued.current=null;};
    const frame=window.setInterval(move,32);
    window.addEventListener('keydown',down);
    window.addEventListener('keyup',up);
    window.addEventListener('blur',clear);
    return ()=>{
      window.clearInterval(frame);clear();
      window.removeEventListener('keydown',down);
      window.removeEventListener('keyup',up);
      window.removeEventListener('blur',clear);
    };
  },[]);
  return {
    start:(event:PointerEvent<HTMLButtonElement>,direction:Direction)=>{
      if(event.button!==0)return;
      event.currentTarget.setPointerCapture(event.pointerId);
      pointers.current.set(event.pointerId,direction);
      queued.current=direction;
      move();
    },
    stop:(event:PointerEvent<HTMLButtonElement>)=>pointers.current.delete(event.pointerId),
    tap:(direction:Point)=>{latest.current.move(direction);},
  };
}
