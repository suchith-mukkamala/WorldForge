import {useEffect,useRef} from 'react';
import type {Agent,World} from './engine';
import {adventurePlaceKey} from './adventurePlaces';
import type {AdventureGate,AdventureMap,AdventureRegion} from './adventureMap';
import {ADVENTURE_TILE as TILE,adventureProp,paintAdventureBuilding,
  paintAdventureGround,paintAdventureProp,paintAdventureSign,
  paintErrandMarker} from './adventureArt';
import {actionPose,canAnimate,directionBetween,motionFrame,type Motion,
  type Point,type SpritePose} from './motion';
import {paintPerson} from './pixelArt';
import {mortalMovementDelay} from './mortalGameplay';
import {pixelTerrainHash} from './depthWorldArt';
import {mortalWorldPoint} from './spatialDetails';

type Props={world:World;map:AdventureMap;region:AdventureRegion;actor:Agent;
  marked:Point|null;board?:Point;gather?:Point;onSelect:(point:Point)=>void};

type Scenery={x:number;y:number;depth:number;opacity:number;
  draw:(ctx:CanvasRenderingContext2D,x:number,y:number)=>void};

function sceneScenery({world,map,region}:Props,origin:Point,cols:number,rows:number){
  const scenery:Scenery[]=[];
  const signs=new Map<number,AdventureGate>();
  for(const gate of region.gates)signs.set(gate.point.y*world.width+gate.point.x,gate);
  for(let y=Math.max(0,origin.y);y<Math.min(world.height,origin.y+rows);y++){
    for(let x=Math.max(0,origin.x);x<Math.min(world.width,origin.x+cols);x++){
      const index=y*world.width+x,site=map.buildings.get(index),sign=signs.get(index);
      const opacity=region.area.has(index)||site&&site.settlementId===region.settlement?.id?
        1:.72;
      const variant=pixelTerrainHash(x,y,world.settings.seed);
      const depth=y*TILE+20;
      if(site)scenery.push({x,y,depth,opacity,draw:(ctx,px,py)=>
        paintAdventureBuilding(ctx,site.building,px,py,region.landscape,variant)});
      if(sign)scenery.push({x,y,depth:depth-7,opacity:1,draw:(ctx,px,py)=>
        paintAdventureSign(ctx,px+6,py-4,sign.direction,region.landscape,!!sign.ferry)});
      const prop=adventureProp(world,map,region,x,y);
      if(prop)scenery.push({x,y,depth,opacity,draw:(ctx,px,py)=>
        paintAdventureProp(ctx,prop,px,py,variant)});
    }
  }
  return scenery;
}

const anchor=(first:number,last:number,view:number,focus:number)=>{
  const min=first*TILE-view*.15,max=(last+1)*TILE+view*.15;
  return max-min<=view?(min+max-view)/2:
    Math.max(min,Math.min(max-view,(focus+.5)*TILE-view/2));
};
const samePoint=(a:Point,b:Point)=>a.x===b.x&&a.y===b.y;

export function AdventureCanvas(props:Props){
  const canvas=useRef<HTMLCanvasElement>(null);
  const latest=useRef(props);
  latest.current=props;
  const viewport=useRef({x:0,y:0});
  useEffect(()=>{
    const element=canvas.current,ctx=element?.getContext('2d',{alpha:false});
    if(!element||!ctx)return;
    const background=document.createElement('canvas');
    const ground=background.getContext('2d',{alpha:false});
    if(!ground)return;
    const actorMotion:Motion={from:latest.current.actor,to:latest.current.actor,start:0,
      duration:1,facing:'south'};
    let previous:Props|null=null,lastKey='',lastFrame=-Infinity;
    let origin={x:Infinity,y:Infinity};
    let foreground:Scenery[]=[];
    let people:Agent[]=[];
    let nativeWidth=480,nativeHeight=288;
    let frame=0;
    const resize=()=>{
      const {width,height}=element.getBoundingClientRect();
      if(width<=0||height<=0)return;
      nativeWidth=width<540?264:432;
      nativeHeight=Math.max(180,Math.round(nativeWidth*height/width));
    };
    const observer=new ResizeObserver(resize);
    observer.observe(element);
    resize();
    const paint=(now:number)=>{
      frame=requestAnimationFrame(paint);
      const view=latest.current,{world,map,region,actor,marked,board,gather}=view;
      const scene=adventurePlaceKey(region.place);
      const changed=previous!==view;
      const active=now-actorMotion.start<actorMotion.duration;
      if(now-lastFrame<(active||changed?25:125))return;
      lastFrame=now;
      if(scene!==lastKey||!samePoint(actorMotion.to,actor)){
        const from=motionFrame(actorMotion,now);
        const slide=scene===lastKey&&canAnimate(actorMotion.to,actor);
        actorMotion.facing=directionBetween(from,actor,actorMotion.facing);
        actorMotion.from=slide?from:actor;
        actorMotion.to=actor;
        actorMotion.start=now;
        actorMotion.duration=slide?mortalMovementDelay(actor)*.88:1;
      }
      const player=motionFrame(actorMotion,now);
      if(element.width!==nativeWidth||element.height!==nativeHeight){
        element.width=nativeWidth;element.height=nativeHeight;
        ctx.imageSmoothingEnabled=false;
        origin={x:Infinity,y:Infinity};
      }
      const {left,right,top,bottom}=region.bounds;
      const x=Math.round(anchor(left,right,nativeWidth,player.x));
      const y=Math.round(anchor(top,bottom,nativeHeight,player.y));
      viewport.current={x,y};
      const grid={x:Math.floor(x/TILE)-1,y:Math.floor(y/TILE)-1};
      const cols=Math.ceil(nativeWidth/TILE)+4,rows=Math.ceil(nativeHeight/TILE)+4;
      const restage=!samePoint(grid,origin)||previous?.map!==map||previous?.region!==region;
      if(restage){
        origin=grid;
        background.width=cols*TILE;background.height=rows*TILE;
        paintAdventureGround(ground,world,region,map,origin,cols,rows);
        foreground=sceneScenery(view,origin,cols,rows);
      }
      ctx.drawImage(background,origin.x*TILE-x,origin.y*TILE-y);
      if(restage||previous?.world.agents!==world.agents){
        people=world.agents.filter(a=>a.id!==actor.id&&a.x>=origin.x&&
          a.x<origin.x+cols&&a.y>=origin.y&&a.y<origin.y+rows&&
          region.area.has(a.y*world.width+a.x));
      }
      const sprites:Scenery[]=foreground.slice();
      const marker=(point:Point,kind:'board'|'gather')=>sprites.push({...point,
        depth:point.y*TILE+14,opacity:1,draw:(ctx,px,py)=>paintErrandMarker(ctx,px,py,kind)});
      if(board)marker(board,'board');
      if(gather)marker(gather,'gather');
      const drawCharacter=(agent:Agent,at:Point,facing:Motion['facing'],
        stride:0|1|2|3,pose:SpritePose,isPlayer:boolean)=>{
        sprites.push({x:at.x,y:at.y,depth:at.y*TILE+19,opacity:1,
          draw:(context,px,py)=>{
            if(isPlayer){
              context.fillStyle='#f1cc7fbd';
              context.fillRect(px+5,py+18,14,3);
              context.fillRect(px+8,py+17,8,5);
              context.fillStyle='#284035';
              context.fillRect(px+7,py+18,10,2);
            }
            const bob=!isPlayer&&Math.floor((now+agent.id*153)/650)%2===0?1:0;
            paintPerson(context,agent,px+4,py-2+bob,facing,stride,pose);
          }});
      };
      for(const person of people){
        const activity=person.cognition?.today?.action;
        drawCharacter(person,mortalWorldPoint(person,world),'south',0,actionPose(activity),false);
      }
      drawCharacter(actor,player,player.facing,player.stride,player.walking?'walk':'idle',true);

      if(marked){
        const px=marked.x*TILE-x,py=marked.y*TILE-y;
        ctx.strokeStyle='#ffe4a1';
        ctx.lineWidth=1;
        ctx.strokeRect(px+2.5,py+2.5,TILE-5,TILE-5);
        ctx.fillStyle='#fff1b9cc';
        ctx.fillRect(px+9,py+2,6,2);
      }
      sprites.sort((a,b)=>a.depth-b.depth||a.x-b.x);
      for(const sprite of sprites){
        ctx.globalAlpha=sprite.opacity;
        sprite.draw(ctx,Math.round(sprite.x*TILE)-x,Math.round(sprite.y*TILE)-y);
      }
      ctx.globalAlpha=1;
      previous=view;
      lastKey=scene;
    };
    frame=requestAnimationFrame(paint);
    return ()=>{observer.disconnect();cancelAnimationFrame(frame);};
  },[]);
  return <canvas className="adventure-canvas" ref={canvas} width={480} height={288}
    aria-label={props.region.name+' exploration map'} role="img"
    onClick={event=>{
      const element=event.currentTarget,box=element.getBoundingClientRect();
      props.onSelect({
        x:Math.floor((viewport.current.x+(event.clientX-box.left)*element.width/box.width)/TILE),
        y:Math.floor((viewport.current.y+(event.clientY-box.top)*element.height/box.height)/TILE),
      });
    }}/>;
}
