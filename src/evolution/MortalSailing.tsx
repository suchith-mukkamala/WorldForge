import {useEffect,useRef,useState} from 'react';
import {AdventureDirections} from './AdventureDirections';
import {adventureMapFor,type AdventureMap} from './adventureMap';
import {calendarDate,MONTH_NAMES} from './calendar';
import type {World} from './engine';
import {landShip,landingSites,steerShip} from './mortalSailing';
import {directionBetween,inFrontOf,type Point} from './motion';
import {SailingCanvas,SAIL_STEP_MS} from './SailingCanvas';
import {seaPoint,type MortalShip} from './shipSave';
import {cavesInSight,chartCaves} from './mortalTidalCaves';
import {coastTide,tidalCaves,type TidalCave} from './tidalCaves';
import {useAdventureControls} from './useAdventureControls';

function SeaChart({world,map,ship,caves}:{world:World;map:AdventureMap;ship:MortalShip;
  caves:readonly TidalCave[]}){
  const ref=useRef<HTMLCanvasElement>(null);
  const terrain=useRef<{tiles:World['tiles'];image:HTMLCanvasElement}|null>(null);
  const treeLanding=world.worldTree?.trail.at(-1);
  const here=seaPoint(world.width,ship.at);
  useEffect(()=>{
    const canvas=ref.current,ctx=canvas?.getContext('2d');
    if(!ctx)return;
    const {width,height,tiles}=world;
    if(!terrain.current||terrain.current.tiles!==tiles){
      const image=document.createElement('canvas');image.width=width;image.height=height;
      const ground=image.getContext('2d');
      if(!ground)return;
      ground.fillStyle='#203f50';ground.fillRect(0,0,width,height);
      ground.fillStyle='#819373';
      for(let i=0;i<tiles.length;i++)if(tiles[i].biome!=='water')
        ground.fillRect(i%width,Math.floor(i/width),1,1);
      terrain.current={tiles,image};
    }
    ctx.imageSmoothingEnabled=false;
    ctx.drawImage(terrain.current.image,0,0);
    const marker=(i:number,color:string,size:number)=>{
      const p=seaPoint(width,i);
      ctx.fillStyle='#162e34';ctx.fillRect(p.x-size-1,p.y-size-1,size*2+3,size*2+3);
      ctx.fillStyle=color;ctx.fillRect(p.x-size,p.y-size,size*2+1,size*2+1);
    };
    for(const yard of map.shipyards.values())marker(yard.shore,'#cba273',1);
    for(const i of ship.landfalls)marker(i,'#96cfbd',1);
    if(treeLanding!==undefined)marker(treeLanding,'#cba5e6',1);
    for(const cave of caves)marker(cave.mouth,'#8bd6e3',1);
    marker(ship.at,'#ffe4a6',2);
  },[world.tiles,world.width,world.height,map.shipyards,ship,treeLanding,caves]);
  return <section className="adventure-exits sea-chart" aria-label="Navigation">
    <h2>Sea chart</h2>
    <canvas ref={ref} width={world.width} height={world.height} role="img"
      aria-label={'Your ship at X '+here.x+', Y '+here.y}/>
    <small><i/> Shipyards <i/> Charted landfalls{treeLanding!==undefined&&<><i/> World Tree landing</>}{caves.length>0&&<><i className="sea-chart-cave"/> Sea caves</>}</small>
  </section>;
}

export function MortalSailing({world,ship,running,notice,onChange,onAscend,onToggleTime}:{
  world:World;ship:MortalShip;running:boolean;notice?:string;
  onChange:(world:World)=>void;onAscend:()=>void;onToggleTime:()=>void;
}){
  const current=useRef(world);current.current=world;
  const [message,setMessage]=useState('');
  const map=adventureMapFor(world),landings=landingSites(world,map);
  const position=seaPoint(world.width,ship.at),front=inFrontOf(position,ship.heading);
  const sighted=cavesInSight(world,map);
  const known=new Set(world.descent?.tidal?.chart.map(entry=>entry.mouth));
  const charted=tidalCaves(world).filter(cave=>known.has(cave.mouth)||sighted.includes(cave));
  useEffect(()=>{
    const next=chartCaves(world,cavesInSight(world,map));
    if(next!==world&&current.current===world){current.current=next;onChange(next);}
  },[world,map,onChange]);
  const ahead=front.y*world.width+front.x;
  const treeLanding=world.worldTree?.trail.at(-1);
  const landing=front.x>=0&&front.x<world.width&&landings.includes(ahead)?ahead:
    sighted.find(cave=>landings.includes(cave.shore))?.shore??landings[0];
  const atCave=sighted.find(cave=>cave.shore===landing);
  const tide=coastTide(world);
  const land=(i:number)=>{
    const result=landShip(current.current,i);
    if(result.moved){current.current=result.world;onChange(result.world);}
    else setMessage(result.reason??'This shore is inaccessible.');
  };
  const move=({x,y}:Point)=>{
    const before=current.current;
    const result=steerShip(before,x,y,adventureMapFor(before).bridges);
    if(result.moved){current.current=result.world;onChange(result.world);setMessage('');}
    else setMessage(result.reason??'You cannot sail there.');
    return SAIL_STEP_MS;
  };
  const controls=useAdventureControls({move,interact:()=>{
    if(landing===undefined)setMessage('Sail alongside a clear bank to go ashore.');
    else land(landing);
  },escape:()=>setMessage(''),pause:onToggleTime});
  const date=calendarDate(world);
  return <div className="evo-app adventure-shell" data-landscape="coast">
    <header className="adventure-topbar">
      <div className="adventure-brand"><span aria-hidden="true">✦</span> WorldForge</div>
      <div className="adventure-top-actions">
        <button onClick={onToggleTime} aria-pressed={!running}
          aria-keyshortcuts="P">{running?'Pause time':'Resume time'}</button>
        <button className="adventure-ascend" onClick={onAscend}>↑ Ascend</button>
      </div>
    </header>
    <main className="adventure-main">
      <header className="adventure-heading">
        <div><p>Sailing {ship.heading}</p><h1>At sea</h1></div>
        <time>{MONTH_NAMES[date.month]} {date.day} <span>· Year {date.year}</span></time>
      </header>
      {notice&&<p className="adventure-feedback" role="status">{notice}</p>}
      <div className="adventure-layout">
        <div className="adventure-stage">
          <div className="adventure-picture"><SailingCanvas world={world} ship={ship}
            landings={landings} caves={sighted} onLand={land}/></div>
          <div className="adventure-controls">
            <AdventureDirections controls={controls} action="Sail"/>
            <div className="adventure-controls-main">
              <div className="adventure-hints"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> Steer</span>
                {landing!==undefined&&<span><kbd>E</kbd> Land</span>}</div>
              {landing!==undefined&&<button className="adventure-primary" aria-keyshortcuts="E"
                onClick={()=>land(landing)}>{atCave?'Land at '+atCave.name:landing===treeLanding?'Land at World Tree':'Go ashore'}</button>}
            </div>
            <p className="adventure-feedback" role="status">{message}</p>
          </div>
        </div>
        <aside className="adventure-sidebar">
          <SeaChart world={world} map={map} ship={ship} caves={charted}/>
          {sighted.length>0&&<section className="adventure-exits tidal-status" aria-label="Sea caves in sight">
            <h2>Sea caves in sight</h2>
            <p>{tide.low?'Low tide · Sand exposed':'High tide · Low tide in '+tide.untilLow+
              (tide.untilLow===1?' day':' days')}</p>
            <ul>{sighted.map(cave=>{
              const p=seaPoint(world.width,cave.shore),direction=directionBetween(position,p);
              const steps=Math.max(Math.abs(p.x-position.x),Math.abs(p.y-position.y));
              return <li key={cave.mouth}>
                {landings.includes(cave.shore)&&cave.shore!==landing?
                  <button onClick={()=>land(cave.shore)}>
                    <span className="adventure-direction" aria-hidden="true">≈</span>
                    <span><strong>Land at {cave.name}</strong></span><span aria-hidden="true">›</span>
                  </button>:<p><strong>{cave.name}</strong>
                    <small>{steps===1?'Beach alongside':steps+' tiles '+direction}</small></p>}
              </li>;
            })}</ul>
          </section>}
          {landings.length>1&&<section className="adventure-exits" aria-label="Nearby landings">
            <h2>Nearby landings</h2>
            <ul>{landings.map(i=>{
              const direction=directionBetween(position,seaPoint(world.width,i));
              const town=map.towns[map.owners[i]-1];
              const label=sighted.find(cave=>cave.shore===i)?.name??(i===treeLanding?'World Tree landing':town?.area.has(i)?town.settlement.name:'Shore');
              return <li key={i}><button onClick={()=>land(i)}>
                <span className="adventure-direction" aria-hidden="true">{direction[0].toUpperCase()}</span>
                <span><strong>{label}</strong><small>{direction}</small></span><span aria-hidden="true">›</span>
              </button></li>;
            })}</ul>
          </section>}
        </aside>
      </div>
    </main>
  </div>;
}
