import {lazy,Suspense,useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import type {ChangeEvent,SetStateAction} from 'react';
import {shouldAcceptSimulation,type PendingSimulation,
  type SimulationRequest,type SimulationReply} from './simulationProtocol';
import {WorldCanvas,type MapOverlay} from './WorldCanvas';
import {DepthCanvas} from './DepthCanvas';
import {CAMERA_PITCHES,RELIEF_LEVELS,
  type CameraPitch,type ReliefLevel} from './depthProjection';
import {MapLayerLegend} from './MapLayerLegend';
import {sceneAtmosphere} from './sceneAtmosphere';
import {createDepthProjector} from './depthProjection';
import {topographyForWorld} from './topography';
import {readWorldPerspective,writeWorldPerspective} from './worldViewPreferences';
import {boundedMapZoom,captureWorldZoomAnchor,gestureZoomFactor,
  isMapPanDrag,mapScrollForDrag,restoreWorldZoomAnchor,
  type WorldZoomAnchor} from './mapGestures';
import {yawForRightDrag} from './orbitGestures';
import {enablePhysicalTerrain,hasPhysicalTerrain,terrainFarmFactor,
  terrainRuggedness} from './terrainPhysics';
import {elevationAt} from './topography';
import {hydrologyForWorld} from './hydrology';
import {advanceWorldDays,calendarDate,MONTH_NAMES,TIME_RATES,
  type TimeRate} from './calendar';
import {cameraScrollTarget} from './motion';
import {PixelPortrait} from './PixelPortrait';
import {RankProfile} from './RankProfile';
import {WorldCreator} from './WorldCreator';
import {EvolutionHistory} from './EvolutionHistory';
import {WorldFamily} from './WorldFamily';
import {PeopleDirectory} from './PeopleDirectory';
import {DivineCodex} from './DivineCodex';
import {TOPIC_INFO} from './knowledge';
import {DivinePowers} from './DivinePowers';
import {settlementStage} from './construction';
import {SPECIALTY_LABELS} from './economy';
import {RESOURCE_LABELS,RESOURCE_COLORS} from './resources';
import {intervene,type DivineAction} from './divine';
import {personName,isPersonFavorite,renamePerson,togglePersonFavorite,
  toggleSettlementFavorite,renameSettlement,knownSettlements} from './identity';
import {hybridFraction,traitProfile,ancestryLabel} from './family';
import {lifeStage,CAREER_LABELS} from './development';
import {GOAL_LABELS} from './mind';
const KnowledgeCodex=lazy(()=>import('./KnowledgeCodex').then(m=>({default:m.KnowledgeCodex})));
const CultureCodex=lazy(()=>import('./CultureCodex').then(m=>({default:m.CultureCodex})));
const SettlementView=lazy(()=>import('./SettlementView').then(m=>({default:m.SettlementView})));
import {compactWorld,loadBrowserWorld,loadBrowserWorldSnapshot,readSavedWorld,WORLD_STORAGE_KEY,
  WORLD_STORAGE_TIME_KEY,MAX_WORLD_FILE_BYTES,loadDatabaseSnapshot,
  saveDatabaseWorld} from './storage';
export {readSavedWorld} from './storage';
import {
  BIOME_INFO,BIOMES,DEFAULT_SETTINGS,SPECIES,SPECIES_INFO,
  createWorld,editWorld,population,
  type Brush,type World,type WorldSettings,
} from './engine';

function initialWorld():World{
  if(typeof window!=='undefined'){
    try{
      const restored=loadBrowserWorld(window.localStorage);
      if(restored)return restored;
    }catch{/* Restricted storage: continue with an in-memory world. */}
  }
  return createWorld(DEFAULT_SETTINGS);
}
type Tab='world'|'creator'|'history'|'family'|'people'|'knowledge'|'codex'|'powers'|
  'settlements'|'culture';
const format=(n:number)=>n.toLocaleString('en-US');
const CAMERA_TILT_CHOICES:readonly (readonly [CameraPitch,string])[]=[
  ['low','LOW'],['classic','CLASSIC'],['high','HIGH'],
];
const downloadJson=(world:World)=>{
  const blob=new Blob([JSON.stringify(world)],{type:'application/json'});
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;
  link.download='worldforge-'+world.settings.seed+'-year-'+world.year+'.json';
  document.body.appendChild(link);link.click();link.remove();
  URL.revokeObjectURL(url);
};
// World snapshots are immutable: repeat checkpoints of the same instance
// do not need a new multi-MB serialization or IndexedDB transaction.
const snapshotSaves=new WeakMap<World,Promise<void>>();
async function persistSnapshot(world:World):Promise<void>{
  const raw=compactWorld(world);
  const savedAt=Date.now();
  // A small synchronous fallback survives reloads even if a pagehide event
  // cannot finish its asynchronous IndexedDB transaction.
  let localSaved=false;
  if(raw.length<2_000_000){
    try{
      window.localStorage.setItem(WORLD_STORAGE_KEY,raw);
      window.localStorage.setItem(WORLD_STORAGE_TIME_KEY,String(savedAt));
      localSaved=true;
    }
    catch{/* IndexedDB is the primary save location. */}
  }
  try{await saveDatabaseWorld(raw,savedAt,true);}
  catch(error){
    if(localSaved)return;
    try{
      window.localStorage.setItem(WORLD_STORAGE_KEY,raw);
      window.localStorage.setItem(WORLD_STORAGE_TIME_KEY,String(savedAt));
    }
    catch{throw error;}
  }
}
function saveSnapshot(world:World):Promise<void>{
  const existing=snapshotSaves.get(world);
  if(existing)return existing;
  const pending=persistSnapshot(world).catch(error=>{
    // A failed checkpoint must be retryable, especially during pagehide.
    snapshotSaves.delete(world);
    throw error;
  });
  snapshotSaves.set(world,pending);
  return pending;
}

export function WorldforgeApp(){
  const [world,reactSetWorld]=useState<World>(initialWorld);
  // A generation is incremented on EVERY player edit/import/command. A stale
  // worker result must never replace those changes.
  const worldRevision=useRef(0);
  const setWorld=useCallback((change:SetStateAction<World>)=>{
    worldRevision.current++;
    reactSetWorld(change);
  },[]);
  const simulationWorker=useRef<Worker|null>(null);
  const simulationPending=useRef<PendingSimulation|null>(null);
  const preparedSimulation=useRef<{pending:PendingSimulation;
    reply:Extract<SimulationReply,{kind:'advanced'}>}|null>(null);
  const playbackDeadlineReached=useRef(false);
  const simulationRequestId=useRef(0);
  const workerSyncedRevision=useRef(-1);
  const lastSimulationMs=useRef<number|null>(null);
  const lastTransferMs=useRef<number|null>(null);
  const [workerMode,setWorkerMode]=useState<'worker'|'fallback'|'starting'>('starting');
  const [showDiagnostics,setShowDiagnostics]=useState(false);
  const [canvasDiagnostics,setCanvasDiagnostics]=useState<{
    drawn:number;frameMs:number}|null>(null);
  // Server-rendered previews have no browser database to restore.
  const [storageReady,setStorageReady]=useState(typeof window==='undefined');
  const [tab,setTab]=useState<Tab>('world');
  const [playing,reactSetPlaying]=useState(false);
  const playingRef=useRef(false);
  const setPlaying=useCallback((change:SetStateAction<boolean>)=>{
    const next=typeof change==='function'?change(playingRef.current):change;
    playingRef.current=next;
    reactSetPlaying(next);
  },[]);
  const [timeRate,setTimeRate]=useState<TimeRate>('month');
  const playback=TIME_RATES.find(rate=>rate.id===timeRate)??TIME_RATES[2];
  const playbackDaysRef=useRef<number>(playback.days);
  playbackDaysRef.current=playback.days;
  const speed=timeRate==='sixteen'?16:timeRate==='four'?4:1;
  const [brush,setBrush]=useState<Brush>({kind:'inspect'});
  const [overlay,setOverlay]=useState<MapOverlay>('terrain');
  const [mapView,setMapView]=useState<'overhead'|'depth'>(()=>{
    try{return readWorldPerspective(
      typeof window==='undefined'?null:window.localStorage);}
    catch{return 'depth';}
  });
  const [reliefLevel,setReliefLevel]=useState<ReliefLevel>('dramatic');
  const [orbitYaw,setOrbitYaw]=useState(0);
  const orbitYawRef=useRef(orbitYaw);
  orbitYawRef.current=orbitYaw;
  const [cameraPitch,setCameraPitch]=useState<CameraPitch>('classic');
  const [zoom,setZoom]=useState(mapView==='depth'?1.5:1);
  const [advancedView,setAdvancedView]=useState(false);
  const [toolPanel,setToolPanel]=useState(false);
  useEffect(()=>{
    try{writeWorldPerspective(window.localStorage,mapView);}
    catch{/* Privacy settings can block browser storage. */}
  },[mapView]);
  const [selected,setSelected]=useState<{x:number;y:number}|null>(null);
  const [selectedAgentId,setSelectedAgentId]=useState<number|null>(null);
  const [followId,setFollowId]=useState<number|null>(null);
  const [selectedSettlementId,setSelectedSettlementId]=useState<number|null>(null);
  const [mapFocus,setMapFocus]=useState<number|null>(null);
  const mapScrollRef=useRef<HTMLDivElement>(null);
  const orbitFocusRef=useRef<{x:number;y:number}|null>(null);
  const pendingZoomAnchor=useRef<WorldZoomAnchor|null>(null);
  const [notice,setNotice]=useState('');
  const [savedDate,setSavedDate]=useState<ReturnType<typeof calendarDate>|null>(null);
  const fileRef=useRef<HTMLInputElement>(null);
  const currentWorld=useRef(world);
  currentWorld.current=world;
  const tabRef=useRef(tab);
  tabRef.current=tab;
  const centerCamera=useCallback((x:number,y:number)=>{
    const viewport=mapScrollRef.current;
    if(!viewport)return;
    const w=currentWorld.current.width,h=currentWorld.current.height;
    if(mapView==='depth'){
      const current=currentWorld.current;
      const projector=createDepthProjector(current,RELIEF_LEVELS[reliefLevel],
        {yaw:orbitYaw,pitch:CAMERA_PITCHES[cameraPitch]});
      const tx=Math.max(0,Math.min(w-1,Math.floor(x)));
      const ty=Math.max(0,Math.min(h-1,Math.floor(y)));
      const elevation=topographyForWorld(current).heights[ty*w+tx]??0;
      const point=projector.project(x,y,elevation);
      const scaleX=viewport.scrollWidth/projector.size.width;
      const scaleY=viewport.scrollHeight/projector.size.height;
      viewport.scrollLeft=point.x*scaleX-viewport.clientWidth/2;
      viewport.scrollTop=point.y*scaleY-viewport.clientHeight/2;
    }else{
      const target=cameraScrollTarget({x,y},{x:w,y:h},
        {x:viewport.scrollWidth,y:viewport.scrollHeight},
        {x:viewport.clientWidth,y:viewport.clientHeight});
      viewport.scrollLeft=target.left;viewport.scrollTop=target.top;
    }
  },[mapView,reliefLevel,orbitYaw,cameraPitch]);
  // A trackpad pinch is a ctrl+wheel gesture on Chrome/Firefox. It changes
  // only the map scale; regular two-finger scrolling pans both axes natively.
  // Safari emits gesturechange, handled separately with the same anchor.
  useEffect(()=>{
    if(tab!=='world')return;
    const viewport=mapScrollRef.current;
    if(!viewport)return;
    const requestZoom=(factor:number,clientX:number,clientY:number)=>{
      const rect=viewport.getBoundingClientRect();
      const x=Number.isFinite(clientX)?clientX-rect.left:rect.width/2;
      const y=Number.isFinite(clientY)?clientY-rect.top:rect.height/2;
      pendingZoomAnchor.current=captureWorldZoomAnchor(viewport,{
        x:Math.max(0,Math.min(rect.width,x)),
        y:Math.max(0,Math.min(rect.height,y)),
      });
      setFollowId(null);
      setZoom(value=>boundedMapZoom(value*factor));
    };
    const wheel=(event:WheelEvent)=>{
      if(!event.ctrlKey){
        // Trackpad two-finger scrolling pans naturally with browser inertia.
        // A manual navigation gesture also releases the follow camera.
        if(event.deltaX||event.deltaY)setFollowId(null);
        return;
      }
      event.preventDefault(); // Pinch the map, never the entire browser page.
      requestZoom(gestureZoomFactor(event.deltaY,event.deltaMode),
        event.clientX,event.clientY);
    };
    let lastSafariScale=1;
    const startGesture=(event:Event)=>{
      event.preventDefault();
      lastSafariScale=1;
    };
    const safariGesture=(event:Event)=>{
      const pinch=event as Event&{scale?:number;clientX?:number;clientY?:number};
      if(!pinch.scale||pinch.scale<=0)return;
      event.preventDefault();
      requestZoom(pinch.scale/lastSafariScale,
        pinch.clientX??NaN,pinch.clientY??NaN);
      lastSafariScale=pinch.scale;
    };
    viewport.addEventListener('wheel',wheel,{passive:false});
    viewport.addEventListener('gesturestart',startGesture,{passive:false});
    viewport.addEventListener('gesturechange',safariGesture,{passive:false});
    return ()=>{
      viewport.removeEventListener('wheel',wheel);
      viewport.removeEventListener('gesturestart',startGesture);
      viewport.removeEventListener('gesturechange',safariGesture);
    };
  },[tab,storageReady]);
  // Left-button navigation uses mouse events on the window so a quick drag
  // remains reliable even when it crosses the viewport edge. A small wobble
  // remains a real click for the canvas inspector.
  useEffect(()=>{
    if(tab!=='world')return;
    const viewport=mapScrollRef.current;
    if(!viewport)return;
    let pan:{startX:number;startY:number;scrollX:number;scrollY:number;
      moved:boolean}|null=null;
    let suppressClick=false;
    const move=(event:MouseEvent)=>{
      if(!pan)return;
      const dx=event.clientX-pan.startX,dy=event.clientY-pan.startY;
      if(!pan.moved){
        if(!isMapPanDrag(dx,dy))return;
        pan.moved=true;
        viewport.classList.add('is-pan-dragging');
        setFollowId(null);
      }
      event.preventDefault();
      const scroll=mapScrollForDrag({scrollLeft:pan.scrollX,
        scrollTop:pan.scrollY},{x:dx,y:dy});
      viewport.scrollLeft=scroll.x;viewport.scrollTop=scroll.y;
    };
    const up=()=>{
      if(pan?.moved)suppressClick=true;
      pan=null;
      viewport.classList.remove('is-pan-dragging');
      window.removeEventListener('mousemove',move);
      window.removeEventListener('mouseup',up);
    };
    const down=(event:MouseEvent)=>{
      if(event.button!==0)return;
      suppressClick=false;
      pan={startX:event.clientX,startY:event.clientY,
        scrollX:viewport.scrollLeft,scrollY:viewport.scrollTop,moved:false};
      window.addEventListener('mousemove',move);
      window.addEventListener('mouseup',up);
    };
    const clickCapture=(event:MouseEvent)=>{
      if(!suppressClick)return;
      suppressClick=false;
      event.preventDefault();event.stopPropagation();
    };
    viewport.addEventListener('mousedown',down);
    viewport.addEventListener('click',clickCapture,true);
    return ()=>{
      window.removeEventListener('mousemove',move);
      window.removeEventListener('mouseup',up);
      viewport.classList.remove('is-pan-dragging');
      viewport.removeEventListener('mousedown',down);
      viewport.removeEventListener('click',clickCapture,true);
    };
  },[tab]);
  // Right-drag orbits the raised view in 15° steps, without interfering with
  // native two-finger scrolling or left-button panning.
  useEffect(()=>{
    if(tab!=='world'||mapView!=='depth')return;
    const viewport=mapScrollRef.current;
    if(!viewport)return;
    let drag:{pointerId:number;startX:number;startYaw:number}|null=null;
    let frame=0,pendingYaw:number|null=null;
    const commit=()=>{
      frame=0;
      if(pendingYaw!==null){setOrbitYaw(pendingYaw);pendingYaw=null;}
    };
    const finish=(event:PointerEvent)=>{
      if(!drag||event.pointerId!==drag.pointerId)return;
      drag=null;
      if(frame){window.cancelAnimationFrame(frame);commit();}
      viewport.classList.remove('is-orbit-dragging');
      if(viewport.hasPointerCapture(event.pointerId))
        viewport.releasePointerCapture(event.pointerId);
    };
    const down=(event:PointerEvent)=>{
      if(drag||event.button!==2)return;
      event.preventDefault();
      // Pivot around the actual viewport center, rather than snapping to the
      // world's center every time a player orbits a nearby settlement.
      const w=currentWorld.current;
      const projector=createDepthProjector(w,RELIEF_LEVELS[reliefLevel],
        {yaw:orbitYawRef.current,pitch:CAMERA_PITCHES[cameraPitch]});
      const scaleX=viewport.scrollWidth/projector.size.width;
      const scaleY=viewport.scrollHeight/projector.size.height;
      const cx=(viewport.scrollLeft+viewport.clientWidth/2)/Math.max(.001,scaleX);
      const cy=(viewport.scrollTop+viewport.clientHeight/2)/Math.max(.001,scaleY);
      const heights=topographyForWorld(w).heights;
      let nearest={x:Math.floor(w.width/2),y:Math.floor(w.height/2)};
      let best=Infinity;
      for(let y=0;y<w.height;y++)for(let x=0;x<w.width;x++){
        const p=projector.project(x,y,heights[y*w.width+x]);
        const d=(p.x-cx)**2+(p.y-cy)**2;
        if(d<best){best=d;nearest={x,y};}
      }
      orbitFocusRef.current=nearest;
      drag={pointerId:event.pointerId,startX:event.clientX,
        startYaw:orbitYawRef.current};
      viewport.classList.add('is-orbit-dragging');
      viewport.setPointerCapture(event.pointerId);
      setFollowId(null);
    };
    const move=(event:PointerEvent)=>{
      if(!drag||event.pointerId!==drag.pointerId)return;
      if(!(event.buttons&2)){finish(event);return;}
      event.preventDefault();
      pendingYaw=yawForRightDrag(drag.startYaw,event.clientX-drag.startX);
      if(!frame)frame=window.requestAnimationFrame(commit);
    };
    const contextMenu=(event:MouseEvent)=>event.preventDefault();
    viewport.addEventListener('pointerdown',down);
    viewport.addEventListener('pointermove',move);
    viewport.addEventListener('pointerup',finish);
    viewport.addEventListener('pointercancel',finish);
    viewport.addEventListener('contextmenu',contextMenu);
    return ()=>{
      if(frame)window.cancelAnimationFrame(frame);
      viewport.classList.remove('is-orbit-dragging');
      viewport.removeEventListener('pointerdown',down);
      viewport.removeEventListener('pointermove',move);
      viewport.removeEventListener('pointerup',finish);
      viewport.removeEventListener('pointercancel',finish);
      viewport.removeEventListener('contextmenu',contextMenu);
    };
  },[tab,mapView,reliefLevel,cameraPitch]);
  // After the canvas changes size, restore the exact world point below the
  // fingers instead of jumping to the top-left of the projected panorama.
  useLayoutEffect(()=>{
    const anchor=pendingZoomAnchor.current;
    const viewport=mapScrollRef.current;
    if(!anchor||!viewport)return;
    pendingZoomAnchor.current=null;
    const scroll=restoreWorldZoomAnchor(anchor,viewport);
    viewport.scrollLeft=scroll.x;
    viewport.scrollTop=scroll.y;
  },[zoom]);
  useEffect(()=>{
    let active=true;
    loadDatabaseSnapshot().then(restored=>{
      let localTime=0;
      try{
        localTime=loadBrowserWorldSnapshot(window.localStorage)?.savedAt??0;
      }catch{/* Restricted storage does not suppress database recovery. */}
      if(active&&restored&&restored.savedAt>=localTime)
        setWorld(restored.world);
    }).catch(()=>{/* localStorage / newly created world remains available. */})
      .finally(()=>{if(active)setStorageReady(true);});
    return ()=>{active=false;};
  },[]);
  // Playback may update the world 16 times/second. A debounce alone would
  // *never* fire while playing, so retain periodic checkpoints as well.
  useEffect(()=>{
    if(!storageReady)return;
    const save=()=>{
      const current=currentWorld.current;
      void saveSnapshot(current).then(()=>setSavedDate(calendarDate(current)))
        .catch(()=>setNotice('Autosave failed. Export World JSON to keep your progress.'));
    };
    const timer=window.setInterval(save,10000);
    window.addEventListener('pagehide',save);
    return ()=>{window.clearInterval(timer);window.removeEventListener('pagehide',save);save();};
  },[storageReady]);
  useEffect(()=>{
    if(playing||!storageReady)return; // The periodic checkpoint handles play.
    const timer=window.setTimeout(()=>{
      void saveSnapshot(world).then(()=>setSavedDate(calendarDate(world)))
        .catch(()=>setNotice('Autosave failed. Export World JSON to keep your progress.'));
    },500);
    return ()=>window.clearTimeout(timer);
  },[world,playing,storageReady]);
  useEffect(()=>{if(tab!=='world'&&tab!=='settlements')setPlaying(false);},[tab]);
  const requestSimulation=useCallback(()=>{
    const worker=simulationWorker.current,current=currentWorld.current;
    if(!worker||simulationPending.current||preparedSimulation.current||
      !playingRef.current||!current.agents.length||current.year>=9999)return;
    const request:SimulationRequest={kind:'advance',
      id:++simulationRequestId.current,days:playbackDaysRef.current,
      ...(workerSyncedRevision.current===worldRevision.current?
        {}:{world:current})};
    simulationPending.current={id:request.id,
      revision:worldRevision.current,world:current};
    try{
      const start=performance.now();
      worker.postMessage(request);
      lastTransferMs.current=Math.max(0,performance.now()-start);
    }catch{
      worker.terminate();simulationWorker.current=null;
      simulationPending.current=null;preparedSimulation.current=null;
      workerSyncedRevision.current=-1;
      setWorkerMode('fallback');
      setNotice('Worker messaging failed; using safe main-thread playback.');
    }
  },[]);
  const publishPrepared=useCallback(()=>{
    const prepared=preparedSimulation.current;
    if(!prepared)return false;
    preparedSimulation.current=null;
    const {pending,reply}=prepared;
    if(!shouldAcceptSimulation(pending,reply,worldRevision.current,
      playingRef.current&&['world','settlements'].includes(tabRef.current),
      currentWorld.current)){
      workerSyncedRevision.current=-1;
      return false;
    }
    lastSimulationMs.current=reply.elapsedMs;
    currentWorld.current=reply.world;
    setWorld(reply.world);
    workerSyncedRevision.current=worldRevision.current;
    return true;
  },[setWorld]);
  // A dedicated worker owns each expensive playback calculation. The UI
  // remains authoritative for edits; stale worker results are discarded.
  // Missing/crashed workers safely fall back to the exact same calendar code.
  useEffect(()=>{
    if(typeof Worker==='undefined'){setWorkerMode('fallback');return;}
    let worker:Worker;
    try{
      worker=new Worker(new URL('./simulation.worker.ts',import.meta.url),
        {type:'module'});
    }catch{
      setWorkerMode('fallback');return;
    }
    simulationWorker.current=worker;
    workerSyncedRevision.current=-1;
    setWorkerMode('worker');
    const fallback=(message:string)=>{
      worker.terminate();
      if(simulationWorker.current===worker)simulationWorker.current=null;
      simulationPending.current=null;
      preparedSimulation.current=null;
      workerSyncedRevision.current=-1;
      setWorkerMode('fallback');
      setNotice(message);
    };
    worker.onmessage=(event:MessageEvent<SimulationReply>)=>{
      const reply=event.data,pending=simulationPending.current;
      if(!pending||!reply||pending.id!==reply.id)return;
      simulationPending.current=null;
      if(reply.kind==='failed'){
        fallback('Background simulation failed; using safe main-thread playback.');
        return;
      }
      if(!shouldAcceptSimulation(pending,reply,worldRevision.current,
        playingRef.current&&['world','settlements'].includes(tabRef.current),
        currentWorld.current)){
        workerSyncedRevision.current=-1;
        if(playingRef.current)requestSimulation();
        return;
      }
      // Prepare the next world while the current one is being displayed.
      // The clock only publishes it on its regular presentation deadline.
      preparedSimulation.current={pending,reply};
      if(playbackDeadlineReached.current){
        playbackDeadlineReached.current=false;
        publishPrepared();
        requestSimulation();
      }
    };
    worker.onerror=()=>{
      fallback('Background worker unavailable; continuing with safe playback.');
    };
    return ()=>{
      worker.terminate();
      if(simulationWorker.current===worker)simulationWorker.current=null;
      simulationPending.current=null;
      preparedSimulation.current=null;
      workerSyncedRevision.current=-1;
    };
  },[requestSimulation,publishPrepared]);
  useEffect(()=>{
    if(!playing||(tab!=='world'&&tab!=='settlements'))return;
    playbackDeadlineReached.current=false;
    preparedSimulation.current=null;
    // Start the expensive calculation at the beginning of the display period,
    // rather than waiting until the exact moment the next frame is due.
    requestSimulation();
    const timer=window.setInterval(()=>{
      const current=currentWorld.current;
      if(!current.agents.length||current.year>=9999)return;
      const worker=simulationWorker.current;
      if(worker){
        playbackDeadlineReached.current=true;
        if(preparedSimulation.current){
          playbackDeadlineReached.current=false;
          publishPrepared();
          requestSimulation();
        }else requestSimulation();
        return;
      }
      const start=performance.now();
      setWorld(w=>{
        if(!w.agents.length||w.year>=9999)return w;
        const next=advanceWorldDays(w,playback.days);
        lastSimulationMs.current=Math.max(0,performance.now()-start);
        return next;
      });
    },playback.interval);
    return ()=>{
      window.clearInterval(timer);
      playbackDeadlineReached.current=false;
      preparedSimulation.current=null;
      simulationPending.current=null;
      // The worker may be ahead of the displayed world. Resend an exact
      // snapshot after a pause or rate change, never its speculative state.
      workerSyncedRevision.current=-1;
    };
  },[playing,playback.days,playback.interval,tab,setWorld,
    requestSimulation,publishPrepared]);
  useEffect(()=>{
    if(playing&&(!world.agents.length||world.year>=9999))setPlaying(false);
  },[world.agents.length,world.year,playing]);
  const counts=useMemo(()=>population(world),[world]);
  const agent=selectedAgentId===null?null:
    world.agents.find(a=>a.id===selectedAgentId)??null;
  useEffect(()=>{
    if(followId!==null&&!world.agents.some(a=>a.id===followId)){
      setFollowId(null);
      setNotice('The person you were following is no longer alive. Camera follow ended.');
    }
  },[followId,world.agents]);
  const displayed=agent?{x:agent.x,y:agent.y}:selected;
  const tile=displayed?world.tiles[displayed.y*world.width+displayed.x]:null;
  const altitude=displayed?elevationAt(world,displayed.x,displayed.y):null;
  const drainage=displayed?hydrologyForWorld(world):null;
  const drainageIndex=displayed?displayed.y*world.width+displayed.x:-1;
  const streamTier=drainageIndex>=0?drainage?.channel[drainageIndex]??0:0;
  const receiving=drainageIndex>=0?drainage?.basin[drainageIndex]??-1:-1;
  const receiverIsWater=receiving>=0&&world.tiles[receiving]?.biome==='water';
  const resource=displayed?world.deposits?.find(d=>d.index===
    displayed.y*world.width+displayed.x):undefined;
  const settlement=displayed?world.settlements.find(s=>(s.x===displayed.x&&
    s.y===displayed.y)||s.infrastructure?.buildings.some(b=>b.x===displayed.x&&
    b.y===displayed.y))??null:null;
  const ancientSite=displayed?world.ancientSites?.find(s=>
    s.x===displayed.x&&s.y===displayed.y):undefined;
  const latest=world.history.at(-1);
  const hybrids=useMemo(()=>world.agents.filter(a=>hybridFraction(a.ancestry)>.01).length,
    [world.agents]);
  const partnerships=useMemo(()=>world.bonds.filter(b=>b.stage==='partner').length,
    [world.bonds]);
  const explorers=useMemo(()=>world.agents.filter(a=>a.mind?.goal==='venture').length,
    [world.agents]);
  const focusPerson=(id:number)=>{
    setPlaying(false);setSelectedAgentId(id);setTab('family');
  };
  const openPerson=(id:number)=>{
    setPlaying(false);setSelectedAgentId(id);setTab('people');
  };
  const favoritePerson=(id:number)=>setWorld(w=>togglePersonFavorite(w,id));
  const favoriteSettlement=(id:number)=>setWorld(w=>toggleSettlementFavorite(w,id));
  const giveName=(id:number,name:string)=>setWorld(w=>renamePerson(w,id,name));
  const renamePlace=(id:number,name:string)=>setWorld(w=>renameSettlement(w,id,name));
  const findSettlement=(id:number)=>{
    const place=knownSettlements(world).find(s=>s.id===id);
    if(!place)return;
    setPlaying(false);
    setFollowId(null);
    setSelected({x:place.x,y:place.y});setSelectedAgentId(null);
    setZoom(v=>Math.max(1.5,v));setTab('world');setMapFocus(-1);
  };
  const openSettlement=(id:number)=>{
    setSelectedSettlementId(id);setTab('settlements');
  };
  const findOnMap=(id:number)=>{
    const target=world.agents.find(a=>a.id===id);
    if(!target)return;
    setSelectedAgentId(id);setSelected({x:target.x,y:target.y});
    setZoom(v=>Math.max(2,v));setFollowId(id);
    setTab('world');setMapFocus(id);
  };
  const findAncientSite=(x:number,y:number)=>{
    setPlaying(false);setSelected({x,y});setSelectedAgentId(null);
    setFollowId(null);setZoom(v=>Math.max(1.5,v));setTab('world');setMapFocus(-1);
  };
  useEffect(()=>{
    if(tab!=='world'||mapFocus===null)return;
    const target=mapFocus===-1?selected:
      world.agents.find(a=>a.id===mapFocus);
    if(target)centerCamera(target.x,target.y);
    setMapFocus(null);
  },[tab,mapFocus,zoom,centerCamera]);
  // The raised camera's full projected canvas may be much wider than the
  // viewport. Center it on entry; otherwise first-time users see only the
  // empty skyline at the top-left of a large panorama.
  useEffect(()=>{
    if(!storageReady||tab!=='world'||mapView!=='depth'||mapFocus!==null)return;
    const frame=window.requestAnimationFrame(()=>{
      const point=orbitFocusRef.current??selected??{x:Math.floor(world.width/2),
        y:Math.floor(world.height/2)};
      centerCamera(point.x,point.y);
    });
    return ()=>window.cancelAnimationFrame(frame);
  },[storageReady,tab,mapView,world.width,world.height,world.settings.seed,
    centerCamera]);
  useEffect(()=>{
    const target=followId===null?null:world.agents.find(a=>a.id===followId);
    if(tab==='world'&&target)centerCamera(target.x,target.y);
  },[followId,tab,zoom,world.settings.seed,centerCamera]);
  const chooseTile=(x:number,y:number)=>{
    orbitFocusRef.current=null;
    setSelected({x,y});
    const individual=world.agents.find(a=>a.x===x&&a.y===y);
    setSelectedAgentId(individual?.id??null);
    if(followId!==null)setFollowId(individual?.id??null);
  };
  const brushAt=(x:number,y:number)=>{
    const before=world;
    const next=editWorld(before,x,y,brush);
    if(next===before){
      setNotice('That tile cannot accept the selected brush. Water and occupied tiles have restrictions.');
    }else{
      setWorld(next);setNotice('');
      setFollowId(null);
      setSelected({x,y});setSelectedAgentId(null);
    }
  };
  const startWorld=(settings:WorldSettings)=>{
    if(!window.confirm('Generate a new world? This replaces your current simulation. '+
      'Use Export World JSON first to keep this timeline.'))return;
    setPlaying(false);setWorld(createWorld(settings));setTab('world');
    setSavedDate(null);
    setFollowId(null);
    setSelected(null);setSelectedAgentId(null);setBrush({kind:'inspect'});
    setZoom(mapView==='depth'?1.5:1);
    setNotice('New world created with seed '+settings.seed+'.');
  };
  const reset=()=>{
    const legacyDimensions=world.width!==({
      small:96,medium:160,large:256,vast:320,
    }[world.settings.size]);
    const note=legacyDimensions?
      'This is a migrated v0.1 world. Replaying its seed will start a NEW, LARGER v0.2 map. ':
      '';
    if(!window.confirm(note+'Restart from year 0 using seed '+world.settings.seed+
      '? Your current timeline will be replaced. Export World JSON first to keep it.'))return;
    setPlaying(false);setWorld(createWorld(world.settings));
    setSavedDate(null);
    setFollowId(null);
    setSelected(null);setSelectedAgentId(null);
    setNotice('World replayed from the same starting seed.');
  };
  const importWorld=async(event:ChangeEvent<HTMLInputElement>)=>{
    const file=event.currentTarget.files?.[0];event.currentTarget.value='';
    if(!file)return;
    if(file.size>MAX_WORLD_FILE_BYTES){
      setNotice('World file exceeds the 64 MB safety limit.');return;
    }
    if(!window.confirm('Load '+file.name+'? This replaces the current world. '+
      'Export your world first if you want a backup.'))return;
    try{
      const obj=readSavedWorld(await file.text());
      if(!obj)throw Error('Invalid or unsupported Worldforge world JSON.');
      setPlaying(false);setWorld(obj);setTab('world');
      setSavedDate(null);
      setFollowId(null);
      setSelected(null);setSelectedAgentId(null);
      setZoom(mapView==='depth'?1.5:1);setBrush({kind:'inspect'});
      setNotice('Loaded saved world, year '+obj.year+'.');
    }catch(error){setNotice(error instanceof Error?error.message:'Unable to open world file.');}
  };
  const step=(days:number)=>{
    setPlaying(false);setWorld(w=>advanceWorldDays(w,days));
  };
  const navigate=(next:Tab)=>{
    if(next!=='settlements')setPlaying(false);
    setTab(next);setNotice('');
  };
  const applyDivine=(action:DivineAction)=>{
    setPlaying(false);
    try{
      const updated=intervene(currentWorld.current,action);
      setWorld(updated);
      const last=updated.divine?.history.at(-1);
      setNotice(last?'Divine intervention #'+last.id+': '+last.description:'Power applied.');
    }catch(err){setNotice(err instanceof Error?err.message:'That power could not take effect.');}
  };
  if(!storageReady)return <div className="evo-app evo-loading-world" role="status">
    Restoring your saved world…</div>;
  return <div className="evo-app">
    <header className="evo-lab-nav">
      <div className="evo-lab-brand">
        <span>✦</span>
        <div><strong>WORLDFORGE</strong><small>AN AUTONOMOUS LIVING WORLD</small></div>
      </div>
      <nav role="tablist" aria-label="Worldforge pages" className="evo-lab-tabs">
        <button role="tab" aria-selected={tab==='world'}
          className={tab==='world'?'active':''} onClick={()=>navigate('world')}>
          ◈ WORLD</button>
        <button role="tab" aria-selected={tab==='settlements'}
          className={tab==='settlements'?'active':''}
          onClick={()=>navigate('settlements')}>⌂ SETTLEMENTS</button>
        <button role="tab" aria-selected={tab==='people'}
          className={tab==='people'?'active':''} onClick={()=>navigate('people')}>
          ◉ PEOPLE</button>
        <button role="tab" aria-selected={tab==='knowledge'}
          className={tab==='knowledge'?'active':''} onClick={()=>navigate('knowledge')}>
          ✧ EXPEDITIONS & KNOWLEDGE</button>
        <button role="tab" aria-selected={tab==='culture'}
          className={tab==='culture'?'active':''} onClick={()=>navigate('culture')}>
          ⚖ BELIEFS & GOVERNMENT</button>
        <button role="tab" aria-selected={tab==='powers'}
          className={tab==='powers'?'active':''} onClick={()=>navigate('powers')}>
          ⚡ POWERS</button>
        <details className="evo-nav-more">
          <summary>✧ ARCHIVES</summary>
          <div className="evo-nav-more-panel">
            {([['creator','✧ WORLD CREATOR'],['family','♡ FAMILIES'],
              ['codex','✦ DIVINE CODEX'],['history','≋ HISTORY']] as const)
              .map(([page,title])=><button key={page}
                className={tab===page?'active':''}
                aria-current={tab===page?'page':undefined}
                onClick={()=>navigate(page)}>{title}</button>)}
          </div>
        </details>
      </nav>
      <div className="evo-nav-status"><span/> YEAR {world.year}
        {savedDate&&<small> · SAVED Y{savedDate.year} {MONTH_NAMES[savedDate.month]}
          {' '}{savedDate.day}</small>}</div>
    </header>
    {tab==='creator'?<WorldCreator key={world.settings.seed+'-'+world.year}
      current={world.settings} onCreate={startWorld} onReturn={()=>navigate('world')}/>:
    tab==='history'?<EvolutionHistory world={world}/>:
    tab==='settlements'?<Suspense fallback={<main className="evo-history-page" role="status">
      Opening the settlement atlas…</main>}><SettlementView world={world}
      selectedId={selectedSettlementId} onFindOnMap={findSettlement}
      playing={playing} onTogglePlay={()=>setPlaying(v=>!v)}
      onAdvance={step}/></Suspense>:
    tab==='family'?<WorldFamily world={world} focusId={selectedAgentId}
      onChoose={focusPerson} onShowOnMap={findOnMap}
      onFavorite={favoritePerson} onRename={giveName}/>:
    tab==='people'?<PeopleDirectory world={world} selectedId={selectedAgentId}
      onOpen={focusPerson} onFavorite={favoritePerson}
      onRename={giveName} onFindOnMap={findOnMap}
      onInvoke={id=>{setSelectedAgentId(id);navigate('powers');}}/>:
    tab==='knowledge'?<Suspense fallback={<main className="evo-history-page" role="status">
      Opening the expedition journal…</main>}><KnowledgeCodex world={world}
      onFindOnMap={findAncientSite} onOpenPerson={openPerson}/></Suspense>:
    tab==='culture'?<Suspense fallback={<main className="evo-history-page" role="status">
      Opening the civilization archive…</main>}><CultureCodex world={world}
      onFindSettlement={findSettlement} onOpenPerson={openPerson}/></Suspense>:
    tab==='codex'?<DivineCodex world={world}
      onOpenPerson={focusPerson} onFavoritePerson={favoritePerson}
      onFavoriteSettlement={favoriteSettlement}
      onRenameSettlement={renamePlace} onFindSettlement={findSettlement}/>:
    tab==='powers'?<><DivinePowers world={world} selectedId={selectedAgentId}
      selectedTile={selected} onApply={applyDivine} onOpenPerson={openPerson}
      onFindOnMap={findOnMap}/>
      {notice&&<p className="evo-notice" role="status">{notice}</p>}</>:
    <main className="evo-playground">
      <header className="evo-playground-heading">
        <div>
          <span className="evo-overline">THE WORLD IS YOUR EXPERIMENT</span>
          <h1>Let the world <em>write itself.</em></h1>
          <p>Watch four fantasy peoples survive, spread and form settlements
            in a living pixel world.</p>
        </div>
        <div className="evo-sim-controls">
          <button className={playing?'playing evo-play-main':'evo-play-main'}
            disabled={!world.agents.length||world.year>=9999}
            onClick={()=>setPlaying(v=>!v)}>{playing?'■ PAUSE':'▶ PLAY'}</button>
          <div className="evo-step-actions" role="group"
            aria-label="Advance the world clock">
            <button onClick={()=>step(1)} title="Advance one simulated day">+DAY</button>
            <button onClick={()=>step(30)} title="Advance thirty simulated days">+MONTH</button>
            <button onClick={()=>step(365)} title="Advance one simulated year">+YEAR</button>
            <details className="evo-more-steps">
              <summary aria-label="More time advances">MORE +</summary>
              <div className="evo-extra-steps">
                <button onClick={()=>step(7)}>+WEEK</button>
                <button onClick={()=>step(3650)} title="Advance ten years">+10Y</button>
              </div>
            </details>
          </div>
          <div className="evo-pace-panel" role="group" aria-label="Playback pace">
            <small>PACE</small>
            {TIME_RATES.map(rate=><button key={rate.id}
              className={timeRate===rate.id?'is-on':''}
              aria-pressed={timeRate===rate.id}
              title={rate.label}
              onClick={()=>setTimeRate(rate.id)}>
                {rate.id==='sixteen'?'16×':rate.id==='four'?'4×':
                  rate.id==='season'?'SEASON':rate.id.toUpperCase()}
              </button>)}
          </div>
        </div>
      </header>
      <section className="evo-stats" aria-label="Live world statistics">
        <div className="evo-stat big"><small>WORLD DATE</small>
          <strong>Year {world.year}</strong>
          <span>{MONTH_NAMES[calendarDate(world).month]} {calendarDate(world).day}
            {' · '}Seed {world.settings.seed}</span></div>
        <div className="evo-stat"><small>LIVING PEOPLE</small>
          <strong>{format(world.agents.length)}</strong>
          <span>{latest?.births??0} births · {latest?.deaths??0} deaths this year</span>
        </div>
        <div className="evo-stat"><small>SETTLEMENTS</small>
          <strong>{world.settlements.length}</strong><span>Founded by local groups</span></div>
        <details className="evo-extra-stats">
          <summary>✧ MORE WORLD STATISTICS <span>HYBRIDS · BONDS · EXPEDITIONS · DISCOVERIES</span></summary>
          <div className="evo-extra-stat-grid">
        <div className="evo-stat"><small>LIVING HYBRIDS</small>
          <strong>{hybrids}</strong><span>Mixed-species ancestry</span></div>
        <div className="evo-stat"><small>PARTNERSHIPS</small>
          <strong>{partnerships}</strong><span>Active mutual bonds</span></div>
        <div className="evo-stat"><small>ON EXPEDITION</small>
          <strong>{explorers}</strong><span>Exploring beyond home biomes</span></div>
        <div className="evo-stat"><small>KNOWN DISCOVERIES</small>
          <strong>{world.knowledge?.firsts.length??0}</strong>
          <span><button onClick={()=>navigate('knowledge')}>Explore the knowledge codex ↗</button></span>
        </div>
          </div>
        </details>
      </section>
      <div className="evo-playground-layout">
        <section className="evo-map-card">
          <div className="evo-card-heading evo-map-heading">
            <div><strong>◈ LIVING WORLD</strong>
              <small>{world.width} × {world.height} TILES · {world.settings.size.toUpperCase()} WORLD</small>
            </div>
            <div className="evo-map-actions">
              <button className={'evo-follow-camera'+(followId!==null?' is-on':'')}
                aria-pressed={followId!==null} disabled={!agent}
                title={followId!==null?'Stop following the selected person':
                  'Follow the selected person while they travel'}
                onClick={()=>{
                  if(followId!==null){setFollowId(null);return;}
                  if(!agent)return;
                  setFollowId(agent.id);setZoom(v=>Math.max(mapView==='depth'?2:3,v));
                  setMapFocus(agent.id);
                }}>{followId!==null?'◉ TRACKING':'⌖ FOLLOW'}</button>
              <button onClick={()=>setShowDiagnostics(v=>!v)}
                aria-pressed={showDiagnostics}
                title="Toggle simulation and rendering diagnostics">
                {showDiagnostics?'◉ STATS':'◌ STATS'}
              </button>
              <button onClick={()=>setZoom(v=>boundedMapZoom(v-.5))}
                disabled={zoom<=1} title="Zoom out">−</button>
              <button onClick={()=>setZoom(1)} title="Reset map zoom to 1×">⌖ FIT</button>
              <button onClick={()=>setZoom(v=>boundedMapZoom(v+.5))}
                disabled={zoom>=8} title="Zoom in">+</button>
            </div>
          </div>
          <div className="evo-map-toolbar evo-map-commandbar">
            <div className="evo-view-switch" role="group" aria-label="Map perspective">
              <button className={mapView==='depth'?'is-on':''}
                aria-pressed={mapView==='depth'}
                onClick={()=>{setMapView('depth');
                  setFollowId(null);setZoom(1.5);}}>
                ◈ 2.5D WORLD</button>
              <button className={mapView==='overhead'?'is-on':''}
                aria-pressed={mapView==='overhead'}
                onClick={()=>{setMapView('overhead');setZoom(1);}}>
                ▦ OVERHEAD</button>
            </div>
            <div className="evo-layer-chips" role="group" aria-label="Map layers">
              {([['terrain','WORLD'],['resources','FOOD'],
                ['deposits','RESOURCES'],['elevation','HEIGHT'],
                ['watersheds','RIVERS']] as const).map(([key,label])=>
                <button key={key} className={overlay===key?'is-on':''}
                  aria-pressed={overlay===key} onClick={()=>setOverlay(key)}
                  title={key==='watersheds'?'Watersheds & rivers':
                    key==='terrain'?'Biomes':key==='elevation'?
                    'Elevation & contours':key==='deposits'?
                    'Trees & ore deposits':'Food levels'}>
                  {label}</button>)}
            </div>
            <div className="evo-toolbar-drawers">
              {mapView==='depth'&&<button className={advancedView?'is-on':''}
                aria-expanded={advancedView} aria-controls="evo-camera-panel"
                onClick={()=>setAdvancedView(v=>!v)}>◌ CAMERA</button>}
              <button className={toolPanel?'is-on':''}
                aria-expanded={toolPanel} aria-controls="evo-world-tools"
                onClick={()=>setToolPanel(v=>!v)}>
                ✧ WORLD TOOLS{brush.kind==='inspect'?'':' • ACTIVE'}
              </button>
            </div>
          </div>
          {mapView==='depth'&&advancedView&&
            <div id="evo-camera-panel" className="evo-map-options evo-camera-panel">
              <div className="evo-option-group">
                <small>RELIEF</small>
                {([['natural','NATURAL'],['dramatic','DRAMATIC'],
                  ['monumental','MONUMENTAL']] as const).map(([key,label])=>
                  <button key={key} className={reliefLevel===key?'is-on':''}
                    aria-pressed={reliefLevel===key}
                    onClick={()=>setReliefLevel(key)}>{label}</button>)}
              </div>
              <div className="evo-option-group">
                <small>CAMERA TILT</small>
                {CAMERA_TILT_CHOICES.map(([key,label])=>
                  <button key={key} className={cameraPitch===key?'is-on':''}
                    aria-pressed={cameraPitch===key}
                    onClick={()=>setCameraPitch(key)}>{label}</button>)}
              </div>
              <div className="evo-option-group evo-orbit-controls" role="group"
                aria-label="Orbit camera controls">
                <small>ORBIT</small>
                <button aria-label="Rotate camera 45 degrees left"
                  title="Orbit left 45°"
                  onClick={()=>setOrbitYaw(yaw=>(yaw+315)%360)}>↶</button>
                <input id="evo-orbit" type="range" min="0" max="345" step="15"
                  aria-label="Camera rotation in degrees" value={orbitYaw}
                  onChange={e=>setOrbitYaw(Number(e.target.value))}/>
                <button aria-label="Rotate camera 45 degrees right"
                  title="Orbit right 45°"
                  onClick={()=>setOrbitYaw(yaw=>(yaw+45)%360)}>↷</button>
                <output htmlFor="evo-orbit">{orbitYaw}°</output>
                <button className="evo-orbit-reset"
                  aria-label="Reset camera orientation"
                  onClick={()=>{setOrbitYaw(0);setCameraPitch('classic');
                    setReliefLevel('dramatic');}}>RESET</button>
              </div>
            </div>}
          {toolPanel&&<div id="evo-world-tools"
            className="evo-map-options evo-world-tools-panel">
            <div className="evo-option-group">
              <small>MAP ACTION</small>
              <button className={brush.kind==='inspect'?'is-on':''}
                aria-pressed={brush.kind==='inspect'}
                onClick={()=>setBrush({kind:'inspect'})}>⌖ INSPECT</button>
              <button className={brush.kind==='food'?'is-on':''}
                aria-pressed={brush.kind==='food'}
                onClick={()=>setBrush({kind:'food'})}>✿ RESTORE FOOD</button>
            </div>
            <div className="evo-option-group">
              <small>ADD PEOPLE</small>
              {SPECIES.map(species=><button key={species}
                className={brush.kind==='spawn'&&brush.species===species?'is-on':''}
                aria-pressed={brush.kind==='spawn'&&brush.species===species}
                onClick={()=>setBrush({kind:'spawn',species})}>
                + {SPECIES_INFO[species].name.toUpperCase()}</button>)}
            </div>
            <div className="evo-option-group">
              <small>PAINT TERRAIN</small>
              {BIOMES.map(biome=><button key={biome}
                className={brush.kind==='terrain'&&brush.biome===biome?'is-on':''}
                aria-pressed={brush.kind==='terrain'&&brush.biome===biome}
                onClick={()=>setBrush({kind:'terrain',biome})}>
                {BIOME_INFO[biome].name.toUpperCase()}</button>)}
            </div>
            <p>Choose a tool, then click a world tile. Inspect is the default;
              terrain edits and spawning remain entirely optional.</p>
          </div>}
          <MapLayerLegend overlay={overlay}/>
          {overlay==='terrain'&&<div className="evo-season-visual" role="note"
            aria-label="Visual world season">
            <span className="evo-season-icon" aria-hidden="true">✦</span>
            <span><strong>{sceneAtmosphere(world.dayOfYear??0).season.toUpperCase()}</strong>
              <small>Seasonal light · layered scenery · pixel atmosphere</small></span>
            <span className="evo-season-dot" aria-hidden="true"/>
          </div>}
          {!hasPhysicalTerrain(world)&&<div className="evo-terrain-upgrade" role="note">
            <div><strong>CLASSIC TERRAIN RULES</strong>
              <span>This older world keeps its original routes and farming.
                Enable v2.0 slope and elevation effects whenever you’re ready.</span></div>
            <button onClick={()=>{
              if(!window.confirm('Enable v2.0 physical terrain for this world? '+
                'Your saved people and history stay intact, but future travel, '+
                'farming, and building decisions will respond to elevation.'))return;
              setWorld(w=>enablePhysicalTerrain(w));
              setNotice('Physical terrain enabled. Your existing world was preserved.');
            }}>ENABLE PHYSICAL TERRAIN</button>
          </div>}
          <div className="evo-map-scroll" ref={mapScrollRef}>
            {mapView==='overhead'?<WorldCanvas world={world} brush={brush}
              overlay={overlay} zoom={zoom}
              speed={speed} followId={followId} onFollowPosition={centerCamera}
              selected={displayed} onSelect={chooseTile} onEdit={brushAt}
              onDiagnostics={showDiagnostics?setCanvasDiagnostics:undefined}/>:
              <DepthCanvas world={world} brush={brush} overlay={overlay}
                zoom={zoom} speed={speed} selected={displayed} onSelect={chooseTile}
                onEdit={brushAt} relief={RELIEF_LEVELS[reliefLevel]}
                camera={{yaw:orbitYaw,pitch:CAMERA_PITCHES[cameraPitch]}}
                followId={followId} onFollowPosition={centerCamera}/>} 
          </div>
          {[0,world.width-1,world.width*(world.height-1),
            world.tiles.length-1].some(i=>world.tiles[i]?.biome!=='water')&&
            <div className="evo-terrain-upgrade" role="note">
              <strong>LEGACY RECTANGULAR WORLD</strong>
              <span>This saved world's original geography is preserved.
                Irregular coastlines appear in newly generated worlds.</span>
              <button onClick={()=>navigate('creator')}>CREATE AN ISLAND WORLD</button>
            </div>}
          <div className="evo-map-footer">
            <div className="evo-species-legend">
              {SPECIES.map(s=><span key={s}>
                <i style={{background:SPECIES_INFO[s].color}}/>{SPECIES_INFO[s].name}
                <b>{counts[s]}</b>
              </span>)}
            </div>
            <span>⌂ SETTLEMENTS · CLICK TO INSPECT · {brush.kind==='inspect'?
              'ARROW KEYS TO MOVE SELECTION':'CLICK TO APPLY TOOL'} ·
              {mapView==='overhead'?'LEFT-DRAG TO PAN · PINCH TO ZOOM · TWO-FINGER SCROLL TO PAN · FOLLOW A SELECTED PERSON':
                'LEFT-DRAG TO PAN · RIGHT-DRAG TO ORBIT · PINCH TO ZOOM · TWO-FINGER SCROLL TO PAN'}</span>
          </div>
          {showDiagnostics&&<section className="evo-diagnostics" role="status"
            aria-label="WorldForge performance diagnostics">
            <strong>PERFORMANCE & WORLD HEALTH</strong>
            <span>SIMULATION: {workerMode==='worker'?'Background worker':
              workerMode==='starting'?'Initializing':'Main-thread fallback'}
              {' · '+(lastSimulationMs.current===null?'not sampled':
                lastSimulationMs.current.toFixed(1)+' ms / tick')}</span>
            <span>WORKER MESSAGE: {lastTransferMs.current===null?'not sampled':
              lastTransferMs.current.toFixed(1)+' ms'}
              {' · Frame: '+(canvasDiagnostics?.frameMs.toFixed(1)??'—')+' ms'}</span>
            <span>PEOPLE: {world.agents.length.toLocaleString()}
              {' · DRAWN SPRITES: '+(canvasDiagnostics?.drawn??'—')}
              {' · SETTLEMENTS: '+world.settlements.length}</span>
            <small>Camera and visibility only change rendering, not NPC
              behavior. Worker ticks are applied in order; stale edits win.</small>
          </section>}
          {notice&&<div className="evo-notice" role="status">{notice}</div>}
        </section>
        <aside className="evo-world-sidebar">
          <section className="evo-section-card evo-inspector-card">
            <div className="evo-card-heading">
              <strong>◉ WORLD INSPECTOR</strong>
              <span>{displayed?'X '+displayed.x+' · Y '+displayed.y:'NO SELECTION'}</span>
            </div>
            {!displayed||!tile?<div className="evo-inspector-empty">
              <div>⌖</div>
              <strong>CLICK SOMEWHERE IN THE WORLD</strong>
              <p>Choose a person, settlement, or terrain tile to inspect it.
                World Tools opens optional editing actions.</p>
            </div>:<>
              <div className="evo-biome-info">
                <span className="evo-biome-swatch"
                  style={{background:BIOME_INFO[tile.biome].color}}/>
                <div><strong>{BIOME_INFO[tile.biome].name}</strong>
                  <small>Food available: {tile.food.toFixed(1)} units
                    {altitude!==null?' · Elevation '+altitude+'/255':''}</small></div>
              </div>
              {hasPhysicalTerrain(world)&&displayed&&<div className="evo-biome-info">
                <span className="evo-biome-swatch" style={{background:'#c7a879'}}/>
                <div><strong>PHYSICAL TERRAIN</strong>
                  <small>Steepest adjacent rise/drop: {Math.round(terrainRuggedness(
                    world,displayed.y*world.width+displayed.x))} height units</small>
                  <small>Farm suitability: {Math.round(terrainFarmFactor(
                    world,displayed.y*world.width+displayed.x)*100)}% · slopes
                    affect travel, farming and building.</small>
                </div>
              </div>}
              {drainage&&<div className="evo-biome-info">
                <span className="evo-biome-swatch" style={{background:'#4aadd0'}}/>
                <div><strong>{tile.biome==='water'?'Existing water body':
                  streamTier===3?'River':streamTier===2?'Stream':
                    streamTier===1?'Creek':'Drainage slope'}</strong>
                  <small>Contributing area: {drainage.catchment[drainageIndex]}
                    {' tiles · drains to '+(receiverIsWater?'existing water':'world edge')}
                    {drainage.pondDepth[drainageIndex]>=6?
                      ' · Potential depression':''}</small>
                  <small>Creek runoff can improve farm yields in v2.0 worlds.
                    Ships still require real water tiles.</small>
                </div>
              </div>}
              {resource&&<div className="evo-biome-info">
                <span className="evo-biome-swatch" style={{background:
                  RESOURCE_COLORS[resource.kind]}}/>
                <div><strong>{RESOURCE_LABELS[resource.kind]}</strong>
                  <small>{resource.amount.toFixed(1)} / {resource.capacity.toFixed(1)}
                    {' units · renewable deposit'}</small></div>
              </div>}
              {ancientSite&&<div className="evo-selected-settlement">
                <strong>✧ {ancientSite.name??'ANCIENT '+ancientSite.kind.toUpperCase()+' #'+ancientSite.id}</strong>
                <span>Risk {ancientSite.danger}/100 ·
                  {' '}{ancientSite.visits??ancientSite.visitors.length} previous expeditions</span>
                {ancientSite.origin==='collapsed'&&<span>
                  {ancientSite.culture} settlement, abandoned in year {ancientSite.collapsed}.
                  {' '}{ancientSite.lostTopics?.length??0} archived ideas survive.</span>}
                <span>Explorers may uncover forgotten wisdom or be injured.
                  Knowledge is never guaranteed.</span>
                <button onClick={()=>navigate('knowledge')}>⌖ OPEN EXPEDITION JOURNAL ↗</button>
              </div>}
              {agent?<div className="evo-individual">
                <div className="evo-individual-title">
                  <PixelPortrait person={agent} compact
                    name={personName(world,world.lineage.find(r=>r.id===agent.id)??agent)}/>
                  <div><strong>{personName(world,world.lineage.find(r=>r.id===agent.id)??agent)}</strong>
                    <small>#{agent.id} · {agent.age} years old · Born year {agent.born}
                      · Generation {agent.generation}</small></div>
                </div>
                <div className="evo-inspector-heritage">
                  <strong>{ancestryLabel(agent.ancestry)}</strong>
                  <div className="evo-ancestry-bar" aria-label="Ancestry breakdown">
                    {SPECIES.map(s=><i key={s} style={{width:
                      (agent.ancestry[s]*100)+'%',
                      background:SPECIES_INFO[s].color}}/>)}
                  </div>
                  {hybridFraction(agent.ancestry)>.01&&<small>✧ MIXED ANCESTRY</small>}
                </div>
                <div className="evo-world-person-buttons">
                  <button onClick={()=>favoritePerson(agent.id)}
                    aria-label="Favorite individual"
                    aria-pressed={isPersonFavorite(world,agent.id)}>
                    {isPersonFavorite(world,agent.id)?'★ FOLLOWING':'☆ FAVORITE'}
                  </button>
                  <button onClick={()=>openPerson(agent.id)}>◉ PROFILE ↗</button>
                  <button className="evo-ancestry-open"
                    onClick={()=>focusPerson(agent.id)}>♡ FAMILY TREE ↗</button>
                  <button onClick={()=>navigate('powers')}>⚡ DIVINE POWERS ↗</button>
                </div>
                <div className="evo-vitals">
                  <label>ENERGY <b>{Math.round(agent.energy)}%</b>
                    <progress max="100" value={agent.energy}/></label>
                  <label>HEALTH <b>{Math.round(agent.health)}%</b>
                    <progress max="100" value={agent.health}/></label>
                </div>
                <RankProfile seed={world.settings.seed} person={agent} compact/>
                <div className="evo-mind-status" aria-label="Autonomous mind">
                  <small>◈ CURRENT INTENTION</small>
                  <strong>{agent.mind?GOAL_LABELS[agent.mind.goal]:'Awakening'}</strong>
                  <p>{agent.mind?.reason??'This person will choose a goal next year.'}</p>
                </div>
                <div className="evo-individual-facts">
                  <span>Maturity <b>{Math.round(traitProfile(agent.ancestry).maturity)} years</b></span>
                  <span>Typical lifespan <b>{Math.round(traitProfile(agent.ancestry).lifespan)} years</b></span>
                  <span>Partner <b>{agent.partnerId?'#'+agent.partnerId:'None'}</b></span>
                  <span>Life stage <b>{lifeStage(agent)}</b></span>
                  {agent.development?.career&&<span>Career <b>
                    {CAREER_LABELS[agent.development.career]}</b></span>}
                  {agent.development?.householdId&&<span>Household <b>
                    #{agent.development.householdId}</b></span>}
                  {agent.development&&<span>Places explored <b>
                    {agent.development.knownBiomes.length} biomes</b></span>}
                  <span>Curiosity <b>{agent.genes.curiosity.toFixed(2)}×</b></span>
                  <span>Vigor <b>{agent.genes.vigor.toFixed(2)}×</b></span>
                  <span>Physical strength <b>{traitProfile(agent.ancestry).strength.toFixed(2)}×</b></span>
                  <span>Travel speed <b>{traitProfile(agent.ancestry).speed.toFixed(2)}×</b></span>
                  <span>Learned discoveries <b>{agent.knowledge?.length??0}</b></span>
                  {agent.parents&&<span>Parent IDs <b>{agent.parents.join(' + ')}</b></span>}
                </div>
                {!!agent.knowledge?.length&&<p className="evo-family-help">
                  Knowledge: {agent.knowledge.map(k=>TOPIC_INFO[k.topic].name).join(', ')}.
                </p>}
              </div>:<div className="evo-inspector-empty small">
                No individual currently occupies this tile.
              </div>}
              {settlement&&<div className="evo-selected-settlement">
                <strong>⌂ {settlement.name}</strong>
                <span>{SPECIES_INFO[settlement.species].name} ·
                  {settlementStage(settlement)} · Founded Y{settlement.founded}</span>
                <span>{settlement.population} nearby people · {settlement.stores.toFixed(0)} stores</span>
                <span>{settlement.infrastructure?.buildings.filter(b=>b.stage==='complete').length??0}
                  {' completed buildings · '+(settlement.infrastructure?.roads.length??0)+' road tiles'}</span>
                <span>{settlement.economy?.specialty?
                  SPECIALTY_LABELS[settlement.economy.specialty]:'Emerging economy'}
                  {' · '+(world.tradeRelations??[]).filter(r=>
                    (r.a===settlement.id||r.b===settlement.id)&&
                    r.completed>=3&&r.trust>=47).length+' trusted trade links'}</span>
                <button onClick={()=>openSettlement(settlement.id)}>⌂ VIEW LOCAL ECONOMY & CONSTRUCTION ↗</button>
              </div>}
            </>}
          </section>
          <section className="evo-section-card evo-world-actions">
            <div className="evo-card-heading"><strong>WORLD FILE</strong></div>
            <div className="evo-actions-buttons">
              <button onClick={()=>{setPlaying(false);downloadJson(world);}}>
                ⇩ EXPORT WORLD JSON
              </button>
              <button onClick={()=>fileRef.current?.click()}>⇧ IMPORT WORLD JSON</button>
              <input type="file" accept=".json,application/json" hidden ref={fileRef}
                onChange={importWorld}/>
              <button onClick={reset}>↺ REPLAY THIS SEED</button>
            </div>
            <p>Changes autosave in this browser. Export JSON for portable backups.
              Replay resets the simulation to its original conditions.</p>
          </section>
          <section className="evo-section-card evo-latest-events">
            <div className="evo-card-heading"><strong>RECENT CHRONICLE</strong>
              <button onClick={()=>navigate('history')}>VIEW ALL ↗</button></div>
            {world.events.slice(-4).reverse().map(e=><div key={e.id} className="evo-event-small">
              <span>Y{e.year}</span><p>{e.message}</p>
            </div>)}
          </section>
        </aside>
      </div>
      <div className="evo-future-note">
        <strong>V2.3.9: EXPLORE YOUR WORLD</strong>
        <span>People keep their small in-world proportions when zooming closer,
          while terrain and structures retain their illustrated 2.5D detail.
          Left-drag to move around without inspecting by accident; right-drag
          to orbit, pinch to zoom and scroll with two fingers to pan.
          Mortal choices and simulation rules are unchanged.</span>
      </div>
    </main>}
  </div>;
}
