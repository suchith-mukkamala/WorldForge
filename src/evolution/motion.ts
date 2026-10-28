/** v1.2 visual interpolation. None of these values belong in a World save. */
export type Facing='north'|'south'|'east'|'west';
export type Point={x:number;y:number};
export type Motion={from:Point;to:Point;start:number;duration:number;
  facing:Facing};
export type SpritePose='idle'|'walk'|'work'|'talk'|'study'|'rest'|'explore';
/** Saved intentions choose a pose; the renderer alone chooses animation frames. */
export function actionPose(action?:string):SpritePose{
  if(!action||action==='idle')return 'idle';
  if(['travel','observe'].includes(action))return 'explore';
  if(['talk','share','help','socialize'].includes(action))return 'talk';
  if(['practice','prepare','study','reflect'].includes(action))return 'study';
  if(action==='rest')return 'rest';
  return 'work';
}

export function directionBetween(from:Point,to:Point,
  fallback:Facing='south'):Facing{
  const dx=to.x-from.x,dy=to.y-from.y;
  if(!dx&&!dy)return fallback;
  return Math.abs(dx)>Math.abs(dy)?dx>0?'east':'west':
    dy>0?'south':'north';
}

/** Large discontinuities are changes of state, not onscreen sprint routes. */
export function canAnimate(from:Point,to:Point):boolean{
  const distance=Math.max(Math.abs(to.x-from.x),Math.abs(to.y-from.y));
  return distance>0&&distance<=4;
}

export function motionFrame(motion:Motion,now:number):Point&{
  progress:number;walking:boolean;stride:0|1|2|3;facing:Facing}{
  const progress=Math.max(0,Math.min(1,
    (now-motion.start)/Math.max(1,motion.duration)));
  const walking=progress<1;
  return {x:motion.from.x+(motion.to.x-motion.from.x)*progress,
    y:motion.from.y+(motion.to.y-motion.from.y)*progress,
    progress,walking,stride:walking?Math.floor(progress*4)%4 as 0|1|2|3:0,
    facing:motion.facing};
}

export function visualMotionDuration(speed:number):number{
  return Math.max(35,Math.min(900,1000/Math.max(1,speed)*.85));
}

/** Center a scrolling viewport on a world point. Only viewport pixels change. */
export function cameraScrollTarget(point:Point,world:Point,content:Point,
  viewport:Point):{left:number;top:number}{
  const left=(point.x+.5)*content.x/Math.max(1,world.x)-viewport.x/2;
  const top=(point.y+.5)*content.y/Math.max(1,world.y)-viewport.y/2;
  return {left:Math.max(0,Math.min(left,Math.max(0,content.x-viewport.x))),
    top:Math.max(0,Math.min(top,Math.max(0,content.y-viewport.y)))};
}
