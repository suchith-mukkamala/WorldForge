import {useEffect,useRef,type ReactNode} from 'react';
import type {World} from './engine';
import {ARCHITECTURE,BUILDING_LABELS} from './construction';
import {paintVoxelPerson} from './personArt';
import {DESCENT_BLOCK_VIEW} from './blockScenery';
import {DESCENT_PERSON_UNIT} from './personSpriteScale';
import {personName} from './identity';
import {lifeStage} from './development';
import {livingHousehold} from './livingHouseholds';
import {INTERIOR_DOOR,INTERIOR_TEMPLATES,
  ROOM_HEIGHT,ROOM_WIDTH,type InteriorPosition} from './mortalInteriors';
import type {MortalAction,MortalBuilding} from './mortalGameplay';
import {ADVENTURE_TILE as CELL} from './adventureArt';
import {adventureCamera,adventureFrameSize} from './adventureCamera';
import {motionFrame,samePoint,type Facing,type Motion,type Point} from './motion';

const OX=24,OY=60,CW=ROOM_WIDTH*CELL+2*OX,CH=OY+ROOM_HEIGHT*CELL+24;
const rect=(ctx:CanvasRenderingContext2D,c:string,x:number,y:number,
  w:number,h:number)=>{ctx.fillStyle=c;ctx.fillRect(x,y,w,h);};

function furniture(ctx:CanvasRenderingContext2D,kind:string,x:number,y:number){
  const shadow='#2b3039',wood='#815b47',top='#caa77a',light='#edd29b';
  if(kind==='rug'||kind==='net'){
    rect(ctx,kind==='rug'?'#765b64':'#486a67',x-9,y-9,18,13);
    rect(ctx,kind==='rug'?'#c28d7a':'#88b1a2',x-6,y-7,12,9);return;
  }
  rect(ctx,shadow,x-10,y-7,22,15);
  if(kind==='bed'){
    rect(ctx,'#694f51',x-11,y-9,22,15);
    rect(ctx,'#b9b4a0',x-9,y-10,18,10);
    rect(ctx,'#e4d7af',x-8,y-10,8,4);
    rect(ctx,'#658184',x+1,y-6,7,5);
  }else if(kind==='fire'||kind==='forge'){
    rect(ctx,'#69686b',x-10,y-11,20,15);
    rect(ctx,'#9b9890',x-8,y-11,16,3);
    rect(ctx,'#502f30',x-6,y-6,12,7);
    rect(ctx,'#f2af55',x-3,y-8,8,9);
    rect(ctx,'#f7d987',x,y-6,3,6);
  }else if(kind==='well'){
    rect(ctx,'#8d989a',x-10,y-11,20,18);
    rect(ctx,'#263d4e',x-7,y-9,14,12);
    rect(ctx,'#448b97',x-5,y-6,10,7);
    rect(ctx,light,x-10,y-11,20,3);
  }else if(kind==='hay'){
    rect(ctx,'#b89359',x-11,y-7,22,12);
    rect(ctx,'#edce80',x-9,y-9,18,9);
    rect(ctx,'#8b6c46',x-5,y-8,2,12);
  }else if(kind==='boat'){
    rect(ctx,'#634d47',x-11,y-8,22,13);
    rect(ctx,'#ad7853',x-9,y-10,18,12);
    rect(ctx,'#c6a47a',x-6,y-7,12,7);
    rect(ctx,'#4b3939',x,y-7,2,9);
  }else if(kind==='barrel'){
    rect(ctx,'#5b3c39',x-8,y-10,16,16);
    rect(ctx,'#b08058',x-7,y-9,14,15);
    rect(ctx,'#dac18d',x-7,y-5,14,2);
    rect(ctx,'#dac18d',x-7,y+2,14,2);
  }else if(kind==='tools'||kind==='shelf'){
    rect(ctx,wood,x-11,y-12,22,17);
    rect(ctx,top,x-10,y-10,20,3);
    rect(ctx,'#425d62',x-7,y-7,5,8);
    rect(ctx,'#d9bea0',x+3,y-6,4,6);
    rect(ctx,light,x-10,y+1,20,2);
  }else if(kind==='chest'||kind==='crate'){
    rect(ctx,wood,x-10,y-9,20,15);
    rect(ctx,top,x-9,y-11,18,5);
    rect(ctx,light,x-3,y-9,6,3);
    rect(ctx,'#65483e',x-1,y-6,3,11);
  }else if(kind==='stall'||kind==='bench'){
    rect(ctx,wood,x-11,y-9,22,14);
    rect(ctx,kind==='stall'?'#c37e70':top,x-11,y-12,22,6);
    rect(ctx,light,x-10,y-12,17,2);
  }else if(kind==='chair'){
    rect(ctx,wood,x-8,y-8,16,13);
    rect(ctx,top,x-6,y-5,12,8);
  }else{
    rect(ctx,wood,x-11,y-9,22,15);
    rect(ctx,top,x-11,y-11,22,8);
    rect(ctx,light,x-8,y-11,13,2);
    rect(ctx,'#b49375',x-9,y-2,3,7);
    rect(ctx,'#b49375',x+6,y-2,3,7);
  }
}

/** A fixed-sized illustrated room: every structure of a type uses the same
 * arrangement, while culture supplies the real settlement's materials. */
export function drawMortalRoom(ctx:CanvasRenderingContext2D,
  type:MortalBuilding['building']['type'],culture:MortalBuilding['building']['culture']){
  const template=INTERIOR_TEMPLATES[type],style=ARCHITECTURE[culture];
  ctx.imageSmoothingEnabled=false;
  rect(ctx,'#111e27',0,0,CW,CH);
  rect(ctx,'#27333c',OX-22,OY-59,ROOM_WIDTH*CELL+44,
    ROOM_HEIGHT*CELL+77);
  // Side walls and raised back wall create pixel-sharp depth without WebGL.
  rect(ctx,style.roof,OX-14,OY-47,ROOM_WIDTH*CELL+28,54);
  rect(ctx,template.wall,OX-9,OY-39,ROOM_WIDTH*CELL+18,39);
  rect(ctx,style.trim,OX-9,OY-39,ROOM_WIDTH*CELL+18,3);
  for(let k=0;k<ROOM_WIDTH;k++){
    rect(ctx,'#38404a',OX+k*CELL,OY-36,2,30);
  }
  for(const x of [2,9]){
    rect(ctx,'#384a51',OX+x*CELL-2,OY-30,39,23);
    rect(ctx,'#b8d8c8',OX+x*CELL+2,OY-27,30,15);
    rect(ctx,'#93b9a6',OX+x*CELL+2,OY-18,30,6);
    rect(ctx,'#615850',OX+x*CELL+16,OY-27,2,15);
    rect(ctx,'#615850',OX+x*CELL+2,OY-21,30,2);
    rect(ctx,'#9b8c6b',OX+x*CELL,OY-9,36,3);
    rect(ctx,style.roof,OX+x*CELL-4,OY-34,7,25);
    rect(ctx,style.roof,OX+x*CELL+31,OY-34,7,25);
    rect(ctx,style.trim,OX+x*CELL-4,OY-18,7,2);
    rect(ctx,style.trim,OX+x*CELL+31,OY-18,7,2);
  }
  rect(ctx,style.wall,OX-13,OY,13,ROOM_HEIGHT*CELL);
  rect(ctx,style.wall,OX+ROOM_WIDTH*CELL,OY,13,ROOM_HEIGHT*CELL);
  rect(ctx,template.floor,OX,OY,ROOM_WIDTH*CELL,ROOM_HEIGHT*CELL);
  for(let y=0;y<ROOM_HEIGHT;y++)for(let x=0;x<ROOM_WIDTH;x++){
    const px=OX+x*CELL,py=OY+y*CELL;
    const light=(x*13+y*19)%5;
    rect(ctx,light<2?'#00000010':light===4?'#fff6bc14':'#ffffff07',px,py,CELL,CELL);
    for(let row=0;row<3;row++){
      const seam=px+5+(x*3+y*5+row*9)%17;
      rect(ctx,'#2b303429',px,py+8+row*9,CELL,1);
      rect(ctx,'#2b30341b',seam,py+row*9,1,8);
      rect(ctx,'#e9d9b021',px+2,py+1+row*9,9,1);
    }
  }
  for(const x of [2,9])for(let ray=0;ray<5;ray++){
    rect(ctx,'#f8d9a217',OX+x*CELL+ray*3,OY+ray*6,35,6);
  }
  // The exit is a consistent visible feature of every template.
  rect(ctx,'#443e42',OX+INTERIOR_DOOR.x*CELL-7,
    OY+ROOM_HEIGHT*CELL-4,CELL+14,11);
  rect(ctx,'#d5b578',OX+INTERIOR_DOOR.x*CELL-4,
    OY+ROOM_HEIGHT*CELL-1,CELL+8,7);
  for(const item of template.props.filter(p=>p.kind==='rug'||p.kind==='net')){
    furniture(ctx,item.kind,OX+item.x*CELL+CELL/2,
      OY+item.y*CELL+CELL/2);
  }
  rect(ctx,'#1b222b',OX-18,OY+ROOM_HEIGHT*CELL+10,
    ROOM_WIDTH*CELL+36,6);
}

export function MortalInterior({world,site,position,message,facing='north',marked=null,compact=false,
  targetId=null,onSelectResident,onSelectTile,onTalk,onCloseConversation,
  onExit,children}:{world:World;site:MortalBuilding;
  position:InteriorPosition;message:string;
  facing?:Facing;marked?:Point|null;compact?:boolean;
  targetId?:number|null;onSelectResident?:(id:number)=>void;
  onSelectTile?:(point:Point)=>void;
  onTalk?:(action:MortalAction)=>void;onCloseConversation?:()=>void;
  onExit:()=>void;children?:ReactNode}){
  const canvas=useRef<HTMLCanvasElement>(null);
  const camera=useRef({x:0,y:0,width:312,height:184});
  const person=world.agents.find(a=>a.id===world.descent?.agentId);
  const household=site.building.householdId===undefined?undefined:
    world.households?.find(h=>h.id===site.building.householdId);
  const life=livingHousehold(world,site);
  const near=(p:InteriorPosition)=>Math.max(Math.abs(p.x-position.x),
    Math.abs(p.y-position.y))<=1;
  const active=life.present.find(p=>p.agent.id===targetId&&near(p.position));
  const view={person,life,site,position,facing,active,marked};
  const latest=useRef(view);
  latest.current=view;
  const nameOf=(id:number)=>personName(world,
    world.lineage.find(p=>p.id===id)??{
      id,species:world.agents.find(a=>a.id===id)?.species??'human'});
  useEffect(()=>{
    const element=canvas.current,ctx=element?.getContext('2d',{alpha:false});
    if(!element||!ctx)return;
    const staticArt=document.createElement('canvas');
    staticArt.width=CW;staticArt.height=CH;
    const staticCtx=staticArt.getContext('2d');
    if(!staticCtx)return;
    const initial=latest.current;
    const motion:Motion={from:initial.position,to:initial.position,start:0,duration:1,
      facing:initial.facing};
    let frameSize={width:312,height:184},density=3;
    const resize=()=>{
      const {width,height}=element.getBoundingClientRect();
      if(width>0&&height>0){
        frameSize=adventureFrameSize(width,height);
        density=Math.min(6,Math.max(2,Math.ceil(width/frameSize.width*window.devicePixelRatio)));
      }
    };
    const observer=new ResizeObserver(resize);
    observer.observe(element);resize();
    let frame=0,lastPaint=-Infinity;
    let lastView:typeof view|undefined;
    let lastArt='';
    const paint=(time:number)=>{
      frame=requestAnimationFrame(paint);
      const current=latest.current;
      if(!current.person)return;
      if(time-lastPaint<(lastView!==current||motionFrame(motion,time).walking?25:125))return;
      lastPaint=time;
      const b=current.site.building,art=b.type+':'+b.culture;
      if(art!==lastArt){drawMortalRoom(staticCtx,b.type,b.culture);lastArt=art;}
      if(!samePoint(motion.to,current.position)){
        motion.from=motionFrame(motion,time);motion.to=current.position;
        motion.start=time;motion.duration=136;
      }
      motion.facing=current.facing;
      const player=motionFrame(motion,time);
      if(element.width!==frameSize.width*density||element.height!==frameSize.height*density){
        element.width=frameSize.width*density;element.height=frameSize.height*density;
      }
      ctx.setTransform(density,0,0,density,0,0);ctx.imageSmoothingEnabled=false;
      const offset=adventureCamera({x:OX+(player.x+.5)*CELL,y:OY+(player.y+.84)*CELL},
        frameSize,{width:CW,height:CH});
      camera.current={...offset,...frameSize};
      rect(ctx,'#111e27',0,0,frameSize.width,frameSize.height);
      ctx.save();
      ctx.translate(-offset.x,-offset.y);
      ctx.drawImage(staticArt,0,0);
      const mark=current.active?.position??current.marked;
      if(mark){
        ctx.strokeStyle='#ffe4a1';ctx.lineWidth=1;
        ctx.strokeRect(OX+mark.x*CELL+2.5,OY+mark.y*CELL+2.5,CELL-5,CELL-5);
      }
      const drawables=INTERIOR_TEMPLATES[b.type].props
        .filter(prop=>prop.kind!=='rug'&&prop.kind!=='net')
        .map(prop=>({y:prop.y,paint:()=>furniture(ctx,prop.kind,
          OX+prop.x*CELL+CELL/2,OY+prop.y*CELL+CELL/2)}));
      for(const {agent,position:at} of current.life.present){
        drawables.push({y:at.y,paint:()=>paintVoxelPerson(ctx,agent,
          {x:OX+(at.x+.5)*CELL,y:OY+at.y*CELL+19})});
      }
      const person=current.person;
      drawables.push({y:player.y,paint:()=>{
        const x=OX+(player.x+.5)*CELL,y=OY+player.y*CELL+19;
        rect(ctx,'#f1cc7fbd',x-7,y-1,14,3);
        rect(ctx,'#284035',x-5,y,10,1);
        paintVoxelPerson(ctx,person,{x,y},DESCENT_BLOCK_VIEW,DESCENT_PERSON_UNIT,
          player.facing,player.stride,player.walking?'walk':'idle');
      }});
      for(const drawable of drawables.sort((a,b)=>a.y-b.y))drawable.paint();
      ctx.restore();
      lastView=current;
    };
    frame=requestAnimationFrame(paint);
    return ()=>{cancelAnimationFrame(frame);observer.disconnect();};
  },[]);
  return <section className="evo-interior" aria-label="Enterable building interior">
    <header className="evo-interior-header">
      <div>{!compact&&<strong>{BUILDING_LABELS[site.building.type]}</strong>}
        <span>{ARCHITECTURE[site.building.culture].name} ·
          {' '}{Math.round(site.building.condition)}% condition</span></div>
      <div className="evo-interior-actions">
        <button onClick={onExit}>← Exit building</button>
      </div>
    </header>
    <div className="adventure-picture room-picture">
      <canvas ref={canvas} className="adventure-canvas" width={312} height={184}
        aria-label={`${INTERIOR_TEMPLATES[site.building.type].name} with walkable floor, furniture and an exit`}
        onClick={event=>{
          const element=event.currentTarget,box=element.getBoundingClientRect();
          const {x,y,width,height}=camera.current;
          onSelectTile?.({
            x:Math.floor((x-OX+(event.clientX-box.left)*width/box.width)/CELL),
            y:Math.floor((y-OY+(event.clientY-box.top)*height/box.height)/CELL),
          });
        }}/>
      {active&&<aside className="adventure-dialogue room-dialogue"
      aria-label="Speak with a resident inside this home">
        <div className="adventure-dialogue-copy">
          <strong>{nameOf(active.agent.id)}</strong>
          <p aria-live="polite">{message||active.agent.dailyLife?.reason||active.action}</p>
          {onTalk&&<div className="adventure-dialogue-actions">
            <button onClick={()=>onTalk('greet')}>GREET</button>
            {lifeStage(active.agent)!=='infant'&&<button
              onClick={()=>onTalk('ask')}>ASK ABOUT LIFE</button>}
            <button onClick={()=>onTalk('help')}>
              {lifeStage(active.agent)==='infant'?'OFFER CARE':'OFFER HELP'}</button>
          </div>}
        </div>
        {onCloseConversation&&<button className="adventure-close" onClick={onCloseConversation}
          aria-label="Close household conversation">×</button>}
      </aside>}
    </div>
    {children}
    {!active&&message&&<p role="status" className="evo-interior-message">{message}</p>}
    {household&&<details className="evo-interior-household">
      <summary>Household · {life.members.length} resident{life.members.length===1?'':'s'}</summary>
      <p>{life.present.length?`${life.present.length} at home`:
        'The other residents are away right now.'}
        {life.away.length?` · ${life.away.length} away`:''}
        {life.members.some(a=>a.id===person?.id)?' · You are home':''}</p>
      {life.present.length>0&&<ul className="evo-interior-residents">
        {life.present.map(({agent,action,position:residentPosition})=><li key={agent.id}>
          {onSelectResident?<button
            className={agent.id===targetId?'active':''}
            disabled={!near(residentPosition)}
            title={near(residentPosition)?'Speak with this resident':'Walk closer to talk'}
            onClick={()=>onSelectResident(agent.id)}>{nameOf(agent.id)}</button>:
            <span>{nameOf(agent.id)}</span>}
          <em>{action}</em>
        </li>)}
      </ul>}
      {life.away.length>0&&<small>Away: {life.away.slice(0,5).map(a=>
        nameOf(a.id)).join(' · ')}{life.away.length>5?' and others':''}</small>}
    </details>}
  </section>;
}
