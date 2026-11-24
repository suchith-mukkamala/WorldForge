import {useEffect,useRef,useState} from 'react';
import {adventureCamera,adventureFrameSize} from './adventureCamera';
import {AdventureDirections} from './AdventureDirections';
import {adventureDistance} from './adventureMap';
import {calendarDate,MONTH_NAMES} from './calendar';
import type {World} from './engine';
import {mortalName} from './MortalHUD';
import {canAnimate,directionBetween,motionFrame,samePoint,type Facing,type Motion,type Point} from './motion';
import {inspectCaveFind,leaveTideCave,occupiedTidalCave,walkTideCave} from './mortalTidalCaves';
import {paintVoxelPerson} from './personArt';
import {DESCENT_BLOCK_VIEW} from './blockScenery';
import {DESCENT_PERSON_UNIT} from './personSpriteScale';
import {PixelPortrait} from './PixelPortrait';
import {CAVE_TILE,markCavePoint,paintTidalCave} from './tidalCaveArt';
import {CAVE_HEIGHT,CAVE_WIDTH,CAVE_FINDS,coastTide} from './tidalCaves';
import {cavePoint} from './tidalCaveRoom';
import {useAdventureControls} from './useAdventureControls';

type Visit=NonNullable<ReturnType<typeof occupiedTidalCave>>;
type Scene={visit:Visit;low:boolean;facing:Facing;marked?:number};

function CaveCanvas({scene,onSelect}:{scene:Scene;onSelect:(cell:number)=>void}){
  const ref=useRef<HTMLCanvasElement>(null),latest=useRef(scene);
  const viewport=useRef({x:0,y:0,width:312,height:184});
  latest.current=scene;
  useEffect(()=>{
    const canvas=ref.current,ctx=canvas?.getContext('2d');
    const background=document.createElement('canvas'),ground=background.getContext('2d');
    if(!canvas||!ctx||!ground)return;
    const bounds={width:CAVE_WIDTH*CAVE_TILE,height:CAVE_HEIGHT*CAVE_TILE};
    background.width=bounds.width;background.height=bounds.height;
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame=0,previous:Scene|null=null,frameSize={width:312,height:184},density=3;
    const start=cavePoint(latest.current.visit.inside.cell);
    let motion:Motion={from:start,to:start,start:0,duration:1,facing:latest.current.facing};
    let moving=false;
    const resize=()=>{
      const box=canvas.getBoundingClientRect();
      if(!box.width||!box.height)return;
      frameSize=adventureFrameSize(box.width,box.height);
      density=Math.min(6,Math.max(2,Math.ceil(box.width/frameSize.width*window.devicePixelRatio)));
      canvas.width=frameSize.width*density;canvas.height=frameSize.height*density;
      previous=null;
    };
    const observer=new ResizeObserver(resize);resize();observer.observe(canvas);
    const paint=(now:number)=>{
      frame=requestAnimationFrame(paint);
      const view=latest.current,{visit,low,facing,marked}=view;
      if(view===previous&&!moving)return;
      if(previous?.visit.room!==visit.room||previous.low!==low)paintTidalCave(ground,visit.cave,visit.room,low);
      const next=cavePoint(visit.inside.cell);
      if(!samePoint(next,motion.to)){
        const from=motionFrame(motion,now);
        motion={from:canAnimate(from,next)?from:next,to:next,start:now,
          duration:reduced.matches?1:125,facing};
      }
      const position=motionFrame(motion,now);
      const anchor={x:(position.x+.5)*CAVE_TILE,y:(position.y+.82)*CAVE_TILE};
      const camera=adventureCamera(anchor,frameSize,bounds);
      viewport.current={...camera,...frameSize};
      ctx.setTransform(density,0,0,density,0,0);ctx.imageSmoothingEnabled=false;
      ctx.fillStyle='#121d26';ctx.fillRect(0,0,frameSize.width,frameSize.height);
      ctx.save();ctx.translate(-camera.x,-camera.y);ctx.drawImage(background,0,0);
      if(marked!==undefined)markCavePoint(ctx,marked);
      paintVoxelPerson(ctx,visit.actor,anchor,DESCENT_BLOCK_VIEW,DESCENT_PERSON_UNIT,facing,
        position.stride,position.walking?'walk':'idle');
      ctx.restore();
      previous=view;moving=position.walking;
    };
    frame=requestAnimationFrame(paint);
    return ()=>{observer.disconnect();cancelAnimationFrame(frame);};
  },[]);
  const {x,y}=cavePoint(scene.visit.inside.cell);
  return <canvas ref={ref} className="adventure-canvas" role="img"
    aria-label={'Cave floor, position '+x+', '+y} onClick={event=>{
      const box=event.currentTarget.getBoundingClientRect(),view=viewport.current;
      const x=Math.floor((view.x+(event.clientX-box.left)*view.width/box.width)/CAVE_TILE);
      const y=Math.floor((view.y+(event.clientY-box.top)*view.height/box.height)/CAVE_TILE);
      if(x>=0&&x<CAVE_WIDTH&&y>=0&&y<CAVE_HEIGHT)onSelect(y*CAVE_WIDTH+x);
    }}/>;
}

export function MortalCave({world,visit,notice,running,onToggleTime,onChange,onAscend}:{
  world:World;visit:Visit;notice?:string;running:boolean;onToggleTime:()=>void;
  onChange:(world:World)=>void;onAscend:()=>void;
}){
  const current=useRef(world);current.current=world;
  const [facing,setFacing]=useState<Facing>('north'),[message,setMessage]=useState('');
  const {actor,cave,room,inside}=visit,point=cavePoint(inside.cell);
  const find=CAVE_FINDS[cave.find],date=calendarDate(world),low=coastTide(world).low;
  const near=(index:number)=>adventureDistance(point,cavePoint(index))<=1;
  const found=world.descent?.tidal?.chart.some(entry=>entry.mouth===cave.mouth&&entry.find);
  const remember=(next:World)=>{current.current=next;onChange(next);};
  const leave=(far=false)=>{
    const result=leaveTideCave(current.current,far);
    if(result.moved)remember(result.world);
    else setMessage(result.reason??'The passage is blocked.');
  };
  const inspect=()=>{
    const before=current.current,result=inspectCaveFind(before);
    if(result.world!==before)remember(result.world);
    setMessage(result.message);
  };
  const action=near(room.find)?{label:find.action,index:room.find,run:inspect}:
    room.farExit!==undefined&&near(room.farExit)?
      {label:'Exit to the hidden cove',index:room.farExit,run:()=>leave(true)}:
      near(room.entrance)?{label:'Return to shore',index:room.entrance,run:()=>leave()}:undefined;
  const controls=useAdventureControls({
    move:({x,y})=>{
      const before=current.current,active=occupiedTidalCave(before);
      if(!active)return 140;
      setFacing(directionBetween({x:0,y:0},{x,y}));
      if(y===1&&active.inside.cell===active.room.entrance){leave();return 235;}
      if(y===-1&&active.inside.cell===active.room.farExit){leave(true);return 235;}
      const result=walkTideCave(before,x,y);
      if(result.moved){remember(result.world);setMessage('');}
      else setMessage(result.reason??'The passage is blocked.');
      return 140;
    },
    interact:()=>action?.run(),escape:()=>leave(),pause:onToggleTime,
  });
  const name=mortalName(world,actor);
  return <div className="evo-app adventure-shell" data-landscape="coast">
    <header className="adventure-topbar">
      <div className="adventure-brand"><span aria-hidden="true">✦</span> WorldForge</div>
      <div className="adventure-top-actions">
        <button onClick={onToggleTime} aria-pressed={!running} aria-keyshortcuts="P">
          {running?'Pause time':'Resume time'}</button>
        <button className="adventure-ascend" onClick={onAscend}>↑ Ascend</button>
      </div>
    </header>
    <main className="adventure-main">
      <header className="adventure-heading">
        <div><p>{cave.stone==='reef'?'Reef grotto':cave.stone==='basalt'?'Basalt cave':'Limestone cave'}</p>
          <h1>{cave.name}</h1></div>
        <time>{MONTH_NAMES[date.month]} {date.day} <span>· Year {date.year}</span></time>
      </header>
      {notice&&<p className="adventure-feedback" role="status">{notice}</p>}
      <div className="adventure-layout">
        <div className="adventure-stage">
          <div className="adventure-picture tidal-cave-picture">
            <CaveCanvas scene={{visit,low,facing,marked:action?.index}} onSelect={index=>{
              if(action?.index===index)action.run();
              else if(index===room.find)setMessage('Walk to the find to inspect it.');
            }}/>
          </div>
          <div className="adventure-controls" role="group" aria-label="Cave controls">
            <AdventureDirections controls={controls}/>
            <div className="adventure-controls-main">
              <div className="adventure-hints"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> Move</span>
                <span><kbd>E</kbd> Interact</span></div>
              {action&&<button className="adventure-primary" aria-keyshortcuts="E" onClick={action.run}>
                {action.label}</button>}
              <p className="adventure-feedback" role="status">{message}</p>
            </div>
          </div>
        </div>
        <aside className="adventure-sidebar">
          <section className="adventure-profile" aria-label="Your mortal">
            <PixelPortrait person={actor} name={name} compact/>
            <div><strong>{name}</strong>
              <label>Energy <meter min={0} max={100} value={actor.energy}/></label></div>
          </section>
          <section className="adventure-exits tidal-status" aria-label="Tide and exits">
            <h2>{low?'Low tide':'High tide'}</h2>
            {!low&&<p>The dry ledge still leads back to shore.</p>}
            {action?.index!==room.entrance&&<button onClick={()=>leave()} aria-keyshortcuts="Escape">
              <span className="adventure-direction" aria-hidden="true">↓</span>
              <strong>Return to shore</strong>
              <span aria-hidden="true">›</span>
            </button>}
          </section>
          {found&&<section className="adventure-exits tidal-status" aria-label="Cave discovery">
            <h2>{find.name}</h2><p>{find.description}</p>
          </section>}
        </aside>
      </div>
    </main>
  </div>;
}
