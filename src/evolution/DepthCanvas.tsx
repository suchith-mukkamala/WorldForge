import {useEffect,useRef} from 'react';
import type {KeyboardEvent,MouseEvent} from 'react';
import {BIOME_INFO,SPECIES_INFO,type Biome,type Brush,type World} from './engine';
import type {MapOverlay} from './WorldCanvas';
import {SEA_LEVEL,topographyForWorld} from './topography';
import {hydrologyForWorld} from './hydrology';
import {terrainDetailAt} from './terrainDetails';
import {woodlandCover,woodlandHabitat} from './woodland';
import {ATLAS_SEA,atlasRivers,atlasTerrainColors,occupiedScenery,
  paintRiverSegment,showAtlasScenery} from './atlasTerrain';
import {depthGroundHeight,depthTerrain,pickTerrainFace,projectedTerrainCorners,
  terrainRiverEdge,type DepthPicking} from './depthTerrain';
import {paintTradeRoutes} from './tradeRoutes';
import {visibleCoastTile} from './worldOutline';
import {isMultiIslandLayout} from './worldGeography';
import {paintDepthRoads,paintDepthSurfaceDetail,depthRoadSignature} from './depthWorldArt';
import {populationScene,renderedPopulation,
  type PopulationScene} from './populationVisibility';
import {buildingVisualScale,depthArtDetail,depthRenderDensity,depthSceneryDensity,
  paintDepthBuilding,paintDepthPerson,paintDepthTree,
  paintDepthSettlementHub,
  type DepthArtDetail,type PersonSpriteCache} from './depthSprites';
import {depthStructureSignature,uncrowdedDistrictBuildings,
  visibleDistrictBuildings} from './depthPerformance';
import {buildingTier,settlementStage,type Building} from './construction';
import type {Agent} from './engine';
import {mortalWorldPoint} from './spatialDetails';
import {updateAtmosphereLayer} from './sceneAtmosphere';
import {canAnimate,directionBetween,motionFrame,visualMotionDuration,
  type Facing,type Motion,type Point} from './motion';
import {createDepthProjector,DEFAULT_DEPTH_CAMERA,DEPTH_RISE,type DepthCamera} from './depthProjection';
import {atlasLevel} from './atlasMap';
import {atlasBuildingAt,cacheBuildingArt,paintAtlasBuilding,
  type AtlasBuilding,type BuildingArt} from './atlasBuildingArt';
import {paintAncientSite} from './pixelArt';

const BASINS=['#385e60','#4a6758','#536072','#637056',
  '#42637c','#6c695e','#456f68','#606d77'];
const PALETTE:Record<Biome,{top:string;right:string;left:string}>={
  plains:{top:'#7a9b75',right:'#426e5a',left:'#527d60'},
  forest:{top:'#36765f',right:'#204b47',left:'#286554'},
  mountain:{top:'#9ca9ad',right:'#495972',left:'#62778a'},
  cave:{top:'#667185',right:'#303b52',left:'#414c63'},
  wasteland:{top:'#a28182',right:'#624e63',left:'#795c6d'},
  volcanic:{top:'#a46a73',right:'#513e59',left:'#74465d'},
  water:{top:'#367c9b',right:'#1d4b72',left:'#285f83'},
};
const HEIGHT_COLORS=['#234966','#3b7182','#5d866b','#74936a',
  '#8c9a72','#b19f7c','#9b918b','#bcc1c4','#e8e7d9'];
type Pt={x:number;y:number};
type Projector=ReturnType<typeof createDepthProjector>;

function polygon(ctx:CanvasRenderingContext2D,hit:DepthPicking,
  points:readonly Pt[],color:string,index:number){
  ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);
  for(let i=1;i<points.length;i++)ctx.lineTo(points[i].x,points[i].y);
  ctx.closePath();ctx.fill();
  // Seal subpixel seams where two adjacent, anti-aliased faces touch.
  ctx.strokeStyle=color;ctx.lineWidth=.72;ctx.stroke();
  pickTerrainFace(hit,points,index);
}
function rockFace(ctx:CanvasRenderingContext2D,hit:DepthPicking,
  a:Pt,b:Pt,dropA:number,dropB:number,color:string,index:number,detail:boolean){
  if(dropA<=0&&dropB<=0)return;
  polygon(ctx,hit,[a,b,{x:b.x,y:b.y+dropB},{x:a.x,y:a.y+dropA}],color,index);
  if(detail&&Math.min(dropA,dropB)>=5){
    ctx.strokeStyle='rgba(238,221,181,.19)';ctx.lineWidth=.7;
    for(const fraction of [.38,.71]){
      ctx.beginPath();ctx.moveTo(a.x,a.y+dropA*fraction);
      ctx.lineTo(b.x,b.y+dropB*fraction);ctx.stroke();
    }
  }
}

const cross=(a:Pt,b:Pt,c:Pt)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
function paintSurface(ctx:CanvasRenderingContext2D,hit:DepthPicking,
  corners:readonly Pt[],center:Pt,color:string,index:number){
  if(corners.every((a,i)=>cross(a,corners[(i+1)%4],center)>=0&&
    cross(a,corners[(i+1)%4],corners[(i+2)%4])>=0)){
    polygon(ctx,hit,corners,color,index);
    return;
  }
  // A steep tile can fold in projection. Its four triangular slopes still
  // cover its true center and its boundary with each neighboring tile.
  for(let i=0;i<4;i++)polygon(ctx,hit,[corners[i],corners[(i+1)%4],center],color,index);
}
function tileColor(w:World,index:number,overlay:MapOverlay,height:number,
  drainage:ReturnType<typeof hydrologyForWorld>|null):string{
  const tile=w.tiles[index];
  if(overlay==='elevation')return HEIGHT_COLORS[tile.biome==='water'?0:
    Math.min(8,Math.floor(height/30))];
  if(overlay==='watersheds'&&drainage)return tile.biome==='water'?'#285d7a':
    BASINS[(drainage.basin[index]>>>0)%BASINS.length];
  if(overlay==='resources'&&tile.biome!=='water'){
    const fraction=tile.food/Math.max(1,
      BIOME_INFO[tile.biome].food*w.settings.resourceLevel);
    return fraction>.66?'#639b75':fraction>.32?'#b1a36b':'#a36a73';
  }
  return PALETTE[tile.biome].top;
}
type TreeSpriteCache=Map<string,HTMLCanvasElement>;
function paintCachedTree(ctx:CanvasRenderingContext2D,p:Pt,pine:boolean,
  variant:number,detail:DepthArtDetail,cache:TreeSpriteCache){
  const key=[pine,variant,detail].join(':');
  let sprite=cache.get(key);
  if(!sprite){
    sprite=document.createElement('canvas');
    sprite.width=64;sprite.height=64;
    const painter=sprite.getContext('2d');
    if(painter){painter.imageSmoothingEnabled=false;
      paintDepthTree(painter,{x:32,y:54},pine,variant,detail);}
    cache.set(key,sprite);
  }
  ctx.drawImage(sprite,Math.round(p.x)-32,Math.round(p.y)-54);
}

/** Static terrain is drawn rear-to-front, so even vast worlds can be rendered
 * in one inexpensive 2D canvas without allocating thousands of SVG nodes.
 */
function renderTerrain(w:World,overlay:MapOverlay,
  ctx:CanvasRenderingContext2D,hit:DepthPicking,
  projector:Projector,detailTier:DepthArtDetail,trees:TreeSpriteCache,
  sceneryDensity:number,showBuildings:boolean,street:boolean){
  const W=w.width,H=w.height,surface=depthTerrain(w),{heights}=surface;
  const drainage=overlay==='watersheds'||overlay==='terrain'?
    hydrologyForWorld(w):null;
  const multiShore=isMultiIslandLayout(w.settings.layout);
  const landscape=overlay==='terrain'||overlay==='trade'?atlasTerrainColors(w):null;
  const occupied=overlay==='terrain'&&showBuildings?occupiedScenery(w):null;
  const waterLinks=new Map<number,{other:number;tier:number;downstream:boolean}[]>();
  if(drainage)for(const {from,to,tier} of atlasRivers(drainage,showBuildings||overlay==='watersheds')){
    for(const [index,other] of [[from,to],[to,from]]){
      if(w.tiles[index].biome==='water')continue;
      const link={other,tier,downstream:index===from},links=waterLinks.get(index);
      if(links)links.push(link);else waterLinks.set(index,[link]);
    }
  }
  ctx.fillStyle=ATLAS_SEA;ctx.fillRect(0,0,
    ctx.canvas.width/sceneryDensity,ctx.canvas.height/sceneryDensity);
  hit.ids.fill(0);
  ctx.imageSmoothingEnabled=false;
  const ordered=Array.from({length:W*H},(_,i)=>i);
  ordered.sort((a,b)=>projector.order(a%W,Math.floor(a/W))-
    projector.order(b%W,Math.floor(b/W))||a%W-b%W);
  for(const index of ordered){
      const x=index%W,y=Math.floor(index/W),height=heights[index];
      if(!multiShore&&!visibleCoastTile(x,y,W,H,w.tiles[index].biome,
        w.settings.seed))continue;
      const p=projector.projectSmooth(x,y,height);
      const corners=projectedTerrainCorners(surface,projector,W,index);
      const biome=w.tiles[index].biome,palette=PALETTE[biome];
      const fx=projector.frontX,fy=projector.frontY;
      if(biome!=='water'){
        const edge=(a:number,b:number,neighbor:number,na:number,nb:number,stone:string)=>{
          const aHeight=surface.corners[index*4+a],bHeight=surface.corners[index*4+b];
          const drop=(above:number,below:number)=>Math.max(0,(above-below)/DEPTH_RISE*projector.riseScale);
          const belowA=neighbor<0?SEA_LEVEL:surface.corners[neighbor*4+na];
          const belowB=neighbor<0?SEA_LEVEL:surface.corners[neighbor*4+nb];
          rockFace(ctx,hit,corners[a],corners[b],drop(aHeight,belowA),drop(bHeight,belowB),
            stone,index,showBuildings);
        };
        if(fx>0)edge(1,2,x===W-1?-1:index+1,0,3,palette.right);
        if(fx<0)edge(3,0,x===0?-1:index-1,2,1,palette.left);
        if(fy>0)edge(2,3,y===H-1?-1:index+W,1,0,palette.right);
        if(fy<0)edge(0,1,y===0?-1:index-W,3,2,palette.left);
      }
      paintSurface(ctx,hit,corners,p,landscape?.[index]??tileColor(w,index,overlay,height,drainage),index);
      for(const {other,tier,downstream} of waterLinks.get(index)??[]){
        const bank=terrainRiverEdge(surface,projector,W,index,other);
        paintRiverSegment(ctx,p,bank,tier,overlay==='watersheds');
        if(downstream&&(fx&&other%W-x===fx||fy&&Math.floor(other/W)-y===fy)){
          const lowerBank=terrainRiverEdge(surface,projector,W,other,index);
          if(lowerBank.y>bank.y+1)paintRiverSegment(ctx,bank,lowerBank,tier,overlay==='watersheds');
        }
      }
      if(overlay==='elevation'&&(
        x>0&&Math.floor(heights[index-1]/30)<Math.floor(height/30)||
        y>0&&Math.floor(heights[index-W]/30)<Math.floor(height/30))){
        ctx.strokeStyle='rgba(247,232,193,.8)';ctx.lineWidth=.9;
        ctx.beginPath();ctx.moveTo(corners[3].x,corners[3].y);
        ctx.lineTo(corners[0].x,corners[0].y);ctx.stroke();
      }
      const cover=occupied&&woodlandHabitat(biome)?woodlandCover(w.woodland,index):undefined;
      if(occupied&&!occupied.has(index)&&showAtlasScenery(biome,x,y,w.settings.seed,street,cover)){
        const vegetationHash=(Math.imul(x+w.settings.seed,73856093)^
          Math.imul(y+w.settings.seed,19349663))>>>0;
        const detail=terrainDetailAt(biome,x,y,w.settings.seed,height,false,cover);
        if(detail.motif==='oak'||detail.motif==='pine'){
          paintCachedTree(ctx,p,detail.motif==='pine',
            (vegetationHash>>>5)%3,detailTier,trees);
        }else if(['boulder','snowstone','crystal','basalt'].includes(detail.motif)){
          const span=detail.variant+3,rise=detail.variant%3+2;
          const left=Math.round(p.x-span/2),base=Math.round(p.y);
          const crystal=detail.motif==='crystal',dark=detail.motif==='basalt';
          ctx.fillStyle='rgba(10,25,35,.27)';
          ctx.fillRect(left-1,base,span+2,1);
          ctx.fillStyle=crystal?'#6bb0ae':dark?'#534b58':'#7b8c91';
          ctx.fillRect(left,base-rise,span,rise);
          ctx.fillStyle=crystal?'#a7d8d2':dark?'#786672':'#abb6b4';
          ctx.fillRect(left+1,base-rise-1,span-2,2);
        }else if(['flowers','grass','reeds','fern','scrub'].includes(detail.motif)){
          ctx.fillStyle=biome==='wasteland'?'#9c9279':'#427b5d';
          ctx.fillRect(p.x-2,p.y-2,5,2);
          ctx.fillStyle=detail.motif==='flowers'?'#e9c88a':
            detail.motif==='reeds'?'#bad6a0':'#83b98b';
          ctx.fillRect(p.x-1,p.y-4,1,3);
          ctx.fillRect(p.x+2,p.y-3,1,2);
        }else{
          paintDepthSurfaceDetail(ctx,biome,p,x,y,w.settings.seed);
        }
      }
      if(overlay==='watersheds'&&drainage&&
        drainage.pondDepth[index]>=6&&biome!=='water'){
        ctx.fillStyle='#89b9be';ctx.fillRect(p.x-2,p.y-1,4,2);
      }
  }
  if(showBuildings){
    if(overlay==='terrain')paintDepthRoads(ctx,w,heights,projector);
    for(const site of w.ancientSites??[]){
      const p=projector.project(site.x,site.y,heights[site.y*W+site.x]);
      paintAncientSite(ctx,site.kind,p.x-3,p.y-5,(site.visits??site.visitors.length)>0);
    }
  }
  if(overlay==='deposits')for(const d of w.deposits??[]){
    if(d.amount<=.1)continue;
    const p=projector.project(d.index%W,Math.floor(d.index/W),heights[d.index]);
    ctx.fillStyle=d.kind==='tree'?'#92ca91':'#e9c790';
    ctx.fillRect(p.x-1,p.y-4,3,4);
  }
}

type DepthActor={order:number;paint:()=>void};
/** Geometry and structures are immutable throughout an animation. Build
 * projected actors only when the world or camera changes. */
function prepareDepthStructures(ctx:CanvasRenderingContext2D,w:World,
  projector:Projector,cache:Map<string,BuildingArt>,detail:DepthArtDetail){
  const heights=topographyForWorld(w).heights,actors:DepthActor[]=[];
  const plots:AtlasBuilding[]=[];
  const projected:{building:Building;x:number;y:number;p:Pt}[]=[];
  for(const s of w.settlements){
    const buildings=s.infrastructure?.buildings??[];
    if(!buildings.length){
      const p=projector.project(s.x,s.y,heights[s.y*w.width+s.x]);
      actors.push({order:p.y+.2,paint:()=>paintDepthSettlementHub(
        ctx,p,settlementStage(s),s.species)});
    }
    for(const building of buildings){
      const p=projector.project(building.x,building.y,
        heights[building.y*w.width+building.x]);
      projected.push({building,x:p.x,y:p.y,p});
    }
  }
  const district=uncrowdedDistrictBuildings(visibleDistrictBuildings(projected,detail));
  district.sort((a,b)=>a.y-b.y);
  for(const {building:b,p} of district){
    const key=[b.type,b.stage,b.culture,buildingTier(b),detail].join(':');
    const art=cacheBuildingArt(cache,key,64,painter=>paintDepthBuilding(
      painter,b,{x:32,y:54},detail));
    if(!art)continue;
    const scale=buildingVisualScale(b.type);
    const plot={building:b,art,scale,
      x:Math.round(p.x-32*scale),y:Math.round(p.y-54*scale)};
    plots.push(plot);
    actors.push({order:p.y+.4,paint:()=>paintAtlasBuilding(ctx,plot)});
  }
  return {actors,plots};
}
function paintInhabitants(ctx:CanvasRenderingContext2D,w:World,
  selected:{x:number;y:number}|null,zoom:number,
  positions:Map<number,Point>,walking:Set<number>,projector:Projector,
  structures:DepthActor[],
  visibleAgents:readonly Agent[],
  sprites:PersonSpriteCache,
  facing:Map<number,Facing>,stride:Map<number,0|1|2|3>):void{
  const heights=topographyForWorld(w).heights;
  const actors:DepthActor[]=[...structures];
  for(const a of visibleAgents){
    const pos=positions.get(a.id)??{x:a.x,y:a.y};
    // Both the horizontal position and the changing elevation must advance
    // continuously. Sampling only the destination tile used to make people
    // leap vertically as soon as a step onto a slope began.
    const ground=depthGroundHeight(w,pos.x,pos.y);
    const p=projector.projectSmooth(pos.x,pos.y,ground);
    actors.push({order:p.y+.6,paint:()=>paintDepthPerson(ctx,a,p,walking.has(a.id),
      zoom>=2||!!selected&&selected.x===a.x&&selected.y===a.y,
      sprites,facing.get(a.id)??'south',stride.get(a.id)??0)});
  }
  actors.sort((a,b)=>a.order-b.order);
  for(const actor of actors)actor.paint();
  if(selected){
    const index=selected.y*w.width+selected.x;
    if(index>=0&&index<heights.length){
      const p=projector.project(selected.x,selected.y,heights[index]);
      const corners=projectedTerrainCorners(depthTerrain(w),projector,w.width,index);
      ctx.lineWidth=2;ctx.strokeStyle='#fff0ac';ctx.beginPath();
      ctx.moveTo(corners[0].x,corners[0].y);
      for(let i=1;i<corners.length;i++)ctx.lineTo(corners[i].x,corners[i].y);
      ctx.closePath();ctx.stroke();
      ctx.fillStyle='#fff2af';ctx.fillRect(p.x-1,p.y-16,3,5);
    }
  }
}

export function DepthCanvas({world,brush,overlay,selected,onSelect,onEdit,
  zoom=1,speed=4,relief=2.5,camera=DEFAULT_DEPTH_CAMERA,
  followId=null,personId=null,fillWidth=false,onFollowPosition}:{
  world:World;brush:Brush;overlay:MapOverlay;
  selected:{x:number;y:number}|null;onSelect:(x:number,y:number)=>void;
  onEdit:(x:number,y:number)=>void;zoom?:number;speed?:number;
  relief?:number;camera?:DepthCamera;followId?:number|null;personId?:number|null;fillWidth?:boolean;
  onFollowPosition?:(x:number,y:number)=>void;
}){
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const sceneryRef=useRef<HTMLCanvasElement|null>(null);
  const atmosphereRef=useRef<HTMLCanvasElement|null>(null);
  const pickingRef=useRef<DepthPicking|null>(null);
  const buildingSpritesRef=useRef<Map<string,BuildingArt>>(new Map());
  const treeSpritesRef=useRef<TreeSpriteCache>(new Map());
  const personSpritesRef=useRef<PersonSpriteCache>(new Map());
  const populationSceneRef=useRef<{signature:string;seed:number;
    width:number;height:number;scene:PopulationScene}|null>(null);
  const structureCacheRef=useRef<{signature:string;
    topography:World['topography'];seed:number;relief:number;
    yaw:number;pitch:number;detail:DepthArtDetail;
    structures:ReturnType<typeof prepareDepthStructures>}|null>(null);
  const stampRef=useRef<{tiles:World['tiles'];topography:World['topography'];
    woodland:World['woodland'];
    overlay:MapOverlay;deposits:World['deposits'];seed:number;
    relief:number;yaw:number;pitch:number;roadKey:number;
    detail:DepthArtDetail;sceneryDensity:number;showBuildings:boolean;
    siteKey:string;occupiedKey:string;street:boolean;regional:boolean}|null>(null);
  const priorRef=useRef<{seed:number;year:number;day:number;
    positions:Map<number,Point>}|null>(null);
  const motionsRef=useRef<Map<number,Motion>>(new Map());
  const facingRef=useRef<Map<number,Facing>>(new Map());
  const projector=createDepthProjector(world,relief,camera);
  const size=projector.size;
  // Pinch changes the canvas CSS scale continuously. Rebuilding the terrain
  // and NPC layers on every fractional zoom would cause trackpad stutter.
  // Only population visibility/detail thresholds require an actual repaint.
  const zoomDetailTier=depthArtDetail(zoom);
  const level=atlasLevel(zoom);
  const showBuildings=level!=='world',showResidents=level==='street';
  const density=depthRenderDensity(zoom,size);
  const sceneryDensity=depthSceneryDensity(zoom,size);
  useEffect(()=>{
    const canvas=canvasRef.current,ctx=canvas?.getContext('2d');
    if(!canvas||!ctx)return;
    const scenery=sceneryRef.current??document.createElement('canvas');
    const previousPicking=pickingRef.current;
    const reusePicking=previousPicking?.width===size.width&&previousPicking.height===size.height;
    const picking=reusePicking?previousPicking:{...size,ids:new Uint32Array(size.width*size.height)};
    sceneryRef.current=scenery;pickingRef.current=picking;
    const atmosphere=atmosphereRef.current??document.createElement('canvas');
    atmosphereRef.current=atmosphere;
    const resize=(c:HTMLCanvasElement,scale=1)=>{
      if(c.width!==size.width*scale)c.width=size.width*scale;
      if(c.height!==size.height*scale)c.height=size.height*scale;
    };
    resize(scenery,sceneryDensity);resize(atmosphere);
    if(overlay==='terrain')updateAtmosphereLayer(atmosphere,
      world.settings.seed,world.year,world.dayOfYear??0,'depth');
    const backdrop=scenery.getContext('2d');
    if(!backdrop)return;
    const stamp=stampRef.current;
    const woodland=overlay==='terrain'||overlay==='trade'?world.woodland:undefined;
    const roadKey=showBuildings&&overlay==='terrain'?depthRoadSignature(world):0;
    const structureKey=depthStructureSignature(world.settlements);
    const occupiedKey=showBuildings&&overlay==='terrain'?structureKey:'';
    const regional=!!world.settings.regionalGeography;
    const siteKey=showBuildings?(world.ancientSites??[]).map(site=>
      [site.id,site.x,site.y,site.kind,!!(site.visits??site.visitors.length)].join(':')).join('|'):'';
    const landChanged=stamp?.tiles!==world.tiles&&(!stamp||
      overlay==='resources'||stamp.tiles.length!==world.tiles.length||
      stamp.tiles.some((t,i)=>t.biome!==world.tiles[i].biome));
    if(!stamp||!reusePicking||landChanged||stamp.topography!==world.topography||
      stamp.woodland!==woodland||
      stamp.overlay!==overlay||stamp.seed!==world.settings.seed||
      stamp.relief!==relief||stamp.roadKey!==roadKey||
      stamp.detail!==zoomDetailTier||stamp.showBuildings!==showBuildings||
      stamp.siteKey!==siteKey||stamp.occupiedKey!==occupiedKey||
      stamp.street!==showResidents||stamp.regional!==regional||
      stamp.sceneryDensity!==sceneryDensity||
      stamp.yaw!==camera.yaw||
      stamp.pitch!==camera.pitch||
      overlay==='deposits'&&stamp.deposits!==world.deposits){
      backdrop.setTransform(sceneryDensity,0,0,sceneryDensity,0,0);
      renderTerrain(world,overlay,backdrop,picking,projector,
        zoomDetailTier,treeSpritesRef.current,sceneryDensity,showBuildings,showResidents);
    }
    stampRef.current={tiles:world.tiles,topography:world.topography,woodland,
      overlay,deposits:world.deposits,seed:world.settings.seed,relief,
      yaw:camera.yaw,pitch:camera.pitch,roadKey,detail:zoomDetailTier,
      sceneryDensity,showBuildings,siteKey,occupiedKey,street:showResidents,regional};
    // Only painted residents need animation coordinates. Tracking every agent
    // previously allocated thousands of points on every simulation commit,
    // even though the depth view paints at most 350 residents.
    const previousScene=populationSceneRef.current;
    const popScene=previousScene&&previousScene.signature===structureKey&&
      previousScene.seed===world.settings.seed&&
      previousScene.width===world.width&&previousScene.height===world.height?
      previousScene.scene:populationScene(world);
    populationSceneRef.current={signature:structureKey,seed:world.settings.seed,
      width:world.width,height:world.height,scene:popScene};
    const visibleAgents=renderedPopulation(world.agents,popScene,{
      bounds:{minX:0,minY:0,maxX:world.width-1,maxY:world.height-1},
      focusId:followId??personId,focusOnly:!showResidents||overlay==='trade',
      zoom:Math.max(1,zoom),maxVisible:350});
    const positions=new Map(visibleAgents.map(a=>[a.id,mortalWorldPoint(a,world)]));
    const previous=priorRef.current,day=world.dayOfYear??0;
    const now=performance.now();
    if(!previous||previous.seed!==world.settings.seed||
      world.year<previous.year||world.year-previous.year>1||
      world.year===previous.year&&day<previous.day){
      motionsRef.current.clear();
      facingRef.current.clear();
    }else if(previous.year!==world.year||previous.day!==day||
      [...positions].some(([id,to])=>{
        const from=previous.positions.get(id);
        return !!from&&(to.x!==from.x||to.y!==from.y);
      })){
      const moving=new Map<number,Motion>();
      for(const [id,to] of positions){
        const from=previous.positions.get(id);
        if(!from||!canAnimate(from,to))continue;
        moving.set(id,{from,to,start:now,duration:visualMotionDuration(speed),
          facing:directionBetween(from,to)});
      }
      motionsRef.current=moving;
    }
    priorRef.current={seed:world.settings.seed,year:world.year,day,positions};
    const structureCache=structureCacheRef.current;
    const structures=!showBuildings?{actors:[],plots:[]}:structureCache&&
      structureCache.signature===structureKey&&
      structureCache.topography===world.topography&&
      structureCache.seed===world.settings.seed&&
      structureCache.relief===relief&&structureCache.yaw===camera.yaw&&
      structureCache.pitch===camera.pitch&&
      structureCache.detail===zoomDetailTier?structureCache.structures:
      prepareDepthStructures(ctx,world,projector,buildingSpritesRef.current,
        zoomDetailTier);
    structureCacheRef.current=showBuildings?{signature:structureKey,
      topography:world.topography,seed:world.settings.seed,
      relief,yaw:camera.yaw,pitch:camera.pitch,detail:zoomDetailTier,
      structures}:null;
    let frameHandle=0,lastFollow:Point|null=null;
    const draw=(time:number)=>{
      // Maintain identical world-space positions and hit-testing at every
      // zoom; additional pixels resolve the atlas instead of enlarging it.
      ctx.setTransform(density,0,0,density,0,0);
      ctx.clearRect(0,0,size.width,size.height);
      ctx.imageSmoothingEnabled=false;
      ctx.drawImage(scenery,0,0,size.width,size.height);
      if(overlay==='terrain')ctx.drawImage(atmosphere,0,0);
      if(overlay==='trade'){
        ctx.fillStyle='rgba(12,29,33,.26)';
        ctx.fillRect(0,0,size.width,size.height);
        const heights=topographyForWorld(world).heights;
        paintTradeRoutes(ctx,world.shipments??[],index=>
          projector.project(index%world.width,Math.floor(index/world.width),heights[index]),
          size.width/(canvas.clientWidth||size.width));
      }
      const interpolated=new Map<number,Point>(),walking=new Set<number>();
      const strides=new Map<number,0|1|2|3>();
      for(const [id,target] of positions){
        const motion=motionsRef.current.get(id);
        const frame=motion?motionFrame(motion,time):null;
        interpolated.set(id,frame??target);
        if(frame?.walking){
          walking.add(id);strides.set(id,frame.stride);
          facingRef.current.set(id,frame.facing);
        }
      }
      paintInhabitants(ctx,world,selected,zoom,interpolated,walking,
        projector,structures.actors,visibleAgents,personSpritesRef.current,
        facingRef.current,strides);
      const tracked=followId!==null?interpolated.get(followId):undefined;
      if(tracked&&onFollowPosition&&(!lastFollow||
        Math.abs(tracked.x-lastFollow.x)>.12||
        Math.abs(tracked.y-lastFollow.y)>.12)){
        lastFollow=tracked;
        onFollowPosition(tracked.x,tracked.y);
      }
      if(walking.size)frameHandle=requestAnimationFrame(draw);
    };
    // Allow React to commit controls before rasterizing the scene. Painting
    // synchronously inside the effect stalls input at every world tick.
    frameHandle=requestAnimationFrame(draw);
    return ()=>cancelAnimationFrame(frameHandle);
  },[world,overlay,selected,zoomDetailTier,density,sceneryDensity,speed,relief,
    camera.yaw,camera.pitch,followId,personId,showBuildings,showResidents,onFollowPosition]);
  const apply=(x:number,y:number)=>{
    if(brush.kind==='inspect')onSelect(x,y);else onEdit(x,y);
  };
  const click=(event:MouseEvent<HTMLCanvasElement>)=>{
    const rect=event.currentTarget.getBoundingClientRect();
    const px=(event.clientX-rect.left)/rect.width*size.width;
    const py=(event.clientY-rect.top)/rect.height*size.height;
    const x=Math.floor(px),y=Math.floor(py);
    if(x<0||y<0||x>=size.width||y>=size.height)return;
    if(brush.kind==='inspect'&&showBuildings){
      const building=atlasBuildingAt(structureCacheRef.current?.structures.plots??[],px,py);
      if(building){onSelect(building.x,building.y);return;}
    }
    const hit=pickingRef.current;
    if(hit?.width!==size.width||hit.height!==size.height)return;
    const index=hit.ids[y*hit.width+x]-1;
    if(index<0||index>=world.tiles.length)return;
    apply(index%world.width,Math.floor(index/world.width));
  };
  const keyboard=(event:KeyboardEvent<HTMLCanvasElement>)=>{
    if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter',' ']
      .includes(event.key))return;
    event.preventDefault();
    const pos=selected??{x:Math.floor(world.width/2),
      y:Math.floor(world.height/2)};
    const x=Math.max(0,Math.min(world.width-1,pos.x+
      (event.key==='ArrowRight'?1:event.key==='ArrowLeft'?-1:0)));
    const y=Math.max(0,Math.min(world.height-1,pos.y+
      (event.key==='ArrowDown'?1:event.key==='ArrowUp'?-1:0)));
    if(event.key==='Enter'||event.key===' '){
      if(brush.kind!=='inspect')onEdit(x,y);
    }else onSelect(x,y);
  };
  return <canvas ref={canvasRef} className="evo-world-canvas evo-depth-canvas"
    width={size.width*density} height={size.height*density}
    style={{width:fillWidth?'100%':(zoom*100)+'%'}}
    role="grid" tabIndex={0}
    aria-label={'Isometric terrain depth view with slopes and orbit camera: '+world.width+' by '+
      world.height+' world cells. Click a raised tile to '+
      (brush.kind==='inspect'?'inspect it':'apply the selected map tool')+
      '. Arrow keys move the selection; Enter applies the brush.'}
    onClick={click} onKeyDown={keyboard}/>;
}
