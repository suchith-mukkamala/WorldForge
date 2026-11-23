import {useEffect,useMemo,useRef,useState} from 'react';
import {atlasBuildingBounds} from './atlasBuildingArt';
import {AtlasDetailCanvas,type AtlasDetailPatch} from './AtlasDetailCanvas';
import type {AtlasDetailSource} from './atlasDetailTypes';
import {cropTileAt,type RasterCrop} from './atlasRaster';
import {blockRealmFord} from './blockModels';
import {blockSceneryArt,depthBlockView,paintBlockContact,paintBlockScenery,paintPlacedBlock} from './blockScenery';
import {interpolatedGroundHeight,type DepthCamera} from './depthProjection';
import type {DepthPicking} from './depthTerrain';
import type {Point} from './motion';
import {RealmAmbientCanvas} from './RealmAmbientCanvas';
import {RealmAtlasResident,REALM_ATLAS_PERSON_HEIGHT,REALM_ATLAS_PERSON_UNIT} from './RealmAtlasResident';
import {realmEffectLift,type RealmGlimmer,type RealmTrack} from './realmAmbient';
import {prepareRealmRelief,rasterizeRealm,type RealmRasterResult} from './realmRelief';
import {realmFormationUnit,realmScenery} from './realmScenery';
import {realmPropAt} from './realmSceneryArt';
import {realmWildlife} from './realmWildlife';
import {seaNeighbors,seaPoint} from './shipSave';
import {realmDepthPoint,type RealmProjection} from './stackedProjection';
import {RealmBiome,realmFordOpen,type RealmMap,type RealmResident} from './underworld';

type Job={map:RealmMap;projection:RealmProjection;camera:DepthCamera;key:string};
type Displayed={map:RealmMap;key:string;hit:DepthPicking;scenery:ReturnType<typeof prepareScenery>};
const frames:{map:RealmMap;key:string;result:RealmRasterResult}[]=[];
const maxCacheBytes=48*1024*1024;
let cacheBytes=0;
const bytes=({pixels,hit}:RealmRasterResult)=>pixels.byteLength+hit.ids.byteLength;
const sameView=(a:Pick<Job,'map'|'key'>|undefined,b:Pick<Job,'map'|'key'>)=>
  a?.map===b.map&&a.key===b.key;

function cachedFrame(job:Job){
  const index=frames.findIndex(frame=>sameView(frame,job));
  if(index<0)return;
  const [frame]=frames.splice(index,1);
  frames.push(frame);
  return frame.result;
}

function saveFrame(job:Job,result:RealmRasterResult){
  while(frames.length&&(cacheBytes+bytes(result)>maxCacheBytes||frames.length>=6))
    cacheBytes-=bytes(frames.shift()!.result);
  frames.push({map:job.map,key:job.key,result});
  cacheBytes+=bytes(result);
}

/** One raster can run at a time. Intermediate camera requests can be dropped
 * while the last complete frame remains on screen. */
function createRenderer(show:(job:Job,result:RealmRasterResult)=>void){
  let worker:Worker|undefined,workerUnavailable=false,workerMap:RealmMap|undefined;
  let requested:Job|undefined,queued:Job|undefined,active:{id:number;job:Job}|undefined;
  let pendingFrame=0,nextId=0,prepared:ReturnType<typeof prepareRealmRelief>|undefined;
  function finish(result:RealmRasterResult){
    if(active?.id!==result.id)return;
    const {job}=active;
    active=undefined;
    saveFrame(job,result);
    if(sameView(requested,job))show(job,result);
    start();
  }
  function fallback(){
    worker?.terminate();worker=undefined;workerUnavailable=true;workerMap=undefined;
    if(active&&sameView(requested,active.job))queued??=active.job;
    active=undefined;
    start();
  }
  function start(){
    if(active||!queued)return;
    const job=queued;
    queued=undefined;
    const cached=cachedFrame(job);
    if(cached){show(job,cached);return;}
    const {map,projection}=job,id=++nextId;
    active={id,job};
    if(workerUnavailable||typeof Worker==='undefined'){
      pendingFrame=requestAnimationFrame(()=>{
        if(prepared?.map!==map)prepared=prepareRealmRelief(map);
        finish(rasterizeRealm({id,projection},prepared));
      });
      return;
    }
    try{
      if(!worker){
        worker=new Worker(new URL('./realmRelief.worker.ts',import.meta.url),{type:'module'});
        worker.onmessage=({data}:MessageEvent<RealmRasterResult>)=>finish(data);
        worker.onerror=fallback;
        worker.onmessageerror=fallback;
      }
      worker.postMessage({id,projection,map:workerMap===map?undefined:map});
      workerMap=map;
    }catch{fallback();}
  }
  return {
    request(job:Job){
      requested=job;
      const cached=cachedFrame(job);
      if(cached){queued=undefined;show(job,cached);return;}
      queued=sameView(active?.job,job)?undefined:job;
      start();
    },
    dispose(){
      worker?.terminate();
      cancelAnimationFrame(pendingFrame);
      active=undefined;queued=undefined;requested=undefined;
    },
  };
}

function visibleGround(point:Point,index:number,hit:DepthPicking,sx:number,sy:number){
  const x=Math.floor(point.x*sx),y=Math.floor(point.y*sy);
  return x>=0&&x<hit.width&&y>=0&&y<hit.height&&hit.ids[y*hit.width+x]===index+1;
}

function realmPropPoint(map:RealmMap,projection:RealmProjection,cell:number,dx=0,dy=0){
  const {x,y}=seaPoint(map.width,cell),kind=map.biomes[cell];
  const height=map.heights[cell];
  const at=kind===RealmBiome.sea||kind===RealmBiome.lava?height:
    height*.54+interpolatedGroundHeight(map.heights,map.width,map.height,x+dx,y+dy)*.46;
  return realmDepthPoint(projection,x+dx,y+dy,at);
}

function realmDrawOrder(cell:number,width:number,projection:RealmProjection){
  return cell%width*projection.east.y+Math.floor(cell/width)*projection.south.y;
}

function prepareScenery({map,projection,camera}:Job,hit:DepthPicking){
  const sx=hit.width/projection.width,sy=hit.height/projection.height;
  const view=depthBlockView(camera),scale=projection.blockScale;
  const scene=realmScenery(map);
  const sites=[...scene.formations.keys(),...map.houses.keys(),...scene.gates.keys(),...scene.docks.keys()];
  const scenery=sites.flatMap(i=>{
    const prop=realmPropAt(map,scene,i);
    if(!prop)return [];
    const at=realmPropPoint(map,projection,i,prop.dx,prop.dy);
    if(!visibleGround(at,i,hit,sx,sy))return [];
    const unit=scale*prop.unit,sprite=blockSceneryArt(prop.model,at,view,unit);
    if(!sprite)return [];
    return [{at,unit,model:prop.model,sprite,bounds:atlasBuildingBounds(sprite),
      order:realmDrawOrder(i,map.width,projection)}];
  });
  return scenery.sort((a,b)=>a.order-b.order);
}

function paintScenery(ctx:CanvasRenderingContext2D,projection:RealmProjection,camera:DepthCamera,
  hit:DepthPicking,scenery:Displayed['scenery'],crop?:RasterCrop){
  const sx=crop?.density??hit.width/projection.width,sy=crop?.density??hit.height/projection.height;
  const view=depthBlockView(camera);
  ctx.setTransform(sx,0,0,sy,-(crop?.left??0),-(crop?.top??0));
  ctx.imageSmoothingEnabled=false;
  for(const {at,unit,model,sprite,bounds} of scenery){
    if(crop){
      const pad=unit*4,left=crop.left/sx,top=crop.top/sy;
      if(bounds.right+pad<left||bounds.left-pad>left+crop.width/sx||
        bounds.bottom+pad<top||bounds.top-pad>top+crop.height/sy)continue;
    }
    paintBlockContact(ctx,model,at,view,unit);
    paintPlacedBlock(ctx,sprite);
  }
}

function reliefGlimmers(map:RealmMap,projection:RealmProjection,camera:DepthCamera,hit:DepthPicking):RealmGlimmer[]{
  const scene=realmScenery(map),sx=hit.width/projection.width,sy=hit.height/projection.height;
  const rise=depthBlockView(camera).rise*projection.blockScale;
  const cap={spore:36,spark:34,foam:38,steam:24,gleam:32,bat:14};
  const count={spore:0,spark:0,foam:0,steam:0,gleam:0,bat:0};
  const total={...count};
  for(const effect of scene.effects)total[effect.kind]++;
  const projected:RealmGlimmer[]=[];
  for(const {kind,cell,phase} of scene.effects){
    const stride=Math.max(1,Math.ceil(total[kind]/cap[kind]));
    if(count[kind]++%stride)continue;
    const form=scene.formations.get(cell),at=realmPropPoint(map,projection,cell,form?.dx,form?.dy);
    if(!visibleGround(at,cell,hit,sx,sy))continue;
    const lift=form?realmEffectLift(kind)*realmFormationUnit(form.size)*rise:0;
    projected.push({kind,phase,x:at.x+(phase-.5)*5,y:at.y-lift});
  }
  const seep=map.water?.fall;
  if(seep){
    const bank=seaPoint(map.width,seep.bank),outlet=seaPoint(map.width,seep.outlet);
    const dx=outlet.x-bank.x,dy=outlet.y-bank.y;
    const p=realmPropPoint(map,projection,seep.bank);
    const drop=map.heights[seep.bank]-map.heights[seep.outlet];
    if(drop>0&&(dx&&dx===projection.frontX||dy&&dy===projection.frontY)&&
      visibleGround(p,seep.bank,hit,sx,sy)){
      const lip=realmPropPoint(map,projection,seep.bank,dx*.47,dy*.47);
      projected.push({kind:'cascade',phase:0,...lip,dx:0,dy:drop*projection.rise,flow:seep.flow});
    }
  }
  return projected;
}

function reliefWildlife(map:RealmMap,projection:RealmProjection,hit:DepthPicking):RealmTrack[]{
  const sx=hit.width/projection.width,sy=hit.height/projection.height;
  return realmWildlife(map).flatMap(({cells,kind,phase})=>{
    const points=cells.map(cell=>{
      const point=realmPropPoint(map,projection,cell);
      return visibleGround(point,cell,hit,sx,sy)?point:null;
    });
    return points.some((point,i)=>point&&points[i+1])?[{kind,phase,points}]:[];
  });
}

function paintFords(canvas:HTMLCanvasElement,projection:RealmProjection,camera:DepthCamera,
  map:RealmMap,hit:DepthPicking,open:number[]){
  if(canvas.width!==hit.width)canvas.width=hit.width;
  if(canvas.height!==hit.height)canvas.height=hit.height;
  const ctx=canvas.getContext('2d');
  if(!ctx)return;
  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0,0,hit.width,hit.height);
  const sx=hit.width/projection.width,sy=hit.height/projection.height;
  const view=depthBlockView(camera);
  ctx.setTransform(sx,0,0,sy,0,0);
  const dry=(i:number)=>i>=0&&map.biomes[i]!==RealmBiome.lava&&map.biomes[i]!==RealmBiome.sea;
  for(const i of open){
    const {x,y}=seaPoint(map.width,i),point=realmDepthPoint(projection,x,y,map.heights[i]);
    if(!visibleGround(point,i,hit,sx,sy))continue;
    const [,east,,west]=seaNeighbors(i,map.width,map.biomes.length);
    paintBlockScenery(ctx,blockRealmFord(dry(east)&&dry(west)),point,view,projection.blockScale*.59);
  }
}

export function RealmReliefCanvas({map,projection,camera,day,onSelect,selected,showSelection=true,residents,zoom=1}:{
  map:RealmMap;projection:RealmProjection;camera:DepthCamera;day:number;
  onSelect:(cell:number)=>void;selected?:number;showSelection?:boolean;residents?:readonly RealmResident[];zoom?:number;
}){
  const raster=useRef<HTMLCanvasElement>(null),fords=useRef<HTMLCanvasElement>(null);
  const sharp=useRef<AtlasDetailPatch>(undefined);
  const renderer=useRef<ReturnType<typeof createRenderer>>(null);
  const [displayed,setDisplayed]=useState<Displayed>(),[waiting,setWaiting]=useState(false);
  const key=JSON.stringify([projection,camera]);
  const current=sameView(displayed,{map,key});
  const source=useMemo<AtlasDetailSource|undefined>(()=>zoom>=7&&current?
    {kind:'underworld',map,projection,camera}:undefined,[map,key,current,zoom>=7]);
  const openFords=useMemo(()=>[...map.fords].filter(i=>realmFordOpen(map,i,day)),[map,day]);
  const fordKey=openFords.join(',');
  const shown=!!displayed;
  const glimmers=useMemo(()=>current&&displayed?reliefGlimmers(map,projection,camera,displayed.hit):[],
    [current,displayed]);
  const tracks=useMemo(()=>current&&displayed?reliefWildlife(map,projection,displayed.hit):[],[current,displayed]);

  useEffect(()=>{
    const active=createRenderer((job,result)=>{
      const canvas=raster.current,ctx=canvas?.getContext('2d');
      if(!canvas||!ctx)return;
      const {hit,pixels}=result;
      if(canvas.width!==hit.width)canvas.width=hit.width;
      if(canvas.height!==hit.height)canvas.height=hit.height;
      ctx.putImageData(new ImageData(new Uint8ClampedArray(pixels.buffer),hit.width,hit.height),0,0);
      const scenery=prepareScenery(job,hit);
      paintScenery(ctx,job.projection,job.camera,hit,scenery);
      setDisplayed({map:job.map,key:job.key,hit,scenery});
    });
    renderer.current=active;
    return ()=>{active.dispose();renderer.current=null;};
  },[]);
  useEffect(()=>{renderer.current?.request({map,projection,camera,key});},[map,key]);
  useEffect(()=>{
    if(shown)return;
    const timer=window.setTimeout(()=>setWaiting(true),250);
    return ()=>window.clearTimeout(timer);
  },[shown]);
  useEffect(()=>{
    if(current&&displayed&&fords.current)paintFords(fords.current,projection,camera,map,displayed.hit,openFords);
  },[displayed,current,fordKey]);

  const selectedPoint=selected===undefined?undefined:seaPoint(map.width,selected);
  const pin=selectedPoint&&realmDepthPoint(projection,selectedPoint.x,selectedPoint.y,map.heights[selected!]);
  return <>
    <canvas ref={raster} className="strata-floor" role="grid" tabIndex={0}
      aria-label="Underworld relief with raised rock, towns, and lava rivers"
      data-ready={shown||undefined} data-current={current||undefined} onClick={event=>{
        if(!current||!displayed)return;
        const {hit}=displayed,bounds=event.currentTarget.getBoundingClientRect();
        const x=Math.floor((event.clientX-bounds.left)/bounds.width*hit.width);
        const y=Math.floor((event.clientY-bounds.top)/bounds.height*hit.height);
        if(x<0||y<0||x>=hit.width||y>=hit.height)return;
        const detail=sharp.current;
        const i=(detail&&detail.source===source?cropTileAt(detail.frame.crop,detail.frame.hit,{
          x:(event.clientX-bounds.left)/bounds.width*projection.width,
          y:(event.clientY-bounds.top)/bounds.height*projection.height,
        }):undefined)??hit.ids[y*hit.width+x]-1;
        if(i>=0&&i<map.biomes.length)onSelect(i);
      }} onKeyDown={event=>{
        if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key))return;
        event.preventDefault();
        const p=selectedPoint??{x:map.width>>1,y:map.height>>1};
        const x=Math.max(0,Math.min(map.width-1,p.x+Number(event.key==='ArrowRight')-Number(event.key==='ArrowLeft')));
        const y=Math.max(0,Math.min(map.height-1,p.y+Number(event.key==='ArrowDown')-Number(event.key==='ArrowUp')));
        onSelect(y*map.width+x);
      }}/>
    <AtlasDetailCanvas width={projection.width} height={projection.height}
      baseDensity={displayed?displayed.hit.width/projection.width:1.55} source={source} onPatch={patch=>{
        sharp.current=patch;
        if(!patch||!displayed)return;
        const {ctx,frame:{bitmap,crop}}=patch;
        ctx.setTransform(1,0,0,1,0,0);ctx.drawImage(bitmap,0,0);
        paintScenery(ctx,projection,camera,displayed.hit,displayed.scenery,crop);
      }}/>
    {map.fords.size>0&&<canvas ref={fords} className="strata-fords" aria-hidden="true"
      hidden={!current} data-crossings={fordKey}/>}
    <RealmAmbientCanvas points={glimmers} tracks={tracks} width={projection.width} height={projection.height}
      unit={projection.blockScale} hidden={!current}/>
    {current&&displayed&&residents?.map(resident=>{
      const p=realmPropPoint(map,projection,resident.index),{hit,scenery}=displayed;
      if(!visibleGround(p,resident.index,hit,hit.width/projection.width,hit.height/projection.height))return null;
      const unit=REALM_ATLAS_PERSON_UNIT*projection.blockScale;
      const depth=realmDrawOrder(resident.index,map.width,projection);
      const top=p.y-REALM_ATLAS_PERSON_HEIGHT*projection.blockScale;
      const foreground=scenery.filter(({order,bounds})=>order>=depth&&
        bounds.right>p.x-unit*6&&bounds.left<p.x+unit*6&&bounds.bottom>top&&bounds.top<p.y+unit*3)
        .map(({sprite})=>sprite);
      return <RealmAtlasResident key={resident.id} resident={resident}
        point={{x:p.x/projection.width,y:p.y/projection.height}}
        scale={unit/projection.width}
        foreground={foreground.length?{at:p,unit,shapes:foreground}:undefined}/>;
    })}
    {showSelection&&pin&&<span className="strata-selection" aria-hidden="true"
      style={{left:pin.x/projection.width*100+'%',top:pin.y/projection.height*100+'%'}}/>}
    {waiting&&!shown&&<span className="strata-drawing" role="status">Drawing the Underworld relief…</span>}
  </>;
}
