import {useEffect,useMemo,useRef,useState} from 'react';
import {terrainHash} from './biomeGeneration';
import {blockRealmFord,blockRealmGrowth,blockRealmHouse} from './blockModels';
import {depthBlockView,paintBlockScenery} from './blockScenery';
import type {DepthCamera} from './depthProjection';
import type {DepthPicking} from './depthTerrain';
import type {Point} from './motion';
import {prepareRealmRelief,rasterizeRealm,type RealmRasterResult} from './realmRelief';
import {seaNeighbors,seaPoint} from './shipSave';
import {realmDepthPoint,type RealmProjection} from './stackedProjection';
import {RealmBiome,realmFordOpen,type RealmMap} from './underworld';

type Job={map:RealmMap;projection:RealmProjection;camera:DepthCamera;key:string};
type Displayed={map:RealmMap;key:string;hit:DepthPicking};
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

const decorations=new WeakMap<RealmMap,number[]>();
function realmDecorations(map:RealmMap){
  const cached=decorations.get(map);
  if(cached)return cached;
  const places=[...map.houses.keys()];
  for(let i=0;i<map.biomes.length;i++){
    const biome=map.biomes[i];
    if(biome!==RealmBiome.glowroot&&biome!==RealmBiome.crystal||map.roads.has(i)||map.houses.has(i))continue;
    if(terrainHash(i,87,map.seed)>.91)places.push(i);
  }
  decorations.set(map,places);
  return places;
}

function visibleGround(point:Point,index:number,hit:DepthPicking,sx:number,sy:number){
  const x=Math.floor(point.x*sx),y=Math.floor(point.y*sy);
  return x>=0&&x<hit.width&&y>=0&&y<hit.height&&hit.ids[y*hit.width+x]===index+1;
}

function paintScenery(ctx:CanvasRenderingContext2D,{map,projection,camera}:Job,hit:DepthPicking){
  const sx=hit.width/projection.width,sy=hit.height/projection.height;
  const view=depthBlockView(camera),scale=projection.blockScale;
  const order=(index:number)=>index%map.width*projection.east.y+
    Math.floor(index/map.width)*projection.south.y;
  const sites=[...realmDecorations(map)].sort((a,b)=>order(a)-order(b));
  ctx.setTransform(sx,0,0,sy,0,0);
  for(const i of sites){
    const {x,y}=seaPoint(map.width,i),p=realmDepthPoint(projection,x,y,map.heights[i]);
    if(!visibleGround(p,i,hit,sx,sy))continue;
    const house=map.houses.get(i),crystal=map.biomes[i]===RealmBiome.crystal;
    const model=house?blockRealmHouse(house.home==='ash-borne',i%7):blockRealmGrowth(crystal,i%4);
    paintBlockScenery(ctx,model,p,view,scale*(house?.65:.52));
  }
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

export function RealmReliefCanvas({map,projection,camera,day,onSelect,selected,showSelection=true}:{
  map:RealmMap;projection:RealmProjection;camera:DepthCamera;day:number;
  onSelect:(cell:number)=>void;selected?:number;showSelection?:boolean;
}){
  const raster=useRef<HTMLCanvasElement>(null),fords=useRef<HTMLCanvasElement>(null);
  const renderer=useRef<ReturnType<typeof createRenderer>>(null);
  const [displayed,setDisplayed]=useState<Displayed>(),[waiting,setWaiting]=useState(false);
  const key=JSON.stringify([projection,camera]);
  const current=sameView(displayed,{map,key});
  const openFords=useMemo(()=>[...map.fords].filter(i=>realmFordOpen(map,i,day)),[map,day]);
  const fordKey=openFords.join(',');
  const shown=!!displayed;

  useEffect(()=>{
    const active=createRenderer((job,result)=>{
      const canvas=raster.current,ctx=canvas?.getContext('2d');
      if(!canvas||!ctx)return;
      const {hit,pixels}=result;
      if(canvas.width!==hit.width)canvas.width=hit.width;
      if(canvas.height!==hit.height)canvas.height=hit.height;
      ctx.putImageData(new ImageData(new Uint8ClampedArray(pixels.buffer),hit.width,hit.height),0,0);
      paintScenery(ctx,job,hit);
      setDisplayed({map:job.map,key:job.key,hit});
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
        const i=hit.ids[y*hit.width+x]-1;
        if(i>=0&&i<map.biomes.length)onSelect(i);
      }} onKeyDown={event=>{
        if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key))return;
        event.preventDefault();
        const p=selectedPoint??{x:map.width>>1,y:map.height>>1};
        const x=Math.max(0,Math.min(map.width-1,p.x+Number(event.key==='ArrowRight')-Number(event.key==='ArrowLeft')));
        const y=Math.max(0,Math.min(map.height-1,p.y+Number(event.key==='ArrowDown')-Number(event.key==='ArrowUp')));
        onSelect(y*map.width+x);
      }}/>
    {map.fords.size>0&&<canvas ref={fords} className="strata-fords" aria-hidden="true"
      hidden={!current} data-crossings={fordKey}/>}
    {showSelection&&pin&&<span className="strata-selection" aria-hidden="true"
      style={{left:pin.x/projection.width*100+'%',top:pin.y/projection.height*100+'%'}}/>}
    {waiting&&!shown&&<span className="strata-drawing" role="status">Drawing the Underworld relief…</span>}
  </>;
}
