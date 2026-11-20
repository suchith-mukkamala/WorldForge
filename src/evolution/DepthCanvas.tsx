import {useEffect,useRef} from 'react';
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
import {paintDepthCells} from './depthCellTerrain';
import {AtlasFish} from './AtlasFish';
import {waterSeason} from './riverSeasons';
import {surfaceGrid,VISUAL_TERRAIN_SIDE,type SurfaceGrid} from './surfaceGrid';
import {fitStructure,structureForBuilding,structureSite,surfaceHeightAt,type StructureSite} from './structureGround';
import type {RiverCourse} from './riverCourses';
import {paintRiverCourse} from './riverCourseArt';
import {visibleAtlasSite} from './riverDiscoveries';
import {paintTradeRoutes} from './tradeRoutes';
import {visibleCoastTile} from './worldOutline';
import {isMultiIslandLayout} from './worldGeography';
import {coastalDepth,OCEAN_TONES} from './oceanDepth';
import {paintDepthRoads,paintDepthSurfaceDetail,depthRoadSignature,
  pixelTerrainHash,surfaceColor} from './depthWorldArt';
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
import {createDepthProjector,DEFAULT_DEPTH_CAMERA,DEPTH_RISE,interpolatedGroundHeight,
  type DepthCamera} from './depthProjection';
import {atlasLevel} from './atlasMap';
import {atlasBuildingAt,atlasBuildingBounds,paintAtlasBuilding,
  type AtlasBuilding} from './atlasBuildingArt';
import {blockLandmark,blockProp,blockSettlement,terrainBlockProp,type BlockModel} from './blockModels';
import {blockBuildingArt,blockStampScale,depthBlockView,
  paintBlockScenery,type BlockStamp} from './blockScenery';

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
  return {p:projector.projectSmooth(at.x,at.y,height),model:fitted?fitted.model:model};
}

function addDepthApproach(paths:Map<string,Path2D>,grid:SurfaceGrid,projector:Projector,
  at:Point,side:Point,site:StructureSite){
  const steps=VISUAL_TERRAIN_SIDE,step=1/steps;
  const center=steps/2;
  for(let forward=1;forward<=6;forward++)for(let across=-1;across<=0;across++){
    const offset=(direction:number)=>direction>0?forward:-forward-1;
    const column=at.x*steps+center+(side.x?offset(side.x):across);
    const row=at.y*steps+center+(side.y?offset(side.y):across);
    if(row<0||row>=grid.rows||column<0||column>=grid.columns)continue;
    const x=column*step-.5,y=row*step-.5,h=surfaceHeightAt(grid,x+step/2,y+step/2);
    const edge=site.wet?(forward%2?site.material.wood:site.material.earth):
      (forward%3?site.material.earth:site.material.course)+'b0';
    let path=paths.get(edge);
    if(!path){path=new Path2D();paths.set(edge,path);}
    const corners=[[x,y],[x+step,y],[x+step,y+step],[x,y+step]];
    for(const [i,[u,v]] of corners.entries()){
      const p=projector.projectSmooth(u,v,h);
      if(i)path.lineTo(p.x,p.y);else path.moveTo(p.x,p.y);
    }
    path.closePath();
  }
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
  sceneryDensity:number,showBuildings:boolean,street:boolean){
  const W=w.width,H=w.height,heights=topographyForWorld(w).heights,seed=w.settings.seed;
  const drainage=overlay==='watersheds'?hydrologyForWorld(w):null;
  const season=waterSeason(w);
  const multiShore=isMultiIslandLayout(w.settings.layout);
  const tiled=overlay==='terrain'||overlay==='trade';
  const ocean=tiled?coastalDepth(W,H,i=>w.tiles[i].biome==='water'):null;
  const occupied=overlay==='terrain'?occupiedScenery(w):null;
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
  const ordered=Array.from({length:W*H},(_,i)=>i).filter(i=>multiShore||
    visibleCoastTile(i%W,Math.floor(i/W),W,H,w.tiles[i].biome,seed));
  ordered.sort((a,b)=>projector.order(a%W,Math.floor(a/W))-
    projector.order(b%W,Math.floor(b/W))||a%W-b%W);
  const groundVisible=(index:number,p:Pt)=>{
    const x=Math.floor(p.x*sceneryDensity),y=Math.floor(p.y*sceneryDensity);
    const at=hit.ids[y*hit.width+x];
    return !at||at===index+1;
  };
  if(ocean)paintDepthCells(ctx,hit,w,projector,sceneryDensity,ordered,ATLAS_SEA,index=>{
    const x=index%W,y=Math.floor(index/W),biome=w.tiles[index].biome;
    const grain=pixelTerrainHash(x,y,seed);
    const cover=woodlandHabitat(biome)?woodlandCover(w.woodland,index):undefined;
    const upland=w.settings.landforms?highlandColor(biome,heights[index],grain):undefined;
    return {color:biome==='water'?OCEAN_TONES[ocean[index]]:
      upland??surfaceColor(biome,x,y,seed,cover),grain,water:biome==='water'};
  });
  for(const index of ordered){
      const x=index%W,y=Math.floor(index/W),height=heights[index];
      const p=projector.project(x,y,height);
      const corners=projector.tileCorners(x,y,height);
      const biome=w.tiles[index].biome,palette=PALETTE[biome];
      const cover=tiled&&woodlandHabitat(biome)?woodlandCover(w.woodland,index):undefined;
      const grain=tiled?pixelTerrainHash(x,y,seed):0;
      const fx=projector.frontX,fy=projector.frontY;
      if(!ocean){
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
      if(overlay==='elevation'&&(
        x>0&&Math.floor(heights[index-1]/30)<Math.floor(height/30)||
        y>0&&Math.floor(heights[index-W]/30)<Math.floor(height/30))){
        ctx.strokeStyle='rgba(247,232,193,.8)';ctx.lineWidth=.9;
        ctx.beginPath();ctx.moveTo(corners[3].x,corners[3].y);
        ctx.lineTo(corners[0].x,corners[0].y);ctx.stroke();
      }
      const scenery=biome==='water'?ocean&&ocean[index]<=2&&grain%8===0:
        showBuildings?showAtlasScenery(biome,x,y,seed,street,cover):grain%8===0;
      if(visible&&occupied&&!occupied.has(index)&&scenery){
        const upland=w.settings.landforms?highlandColor(biome,height,grain):undefined;
        const detail=terrainDetailAt(biome,x,y,seed,height,false,cover);
        const prop=upland&&height>=175?'snowstone':terrainBlockProp(detail.motif);
        const tree=isTreeKind(prop);
        if(prop&&(tree||showBuildings)){
          paintBlockScenery(ctx,blockProp(prop,detail.variant,season),p,blockView,
            tree?(showBuildings?1.05:.73):.74);
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
    if(overlay==='terrain')paintDepthRoads(ctx,w,heights,projector);
    const ground=tiled?surfaceGrid(w):undefined;
    for(const site of w.ancientSites??[]){
      if(!visibleAtlasSite(w,site))continue;
      const habitat=structureSite(w,site),art=blockLandmark(site.kind,(site.visits??site.visitors.length)>0,habitat);
      const {p,model}=seatAt(w,ground,site,art,habitat,projector,blockView,1.1);
      paintBlockScenery(ctx,model,p,blockView,1.1);
    }
    for(const ruin of w.ruins??[]){
      const habitat=structureSite(w,ruin);
      const {p,model}=seatAt(w,ground,ruin,blockLandmark('ruin',false,habitat),
        habitat,projector,blockView,1.18);
      paintBlockScenery(ctx,model,p,blockView,1.18);
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
  projector:Projector,blockView:SceneryView,cache:Map<string,BlockStamp>,detail:DepthArtDetail,
  ground:SurfaceGrid|undefined){
  const heights=topographyForWorld(w).heights,actors:DepthActor[]=[];
  const plots:AtlasBuilding[]=[];
  const projected:{building:Building;town:Settlement;x:number;y:number}[]=[];
  const approaches=new Map<string,Path2D>();
  for(const s of w.settlements){
    const buildings=s.infrastructure?.buildings??[];
    if(!buildings.length){
      const site=structureSite(w,s),hub=blockSettlement(settlementStage(s),s.species,site);
      const {p,model}=seatAt(w,ground,s,hub,site,projector,blockView,1.1);
      actors.push({order:p.y+.2,paint:()=>paintBlockScenery(ctx,model,p,blockView,1.1)});
    }
    for(const building of buildings){
      const height=ground?surfaceHeightAt(ground,building.x,building.y):heights[building.y*w.width+building.x];
      const p=projector.projectSmooth(building.x,building.y,height);
      projected.push({building,town:s,x:p.x,y:p.y});
    }
  }
  const candidates=visibleDistrictBuildings(projected,detail).flatMap(entry=>{
    const {building:b,town}=entry,look=structureForBuilding(w,town,b);
    const unit=buildingVisualScale(b.type);
    const {p,model}=seatAt(w,ground,b,look.model,look.site,projector,blockView,1.2*unit);
    const art=blockBuildingArt(cache,model,blockView,1.2);
    if(!art)return [];
    const scale=blockStampScale(unit);
    const plot={building:b,art,scale,
      x:p.x-art.anchor.x*scale,y:p.y-art.anchor.y*scale};
    return [{...entry,door:look.door,site:look.site,plot,p,x:p.x,y:p.y,bounds:atlasBuildingBounds(plot)}];
  });
  const district=uncrowdedDistrictBuildings(candidates);
  district.sort((a,b)=>a.y-b.y);
  for(const {plot,p,door,site} of district){
    if(ground&&door)addDepthApproach(approaches,ground,projector,plot.building,door,site);
    plots.push(plot);
    actors.push({order:p.y+.4,paint:()=>paintAtlasBuilding(ctx,plot)});
  }
  return {actors,plots,approaches};
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
    const ground=interpolatedGroundHeight(heights,w.width,w.height,pos.x,pos.y);
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
      const corners=projector.tileCorners(selected.x,selected.y,heights[index]);
      ctx.lineWidth=2;ctx.strokeStyle='#fff0ac';ctx.beginPath();
      ctx.moveTo(corners[0].x,corners[0].y);
      for(let i=1;i<corners.length;i++)ctx.lineTo(corners[i].x,corners[i].y);
      ctx.closePath();ctx.stroke();
      ctx.fillStyle='#fff2af';ctx.fillRect(p.x-1,p.y-16,3,5);
    }
  }
}

export function DepthCanvas({world,brush,overlay,selected,onSelect,onEdit,river,
  zoom=1,speed=4,relief=2.5,camera=DEFAULT_DEPTH_CAMERA,
  followId=null,personId=null,fillWidth=false,onFollowPosition}:{
  world:World;brush:Brush;overlay:MapOverlay;river?:RiverCourse;
  selected:{x:number;y:number}|null;onSelect:(x:number,y:number)=>void;
  onEdit:(x:number,y:number)=>void;zoom?:number;speed?:number;
  relief?:number;camera?:DepthCamera;followId?:number|null;personId?:number|null;fillWidth?:boolean;
  onFollowPosition?:(x:number,y:number)=>void;
}){
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const sceneryRef=useRef<HTMLCanvasElement|null>(null);
  const atmosphereRef=useRef<HTMLCanvasElement|null>(null);
  const pickingRef=useRef<DepthPicking|null>(null);
  const buildingSpritesRef=useRef<Map<string,BlockStamp>>(new Map());
  const personSpritesRef=useRef<PersonSpriteCache>(new Map());
  const populationSceneRef=useRef<{signature:string;seed:number;
    width:number;height:number;scene:PopulationScene}|null>(null);
  const structureCacheRef=useRef<{signature:string;
    topography:World['topography'];seed:number;relief:number;
    ground:SurfaceGrid|undefined;season:string;roadKey:number;
    yaw:number;pitch:number;detail:DepthArtDetail;
    structures:ReturnType<typeof prepareDepthStructures>}|null>(null);
  const stampRef=useRef<{tiles:World['tiles'];topography:World['topography'];
    woodland:World['woodland'];
    terrainCells:World['terrainCells'];
    overlay:MapOverlay;deposits:World['deposits'];seed:number;
    relief:number;yaw:number;pitch:number;roadKey:number;
    detail:DepthArtDetail;sceneryDensity:number;showBuildings:boolean;season:string;
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
  const terrainCells=overlay==='terrain'||overlay==='trade'?world.terrainCells:undefined;
  const density=depthRenderDensity(zoom,size);
  const sceneryDensity=depthSceneryDensity(zoom,size);
  const season=waterSeason(world);
  useEffect(()=>{
    const canvas=canvasRef.current,ctx=canvas?.getContext('2d');
    if(!canvas||!ctx)return;
    const scenery=sceneryRef.current??document.createElement('canvas');
    const previousPicking=pickingRef.current;
    const pickScale=overlay==='terrain'||overlay==='trade'?sceneryDensity:1;
    const pickWidth=size.width*pickScale,pickHeight=size.height*pickScale;
    const reusePicking=previousPicking?.width===pickWidth&&previousPicking.height===pickHeight;
    const picking=reusePicking?previousPicking:{width:pickWidth,height:pickHeight,
      ids:new Uint32Array(pickWidth*pickHeight)};
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
    const blockView=depthBlockView(camera);
    const occupiedKey=showBuildings&&overlay==='terrain'?structureKey:'';
    const regional=!!world.settings.regionalGeography;
    const siteKey=showBuildings?[
      ...(world.ancientSites??[]).filter(site=>visibleAtlasSite(world,site)).map(site=>
        [site.id,site.x,site.y,site.kind,!!(site.visits??site.visitors.length)].join(':')),
      ...(world.ruins??[]).map(ruin=>[ruin.id,ruin.x,ruin.y,'collapsed'].join(':')),
    ].join('|'):'';
    const landChanged=stamp?.tiles!==world.tiles&&(!stamp||
      overlay==='resources'||stamp.tiles.length!==world.tiles.length||
      stamp.tiles.some((t,i)=>t.biome!==world.tiles[i].biome));
    if(!stamp||!reusePicking||landChanged||stamp.topography!==world.topography||
      stamp.woodland!==woodland||
      stamp.terrainCells!==terrainCells||stamp.season!==season||
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
      renderTerrain(world,overlay,backdrop,picking,projector,blockView,
        sceneryDensity,showBuildings,showResidents);
    }
    stampRef.current={tiles:world.tiles,topography:world.topography,woodland,
      terrainCells,
      overlay,deposits:world.deposits,seed:world.settings.seed,relief,
      yaw:camera.yaw,pitch:camera.pitch,roadKey,detail:zoomDetailTier,season,
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
    const ground=showBuildings&&(overlay==='terrain'||overlay==='trade')?surfaceGrid(world):undefined;
    const structures=!showBuildings?undefined:structureCache&&
      structureCache.signature===structureKey&&
      !landChanged&&structureCache.ground===ground&&structureCache.season===season&&structureCache.roadKey===roadKey&&
      structureCache.topography===world.topography&&
      structureCache.seed===world.settings.seed&&
      structureCache.relief===relief&&structureCache.yaw===camera.yaw&&
      structureCache.pitch===camera.pitch&&
      structureCache.detail===zoomDetailTier?structureCache.structures:
      prepareDepthStructures(ctx,world,projector,blockView,buildingSpritesRef.current,
        zoomDetailTier,ground);
    structureCacheRef.current=structures?{signature:structureKey,
      topography:world.topography,seed:world.settings.seed,
      relief,yaw:camera.yaw,pitch:camera.pitch,detail:zoomDetailTier,
      ground,season,roadKey,structures}:null;
    let frameHandle=0,lastFollow:Point|null=null;
    const draw=(time:number)=>{
      // Maintain identical world-space positions and hit-testing at every
      // zoom; additional pixels resolve the atlas instead of enlarging it.
      ctx.setTransform(density,0,0,density,0,0);
      ctx.clearRect(0,0,size.width,size.height);
      ctx.imageSmoothingEnabled=false;
      ctx.drawImage(scenery,0,0,size.width,size.height);
      if(overlay==='terrain')ctx.drawImage(atmosphere,0,0);
      if(structures)for(const [color,path] of structures.approaches){
        ctx.fillStyle=color;ctx.fill(path);
      }
      if(overlay==='trade'){
        ctx.fillStyle='rgba(12,29,33,.26)';
        ctx.fillRect(0,0,size.width,size.height);
        const heights=topographyForWorld(world).heights;
        paintTradeRoutes(ctx,world.shipments??[],index=>
          projector.project(index%world.width,Math.floor(index/world.width),heights[index]),
          size.width/(canvas.clientWidth||size.width));
      }
      if(river&&overlay==='terrain'){
        const elevations=topographyForWorld(world).heights;
        paintRiverCourse(ctx,river,index=>projector.projectSmooth(index%world.width,
          Math.floor(index/world.width),elevations[index]),size.width/(canvas.clientWidth||size.width));
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
        projector,structures?.actors??[],visibleAgents,personSpritesRef.current,
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
    terrainCells,season,river,camera.yaw,camera.pitch,followId,personId,
    showBuildings,showResidents,onFollowPosition]);
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
    if(!hit)return;
    const column=Math.floor(px/size.width*hit.width),row=Math.floor(py/size.height*hit.height);
    const index=hit.ids[row*hit.width+column]-1;
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
    width={size.width*density} height={size.height*density}
    style={{width:fillWidth?'100%':(zoom*100)+'%'}}
    role="grid" tabIndex={0}
    aria-label={'Isometric terrain depth view with stepped tiles and orbit camera: '+world.width+' by '+
      world.height+' world cells. Click a raised tile to '+
      (brush.kind==='inspect'?'inspect it':'apply the selected map tool')+
      '. Arrow keys move the selection; Enter applies the brush.'}
    onClick={click} onKeyDown={keyboard}/>
    {fillWidth&&overlay==='terrain'&&showBuildings&&
      <AtlasFish world={world} width={size.width} height={size.height} square={1.5} project={p=>{
        const index=Math.floor(p.y)*world.width+Math.floor(p.x);
        const elevation=topographyForWorld(world).heights[index];
        const point=projector.projectSmooth(p.x-.5,p.y-.5,elevation);
        const hit=pickingRef.current;
        if(!hit)return;
        const x=Math.floor(point.x/size.width*hit.width),y=Math.floor(point.y/size.height*hit.height);
        if(hit.ids[y*hit.width+x]===index+1)return point;
      }}/>}
  </>;
}
