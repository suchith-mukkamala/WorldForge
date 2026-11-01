import {useEffect,useRef} from 'react';
import type {World} from './engine';
import {ARCHITECTURE,BUILDING_LABELS} from './construction';
import {paintPerson} from './pixelArt';
import {personName} from './identity';
import {lifeStage} from './development';
import {livingHousehold} from './livingHouseholds';
import {atInteriorDoor,INTERIOR_DOOR,INTERIOR_TEMPLATES,
  ROOM_HEIGHT,ROOM_WIDTH,type InteriorPosition} from './mortalInteriors';
import type {MortalAction,MortalBuilding} from './mortalGameplay';

const CELL=28,OX=78,OY=74,CW=520,CH=374;
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
    rect(ctx,'#b3d5c5',OX+x*CELL+2,OY-27,30,15);
    rect(ctx,'#6b9a9b',OX+x*CELL+17,OY-27,2,15);
    rect(ctx,'#9b8c6b',OX+x*CELL,OY-9,36,3);
  }
  rect(ctx,style.wall,OX-13,OY,13,ROOM_HEIGHT*CELL);
  rect(ctx,style.wall,OX+ROOM_WIDTH*CELL,OY,13,ROOM_HEIGHT*CELL);
  rect(ctx,template.floor,OX,OY,ROOM_WIDTH*CELL,ROOM_HEIGHT*CELL);
  for(let y=0;y<ROOM_HEIGHT;y++)for(let x=0;x<ROOM_WIDTH;x++){
    const px=OX+x*CELL,py=OY+y*CELL;
    rect(ctx,(x+y)%2?'#ffffff09':'#0000000b',px,py,CELL,CELL);
    rect(ctx,'#2b303420',px,py+CELL-1,CELL,1);
    rect(ctx,'#e9d9b022',px+2,py+2,9,1);
  }
  // The exit is a consistent visible feature of every template.
  rect(ctx,'#443e42',OX+INTERIOR_DOOR.x*CELL-7,
    OY+ROOM_HEIGHT*CELL-4,CELL+14,11);
  rect(ctx,'#d5b578',OX+INTERIOR_DOOR.x*CELL-4,
    OY+ROOM_HEIGHT*CELL-1,CELL+8,7);
  for(const item of template.props){
    furniture(ctx,item.kind,OX+item.x*CELL+CELL/2,
      OY+item.y*CELL+CELL/2);
  }
  rect(ctx,'#1b222b',OX-18,OY+ROOM_HEIGHT*CELL+10,
    ROOM_WIDTH*CELL+36,6);
}

type Motion={from:InteriorPosition;to:InteriorPosition;start:number};

export function MortalInterior({world,site,position,running,message,
  targetId=null,onSelectResident,onTalk,onCloseConversation,
  onExit,onToggleTime,onAscend}:{world:World;site:MortalBuilding;
  position:InteriorPosition;running:boolean;message:string;
  targetId?:number|null;onSelectResident?:(id:number)=>void;
  onTalk?:(action:MortalAction)=>void;onCloseConversation?:()=>void;
  onExit:()=>void;onToggleTime:()=>void;onAscend:()=>void}){
  const canvas=useRef<HTMLCanvasElement>(null);
  const motion=useRef<Motion>({from:position,to:position,start:0});
  const person=world.agents.find(a=>a.id===world.descent?.agentId);
  const household=site.building.householdId===undefined?undefined:
    world.households?.find(h=>h.id===site.building.householdId);
  const life=livingHousehold(world,site);
  const near=(p:InteriorPosition)=>Math.max(Math.abs(p.x-position.x),
    Math.abs(p.y-position.y))<=1;
  const active=life.present.find(p=>p.agent.id===targetId&&near(p.position));
  const nameOf=(id:number)=>personName(world,
    world.lineage.find(p=>p.id===id)??{
      id,species:world.agents.find(a=>a.id===id)?.species??'human'});
  useEffect(()=>{
    const element=canvas.current,ctx=element?.getContext('2d');
    if(!ctx||!person)return;
    const previous=motion.current,now=performance.now();
    const fraction=Math.max(0,Math.min(1,(now-previous.start)/150));
    const from={x:previous.from.x+(previous.to.x-previous.from.x)*fraction,
      y:previous.from.y+(previous.to.y-previous.from.y)*fraction};
    const next:Motion={from,to:position,start:now};
    motion.current=next;
    const staticArt=document.createElement('canvas');
    staticArt.width=CW;staticArt.height=CH;
    const staticCtx=staticArt.getContext('2d');
    if(staticCtx)drawMortalRoom(staticCtx,site.building.type,site.building.culture);
    const occupants=livingHousehold(world,site).present;
    let frame=0,lastPaint=-Infinity;
    const paint=(time:number)=>{
      // Keep idle family scenes alive without repainting at 60 FPS.
      frame=requestAnimationFrame(paint);
      if(time-lastPaint<95)return;
      lastPaint=time;
      const progress=Math.max(0,Math.min(1,(time-next.start)/150));
      const x=from.x+(position.x-from.x)*progress;
      const y=from.y+(position.y-from.y)*progress;
      ctx.clearRect(0,0,CW,CH);
      ctx.drawImage(staticArt,0,0);
      // Render genuine nearby residents and the player in floor-depth order.
      // All sprites use the same appearance code and fixed scale as outdoors.
      const sprites=[...occupants.map(resident=>({
        person:resident.agent,x:resident.position.x,y:resident.position.y,
        facing:'south' as const,walking:false,
        selected:resident.agent.id===targetId})),{
        person,x,y,facing:(y>from.y?'south':y<from.y?'north':
          x>from.x?'east':x<from.x?'west':'south') as
          'north'|'south'|'east'|'west',walking:progress<1,selected:false}];
      sprites.sort((a,b)=>a.y-b.y||a.x-b.x);
      for(const sprite of sprites){
        const bob=!sprite.walking&&sprite.person.id!==person.id&&
          Math.floor((time+sprite.person.id*131)/680)%2===0?1:0;
        const px=OX+sprite.x*CELL+CELL/2-8,
          py=OY+sprite.y*CELL+CELL/2-17+bob;
        paintPerson(ctx,sprite.person,px,py,sprite.facing,
          sprite.walking?1:0,sprite.walking?'walk':'idle');
        if(sprite.selected){
          ctx.strokeStyle='#f2d28e';ctx.lineWidth=1;
          ctx.strokeRect(px-3,py-5,22,28);
        }
      }
    };
    frame=requestAnimationFrame(paint);
    return ()=>cancelAnimationFrame(frame);
  },[world,site.building.type,site.building.culture,person,targetId,
    position.x,position.y]);
  return <section className="evo-interior" aria-label="Enterable building interior">
    <header className="evo-interior-header">
      <div><small>INSIDE {site.settlementName.toUpperCase()}</small>
        <strong>⌂ {BUILDING_LABELS[site.building.type]}</strong>
        <span>{ARCHITECTURE[site.building.culture].name} ·
          {' '}{Math.round(site.building.condition)}% condition</span></div>
      <div className="evo-interior-actions">
        <button onClick={onToggleTime}>{running?'Ⅱ PAUSE':'▶ RESUME'}</button>
        <button onClick={onExit}>↙ EXIT BUILDING</button>
        <button onClick={onAscend}>↑ ASCEND</button>
      </div>
    </header>
    <canvas ref={canvas} width={CW} height={CH}
      aria-label={`${INTERIOR_TEMPLATES[site.building.type].name} with walkable floor, furniture and an exit`}/>
    <div className="evo-interior-footer">
      <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> Move inside ·
        {' '}<kbd>E</kbd> Talk nearby / Exit at door ·
        {' '}<kbd>Esc</kbd> Close / Leave</span>
      {message&&<span role="status" className="evo-interior-message">{message}</span>}
    </div>
    {active&&<aside className="evo-interior-dialogue"
      aria-label="Speak with a resident inside this home">
      <div className="evo-interior-dialogue-head">
        <strong>◈ {nameOf(active.agent.id)}</strong>
        {onCloseConversation&&<button onClick={onCloseConversation}
          aria-label="Close household conversation">✕</button>}
      </div>
      <p>{active.agent.dailyLife?.reason??'Spending time at home.'}</p>
      <small>{active.action} · Energy {Math.round(active.agent.energy)}
        {' '}· Morale {Math.round(active.agent.dailyLife?.morale??60)}</small>
      {onTalk&&<div className="evo-interior-talk-actions">
        <button onClick={()=>onTalk('greet')}>GREET</button>
        {lifeStage(active.agent)!=='infant'&&<button
          onClick={()=>onTalk('ask')}>ASK ABOUT LIFE</button>}
        <button onClick={()=>onTalk('help')}>
          {lifeStage(active.agent)==='infant'?'OFFER CARE':'OFFER HELP'}</button>
      </div>}
    </aside>}
    {household&&<aside className="evo-interior-household">
      <strong>HOUSEHOLD · {life.members.length} LIVING RESIDENT{life.members.length===1?'':'S'}</strong>
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
      <small>Real family members rest, care for children, and share food when
        they meet at home. Their routines continue while you are away.</small>
    </aside>}
  </section>;
}
