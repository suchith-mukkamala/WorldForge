import {useEffect,useRef,useState} from 'react';
import {opaqueArtAt,paintAtlasBuilding} from './atlasBuildingArt';
import {adventureCamera,adventureFrameSize} from './adventureCamera';
import {AdventureDirections} from './AdventureDirections';
import {adventureDistance} from './adventureMap';
import {blockSailboat} from './blockModels';
import {DESCENT_BLOCK_VIEW,paintBlockScenery} from './blockScenery';
import {calendarDate,MONTH_NAMES} from './calendar';
import type {World} from './engine';
import type {MortalStep} from './mortalGameplay';
import {boardRealmBoat,landRealmBoat,leaveUnderworld,moveUnderworld,occupiedUnderworld,
  realmBerth,realmLandings,realmWadingBank,wadeRealmBank} from './mortalUnderworld';
import {canAnimate,directionBetween,inFrontOf,motionFrame,samePoint,type Facing,type Motion,type Point} from './motion';
import {mortalName} from './MortalHUD';
import {paintPerson} from './pixelArt';
import {PixelPortrait} from './PixelPortrait';
import {paintRealmAmbient,paintRealmWildlife,REALM_AMBIENT_STEP,realmEffectLift,
  type RealmGlimmer,type RealmTrack} from './realmAmbient';
import {realmFormationUnit,realmScenery} from './realmScenery';
import {realmWaterStatus} from './realmWater';
import {realmWildlife} from './realmWildlife';
import {seaNeighbors,seaPoint} from './shipSave';
import {UnderworldAtlas} from './UnderworldAtlas';
import {realmLinkName,realmPeopleName,realmResidents,RealmBiome,
  type RealmResident} from './underworld';
import {paintRealmResident,paintRealmTerrain,REALM_TILE,UNDERWORLD_BIOMES,type RealmForeground} from './underworldArt';
import {VISUAL_TERRAIN_SIDE} from './terrainCells';
import {useAdventureControls} from './useAdventureControls';
import {volcanicDay} from './volcanism';

type Visit=NonNullable<ReturnType<typeof occupiedUnderworld>>;
type Scene={active:Visit;day:number;facing:Facing;residents:RealmResident[];marked?:number};
const TILE=REALM_TILE;

function RealmCanvas({scene,onSelect}:{scene:Scene;onSelect:(cell:number)=>void}){
  const ref=useRef<HTMLCanvasElement>(null),latest=useRef(scene);
  const viewport=useRef({x:0,y:0,width:312,height:184});
  latest.current=scene;
  useEffect(()=>{
    const canvas=ref.current,ctx=canvas?.getContext('2d');
    const stamp=document.createElement('canvas'),ground=stamp.getContext('2d');
    const texture=document.createElement('canvas');
    if(!canvas||!ctx||!ground)return;
    const start=latest.current.active;
    const {width,height}=start.map,bounds={width:width*TILE,height:height*TILE};
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame=0,previous:Scene|undefined,frameSize={width:312,height:184},density=3;
    let painted:Point|undefined,cols=0,rows=0,glimmers:RealmGlimmer[]=[],tracks:RealmTrack[]=[],paintedEffects=-Infinity;
    let foreground:RealmForeground[]=[];
    const startPoint=seaPoint(width,start.visit.at);
    let motion:Motion={from:startPoint,to:startPoint,start:0,duration:1,facing:'north'};
    let moving=false;
    const resize=()=>{
      const box=canvas.getBoundingClientRect();if(!box.width||!box.height)return;
      const size=adventureFrameSize(box.width,box.height);
      frameSize={width:Math.round(size.width*.85),height:Math.round(size.height*.85)};
      density=Math.min(6,Math.max(2,Math.ceil(box.width/frameSize.width*window.devicePixelRatio)));
      canvas.width=frameSize.width*density;canvas.height=frameSize.height*density;
      cols=Math.ceil(frameSize.width/TILE)+4;rows=Math.ceil(frameSize.height/TILE)+4;
      stamp.width=cols*TILE*density;stamp.height=rows*TILE*density;
      texture.width=cols*VISUAL_TERRAIN_SIDE;texture.height=rows*VISUAL_TERRAIN_SIDE;
      painted=undefined;previous=undefined;
    };
    const observer=new ResizeObserver(resize);observer.observe(canvas);resize();
    const draw=(now:number)=>{
      frame=requestAnimationFrame(draw);
      const view=latest.current,{active:{map,visit,actor},day,facing,marked,residents}=view;
      const motionDue=!reduced.matches&&!document.hidden&&(glimmers.length>0||tracks.length>0)&&
        now-paintedEffects>=REALM_AMBIENT_STEP;
      if(previous===view&&!moving&&!motionDue)return;
      const to=seaPoint(width,visit.at),ship=visit.ship,atSea=!!ship?.underway;
      if(!samePoint(to,motion.to)){
        const from=motionFrame(motion,now);
        motion={from:canAnimate(from,to)?from:to,to,start:now,duration:reduced.matches?1:atSea?108:125,facing};
      }
      const position=motionFrame(motion,now);
      const p={x:(position.x+.5)*TILE,y:(position.y+.77)*TILE};
      const camera=adventureCamera(p,frameSize,bounds);
      viewport.current={...camera,...frameSize};
      const origin={x:Math.floor(camera.x/TILE)-1,y:Math.floor(camera.y/TILE)-1};
      const movedView=!painted||!samePoint(painted,origin)||previous?.active.map!==map;
      if(movedView){
        const scene=realmScenery(map);
        const nearby=({x,y}:Point)=>x>=origin.x&&y>=origin.y&&x<origin.x+cols&&y<origin.y+rows;
        glimmers=scene.effects.flatMap(({cell,kind,phase})=>{
          const {x,y}=seaPoint(width,cell);
          if(!nearby({x,y}))return [];
          const form=scene.formations.get(cell);
          const lift=form?realmEffectLift(kind)*realmFormationUnit(form.size)*1.95*DESCENT_BLOCK_VIEW.rise:0;
          return [{kind,phase,x:(x+.5+(form?.dx??0))*TILE,y:(y+.69+(form?.dy??0))*TILE-lift}];
        });
        const fall=map.water?.fall;
        if(fall){
          const a=seaPoint(width,fall.bank),b=seaPoint(width,fall.outlet);
          if(nearby(a)||nearby(b))glimmers.push({kind:'cascade',phase:0,
            x:(a.x+.5)*TILE,y:(a.y+.58)*TILE,dx:(b.x-a.x)*TILE,dy:(b.y-a.y)*TILE,flow:fall.flow});
        }
        tracks=realmWildlife(map).flatMap(({cells,kind,phase})=>{
          const tiles=cells.map(cell=>seaPoint(width,cell));
          return tiles.some(nearby)?[{kind,phase,points:tiles.map(({x,y})=>({x:(x+.5)*TILE,y:(y+.63)*TILE}))}]:[];
        });
      }
      if(movedView||previous?.day!==day){
        ground.setTransform(density,0,0,density,0,0);
        foreground=paintRealmTerrain(ground,texture,map,day,origin,cols,rows);painted=origin;
      }
      ctx.setTransform(density,0,0,density,0,0);ctx.imageSmoothingEnabled=false;
      ctx.drawImage(stamp,origin.x*TILE-camera.x,origin.y*TILE-camera.y,cols*TILE,rows*TILE);
      ctx.save();ctx.translate(-camera.x,-camera.y);
      const time=reduced.matches?1600:now;
      paintRealmWildlife(ctx,tracks,time,1.15);
      const actors:{depth:number;paint:()=>void}[]=[];
      const boatAt=ship?.at??map.towns.find(town=>town.berth!==undefined)?.berth;
      if(boatAt!==undefined&&!atSea){
        const dock=seaPoint(width,boatAt),at={x:(dock.x+.5)*TILE,y:(dock.y+.57)*TILE};
        actors.push({depth:at.y,paint:()=>paintBlockScenery(ctx,
          blockSailboat(ship?.heading??'south',false),at,DESCENT_BLOCK_VIEW,1.25)});
      }
      for(const resident of residents){
        const {x,y}=seaPoint(width,resident.index);
        if(x<origin.x||y<origin.y||x>=origin.x+cols||y>=origin.y+rows)continue;
        const depth=y*TILE+18;
        actors.push({depth,paint:()=>paintRealmResident(ctx,resident,x*TILE+12,depth)});
      }
      actors.push({depth:p.y,paint:()=>{
        if(atSea)paintBlockScenery(ctx,blockSailboat(ship.heading,true),
          {x:p.x,y:p.y-4},DESCENT_BLOCK_VIEW,1.45);
        else paintPerson(ctx,actor,Math.round(p.x-8),Math.round(p.y-20),facing,
          position.stride,position.walking?'walk':'idle');
      }});
      actors.sort((a,b)=>a.depth-b.depth);
      let next=0;
      for(const {depth,sprite} of foreground){
        while(next<actors.length&&actors[next].depth<=depth)actors[next++].paint();
        if(depth>p.y&&(opaqueArtAt(sprite,p.x,p.y-9)||opaqueArtAt(sprite,p.x,p.y-14)))
          ctx.globalAlpha=.34;
        paintAtlasBuilding(ctx,sprite);
        ctx.globalAlpha=1;
      }
      while(next<actors.length)actors[next++].paint();
      paintRealmAmbient(ctx,glimmers,time,1.15);
      paintedEffects=now;
      if(marked!==undefined){
        const {x,y}=seaPoint(width,marked),px=x*TILE,py=y*TILE;
        ctx.fillStyle='#f5db99';
        for(const xx of [2,TILE-3])for(const yy of [2,TILE-3]){
          ctx.fillRect(px+xx,py+yy,1,1);
          ctx.fillRect(px+xx+(xx===2?1:-1),py+yy,1,1);
          ctx.fillRect(px+xx,py+yy+(yy===2?1:-1),1,1);
        }
      }
      ctx.restore();
      previous=view;moving=position.walking;
    };
    frame=requestAnimationFrame(draw);
    return ()=>{observer.disconnect();cancelAnimationFrame(frame);};
  },[]);
  const {map,visit}=scene.active,{x,y}=seaPoint(map.width,visit.at);
  return <canvas ref={ref} className="adventure-canvas" role="img"
    aria-label={'Underworld position '+x+', '+y} onClick={event=>{
      const box=event.currentTarget.getBoundingClientRect(),view=viewport.current;
      const xx=Math.floor((view.x+(event.clientX-box.left)*view.width/box.width)/TILE);
      const yy=Math.floor((view.y+(event.clientY-box.top)*view.height/box.height)/TILE);
      if(xx>=0&&yy>=0&&xx<map.width&&yy<map.height)onSelect(yy*map.width+xx);
    }}/>;
}

export function MortalUnderworld({world,active,notice,running,onToggleTime,onChange,onAscend}:{
  world:World;active:Visit;notice?:string;running:boolean;onToggleTime:()=>void;
  onChange:(world:World)=>void;onAscend:()=>void;
}){
  const current=useRef(world);current.current=world;
  const [facing,setFacing]=useState<Facing>('north'),[message,setMessage]=useState('');
  const [chart,setChart]=useState(false),[pin,setPin]=useState<number>();
  const {map,floor,visit,actor,origin,water}=active,point=seaPoint(map.width,visit.at);
  const day=volcanicDay(world),date=calendarDate(world),atSea=!!visit.ship?.underway;
  const residents=realmResidents(world,map),nearby=seaNeighbors(visit.at,map.width,map.biomes.length);
  const near=(i:number)=>i===visit.at||nearby.includes(i);
  const town=map.towns.find(town=>adventureDistance(point,seaPoint(map.width,town.index))<=2);
  const name=mortalName(world,actor),biome=UNDERWORLD_BIOMES[map.biomes[visit.at]];
  const step=(result:MortalStep)=>{
    if(result.moved){current.current=result.world;onChange(result.world);setMessage('');}
    else setMessage(result.reason??'The passage is blocked.');
  };
  const localLinks=atSea?[]:map.links.filter(link=>near(link.cell));
  const landings=realmLandings(world,map,visit);
  const ahead=inFrontOf(point,visit.ship?.heading??facing),lead=ahead.y*map.width+ahead.x;
  const landing=landings.includes(lead)?lead:landings[0];
  const berth=realmBerth(map,visit);
  const wading=realmWadingBank(map,visit,day);
  const grounded=atSea&&map.biomes[visit.at]!==RealmBiome.sea;
  type Action={label:string;point:number;perform:()=>void};
  const shoreAction=(i:number):Action=>({label:'Go ashore',point:i,perform:()=>step(landRealmBoat(current.current,i))});
  const actions:Action[]=atSea?(landing===undefined?[]:[shoreAction(landing),
    ...landings.filter(i=>i!==landing).map(i=>({...shoreAction(i),label:'Land '+directionBetween(point,seaPoint(map.width,i))}))]):[
    ...localLinks.map(link=>({label:link.surface===visit.origin?'Return to the surface':
      'Climb to '+realmLinkName(world,link),point:link.cell,perform:()=>step(leaveUnderworld(current.current,link))})),
    ...(wading===undefined?[]:[{label:'Wade to dry ground',point:wading,perform:()=>step(wadeRealmBank(current.current))}]),
    ...(berth?[{label:'Board cavern boat',point:berth.water,perform:()=>step(boardRealmBoat(current.current))}]:[]),
    ...residents.filter(resident=>near(resident.index)).map(resident=>({label:'Talk to '+resident.name,
      point:resident.index,perform:()=>setMessage(resident.name+' · '+realmPeopleName(resident.people)+' — '+resident.line)})),
  ];
  const primary=actions[0];
  const controls=useAdventureControls({
    move:({x,y})=>{
      if(chart)return 140;
      setFacing(directionBetween({x:0,y:0},{x,y}));
      step(moveUnderworld(current.current,x,y));return atSea?115:138;
    },
    interact:()=>{if(!chart)primary?.perform();},escape:()=>{if(chart)setChart(false);else setMessage('');},
    pause:onToggleTime,
  });
  const target=map.links.find(link=>link.surface===pin);
  const marked=target?.cell??primary?.point;
  const route=target&&seaPoint(map.width,target.cell);
  const way=route&&Math.abs(route.x-point.x)+Math.abs(route.y-point.y);
  const heading=route&&((route.y<point.y?'N':route.y>point.y?'S':'')+
    (route.x<point.x?'W':route.x>point.x?'E':''));
  return <div className="evo-app adventure-shell underworld-shell">
    <header className="adventure-topbar">
      <div className="adventure-brand"><span aria-hidden="true">✦</span> WorldForge</div>
      <div className="adventure-top-actions">
        <button aria-expanded={chart} onClick={()=>setChart(show=>!show)}>
          {chart?(atSea?'Return to boat':'Return to walking'):'Underworld map'}</button>
        <button onClick={onToggleTime} aria-pressed={!running} aria-keyshortcuts="P">
          {running?'Pause time':'Resume time'}</button>
        <button className="adventure-ascend" onClick={onAscend}>God mode</button>
      </div>
    </header>
    <main className={chart?'adventure-main world-atlas realm-adventure-atlas':'adventure-main'}>
      <header className="adventure-heading">
        <div><p>Underworld · World layer</p><h1>{chart?'Underworld atlas':town?.name??biome.name}</h1></div>
        <time>{MONTH_NAMES[date.month]} {date.day} <span>· Year {date.year}</span></time>
      </header>
      {notice&&<p className="adventure-feedback" role="status">{notice}</p>}
      {chart?<UnderworldAtlas world={world} map={floor} at={visit.at} marked={pin}
        onMark={link=>{setPin(link.surface);setChart(false);}}/>:
      <div className="adventure-layout">
        <div className="adventure-stage">
          <div className="adventure-picture underworld-picture">
            <RealmCanvas scene={{active,day,facing,residents,marked}} onSelect={index=>{
              actions.find(action=>action.point===index)?.perform();
            }}/>
          </div>
          <div className="adventure-controls" role="group" aria-label="Underworld controls">
            <AdventureDirections controls={controls} action={atSea?'Sail':'Move'}/>
            <div className="adventure-controls-main">
              <div className="adventure-hints"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> {atSea?'Steer':'Move'}</span>
                {primary&&<span><kbd>E</kbd> Interact</span>}</div>
              {primary&&<button className="adventure-primary" aria-keyshortcuts="E"
                onClick={primary.perform}>{primary.label}</button>}
              {actions.length>1&&<details className="adventure-nearby">
                <summary>Nearby</summary>
                <div>{actions.slice(1).map(action=><button key={action.label} onClick={event=>{
                  event.currentTarget.closest('details')?.removeAttribute('open');action.perform();
                }}>{action.label}</button>)}</div>
              </details>}
              {message&&<p className="adventure-feedback" role="status">{message}</p>}
              {grounded&&<p className="adventure-feedback" role="status">Water receded. Go ashore or steer into deeper water.</p>}
            </div>
          </div>
        </div>
        <aside className="adventure-sidebar">
          <section className="adventure-profile" aria-label="Your mortal">
            <PixelPortrait person={actor} name={name} compact/>
            <div><strong>{name}</strong><small>{atSea?'Cavern boat':biome.name}</small></div>
          </section>
          <section className="adventure-exits">
            <h2>Surface passage</h2>
            <button onClick={()=>setPin(value=>value===origin.surface?undefined:origin.surface)}
              aria-pressed={pin===origin.surface}>
              <span className="adventure-direction" aria-hidden="true">↑</span>
              <span><strong>Mark entry shaft</strong><small>{realmLinkName(world,origin)}</small></span>
            </button>
          </section>
          {target&&<section className="adventure-exits" aria-label="Marked passage">
            <h2>{realmLinkName(world,target)}</h2>
            <p>{way?way+' tiles '+heading:'At the passage'}</p>
          </section>}
          {water&&<section className="adventure-exits" aria-label="Cave water">
            <h2>Lake waterline</h2><p>{realmWaterStatus(water)}</p>
          </section>}
        </aside>
      </div>}
    </main>
  </div>;
}
