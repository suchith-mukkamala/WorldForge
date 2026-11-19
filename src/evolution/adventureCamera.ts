import {inFrontOf,samePoint,type Facing,type Point} from './motion';

type Size={width:number;height:number};

export function adventureFrameSize(width:number,height:number):Size{
  const pixels=width<540?216:312;
  return {width:pixels,height:Math.max(136,Math.round(height/Math.max(1,width)*pixels))};
}

/** Keep the feet below center, leaving room to see ahead. Clamp at the
 * edge of the art so a tiny room still fills as much of the view as it can. */
export function adventureCamera(focus:Point,frame:Size,bounds:Size):Point{
  const axis=(target:number,view:number,size:number,anchor:number)=>
    Math.round(view>=size?(size-view)/2:Math.max(0,Math.min(size-view,target-view*anchor)));
  return {x:axis(focus.x,frame.width,bounds.width,.5),
    y:axis(focus.y,frame.height,bounds.height,.57)};
}

export function facingActions<T extends {point?:Point}>(actions:T[],position:Point,facing:Facing):T[]{
  const front=inFrontOf(position,facing);
  const index=actions.findIndex(action=>action.point&&samePoint(action.point,front));
  return index<=0?actions:[actions[index],...actions.slice(0,index),...actions.slice(index+1)];
}
