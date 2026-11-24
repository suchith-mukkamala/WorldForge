import {AtlasDetailCanvas,type AtlasDetailPatch} from './AtlasDetailCanvas';
import type {AtlasDetailSource} from './atlasDetailTypes';
import {cropTileAt} from './atlasRaster';
import {AtlasClouds} from './AtlasClouds';
import type {CloudPose} from './surfaceClouds';
import {paintRaisedVolcanism} from './volcanicArt';
import {WORLD_TREE_BLOCK,worldTreeClearings} from './worldTree';
import {worldTreeModel} from './worldTreeArt';
import {clipBehindTree,treeCovers} from './worldTreeOcclusion';
import {useEffect,useMemo,useRef,useState} from 'react';
import type {KeyboardEvent,MouseEvent} from 'react';
import {BIOME_INFO,SPECIES_INFO,type Biome,type Brush,type World} from './engine';
import type {MapOverlay} from './WorldCanvas';
import {SEA_LEVEL,topographyForWorld} from './topography';
import {hydrologyForWorld} from './hydrology';
import {terrainDetailAt} from './terrainDetails';
import {isTreeKind} from './biomeTrees';
import {woodlandCover,woodlandHabitat} from './woodland';
import {ATLAS_SEA,atlasRivers,highlandColor,occupiedScenery,
  paintRiverSegment,showAtlasScenery} from './atlasTerrain';
import {pickTerrainFace,terrainRiverEdge,type DepthPicking} from './depthTerrain';
import {orderedDepthTiles,paintDepthBackdrop,type DepthRasterRequest,type DepthRasterResult} from './depthBackdrop';
import {AtlasWater} from './AtlasWater';
import {waterSeason} from './riverSeasons';
import {surfaceGrid,VISUAL_TERRAIN_SIDE,type SurfaceGrid} from './surfaceGrid';
import {fitStructure,structureFootings,structureForBuilding,structureSite,surfaceHeightAt,type StructureSite} from './structureGround';
import {buildingPlots,paintPlotOutline,type BuildingPlots} from './buildingPlots';
import type {RiverCourse} from './riverCourses';
import {paintRiverCourse} from './riverCourseArt';
import {cavernFlow,cavernFlowKey} from './realmWater';
import {visibleAtlasSite} from './riverDiscoveries';
import {paintTradeRoutes} from './tradeRoutes';
import {coastalDepth} from './oceanDepth';
import {paintDepthRoads,paintDepthSurfaceDetail,depthRoadSignature,depthRoadTiles,
  pixelTerrainHash} from './depthWorldArt';
import {paintFootShadow} from './depthForm';
import {populationScene,renderedPopulation,
  type PopulationScene} from './populationVisibility';
import {buildingVisualScale,depthArtDetail,depthRenderDensity,depthSceneryDensity,
  paintDepthPerson,
  type DepthArtDetail,type PersonSpriteCache} from './depthSprites';
import {depthStructureSignature,uncrowdedDistrictBuildings,
  visibleDistrictBuildings} from './depthPerformance';
import {settlementStage,type Building} from './construction';
import type {Agent,Settlement} from './engine';
import {mortalWorldPoint} from './spatialDetails';
import {updateAtmosphereLayer} from './sceneAtmosphere';
import {canAnimate,directionBetween,motionFrame,visualMotionDuration,
  type Facing,type Motion,type Point} from './motion';
import {createDepthProjector,DEFAULT_DEPTH_CAMERA,DEPTH_RISE,DEPTH_TILE_WIDTH,interpolatedGroundHeight,
  type DepthCamera} from './depthProjection';
import {atlasLevel} from './atlasMap';
import {atlasBuildingBounds,opaqueArtAt,overlappingArt,paintAtlasBuilding,
  type PlacedArt} from './atlasBuildingArt';
import {blockLandmark,blockProp,blockSailboat,blockSettlement,terrainBlockProp,type BlockModel} from './blockModels';
import {blockBuildingArt,blockSceneryArt,depthBlockView,placeBlockArt,type BlockStamp} from './blockScenery';
import {activeVessels} from './vessels';
import {seaPoint} from './shipSave';
import {paintSkylandArt,prepareSkylandArt,skylandHit} from './skylandArt';

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
  taiga:{top:'#57877c',right:'#325451',left:'#3e6e67'},
  wetland:{top:'#639581',right:'#3d655f',left:'#4e7b6b'},
  savanna:{top:'#ad9868',right:'#746148',left:'#8e7952'},
};
const HEIGHT_COLORS=['#234966','#3b7182','#5d866b','#74936a',
  '#8c9a72','#b19f7c','#9b918b','#bcc1c4','#e8e7d9'];
type Pt={x:number;y:number};
type Projector=ReturnType<typeof createDepthProjector>;

function seatAt(world:World,grid:SurfaceGrid|undefined,at:Point,model:BlockModel,site:StructureSite,
  projector:Projector,view:SceneryView,unit:number){
  const fitted=grid&&fitStructure(grid,model,at,unit,unit*view.rise*DEPTH_RISE/projector.riseScale,site);
  const height=fitted?fitted.height:topographyForWorld(world).heights[at.y*world.width+at.x];
  const position=fitted?.at??at;
  return {p:projector.projectSmooth(position.x,position.y,height),
    order:projector.depth(position.x,position.y,height),model:fitted?.model??model,scale:fitted?.scale??1};
}

function polygon(ctx:CanvasRenderingContext2D,points:readonly Pt[],color:string,seal=true){
  ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);
  for(let i=1;i<points.length;i++)ctx.lineTo(points[i].x,points[i].y);
  ctx.closePath();ctx.fill();
  // Seal subpixel seams where two adjacent, anti-aliased faces touch.
  if(seal){ctx.strokeStyle=color;ctx.lineWidth=.65;ctx.stroke();}
}
function rockFace(ctx:CanvasRenderingContext2D,hit:DepthPicking,
  a:Pt,b:Pt,drop:number,color:string,index:number,detail:boolean){
  if(drop<=0)return;
  const face=[a,b,{x:b.x,y:b.y+drop},{x:a.x,y:a.y+drop}];
  polygon(ctx,face,color);
  pickTerrainFace(hit,face,index);
  if(drop>=5&&(detail||drop>=10)){
    ctx.strokeStyle='rgba(238,221,181,.19)';ctx.lineWidth=.7;
    for(const fraction of [.38,.71]){
      ctx.beginPath();ctx.moveTo(a.x,a.y+drop*fraction);
      ctx.lineTo(b.x,b.y+drop*fraction);ctx.stroke();
    }
  }
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
type SceneryView=ReturnType<typeof depthBlockView>;

/** Static terrain is drawn rear-to-front, so even vast worlds can be rendered
 * in one inexpensive 2D canvas without allocating thousands of SVG nodes.
 */
function renderTerrain(w:World,overlay:MapOverlay,
  ctx:CanvasRenderingContext2D,hit:DepthPicking,
  projector:Projector,blockView:SceneryView,
  sceneryDensity:number,showBuildings:boolean,street:boolean,plots:BuildingPlots|undefined,
  exact:DepthRasterResult|undefined,preview:boolean,draftTree:boolean,cutaway:boolean){
  const W=w.width,H=w.height,heights=topographyForWorld(w).heights,seed=w.settings.seed;
  const drainage=overlay==='watersheds'?hydrologyForWorld(w):null;
  const season=waterSeason(w);
  const tiled=overlay==='terrain'||overlay==='trade';
  const ocean=tiled?coastalDepth(W,H,i=>w.tiles[i].biome==='water'):null;
  const occupied=overlay==='terrain'?occupiedScenery(w):null;
  const grid=tiled?surfaceGrid(w):undefined,actors:DepthActor[]=[];
  const waterLinks=new Map<number,{other:number;tier:number;downstream:boolean}[]>();
  if(drainage)for(const {from,to,tier} of atlasRivers(drainage,showBuildings||overlay==='watersheds')){
    for(const [index,other] of [[from,to],[to,from]]){
      if(w.tiles[index].biome==='water')continue;
      const link={other,tier,downstream:index===from},links=waterLinks.get(index);
      if(links)links.push(link);else waterLinks.set(index,[link]);
    }
  }
  ctx.imageSmoothingEnabled=false;
  const ordered=orderedDepthTiles(w,projector,cutaway);
  const width=ctx.canvas.width/sceneryDensity,height=ctx.canvas.height/sceneryDensity;
  if(exact)ctx.drawImage(exact.bitmap,0,0,width,height);
  else{
    hit.ids.fill(0);
    if(ocean)paintDepthBackdrop(ctx,hit,w,projector,sceneryDensity,ordered,plots,preview?8:1,cutaway);
    else{ctx.fillStyle=ATLAS_SEA;ctx.fillRect(0,0,width,height);}
  }
  const groundVisible=(index:number,p:Pt)=>{
    const x=Math.floor(p.x*sceneryDensity),y=Math.floor(p.y*sceneryDensity);
    const at=hit.ids[y*hit.width+x];
    return !at||at===index+1;
  };
  let treeBounds:ReturnType<typeof atlasBuildingBounds>|undefined;
  if(overlay==='terrain'&&w.worldTree){
    const tree=w.worldTree,unit=DEPTH_TILE_WIDTH/2*WORLD_TREE_BLOCK;
    const verticalScale=projector.riseScale/(DEPTH_RISE*blockView.rise*unit);
    const {model,ground,unitScale}=worldTreeModel(w,grid,verticalScale,draftTree);
    const p=projector.projectSmooth(tree.x,tree.y,ground);
    const sprite=blockSceneryArt(model,p,blockView,unit*unitScale,true);
    if(sprite){
      actors.push({order:projector.depth(tree.x,tree.y,ground),sprite,landmark:tree});
      treeBounds=atlasBuildingBounds(sprite);
    }
  }
  for(const index of overlay==='trade'?[]:ordered){
      const x=index%W,y=Math.floor(index/W),height=heights[index];
      const biome=w.tiles[index].biome,palette=PALETTE[biome];
      const cover=tiled&&woodlandHabitat(biome)?woodlandCover(w.woodland,index):undefined;
      const grain=tiled?pixelTerrainHash(x,y,seed):0;
      const scenery=biome==='water'?ocean&&ocean[index]<=2&&grain%8===0:
        showBuildings?showAtlasScenery(biome,x,y,seed,street,cover):grain%8===0;
      const showScenery=occupied&&!occupied.has(index)&&!plots?.clear.has(index)&&!grid?.treeCover?.has(index)&&scenery;
      if(ocean&&!showScenery)continue;
      const ground=grid?surfaceHeightAt(grid,x,y):height;
      const p=projector.projectSmooth(x,y,ground);
      const corners=ocean?null:projector.tileCorners(x,y,height);
      const fx=projector.frontX,fy=projector.frontY;
      if(corners){
        if(biome!=='water'){
          const edge=(a:number,b:number,below:number,stone:string)=>{
            const drop=projector.project(x,y,below).y-p.y;
            rockFace(ctx,hit,corners[a],corners[b],drop,stone,index,showBuildings);
          };
          if(fx>0)edge(1,2,x===W-1?SEA_LEVEL:heights[index+1],palette.right);
          if(fx<0)edge(3,0,x===0?SEA_LEVEL:heights[index-1],palette.left);
          if(fy>0)edge(2,3,y===H-1?SEA_LEVEL:heights[index+W],palette.left);
          if(fy<0)edge(0,1,y===0?SEA_LEVEL:heights[index-W],palette.right);
        }
        polygon(ctx,corners,tileColor(w,index,overlay,height,drainage));
        pickTerrainFace(hit,corners,index);
      }
      const visible=!ocean||groundVisible(index,p);
      if(visible)for(const {other,tier,downstream} of waterLinks.get(index)??[]){
        const bank=terrainRiverEdge(heights,projector,W,index,other);
        paintRiverSegment(ctx,p,bank,tier,overlay==='watersheds');
        if(downstream&&(fx&&other%W-x===fx||fy&&Math.floor(other/W)-y===fy)){
          const lowerBank=terrainRiverEdge(heights,projector,W,other,index);
          if(lowerBank.y>bank.y+1)paintRiverSegment(ctx,bank,lowerBank,tier,overlay==='watersheds');
        }
      }
      if(corners&&overlay==='elevation'&&(
        x>0&&Math.floor(heights[index-1]/30)<Math.floor(height/30)||
        y>0&&Math.floor(heights[index-W]/30)<Math.floor(height/30))){
        ctx.strokeStyle='rgba(247,232,193,.8)';ctx.lineWidth=.9;
        ctx.beginPath();ctx.moveTo(corners[3].x,corners[3].y);
        ctx.lineTo(corners[0].x,corners[0].y);ctx.stroke();
      }
      if(visible&&showScenery){
        const upland=w.settings.landforms?highlandColor(biome,height,grain):undefined;
        const detail=terrainDetailAt(biome,x,y,seed,height,false,cover);
        const natural=upland&&height>=175?'snowstone':terrainBlockProp(detail.motif);
        const prop=plots?.fringe.has(index)&&isTreeKind(natural)?'scrub':natural;
        const tree=isTreeKind(prop);
        if(prop&&(tree||showBuildings)){
          const near=!!treeBounds&&p.x>=treeBounds.left-18&&p.x<=treeBounds.right+18&&
            p.y>=treeBounds.top&&p.y<=treeBounds.bottom+25;
          const sprite=blockSceneryArt(blockProp(prop,detail.variant,season),p,blockView,
            tree?(showBuildings?1.05:.73):.74,near);
          if(sprite&&(showBuildings||near))actors.push({order:projector.depth(x,y,ground),sprite,canopy:tree});
          else if(sprite){paintFootShadow(ctx,sprite);paintAtlasBuilding(ctx,sprite);}
        }else{
          paintDepthSurfaceDetail(ctx,biome,p,x,y,seed);
        }
      }
      if(overlay==='watersheds'&&drainage&&
        drainage.pondDepth[index]>=6&&biome!=='water'){
        ctx.fillStyle='#89b9be';ctx.fillRect(p.x-2,p.y-1,4,2);
      }
  }
  if(showBuildings){
    if(overlay==='terrain')paintDepthRoads(ctx,w,heights,projector,plots?.streetLinks);
    for(const site of w.ancientSites??[]){
      if(!visibleAtlasSite(w,site))continue;
      const habitat=structureSite(w,site),art=blockLandmark(site.kind,(site.visits??site.visitors.length)>0,habitat);
      const {p,model,scale,order}=seatAt(w,grid,site,art,habitat,projector,blockView,1.1);
      const sprite=blockSceneryArt(model,p,blockView,1.1*scale,!!w.worldTree);
      if(sprite)actors.push({order,sprite});
    }
    for(const ruin of w.ruins??[]){
      const habitat=structureSite(w,ruin);
      const {p,model,scale,order}=seatAt(w,grid,ruin,blockLandmark('ruin',false,habitat),
        habitat,projector,blockView,1.18);
      const sprite=blockSceneryArt(model,p,blockView,1.18*scale,!!w.worldTree);
      if(sprite)actors.push({order,sprite});
    }
  }
  if(overlay==='deposits')for(const d of w.deposits??[]){
    if(d.amount<=.1)continue;
    const p=projector.project(d.index%W,Math.floor(d.index/W),heights[d.index]);
    ctx.fillStyle=d.kind==='tree'?'#92ca91':'#e9c790';
    ctx.fillRect(p.x-1,p.y-4,3,4);
  }
  return actors;
}

type DepthActor={order:number;sprite:PlacedArt;building?:Building;canopy?:boolean;landmark?:Pt;treeClipped?:boolean};
/** Geometry and structures are immutable throughout an animation. Build
 * projected actors only when the world or camera changes. */
function prepareDepthStructures(w:World,
  projector:Projector,blockView:SceneryView,cache:Map<string,BlockStamp>,detail:DepthArtDetail,
  ground:SurfaceGrid|undefined,plots:BuildingPlots|undefined,focusedIndex:number){
  const heights=topographyForWorld(w).heights,actors:DepthActor[]=[];
  const projected:{building:Building;town:Settlement;x:number;y:number}[]=[];
  for(const s of w.settlements){
    const buildings=s.infrastructure?.buildings??[];
    if(!buildings.length){
      const site=structureSite(w,s),hub=blockSettlement(settlementStage(s),s.species,site);
      const {p,model,scale,order}=seatAt(w,ground,s,hub,site,projector,blockView,1.1);
      const sprite=blockSceneryArt(model,p,blockView,1.1*scale,!!w.worldTree);
      if(sprite)actors.push({order,sprite});
    }
    for(const building of buildings){
      const index=building.y*w.width+building.x,site=plots?.buildings.get(index);
      const at=site?.placement.at??building;
      const p=projector.projectSmooth(at.x,at.y,site?.placement.profile.height??heights[index]);
      projected.push({building,town:s,x:p.x,y:p.y});
    }
  }
  const focused=projected.find(({building:b})=>b.y*w.width+b.x===focusedIndex);
  const visible=visibleDistrictBuildings(projected,detail);
  if(focused&&!visible.includes(focused))visible.push(focused);
  const candidates=visible.flatMap(entry=>{
    const {building:b,town}=entry,index=b.y*w.width+b.x;
    const plot=plots?.buildings.get(index),look=plot??structureForBuilding(w,town,b);
    const unit=buildingVisualScale(b.type),placed=plot&&structureFootings(plot.placement,look.model,
      1.2*unit*blockView.rise*DEPTH_RISE/projector.riseScale,look.site);
    const {at,model,scale,height}=placed??{at:b,model:look.model,scale:1,height:heights[index]};
    const p=projector.projectSmooth(at.x,at.y,height),order=projector.depth(at.x,at.y,height);
    const art=blockBuildingArt(cache,model,blockView,1.2,!!w.worldTree);
    if(!art)return [];
    const sprite=placeBlockArt(art,p,unit*scale);
    return [{...entry,sprite,order,bounds:atlasBuildingBounds(sprite)}];
  });
  const district=detail===2?candidates:uncrowdedDistrictBuildings(candidates);
  const target=focused&&candidates.find(entry=>entry.building===focused.building);
  if(target&&!district.includes(target))district.push(target);
  for(const {building,sprite,order} of district)actors.push({order,sprite,building});
  return actors;
}
function paintInhabitants(ctx:CanvasRenderingContext2D,w:World,
  selected:{x:number;y:number}|null,zoom:number,
  positions:Map<number,Point>,walking:Set<number>,projector:Projector,
  structures:DepthActor[],tree:DepthActor|undefined,faded:ReadonlySet<DepthActor>,plotSelected:boolean,
  visibleAgents:readonly Agent[],
  sprites:PersonSpriteCache,
  facing:Map<number,Facing>,stride:Map<number,0|1|2|3>):void{
  const heights=topographyForWorld(w).heights;
  const people:{order:number;paint:()=>void}[]=[];
  for(const a of visibleAgents){
    const pos=positions.get(a.id)??{x:a.x,y:a.y};
    // Both the horizontal position and the changing elevation must advance
    // continuously. Sampling only the destination tile used to make people
    // leap vertically as soon as a step onto a slope began.
    const ground=interpolatedGroundHeight(heights,w.width,w.height,pos.x,pos.y);
    const p=projector.projectSmooth(pos.x,pos.y,ground);
    const order=projector.depth(pos.x,pos.y,ground)+.1;
    const paint=()=>paintDepthPerson(ctx,a,p,walking.has(a.id),
      zoom>=2||!!selected&&selected.x===a.x&&selected.y===a.y,
      sprites,facing.get(a.id)??'south',stride.get(a.id)??0);
    if(tree&&treeCovers(tree,p.x,p.y-4,order+2))paint();
    else people.push({order,paint});
  }
  if(tree)paintAtlasBuilding(ctx,tree.sprite);
  people.sort((a,b)=>a.order-b.order);
  let i=0;
  for(const actor of structures){
    for(;i<people.length&&people[i].order<actor.order;i++)people[i].paint();
    ctx.globalAlpha=faded.has(actor)?.28:1;
    if(!actor.treeClipped)paintFootShadow(ctx,actor.sprite);
    paintAtlasBuilding(ctx,actor.sprite);
    ctx.globalAlpha=1;
  }
  for(;i<people.length;i++)people[i].paint();
  const landmark=tree?.landmark;
  if(selected&&!plotSelected&&(selected.x!==landmark?.x||selected.y!==landmark.y)){
    const index=selected.y*w.width+selected.x;
    if(index>=0&&index<heights.length){
      const p=projector.project(selected.x,selected.y,heights[index]);
      const corners=projector.tileCorners(selected.x,selected.y,heights[index]);
      ctx.lineJoin='round';ctx.beginPath();
      ctx.moveTo(corners[0].x,corners[0].y);
      for(let i=1;i<corners.length;i++)ctx.lineTo(corners[i].x,corners[i].y);
      ctx.closePath();
      ctx.lineWidth=3.25;ctx.strokeStyle='#24180acc';ctx.stroke();
      ctx.lineWidth=1.5;ctx.strokeStyle='#fff0ac';ctx.stroke();
      ctx.fillStyle='#fff2af';ctx.fillRect(p.x-1,p.y-16,3,5);
    }
  }
}

export function DepthCanvas({world,brush,overlay,selected,onSelect,onEdit,river,
  zoom=1,speed=4,relief=2.5,camera=DEFAULT_DEPTH_CAMERA,orbiting=false,
  followId=null,personId=null,fillWidth=false,onFollowPosition,showSkylands=false,onSkyland,cutaway=false,showClouds=false}:{
  world:World;brush:Brush;overlay:MapOverlay;river?:RiverCourse;
  selected:{x:number;y:number}|null;onSelect:(x:number,y:number)=>void;
  onEdit:(x:number,y:number)=>void;zoom?:number;speed?:number;
  relief?:number;camera?:DepthCamera;orbiting?:boolean;
  followId?:number|null;personId?:number|null;fillWidth?:boolean;
  onFollowPosition?:(x:number,y:number)=>void;
  showSkylands?:boolean;showClouds?:boolean;onSkyland?:(id:number)=>void;cutaway?:boolean;
}){
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const detailPatch=useRef<AtlasDetailPatch>(undefined);
  const paintDetail=useRef<((patch:AtlasDetailPatch)=>void)|undefined>(undefined);
  const detailStamp=useRef<{geometry:unknown[];source:AtlasDetailSource}>(undefined);
  const [detailSource,setDetailSource]=useState<AtlasDetailSource>();
  const rasterWorker=useRef<Worker|null>(null);
  const rasterJob=useRef<{id:number;geometry:unknown[];result?:DepthRasterResult}|null>(null);
  const displayedRaster=useRef<{view:string;result:DepthRasterResult}|null>(null);
  const skyArtRef=useRef<{view:string;sites:NonNullable<World['skylands']>;grid:SurfaceGrid;
    art:ReturnType<typeof prepareSkylandArt>}|null>(null);
  const rasterBusy=useRef(false),rasterId=useRef(0);
  const [rasterVersion,refreshRaster]=useState(0);
  const [rasterFailed,setRasterFailed]=useState(false);
  const sceneryRef=useRef<HTMLCanvasElement|null>(null);
  const atmosphereRef=useRef<HTMLCanvasElement|null>(null);
  const pickingRef=useRef<DepthPicking|null>(null);
  const sceneryActors=useRef<DepthActor[]>([]);
  const treeMasks=useRef<{tree:DepthActor;actors:WeakMap<DepthActor,DepthActor|null>}|null>(null);
  const inspectActors=useRef<{actors:DepthActor[];faded:ReadonlySet<DepthActor>}|null>(null);
  const plotCacheRef=useRef<{ground:SurfaceGrid;key:string;plots:BuildingPlots}|null>(null);
  const buildingSpritesRef=useRef<Map<string,BlockStamp>>(new Map());
  const personSpritesRef=useRef<PersonSpriteCache>(new Map());
  const populationSceneRef=useRef<{signature:string;seed:number;
    width:number;height:number;scene:PopulationScene}|null>(null);
  const structureCacheRef=useRef<{signature:string;
    topography:World['topography'];seed:number;relief:number;
    ground:SurfaceGrid|undefined;season:string;roadKey:number;focusedIndex:number;
    yaw:number;pitch:number;frameTop:number;detail:DepthArtDetail;
    structures:ReturnType<typeof prepareDepthStructures>}|null>(null);
  const stampRef=useRef<{tiles:World['tiles'];topography:World['topography'];
    woodland:World['woodland'];skylands:World['skylands'];worldTree:World['worldTree'];rootClearings:string;
    terrainCells:World['terrainCells'];
    overlay:MapOverlay;deposits:World['deposits'];seed:number;
    relief:number;yaw:number;pitch:number;roadKey:number;
    detail:DepthArtDetail;sceneryDensity:number;showBuildings:boolean;season:string;feederKey:string;
    siteKey:string;occupiedKey:string;street:boolean;regional:boolean;raster:number;draftTree:boolean;cutaway:boolean}|null>(null);
  const priorRef=useRef<{seed:number;year:number;day:number;
    positions:Map<number,Point>}|null>(null);
  const motionsRef=useRef<Map<number,Motion>>(new Map());
  const facingRef=useRef<Map<number,Facing>>(new Map());
  const topography=topographyForWorld(world);
  const skylands=overlay==='terrain'&&showSkylands&&!cutaway?world.skylands:undefined;
  const projector=useMemo(()=>createDepthProjector({width:world.width,height:world.height,
    skylands,worldTree:world.worldTree},relief,camera,topography.heights),
    [world.width,world.height,skylands,world.worldTree,relief,camera.yaw,camera.pitch,topography]);
  const size=projector.size;
  const cloudProjection=useMemo(()=>{
    const {width,height}=world,elevations=topography.heights;
    const elevation=(p:Point)=>Math.max(SEA_LEVEL-9,
      interpolatedGroundHeight(elevations,width,height,p.x-.5,p.y-.5));
    return {
      project:(cloud:CloudPose)=>projector.projectSmooth(cloud.x-.5,cloud.y-.5,
        Math.max(cloud.height,elevation(cloud)+14)),
      ground:(p:Point)=>projector.projectSmooth(p.x-.5,p.y-.5,elevation(p)),
    };
  },[projector,world.width,world.height,topography]);
  // Pinch changes the canvas CSS scale continuously. Rebuilding the terrain
  // and NPC layers on every fractional zoom would cause trackpad stutter.
  // Only population visibility/detail thresholds require an actual repaint.
  const zoomDetailTier=depthArtDetail(zoom);
  const level=atlasLevel(zoom);
  const showBuildings=level!=='world',showResidents=level==='street';
  const terrainCells=overlay==='terrain'||overlay==='trade'?world.terrainCells:undefined;
  const density=depthRenderDensity(zoom,size);
  const sceneryDensity=depthSceneryDensity(zoom,size);
  const season=waterSeason(world);
  const large=world.tiles.length>=16_000;
  const useRasterWorker=large||cutaway;
  const close=fillWidth&&zoom>=7&&overlay==='terrain'&&!orbiting;
  const previewScale=Math.min(1,Math.sqrt(540_000/(size.width*size.height)));
  const displayScale=large&&orbiting?previewScale:density;
  useEffect(()=>{
    if(!useRasterWorker||rasterFailed||typeof Worker==='undefined'||typeof OffscreenCanvas==='undefined')return;
    let worker:Worker;
    try{worker=new Worker(new URL('./depthBackdrop.worker.ts',import.meta.url),{type:'module'});}
    catch{setRasterFailed(true);return;}
    rasterWorker.current=worker;
    worker.onmessage=({data}:MessageEvent<DepthRasterResult>)=>{
      rasterBusy.current=false;
      const job=rasterJob.current;
      if(job?.id===data.id)job.result=data;
      else data.bitmap.close();
      refreshRaster(value=>value+1);
    };
    worker.onerror=()=>setRasterFailed(true);
    return ()=>{
      worker.terminate();rasterWorker.current=null;rasterBusy.current=false;
      rasterJob.current?.result?.bitmap.close();rasterJob.current=null;
      displayedRaster.current?.result.bitmap.close();displayedRaster.current=null;
    };
  },[useRasterWorker,rasterFailed]);
  useEffect(()=>{
    const canvas=canvasRef.current,ctx=canvas?.getContext('2d');
    if(!canvas||!ctx)return;
    const scenery=sceneryRef.current??document.createElement('canvas');
    sceneryRef.current=scenery;
    const atmosphere=atmosphereRef.current??document.createElement('canvas');
    atmosphereRef.current=atmosphere;
    const stamp=stampRef.current;
    const woodland=overlay==='terrain'||overlay==='trade'?world.woodland:undefined;
    const tiled=overlay==='terrain'||overlay==='trade';
    const roadKey=showBuildings&&tiled?depthRoadSignature(world):0;
    const structureKey=depthStructureSignature(world.settlements);
    const blockView=depthBlockView(camera);
    const occupiedKey=showBuildings&&tiled?structureKey:'';
    const regional=!!world.settings.regionalGeography;
    const siteKey=showBuildings?[
      ...(world.ancientSites??[]).filter(site=>visibleAtlasSite(world,site)).map(site=>
        [site.id,site.x,site.y,site.kind,!!(site.visits??site.visitors.length)].join(':')),
      ...(world.ruins??[]).map(ruin=>[ruin.id,ruin.x,ruin.y,'collapsed'].join(':')),
    ].join('|'):'';
    const landChanged=stamp?.tiles!==world.tiles&&(!stamp||
      overlay==='resources'||stamp.tiles.length!==world.tiles.length||
      stamp.tiles.some((t,i)=>t.biome!==world.tiles[i].biome));
    const ground=showBuildings&&tiled?surfaceGrid(world):undefined;
    const plotKey=[world.settings.seed,structureKey,roadKey,siteKey].join('|');
    const previousPlots=plotCacheRef.current;
    const plots=ground&&(previousPlots?.ground===ground&&previousPlots.key===plotKey?
      previousPlots.plots:buildingPlots(world,ground));
    plotCacheRef.current=ground&&plots?{ground,key:plotKey,plots}:null;
    const worker=tiled?rasterWorker.current:null;
    const feeder=tiled?cavernFlow(world):undefined,feederKey=cavernFlowKey(feeder);
    const rootClearings=worldTreeClearings(world),rootKey=rootClearings.join(',');
    const geometry=[world.settings,world.width,world.height,topography,terrainCells,
      woodland,season,feederKey,plots,relief,camera.yaw,camera.pitch,sceneryDensity,world.skylands,skylands,world.worldTree,rootKey,cutaway];
    const terrainView=():Omit<DepthRasterRequest,'id'|'density'>=>{
      const {width,height,settings,tiles,terrainCells,dayOfYear,woodland,worldTree,volcanicLayout}=world;
      return {world:{width,height,settings,tiles,topography,terrainCells,dayOfYear,woodland,
        skylands:world.skylands,worldTree,rootClearings,feeder,volcanicLayout},relief,camera,
        plots:plots&&{squares:plots.squares,decoratedTiles:plots.decoratedTiles},cutaway,showSkylands:!!skylands};
    };
    if(close){
      const previous=detailStamp.current;
      if(!previous||landChanged||geometry.some((part,i)=>part!==previous.geometry[i])){
        const source:AtlasDetailSource={kind:'surface',view:terrainView()};
        detailStamp.current={geometry,source};
        setDetailSource(source);
      }
    }else if(detailStamp.current){
      detailStamp.current=undefined;setDetailSource(undefined);
    }
    let job=rasterJob.current;
    if(!worker||landChanged||!job||geometry.some((part,i)=>part!==job?.geometry[i])){
      if(job?.result!==displayedRaster.current?.result)job?.result?.bitmap.close();
      job=worker?{id:++rasterId.current,geometry}:null;
      rasterJob.current=job;
    }
    if(worker&&job&&!job.result&&!orbiting&&!rasterBusy.current){
      rasterBusy.current=true;
      const message:DepthRasterRequest={id:job.id,density:sceneryDensity,...terrainView()};
      try{worker.postMessage(message);}catch{setRasterFailed(true);}
    }
    const viewKey=[world.settings.seed,world.width,world.height,camera.yaw,camera.pitch,
      relief,sceneryDensity,size.height,projector.skyBand,cutaway].join(':');
    if(job?.result&&job.result!==displayedRaster.current?.result){
      displayedRaster.current?.result.bitmap.close();
      displayedRaster.current={view:viewKey,result:job.result};
    }
    // A season or plot update may still be rasterizing. Leave the last exact
    // image in place when the camera geometry agrees.
    const exact=worker&&!landChanged&&!orbiting&&displayedRaster.current?.view===viewKey?
      displayedRaster.current.result:undefined;
    const preview=tiled&&!exact&&(!!worker||large&&orbiting);
    const raster=exact?.id??(preview?-1:0),draftTree=!!world.worldTree&&(preview||orbiting);
    const sceneScale=preview?previewScale:sceneryDensity;
    const resize=(c:HTMLCanvasElement,scale=1)=>{
      const width=Math.ceil(size.width*scale),height=Math.ceil(size.height*scale);
      if(c.width!==width)c.width=width;
      if(c.height!==height)c.height=height;
    };
    resize(scenery,sceneScale);resize(atmosphere,preview?sceneScale:1);
    if(overlay==='terrain'&&!cutaway)updateAtmosphereLayer(atmosphere,
      world.settings.seed,world.year,world.dayOfYear??0,'depth');
    const backdrop=scenery.getContext('2d');
    if(!backdrop)return;
    const previousPicking=pickingRef.current;
    const pickScale=tiled?sceneScale:1;
    const pickWidth=Math.ceil(size.width*pickScale),pickHeight=Math.ceil(size.height*pickScale);
    const reusePicking=previousPicking?.width===pickWidth&&previousPicking.height===pickHeight;
    const picking=exact?.hit??(reusePicking&&previousPicking!==displayedRaster.current?.result.hit?
      previousPicking:{width:pickWidth,height:pickHeight,
      ids:new Uint32Array(pickWidth*pickHeight)});
    pickingRef.current=picking;
    if(!stamp||!reusePicking||landChanged||stamp.topography!==world.topography||
      stamp.woodland!==woodland||stamp.skylands!==world.skylands||stamp.worldTree!==world.worldTree||stamp.rootClearings!==rootKey||
      stamp.terrainCells!==terrainCells||stamp.season!==season||stamp.feederKey!==feederKey||
      stamp.overlay!==overlay||stamp.seed!==world.settings.seed||
      stamp.relief!==relief||stamp.roadKey!==roadKey||
      stamp.detail!==zoomDetailTier||stamp.showBuildings!==showBuildings||
      stamp.siteKey!==siteKey||stamp.occupiedKey!==occupiedKey||
      stamp.street!==showResidents||stamp.regional!==regional||
      stamp.sceneryDensity!==sceneryDensity||stamp.raster!==raster||stamp.draftTree!==draftTree||stamp.cutaway!==cutaway||
      stamp.yaw!==camera.yaw||
      stamp.pitch!==camera.pitch||
      overlay==='deposits'&&stamp.deposits!==world.deposits){
      backdrop.setTransform(sceneScale,0,0,sceneScale,0,0);
      sceneryActors.current=renderTerrain(world,overlay,backdrop,picking,projector,blockView,
        sceneScale,showBuildings,showResidents,plots,exact,preview,draftTree,cutaway);
    }
    stampRef.current={tiles:world.tiles,topography:world.topography,woodland,skylands:world.skylands,worldTree:world.worldTree,rootClearings:rootKey,
      terrainCells,
      overlay,deposits:world.deposits,seed:world.settings.seed,relief,
      yaw:camera.yaw,pitch:camera.pitch,roadKey,detail:zoomDetailTier,season,feederKey,
      sceneryDensity,showBuildings,siteKey,occupiedKey,street:showResidents,regional,raster,draftTree,cutaway};
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
    const vessels=tiled?activeVessels(world):[];
    const crew=new Set(vessels.flatMap(ship=>ship.crew===undefined?[]:[ship.crew]));
    const visibleAgents=renderedPopulation(crew.size?world.agents.filter(a=>!crew.has(a.id)):world.agents,popScene,{
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
    const focusedIndex=selected&&zoomDetailTier<2?selected.y*world.width+selected.x:-1;
    const structures=!showBuildings?undefined:structureCache&&
      structureCache.signature===structureKey&&
      !landChanged&&structureCache.ground===ground&&structureCache.season===season&&structureCache.roadKey===roadKey&&
      structureCache.focusedIndex===focusedIndex&&
      structureCache.topography===world.topography&&
      structureCache.seed===world.settings.seed&&
      structureCache.relief===relief&&structureCache.yaw===camera.yaw&&
      structureCache.pitch===camera.pitch&&structureCache.frameTop===projector.skyBand&&
      structureCache.detail===zoomDetailTier?structureCache.structures:
      prepareDepthStructures(world,projector,blockView,buildingSpritesRef.current,
        zoomDetailTier,ground,plots,focusedIndex);
    structureCacheRef.current=structures?{signature:structureKey,
      topography:world.topography,seed:world.settings.seed,
      relief,yaw:camera.yaw,pitch:camera.pitch,frameTop:projector.skyBand,detail:zoomDetailTier,
      ground,season,roadKey,focusedIndex,structures}:null;
    const tree=sceneryActors.current.find(actor=>actor.landmark);
    const ships=vessels.flatMap(vessel=>{
      const {x,y}=seaPoint(world.width,vessel.at),h=surfaceHeightAt(ground??surfaceGrid(world),x,y);
      const sprite=blockSceneryArt(blockSailboat(vessel.heading,vessel.merchant),
        projector.projectSmooth(x,y,h),blockView,.78,!!tree);
      return sprite?[{order:projector.depth(x,y,h),sprite}]:[];
    });
    let actors:DepthActor[]=[...sceneryActors.current,...structures??[],...ships];
    if(tree){
      if(treeMasks.current?.tree!==tree)treeMasks.current={tree,actors:new WeakMap()};
      const masks=treeMasks.current.actors;
      actors=actors.flatMap(actor=>{
        if(actor===tree)return [];
        let masked=masks.get(actor);
        if(masked===undefined){
          const sprite=clipBehindTree(tree,actor);
          masked=sprite===actor.sprite?actor:sprite?{...actor,sprite,treeClipped:true}:null;
          masks.set(actor,masked);
        }
        return masked?[masked]:[];
      });
    }else treeMasks.current=null;
    actors.sort((a,b)=>a.order-b.order);
    const focus=selected&&actors.find(a=>a.building?.x===selected.x&&a.building.y===selected.y);
    const selectedPlot=focus&&selected&&plots?.buildings.get(selected.y*world.width+selected.x);
    const faded=new Set<DepthActor>();
    if(focus)for(const actor of actors){
      if(actor.canopy&&actor.order>=focus.order&&overlappingArt(actor.sprite,focus.sprite))faded.add(actor);
    }
    inspectActors.current={actors:tree?[tree,...actors]:actors,faded};
    const sites=skylands;
    if(sites?.length){
      const previous=skyArtRef.current,grid=ground??surfaceGrid(world);
      const skyView=viewKey+':'+(preview||orbiting)+':'+displayScale;
      if(previous?.view!==skyView||previous.sites!==sites||previous.grid!==grid){
        skyArtRef.current={view:skyView,sites,grid,art:prepareSkylandArt(sites,projector,
          blockView,grid,Math.max(1,displayScale),preview||orbiting)};
      }
    }else skyArtRef.current=null;
    const skyArt=skyArtRef.current?.art;
    const closeRoads=close?depthRoadTiles(world,topography.heights.length,plots?.streetLinks):undefined;
    let frameHandle=0,lastFollow:Point|null=null,lastDraw=-Infinity;
    const paintScene=(painter:CanvasRenderingContext2D,patch:AtlasDetailPatch|undefined,
      interpolated:Map<number,Point>,walking:Set<number>,strides:Map<number,0|1|2|3>)=>{
      painter.imageSmoothingEnabled=false;
      if(patch){
        const {crop,bitmap}=patch.frame,{density,left,top,width,height}=crop;
        painter.setTransform(1,0,0,1,0,0);
        painter.clearRect(0,0,width,height);painter.drawImage(bitmap,0,0);
        painter.setTransform(density,0,0,density,-left,-top);
        if(closeRoads)paintDepthRoads(painter,world,topography.heights,projector,plots?.streetLinks,closeRoads);
      }else{
        painter.setTransform(displayScale,0,0,displayScale,0,0);
        painter.clearRect(0,0,size.width,size.height);
        painter.drawImage(scenery,0,0,size.width,size.height);
      }
      if(overlay==='terrain'){
        if(!cutaway)painter.drawImage(atmosphere,0,0,size.width,size.height);
        paintRaisedVolcanism(painter,world,projector,picking,pickScale,ground);
      }
      if(overlay==='trade'){
        painter.fillStyle='rgba(12,29,33,.26)';
        painter.fillRect(0,0,size.width,size.height);
        const heights=topography.heights;
        paintTradeRoutes(painter,world.shipments??[],index=>
          projector.project(index%world.width,Math.floor(index/world.width),heights[index]),
          size.width/(canvas.clientWidth||size.width));
      }
      if(river&&overlay==='terrain'){
        paintRiverCourse(painter,river,index=>projector.projectSmooth(index%world.width,
          Math.floor(index/world.width),topography.heights[index]),size.width/(canvas.clientWidth||size.width));
      }
      if(selectedPlot)paintPlotOutline(painter,selectedPlot,projector.projectSmooth,.48);
      paintInhabitants(painter,world,selected,zoom,interpolated,walking,
        projector,actors,tree,faded,!!selectedPlot?.outline.length,visibleAgents,personSpritesRef.current,
        facingRef.current,strides);
      if(skyArt)paintSkylandArt(painter,skyArt);
    };
    const draw=(time:number)=>{
      if(large&&time-lastDraw<32){frameHandle=requestAnimationFrame(draw);return;}
      lastDraw=time;
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
      paintScene(ctx,undefined,interpolated,walking,strides);
      paintDetail.current=patch=>{
        if(patch.source===detailStamp.current?.source)paintScene(patch.ctx,patch,interpolated,walking,strides);
      };
      const patch=detailPatch.current;
      if(patch)paintDetail.current(patch);
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
    return ()=>{cancelAnimationFrame(frameHandle);paintDetail.current=undefined;};
  },[world,overlay,selected,zoomDetailTier,density,sceneryDensity,speed,relief,
    terrainCells,season,river,camera.yaw,camera.pitch,followId,personId,
    showBuildings,showResidents,onFollowPosition,orbiting,large,displayScale,rasterVersion,rasterFailed,
    showSkylands,cutaway,close]);
  const apply=(x:number,y:number)=>{
    if(brush.kind==='inspect')onSelect(x,y);else onEdit(x,y);
  };
  const click=(event:MouseEvent<HTMLCanvasElement>)=>{
    const rect=event.currentTarget.getBoundingClientRect();
    const px=(event.clientX-rect.left)/rect.width*size.width;
    const py=(event.clientY-rect.top)/rect.height*size.height;
    const x=Math.floor(px),y=Math.floor(py);
    if(x<0||y<0||x>=size.width||y>=size.height)return;
    const sky=skyArtRef.current;
    if(sky&&onSkyland&&brush.kind==='inspect'){
      const island=skylandHit(sky.art,px,py);
      if(island!==undefined){onSkyland(island);return;}
    }
    if(brush.kind==='inspect'){
      const scene=inspectActors.current;
      if(scene)for(let i=scene.actors.length-1;i>=0;i--){
        const actor=scene.actors[i];
        if(scene.faded.has(actor)||!opaqueArtAt(actor.sprite,px,py))continue;
        if(actor.landmark){onSelect(actor.landmark.x,actor.landmark.y);return;}
        if(actor.building){onSelect(actor.building.x,actor.building.y);return;}
        break;
      }
    }
    const hit=pickingRef.current;
    if(!hit)return;
    const column=Math.floor(px/size.width*hit.width),row=Math.floor(py/size.height*hit.height);
    const sharp=detailPatch.current;
    const index=(sharp&&sharp.source===detailStamp.current?.source?
      cropTileAt(sharp.frame.crop,sharp.frame.hit,{x:px,y:py}):undefined)??hit.ids[row*hit.width+column]-1;
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
  return <><canvas ref={canvasRef} className="evo-world-canvas evo-depth-canvas"
    width={Math.ceil(size.width*displayScale)} height={Math.ceil(size.height*displayScale)}
    style={{width:fillWidth?'100%':(zoom*100)+'%'}}
    role="grid" tabIndex={0}
    aria-label={'Isometric terrain depth view with stepped tiles and orbit camera: '+world.width+' by '+
      world.height+' world cells. Click a raised tile to '+
      (brush.kind==='inspect'?'inspect it':'apply the selected map tool')+
      '. Arrow keys move the selection; Enter applies the brush.'}
    onClick={click} onKeyDown={keyboard}/>
    <AtlasDetailCanvas width={size.width} height={size.height} baseDensity={sceneryDensity}
      source={close?detailSource:undefined} onPatch={patch=>{
        detailPatch.current=patch;
        if(patch)paintDetail.current?.(patch);
      }}/>
    {fillWidth&&overlay==='terrain'&&!orbiting&&
      <AtlasWater world={world} width={size.width} height={size.height} square={1.5} showFish={showBuildings} project={p=>{
        const index=Math.floor(p.y)*world.width+Math.floor(p.x);
        const bed=topography.heights[index];
        const point=projector.projectSmooth(p.x-.5,p.y-.5,bed>SEA_LEVEL?bed:SEA_LEVEL-9);
        if(skyArtRef.current&&skylandHit(skyArtRef.current.art,point.x,point.y)!==undefined)return;
        const hit=pickingRef.current;
        if(!hit)return;
        const x=Math.floor(point.x/size.width*hit.width),y=Math.floor(point.y/size.height*hit.height);
        if(hit.ids[y*hit.width+x]===index+1)return point;
      }}/>}
    {fillWidth&&overlay==='terrain'&&showClouds&&!orbiting&&<AtlasClouds world={world}
      width={size.width} unit={DEPTH_TILE_WIDTH/(2*VISUAL_TERRAIN_SIDE)}
      view={depthBlockView(camera)} {...cloudProjection}/>}
  </>;
}
