import {useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {ATLAS_PLACE_ZOOM,atlasLabelSides,atlasLevel,atlasScrollGeometry} from './atlasMap';
import type {World} from './engine';
import {boundedMapZoom,captureWorldZoomAnchor,gestureZoomFactor,isMapPanDrag,
  mapScrollForDrag,restoreWorldZoomAnchor,type WorldZoomAnchor} from './mapGestures';
import type {Point} from './motion';
import {seaPoint} from './shipSave';
import {VISUAL_TERRAIN_SIDE} from './terrainCells';
import {projectWorldLayer,RealmBiome,realmFordOpen,realmLinkName,type RealmLink,type RealmMap} from './underworld';
import {paintRealmFloor,UNDERWORLD_BIOMES} from './underworldArt';
import {volcanicDay} from './volcanism';

type Feature={cell:number;name:string;kind:'town'|'shaft'|'passage';link?:RealmLink};
type CameraMove={center:number}|{anchor:WorldZoomAnchor};
const zoomLabel=(n:number)=>Math.round(n*100)+'%';
const overviewRegions=[RealmBiome.glowroot,RealmBiome.lava,RealmBiome.sea] as const;

function RealmFloor({world,map,close,onInspect}:{world:World;map:RealmMap;
  close:boolean;onInspect:(cell:number)=>void}){
  const terrain=useRef<HTMLCanvasElement>(null),stamp=useRef<{map:RealmMap;fords:string}>(null);
  const structures=useRef<HTMLCanvasElement>(null);
  const width=map.width*VISUAL_TERRAIN_SIDE,height=map.height*VISUAL_TERRAIN_SIDE;
  const day=volcanicDay(world);
  useEffect(()=>{
    const canvas=terrain.current,ctx=canvas?.getContext('2d');
    if(!ctx)return;
    const fords=[...map.fords].filter(i=>realmFordOpen(map,i,day)).join(',');
    if(stamp.current?.map===map&&stamp.current.fords===fords)return;
    paintRealmFloor(ctx,map,day,{x:0,y:0},map.width,map.height);
    stamp.current={map,fords};
  },[map,day]);
  useEffect(()=>{
    const canvas=structures.current,ctx=canvas?.getContext('2d');
    if(!ctx)return;
    ctx.clearRect(0,0,width,height);
    const side=VISUAL_TERRAIN_SIDE;
    for(const [i,town] of map.houses){
      const {x,y}=seaPoint(map.width,i),px=x*side,py=y*side;
      ctx.fillStyle='#363543';ctx.fillRect(px+1,py+2,6,5);
      ctx.fillStyle=town.home==='ash-borne'?'#b4806a':'#9d90ad';
      ctx.fillRect(px+2,py+1,4,4);
      ctx.fillStyle='#e9ba83';ctx.fillRect(px+2,py+5,1,1);
      ctx.fillRect(px+5,py+5,1,1);
    }
  },[map,width,height,close]);
  return <>
    <canvas ref={terrain} width={width} height={height} role="img"
      aria-label="Underworld terrain with Ember Rivers, Glowroot Forests and the Buried Sea"
      onClick={event=>{
        const box=event.currentTarget.getBoundingClientRect();
        const x=Math.floor((event.clientX-box.left)/box.width*map.width);
        const y=Math.floor((event.clientY-box.top)/box.height*map.height);
        if(x>=0&&y>=0&&x<map.width&&y<map.height)onInspect(y*map.width+x);
      }}/>
    {close&&<canvas ref={structures} className="realm-atlas-buildings" width={width} height={height} aria-hidden="true"/>}
  </>;
}

function regionCenters(map:RealmMap){
  return overviewRegions.flatMap(kind=>{
    const cells:number[]=[];
    let x=0,y=0;
    for(let i=0;i<map.biomes.length;i++){
      if(map.biomes[i]!==kind)continue;
      cells.push(i);x+=i%map.width;y+=Math.floor(i/map.width);
    }
    if(!cells.length)return [];
    x/=cells.length;y/=cells.length;
    const distance=(i:number)=>(i%map.width-x)**2+(Math.floor(i/map.width)-y)**2;
    const cell=cells.reduce((a,b)=>distance(a)<=distance(b)?a:b);
    return [{cell,name:kind===RealmBiome.lava?'Ember Rivers':UNDERWORLD_BIOMES[kind].name}];
  });
}

/** The same geography used by the walking scene, framed as its own atlas
 * layer. Browsing and zooming never move the mortal or change their realm. */
export function UnderworldAtlas({world,map,focusSurface,at,marked,onSurface,onMark}:{
  world:World;map:RealmMap;focusSurface?:number;at?:number;marked?:number;
  onSurface?:(surface:number)=>void;onMark?:(link:RealmLink)=>void;
}){
  const start=focusSurface===undefined?undefined:map.links.find(link=>
    link.surface===focusSurface)?.cell??projectWorldLayer(focusSurface,world,map);
  const [zoom,setZoom]=useState(start===undefined?1:ATLAS_PLACE_ZOOM);
  const [selected,setSelected]=useState(start);
  const [size,setSize]=useState<Point>({x:0,y:0});
  const viewport=useRef<HTMLDivElement>(null),sheet=useRef<HTMLDivElement>(null);
  const pending=useRef<CameraMove>(start===undefined?undefined:{center:start});
  const lastZoom=useRef(zoom);lastZoom.current=zoom;
  const skipClick=useRef(false);
  const drag=useRef<{pointer:number;x:number;y:number;scrollLeft:number;scrollTop:number;moving:boolean}|undefined>(undefined);
  const chart=world.descent?.realm?.chart;
  const features:Feature[]=[
    ...map.towns.map(town=>({cell:town.index,name:town.name,kind:'town' as const})),
    ...map.links.filter(link=>link.kind==='crater'||chart?.includes(link.surface))
      .map(link=>({cell:link.cell,name:realmLinkName(world,link),
        kind:link.kind==='crater'?'shaft' as const:'passage' as const,link})),
  ];
  const town=map.towns.find(town=>town.index===selected);
  const link=features.find(feature=>feature.cell===selected)?.link;
  const surface=link?.surface??(selected===undefined?undefined:projectWorldLayer(selected,map,world));
  const place=surface===undefined?undefined:seaPoint(world.width,surface);
  const biome=selected===undefined?undefined:UNDERWORLD_BIOMES[map.biomes[selected]];
  const population=world.underworld?.population??[];
  const census=town?population[town.id]:population.reduce((sum,group)=>({
    demons:sum.demons+group.demons,ashBorne:sum.ashBorne+group.ashBorne,
  }),{demons:0,ashBorne:0});
  const regions=useMemo(()=>regionCenters(map),[map]);
  const overview=atlasLevel(zoom)==='world';
  const fraction=(cell:number)=>({x:(cell%map.width+.5)/map.width,
    y:(Math.floor(cell/map.width)+.5)/map.height});
  const position=(cell:number)=>{
    const p=fraction(cell);return {left:p.x*100+'%',top:p.y*100+'%'};
  };
  const labels=atlasLabelSides([...features].sort((a,b)=>Number(b.cell===selected)-Number(a.cell===selected))
    .map(feature=>{
      const p=fraction(feature.cell);
      return {id:feature.cell,name:feature.name,x:p.x*size.x,y:p.y*size.y};
    }),size);

  useLayoutEffect(()=>{
    const element=sheet.current;
    if(!element)return;
    const measure=()=>setSize({x:element.offsetWidth,y:element.offsetHeight});
    measure();
    const observer=new ResizeObserver(measure);
    observer.observe(element);
    return ()=>observer.disconnect();
  },[]);
  const center=(cell:number)=>{
    const panel=viewport.current,paper=sheet.current;
    if(!panel||!paper)return;
    const p=fraction(cell);
    panel.scrollTo(paper.offsetLeft+p.x*paper.offsetWidth-panel.clientWidth/2,
      paper.offsetTop+p.y*paper.offsetHeight-panel.clientHeight/2);
  };
  useLayoutEffect(()=>{
    const panel=viewport.current,paper=sheet.current,move=pending.current;
    if(!panel||!paper||!move)return;
    pending.current=undefined;
    if('center' in move){center(move.center);return;}
    const {x,y}=restoreWorldZoomAnchor(move.anchor,atlasScrollGeometry(panel,paper));
    panel.scrollTo(x+paper.offsetLeft,y+paper.offsetTop);
  },[zoom,map]);
  useEffect(()=>{
    const panel=viewport.current;
    if(!panel)return;
    const onWheel=(event:WheelEvent)=>{
      if(!event.ctrlKey&&!event.metaKey)return;
      event.preventDefault();
      const box=panel.getBoundingClientRect();
      zoomBy(lastZoom.current*gestureZoomFactor(event.deltaY,event.deltaMode),
        {x:event.clientX-box.left,y:event.clientY-box.top});
    };
    panel.addEventListener('wheel',onWheel,{passive:false});
    return ()=>panel.removeEventListener('wheel',onWheel);
  },[]);
  function zoomBy(n:number,at?:Point){
    const next=boundedMapZoom(n),panel=viewport.current,paper=sheet.current;
    if(next===lastZoom.current||!panel||!paper)return;
    pending.current={anchor:captureWorldZoomAnchor(atlasScrollGeometry(panel,paper),
      at??{x:panel.clientWidth/2,y:panel.clientHeight/2})};
    setZoom(next);
  }
  const locate=(cell:number)=>{
    setSelected(cell);
    if(zoom>=ATLAS_PLACE_ZOOM){center(cell);return;}
    pending.current={center:cell};
    setZoom(ATLAS_PLACE_ZOOM);
  };
  const fit=()=>{
    pending.current=undefined;setZoom(1);
    viewport.current?.scrollTo(0,0);
  };
  return <div className="evo-playground-layout realm-layer-layout">
    <section className="evo-map-card" aria-label="Underworld layer" data-map-detail={atlasLevel(zoom)}>
      <div className="evo-card-heading evo-map-heading">
        <div className="atlas-map-title" aria-live="polite">
          <strong>{town?.name??(link&&realmLinkName(world,link))??'Underworld map'}</strong>
          <small>{link?'Passage to the Surface':biome?.name??'Underground world layer'}</small>
        </div>
        <div className="evo-map-actions">
          <details className="realm-atlas-places">
            <summary>Places</summary>
            <div>{features.map(feature=><button type="button" key={feature.cell} onClick={event=>{
              event.currentTarget.closest('details')?.removeAttribute('open');locate(feature.cell);
            }}>{feature.name}</button>)}</div>
          </details>
          {at!==undefined&&<button type="button" onClick={()=>locate(at)}>Find me</button>}
          <button type="button" onClick={fit} aria-label="Fit Underworld view">Fit</button>
          <button type="button" onClick={()=>zoomBy(zoom-.5)} disabled={zoom<=1} aria-label="Zoom out">−</button>
          <button type="button" onClick={()=>zoomBy(zoom+.5)} disabled={zoom>=8} aria-label="Zoom in">+</button>
        </div>
      </div>
      <div ref={viewport} className="evo-map-scroll atlas-viewport realm-atlas-viewport"
        tabIndex={0} role="region" aria-label="Pan and zoom the Underworld"
        onKeyDown={event=>{
          if(event.target!==event.currentTarget)return;
          if(event.key==='+'||event.key==='-'){event.preventDefault();zoomBy(zoom+(event.key==='+'?.5:-.5));}
          if(event.key==='Home'){event.preventDefault();fit();}
          const directions:Record<string,Point>={ArrowUp:{x:0,y:-1},ArrowDown:{x:0,y:1},
            ArrowLeft:{x:-1,y:0},ArrowRight:{x:1,y:0}};
          const direction=directions[event.key];
          if(direction){event.preventDefault();event.currentTarget.scrollBy(direction.x*48,direction.y*48);}
        }}
        onPointerDown={event=>{
          skipClick.current=false;
          if(event.pointerType!=='mouse'||event.button!==0||
            event.target instanceof Element&&event.target.closest('button'))return;
          drag.current={pointer:event.pointerId,x:event.clientX,y:event.clientY,moving:false,
            scrollLeft:event.currentTarget.scrollLeft,scrollTop:event.currentTarget.scrollTop};
        }}
        onPointerMove={event=>{
          const start=drag.current;
          if(!start||start.pointer!==event.pointerId)return;
          const dx=event.clientX-start.x,dy=event.clientY-start.y;
          if(!start.moving&&!isMapPanDrag(dx,dy))return;
          if(!start.moving)event.currentTarget.setPointerCapture(event.pointerId);
          start.moving=true;skipClick.current=true;
          const next=mapScrollForDrag(start,{x:dx,y:dy});
          event.currentTarget.scrollTo(next.x,next.y);
        }}
        onPointerLeave={()=>{if(!drag.current?.moving)drag.current=undefined;}}
        onPointerUp={()=>{drag.current=undefined;}}
        onPointerCancel={()=>{drag.current=undefined;skipClick.current=false;}}
        onClickCapture={event=>{
          if(!skipClick.current)return;
          skipClick.current=false;event.stopPropagation();
        }}>
        <div ref={sheet} className="atlas-sheet realm-atlas-sheet"
          style={{width:'min('+zoom*100+'%, calc(var(--atlas-height) * '+
            zoom*world.width/world.height+'))',aspectRatio:world.width+'/'+world.height}}>
          <RealmFloor world={world} map={map} close={!overview} onInspect={setSelected}/>
          {overview&&regions.map(region=><span key={region.name} className="realm-region-label"
            style={position(region.cell)} aria-hidden="true">{region.name}</span>)}
          {features.map(feature=><button key={feature.cell} type="button"
            className="realm-atlas-pin" data-kind={feature.kind}
            data-selected={feature.cell===selected||undefined}
            aria-label={'Locate '+feature.name} title={feature.name}
            style={position(feature.cell)} onClick={()=>locate(feature.cell)}>
            <span className="realm-pin-mark" aria-hidden="true">{feature.kind==='shaft'?'▴':feature.kind==='town'?'▪':'↥'}</span>
            {(overview||feature.cell===selected)&&labels.has(feature.cell)&&
              <span className="realm-pin-name" aria-hidden="true" data-side={labels.get(feature.cell)}>{feature.name}</span>}
          </button>)}
          {selected!==undefined&&!features.some(feature=>feature.cell===selected)&&
            <span className="realm-atlas-crosshair" style={position(selected)} aria-hidden="true"/>}
          {at!==undefined&&<span className="realm-atlas-player" style={position(at)} title="Your mortal" aria-label="Your mortal"/>}
        </div>
      </div>
      <div className="realm-atlas-footer">
        <ul className="underworld-legend" aria-label="Underworld biomes">
          {overviewRegions.map(i=><li key={i}><i style={{background:UNDERWORLD_BIOMES[i].color}}/>
            {i===RealmBiome.lava?'Ember Rivers':UNDERWORLD_BIOMES[i].name}</li>)}
        </ul>
        <span>{zoomLabel(zoom)}</span>
      </div>
    </section>
    <aside className="realm-atlas-info">
      <section className="evo-section-card" aria-label="Underworld place details">
        <div className="evo-card-heading"><strong>{town?.name??(link&&realmLinkName(world,link))??biome?.name??'Underworld'}</strong></div>
        {(town||selected===undefined)&&census&&<p>{census.demons} demons · {census.ashBorne} Ash Borne</p>}
        {place&&<p className="realm-atlas-coordinates">World position · X {place.x} · Y {place.y}</p>}
        {town?.berth!==undefined&&<p>Port on the Buried Sea</p>}
        {surface!==undefined&&onSurface&&<button type="button" className="atlas-terrain-cell-zoom"
          onClick={()=>onSurface(surface)}>Show on Surface</button>}
        {link&&onMark&&<button type="button" className="atlas-terrain-cell-zoom"
          aria-pressed={marked===link.surface} onClick={()=>onMark(link)}>Mark passage</button>}
        {selected===undefined&&<p>Enter through a dormant volcano on the Surface.</p>}
      </section>
    </aside>
  </div>;
}
