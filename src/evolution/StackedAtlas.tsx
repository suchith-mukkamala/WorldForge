import {useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {ATLAS_TOWN_ZOOM,atlasScrollGeometry} from './atlasMap';
import {BIOME_INFO,type Brush,type World} from './engine';
import {DepthCanvas} from './DepthCanvas';
import {terrainHash} from './biomeGeneration';
import type {DepthCamera} from './depthProjection';
import {boundedMapZoom,captureWorldZoomAnchor,gestureZoomFactor,isMapPanDrag,
  mapScrollForDrag,restoreWorldZoomAnchor,type WorldZoomAnchor} from './mapGestures';
import type {Point} from './motion';
import {RealmReliefCanvas} from './RealmReliefCanvas';
import {seaPoint} from './shipSave';
import {STACKED_CAMERA,STACKED_RELIEF,stackedProjection} from './stackedProjection';
import {topographyForWorld} from './topography';
import {projectWorldLayer,realmLinkName,type RealmLink,type RealmMap} from './underworld';
import {UNDERWORLD_BIOMES} from './underworldArt';
import {volcanicDay,volcanoPhase} from './volcanism';

type Projection=ReturnType<typeof stackedProjection>;
type Selection={layer:'surface'|'underworld';cell:number};
type CameraMove={anchor:WorldZoomAnchor}|{point:Point};
const inspect:Brush={kind:'inspect'};
const ignoreEdit=()=>{};

function poly(ctx:CanvasRenderingContext2D,points:readonly Point[],ink:string){
  ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);
  for(let i=1;i<points.length;i++)ctx.lineTo(points[i].x,points[i].y);
  ctx.closePath();ctx.fillStyle=ink;ctx.fill();
}

function StackedRock({projection,links,active}:{projection:Projection;
  links:readonly {surface:Point;underworld:Point;link:RealmLink}[];active?:number}){
  const ref=useRef<HTMLCanvasElement>(null);
  const {size,surface,footprint,upperCrust}=projection;
  const scale=Math.min(1,Math.sqrt(1_900_000/(size.width*size.height)));
  useEffect(()=>{
    const canvas=ref.current,ctx=canvas?.getContext('2d');
    if(!canvas||!ctx)return;
    ctx.setTransform(canvas.width/size.width,0,0,canvas.height/size.height,0,0);
    ctx.clearRect(0,0,size.width,size.height);
    const edges:number[]=[];
    if(surface.frontX)edges.push(surface.frontX>0?1:3);
    if(surface.frontY)edges.push(surface.frontY>0?2:0);
    for(const edge of edges){
      const a=footprint[edge],b=footprint[(edge+1)%4];
      const colors=edge%2?['#786153','#554651','#3d414e']:['#ae8b70','#785d56','#544b55'];
      for(const [n,ink] of colors.entries()){
        const top=-1+upperCrust*n/3,bottom=upperCrust*(n+1)/3;
        poly(ctx,[{x:a.x,y:a.y+top},{x:b.x,y:b.y+top},
          {x:b.x,y:b.y+bottom},{x:a.x,y:a.y+bottom}],ink);
      }
      const columns=Math.ceil(Math.abs(b.x-a.x)/8);
      for(let i=0;i<columns;i++){
        const noise=terrainHash(i,edge,832),shift=upperCrust*(.22+noise*.63);
        const start=i/columns,end=(i+.4+noise*.55)/columns;
        const left={x:a.x+(b.x-a.x)*start,y:a.y+(b.y-a.y)*start+shift};
        const right={x:a.x+(b.x-a.x)*end,y:a.y+(b.y-a.y)*end+shift};
        poly(ctx,[left,right,{x:right.x,y:right.y+2},{x:left.x,y:left.y+2}],
          noise>.64?'#dcbba42c':'#20263638');
      }
    }
    for(const shaft of links){
      const a=shaft.surface,b=shaft.underworld,on=shaft.link.surface===active;
      const bend={x:a.x,y:a.y+(b.y-a.y)*.74};
      const path=()=>{
        ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(bend.x,bend.y);ctx.lineTo(b.x,b.y);ctx.stroke();
      };
      ctx.strokeStyle='#2d252d';ctx.lineWidth=on?11:8;path();
      ctx.strokeStyle=on?'#f4cf8b':'#bf986e';ctx.lineWidth=on?5:3;path();
      ctx.strokeStyle=on?'#fff0b8':'#e1b589';ctx.lineWidth=1;
      ctx.setLineDash([4,4]);path();ctx.setLineDash([]);
    }
  },[projection,links,active]);
  return <canvas ref={ref} className="strata-rock" aria-hidden="true"
    width={Math.ceil(size.width*scale)} height={Math.ceil(size.height*scale)}/>;
}

export function StackedAtlas({world,map,at,onSurface,onUnderworld}:{world:World;map:RealmMap;
  at?:number;onSurface:(cell:number)=>void;onUnderworld:(cell?:number)=>void}){
  const [camera,setCamera]=useState<DepthCamera>(STACKED_CAMERA);
  const [zoom,setZoom]=useState(1),[selected,setSelected]=useState<Selection>();
  const maxHeight=useMemo(()=>map.heights.reduce((max,value)=>Math.max(max,value),0),[map]);
  const projection=useMemo(()=>stackedProjection(world,map,camera,maxHeight),
    [world.width,world.height,world.skylands,world.worldTree,map,camera,maxHeight]);
  const {surface,size,lowerTop,lowerHeight,underneath}=projection;
  const elevations=topographyForWorld(world).heights;
  const links=useMemo(()=>map.links.filter(link=>link.kind==='crater'||
    world.descent?.realm?.chart.includes(link.surface)).map(link=>{
    const a=seaPoint(world.width,link.surface),b=seaPoint(map.width,link.cell);
    const top=surface.projectSmooth(a.x,a.y,elevations[link.surface]);
    const bottom=underneath(b.x,b.y,map.heights[link.cell]);
    return {link,surface:top,underworld:{x:bottom.x,y:bottom.y+lowerTop}};
  }),[projection,map.links,elevations,world.descent?.realm?.chart]);
  const corresponding=links.find(shaft=>selected&&
    (selected.layer==='surface'?shaft.link.surface===selected.cell:shaft.link.cell===selected.cell));
  const chosen=selected&&seaPoint(selected.layer==='surface'?world.width:map.width,selected.cell);
  const town=selected?.layer==='underworld'?map.towns.find(town=>town.index===selected.cell):undefined;
  const vent=corresponding&&world.volcanicLayout?.vents.find(vent=>vent.rim===corresponding.link.surface);
  const title=town?.name??(corresponding&&realmLinkName(world,corresponding.link))??
    (selected?.layer==='surface'?BIOME_INFO[world.tiles[selected.cell].biome].name:
      selected?UNDERWORLD_BIOMES[map.biomes[selected.cell]].name:'Two layers of one world');
  const viewport=useRef<HTMLDivElement>(null),sheet=useRef<HTMLDivElement>(null);
  const pending=useRef<CameraMove|undefined>(undefined);
  const drag=useRef<{id:number;p:Point;scrollLeft:number;scrollTop:number;moving:boolean}|undefined>(undefined);
  const suppress=useRef(false);
  const lastZoom=useRef(zoom);lastZoom.current=zoom;
  const spot=(p:Point)=>({left:p.x/size.width*100+'%',top:p.y/size.height*100+'%'});
  const centered=(p:Point)=>{
    const port=viewport.current,page=sheet.current;
    if(!port||!page)return;
    port.scrollTo(page.offsetLeft+p.x/size.width*page.offsetWidth-port.clientWidth/2,
      page.offsetTop+p.y/size.height*page.offsetHeight-port.clientHeight/2);
  };
  useLayoutEffect(()=>{
    const move=pending.current,port=viewport.current,page=sheet.current;
    if(!move||!port||!page)return;
    pending.current=undefined;
    if('point' in move){centered(move.point);return;}
    const offset=restoreWorldZoomAnchor(move.anchor,atlasScrollGeometry(port,page));
    port.scrollTo(offset.x+page.offsetLeft,offset.y+page.offsetTop);
  },[zoom,projection]);
  function zoomTo(value:number,p?:Point){
    const next=boundedMapZoom(value),port=viewport.current,page=sheet.current;
    if(!port||!page||next===lastZoom.current)return;
    pending.current={anchor:captureWorldZoomAnchor(atlasScrollGeometry(port,page),
      p??{x:port.clientWidth/2,y:port.clientHeight/2})};
    setZoom(next);
  }
  useEffect(()=>{
    const port=viewport.current;
    if(!port)return;
    const wheel=(event:WheelEvent)=>{
      if(!event.ctrlKey&&!event.metaKey)return;
      event.preventDefault();
      const box=port.getBoundingClientRect();
      zoomTo(lastZoom.current*gestureZoomFactor(event.deltaY,event.deltaMode),
        {x:event.clientX-box.left,y:event.clientY-box.top});
    };
    port.addEventListener('wheel',wheel,{passive:false});
    return ()=>port.removeEventListener('wheel',wheel);
  },[]);
  const fit=()=>{pending.current=undefined;setZoom(1);viewport.current?.scrollTo(0,0);};
  const focus=(p:Point)=>{
    if(zoom>=ATLAS_TOWN_ZOOM){centered(p);return;}
    pending.current={point:p};setZoom(ATLAS_TOWN_ZOOM);
  };
  const visitLink=(layer:Selection['layer'],shaft:typeof links[number])=>{
    setSelected({layer,cell:layer==='surface'?shaft.link.surface:shaft.link.cell});
  };
  const surfacePoint=(cell:number)=>{
    const {x,y}=seaPoint(world.width,cell);
    return surface.projectSmooth(x,y,elevations[cell]);
  };
  const lowerPoint=(cell:number)=>{
    const {x,y}=seaPoint(map.width,cell),p=underneath(x,y,map.heights[cell]);
    return {x:p.x,y:p.y+lowerTop};
  };
  return <div className="evo-playground-layout strata-layout">
    <section className="evo-map-card" aria-label="Stacked 3D world">
      <div className="evo-card-heading evo-map-heading">
        <div className="atlas-map-title"><strong>Stacked 3D</strong><small>Surface above the Underworld</small></div>
        <div className="evo-map-actions">
          <button type="button" aria-label="Rotate left" onClick={()=>setCamera(c=>({...c,yaw:(c.yaw+315)%360}))}>↶</button>
          <button type="button" aria-label="Rotate right" onClick={()=>setCamera(c=>({...c,yaw:(c.yaw+45)%360}))}>↷</button>
          <button type="button" aria-pressed={camera.pitch!==STACKED_CAMERA.pitch}
            onClick={()=>setCamera(c=>({...c,pitch:c.pitch===STACKED_CAMERA.pitch?42:STACKED_CAMERA.pitch}))}>Tilt</button>
          <button type="button" onClick={fit}>Fit both</button>
          <button type="button" aria-label="Zoom out" disabled={zoom<=1} onClick={()=>zoomTo(zoom-.5)}>−</button>
          <button type="button" aria-label="Zoom in" disabled={zoom>=8} onClick={()=>zoomTo(zoom+.5)}>+</button>
        </div>
      </div>
      <div className="evo-map-scroll atlas-viewport strata-viewport" ref={viewport} tabIndex={0}
        role="region" aria-label="Pan and zoom both world layers"
        onKeyDown={event=>{
          if(event.target!==event.currentTarget)return;
          if(event.key==='+'||event.key==='-'){event.preventDefault();zoomTo(zoom+(event.key==='+'?.5:-.5));}
          if(event.key==='Home'){event.preventDefault();fit();}
        }}
        onPointerDown={event=>{
          suppress.current=false;
          if(event.pointerType!=='mouse'||event.button!==0||
            event.target instanceof Element&&event.target.closest('button'))return;
          drag.current={id:event.pointerId,p:{x:event.clientX,y:event.clientY},
            scrollLeft:event.currentTarget.scrollLeft,scrollTop:event.currentTarget.scrollTop,moving:false};
        }}
        onPointerMove={event=>{
          const start=drag.current;
          if(!start||start.id!==event.pointerId)return;
          const dx=event.clientX-start.p.x,dy=event.clientY-start.p.y;
          if(!start.moving&&!isMapPanDrag(dx,dy))return;
          if(!start.moving)event.currentTarget.setPointerCapture(event.pointerId);
          start.moving=true;suppress.current=true;
          const p=mapScrollForDrag(start,{x:dx,y:dy});
          event.currentTarget.scrollTo(p.x,p.y);
        }}
        onPointerLeave={()=>{if(!drag.current?.moving)drag.current=undefined;}}
        onPointerUp={()=>{drag.current=undefined;}}
        onPointerCancel={()=>{drag.current=undefined;suppress.current=false;}}
        onClickCapture={event=>{
          if(!suppress.current)return;
          suppress.current=false;event.stopPropagation();
        }}>
        <div className="atlas-sheet strata-sheet" ref={sheet}
          style={{width:'min('+zoom*100+'%, calc(var(--atlas-height) * '+zoom*size.width/size.height+'))',
            aspectRatio:size.width+'/'+size.height}}>
          <StackedRock projection={projection} links={links} active={corresponding?.link.surface}/>
          <div className="strata-level strata-upper" style={{height:surface.size.height/size.height*100+'%'}}>
            <DepthCanvas world={world} overlay="terrain" brush={inspect}
              selected={selected?.layer==='surface'?chosen??null:null}
              onSelect={(x,y)=>setSelected({layer:'surface',cell:y*world.width+x})}
              onEdit={ignoreEdit} camera={camera} relief={STACKED_RELIEF} zoom={zoom} fillWidth cutaway/>
          </div>
          <div className="strata-level strata-lower" style={{top:lowerTop/size.height*100+'%',height:lowerHeight/size.height*100+'%'}}>
            <RealmReliefCanvas map={map} projection={projection.lower} camera={camera} day={volcanicDay(world)}
              selected={selected?.layer==='underworld'?selected.cell:undefined}
              onSelect={cell=>setSelected({layer:'underworld',cell})}/>
          </div>
          <span className="strata-label strata-label-surface">Surface</span>
          <span className="strata-label strata-label-realm" style={{top:lowerTop/size.height*100+'%'}}>Underworld</span>
          {links.map(shaft=><div className="strata-pair" key={shaft.link.surface} data-shaft={shaft.link.surface}>
            {(['surface','underworld'] as const).map(layer=><button key={layer} type="button"
              className="strata-pin" data-layer={layer} data-active={corresponding===shaft||undefined}
              aria-label={realmLinkName(world,shaft.link)+' shaft on '+(layer==='surface'?'Surface':'Underworld')}
              title={realmLinkName(world,shaft.link)} style={spot(shaft[layer])}
              onClick={()=>visitLink(layer,shaft)}>{layer==='surface'?'▴':'◆'}</button>)}
          </div>)}
          {map.towns.map(town=><button type="button" className="strata-pin strata-town" key={town.id}
            aria-label={'Inspect '+town.name} title={town.name} style={spot(lowerPoint(town.index))}
            onClick={()=>setSelected({layer:'underworld',cell:town.index})}>▪</button>)}
          {at!==undefined&&<span className="strata-mortal" style={spot(lowerPoint(at))} title="Your mortal"/>}
        </div>
      </div>
      <div className="strata-footer"><span>Drag to pan · Rotate both layers together</span><span>{Math.round(zoom*100)}%</span></div>
    </section>
    <aside className="strata-inspector">
      <section className="evo-section-card" aria-label="Stacked layer details">
        <div className="evo-card-heading"><strong>{title}</strong></div>
        <div className="strata-details">
          {selected&&chosen?<p>{selected.layer==='surface'?'Surface':'Underworld'} · X {chosen.x} · Y {chosen.y}</p>:
            <p>Select a crater shaft to trace the passage between layers.</p>}
          {vent&&<p>{volcanoPhase(world,vent)} · Volcano</p>}
          {town&&world.underworld&&<p>{world.underworld.population[town.id].demons} demons
            {' · '}{world.underworld.population[town.id].ashBorne} Ash Borne</p>}
          {corresponding&&<button className="atlas-terrain-cell-zoom" type="button" onClick={()=>{
            const layer=selected?.layer==='surface'?'underworld':'surface';
            visitLink(layer,corresponding);focus(corresponding[layer]);
          }}>Follow shaft {selected?.layer==='surface'?'down':'up'}</button>}
          {selected?.layer==='surface'&&<button type="button" className="atlas-terrain-cell-zoom"
            onClick={()=>onSurface(selected.cell)}>Open Surface atlas</button>}
          {selected?.layer==='underworld'&&<button type="button" className="atlas-terrain-cell-zoom"
            onClick={()=>onUnderworld(corresponding?.link.surface??projectWorldLayer(selected.cell,map,world))}>
            Open Underworld atlas</button>}
          <div className="strata-focus-row">
            <button type="button" className="atlas-terrain-cell-zoom"
              onClick={()=>focus(surfacePoint(Math.floor(world.height/2)*world.width+Math.floor(world.width/2)))}>
              Focus Surface</button>
            <button type="button" className="atlas-terrain-cell-zoom"
              onClick={()=>focus(lowerPoint(at??Math.floor(map.height/2)*map.width+Math.floor(map.width/2)))}>
              Focus Underworld</button>
          </div>
        </div>
      </section>
    </aside>
  </div>;
}
