import {AtlasClouds} from './AtlasClouds';
import {paintVolcanicSquares} from './volcanicArt';
import {paintOverheadWorldTree} from './worldTreeArt';
import {useEffect,useRef} from 'react';
import type {KeyboardEvent,MouseEvent} from 'react';
import {BIOME_INFO,SPECIES_INFO,type Brush,type World} from './engine';
import {settlementStage} from './construction';
import {RESOURCE_COLORS} from './resources';
import {paintDeposit,paintPerson,paintTerrain,paintRelief,spriteKey,
  PERSON_SPRITE_HEIGHT,PERSON_SPRITE_WIDTH} from './pixelArt';
import {populationScene,renderedPopulation} from './populationVisibility';
import {topographyForWorld} from './topography';
import {hydrologyForWorld} from './hydrology';
import {buildTerrainDetailAtlas,paintTerrainDetail,
  paintTerrainDetailFromAtlas,terrainDetailAt} from './terrainDetails';
import {isTreeKind} from './biomeTrees';
import {woodlandCover,woodlandHabitat} from './woodland';
import {ATLAS_SEA,atlasRivers,highlandColor,occupiedScenery,overheadTerrainColor,
  paintRiverSegment,showAtlasScenery} from './atlasTerrain';
import {surfaceCoastalDepth} from './oceanDepth';
import {pixelTerrainHash} from './depthWorldArt';
import {paintTerrainMosaic} from './terrainCellArt';
import {surfaceGrid,VISUAL_TERRAIN_SIDE} from './surfaceGrid';
import {AtlasWater} from './AtlasWater';
import {springFlood} from './riverSeasons';
import {fruitCycle,fruitStage} from './fruitTrees';
import {animalCalendarTime,animalPose,surfaceAnimals,surfaceFruitAt,surfaceLifeObstacles} from './surfaceLife';
import {boardwalkSite} from './riverArchitecture';
import type {RiverCourse} from './riverCourses';
import {paintRiverCourse} from './riverCourseArt';
import {cavernFlow,cavernFlowKey} from './realmWater';
import {visibleAtlasSite} from './riverDiscoveries';
import {paintTradeRoutes} from './tradeRoutes';
import {actionPose,canAnimate,directionBetween,motionFrame,visualMotionDuration,
  type Facing,type Motion,type Point} from './motion';
import {mortalWorldPoint} from './spatialDetails';
import {mortalMovementDelay} from './mortalGameplay';
import {innateTrait,INNATE_TRAIT_INFO,TRAIT_DOMAIN_INFO} from './innateTraits';
import {updateAtmosphereLayer} from './sceneAtmosphere';
import {personSpriteSize} from './personSpriteScale';
import {buildingVisualScale} from './depthSprites';
import {blockAnimal,blockFruitTree,blockLandmark,blockProp,blockSailboat,blockSettlement,terrainBlockProp} from './blockModels';
import {OVERHEAD_BLOCK_VIEW,blockBuildingArt,blockSceneryArt,placeBlockArt,paintBlockContact,
  depthBlockView,paintBlockScenery,type BlockStamp} from './blockScenery';
import {structureForBuilding,structureSite} from './structureGround';
import {buildingPlots,paintPlotGround,paintPlotOutline,type BuildingPlots} from './buildingPlots';
import {visibleCoastTile} from './worldOutline';
import {isMultiIslandLayout} from './worldGeography';
import {wornPathTiles} from './trailNetwork';
import {ATLAS_TOWN_ZOOM,atlasLevel,atlasScrollGeometry} from './atlasMap';
import {atlasBuildingAt,opaqueArtAt,paintAtlasBuilding,type AtlasBuilding,type PlacedArt} from './atlasBuildingArt';
import {activeVessels} from './vessels';
import {seaPoint} from './shipSave';
import {overheadSkylandHit,paintOverheadSkylands} from './skylandArt';

export const WORLD_CELL_SIZE=6;
const CELL=WORLD_CELL_SIZE;
export type MapOverlay='terrain'|'resources'|'deposits'|'elevation'|'watersheds'|'trade';
const cloudView=depthBlockView({yaw:315,pitch:90});
const overheadCloud=({x,y}:Point)=>({x:x*CELL,y:y*CELL});
const BASIN_COLORS=['#344f5c','#3b5956','#46515c','#4a5e50',
  '#465766','#50545f','#3d605f','#505e54'];
/** Only these zoom boundaries add scenic objects; fractional steps within a
 * tier change CSS magnification but do not need a new terrain raster. */
export const sceneryZoomTier=(zoom:number)=>zoom>=ATLAS_TOWN_ZOOM?2:zoom>=2?1:0;
/** Pixel-art fantasy map. Canvas redraw depends ONLY on world / map settings. */
export function WorldCanvas({
  world,brush,overlay,selected,onSelect,onEdit,zoom=1,speed=4,river,
  followId=null,personId=null,fillWidth=false,onFollowPosition,onDiagnostics,
  showSkylands=true,onSkyland,showClouds=false,
}:{
  world:World;brush:Brush;overlay:MapOverlay;river?:RiverCourse;
  selected:{x:number;y:number}|null;
  onSelect:(x:number,y:number)=>void;onEdit:(x:number,y:number)=>void;
  zoom?:number;speed?:number;followId?:number|null;personId?:number|null;fillWidth?:boolean;
  onFollowPosition?:(x:number,y:number)=>void;
  onDiagnostics?:(stats:{drawn:number;frameMs:number})=>void;
  showSkylands?:boolean;showClouds?:boolean;onSkyland?:(id:number)=>void;
}){
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const mapWidth=world.width*CELL,mapHeight=world.height*CELL;
  const terrainCells=overlay==='terrain'||overlay==='trade'?world.terrainCells:undefined;
  const skylands=overlay==='terrain'&&showSkylands?world.skylands:undefined;
  // Integer multiples of the eight-square lattice make every top-down square
  // the same size on the backing surface as well as in world coordinates.
  const cellPixels=VISUAL_TERRAIN_SIDE*Math.max(1,Math.min(zoom>=5?6:zoom>=2?4:2,
    Math.floor(Math.sqrt(16_000_000/(world.width*world.height))/VISUAL_TERRAIN_SIDE)));
  const density=cellPixels/CELL;
  const cycle=fruitCycle(world),{season,ripe}=cycle;
  const backgroundRef=useRef<HTMLCanvasElement|null>(null);
  const atmosphereRef=useRef<HTMLCanvasElement|null>(null);
  const terrainAtlasRef=useRef<HTMLCanvasElement|null>(null);
  const buildingArtRef=useRef<Map<string,BlockStamp>>(new Map());
  const buildingPlotsRef=useRef<AtlasBuilding[]>([]);
  const fruitSpritesRef=useRef<(PlacedArt&{target:Point})[]>([]);
  const plotGroundRef=useRef<BuildingPlots|undefined>(undefined);
  const backgroundStamp=useRef<{
    tiles:World['tiles'];topography:World['topography'];woodland:World['woodland'];
    settlementKey:string;
    ruins:World['ruins'];deposits:World['deposits'];
    ancientSites:World['ancientSites'];
    transport:World['transport'];sceneryTier:number;overlay:string;seed:number;
    street:boolean;regional:boolean;
    terrainCells:World['terrainCells'];skylands:World['skylands'];worldTree:World['worldTree'];
    width:number;height:number;season:string;feederKey:string;
    ripe:boolean;fruitHarvest:World['fruitHarvest'];
  }|null>(null);
  const spriteCache=useRef<Map<string,HTMLCanvasElement>>(new Map());
  const prior=useRef<{year:number;day:number;seed:number;
    positions:Map<number,Point>}|null>(null);
  const facing=useRef<Map<number,Facing>>(new Map());
  const motions=useRef<Map<number,Motion>>(new Map());
  useEffect(()=>{
    const canvas=canvasRef.current,visible=canvas?.getContext('2d');
    if(!canvas||!visible)return;
    const background=backgroundRef.current??document.createElement('canvas');
    backgroundRef.current=background;
    if(background.width!==canvas.width)background.width=canvas.width;
    if(background.height!==canvas.height)background.height=canvas.height;
    const ctx=background.getContext('2d');if(!ctx)return;
    const W=world.width,H=world.height;
    const stamp=backgroundStamp.current;
    // Most annual world ticks replace settlement arrays even when their
    // visible buildings and roads are unchanged. Compare the actual scenery
    // instead of repainting every terrain pixel on population-only changes.
    const settlementKey=world.settlements.map(s=>{
      const infra=s.infrastructure;
      return [s.x,s.y,s.species,settlementStage(s),
        (infra?.roads??[]).join(','),
        (infra?.buildings??[]).map(b=>[
          b.x,b.y,b.type,b.stage,Math.round(b.progress),
          Math.round(b.condition),b.culture,b.tier??0].join(':')).join(',')
      ].join('/');
    }).join('|');
    // Food-only updates can occur every simulated day. Repaint the resource
    // heatmap when appropriate, but avoid rasterizing all scenery again when
    // every actual biome and structure is unchanged.
    const landChanged=stamp?.tiles!==world.tiles&&
      (overlay==='resources'||!stamp||stamp.tiles.length!==world.tiles.length||
        stamp.tiles.some((tile,i)=>tile.biome!==world.tiles[i].biome));
    const sceneryTier=sceneryZoomTier(zoom);
    const showBuildings=sceneryTier===2;
    const showResidents=atlasLevel(zoom)==='street';
    const regional=!!world.settings.regionalGeography;
    const woodland=overlay==='terrain'||overlay==='trade'?world.woodland:undefined;
    const feederKey=cavernFlowKey(cavernFlow(world));
    const sceneryChanged=!stamp||landChanged||
      stamp.topography!==world.topography||
      stamp.terrainCells!==terrainCells||stamp.skylands!==world.skylands||stamp.worldTree!==world.worldTree||stamp.season!==season||
      overlay==='terrain'&&(stamp.ripe!==ripe||stamp.fruitHarvest!==world.fruitHarvest)||
      stamp.woodland!==woodland||stamp.feederKey!==feederKey||
      stamp.settlementKey!==settlementKey||stamp.ruins!==world.ruins||
      stamp.ancientSites!==world.ancientSites||
      overlay==='deposits'&&stamp.deposits!==world.deposits||stamp.transport!==world.transport||
      stamp.sceneryTier!==sceneryTier||stamp.overlay!==overlay||
      stamp.street!==showResidents||stamp.regional!==regional||
      stamp.seed!==world.settings.seed||stamp.width!==canvas.width||
      stamp.height!==canvas.height;
    if(sceneryChanged){
    ctx.setTransform(density,0,0,density,0,0);
    ctx.clearRect(0,0,mapWidth,mapHeight);
    ctx.imageSmoothingEnabled=false;
    const tiled=overlay==='terrain'||overlay==='trade';
    if(tiled){
      ctx.fillStyle=ATLAS_SEA;
      ctx.fillRect(0,0,mapWidth,mapHeight);
    }
    const occupied=overlay==='terrain'?occupiedScenery(world):null;
    const lifeSites=occupied?surfaceLifeObstacles(world):null;
    const fruitSprites:typeof fruitSpritesRef.current=[];
    const treeCover=occupied&&world.worldTree?surfaceGrid(world).treeCover:undefined;
    const yard=showBuildings&&tiled?buildingPlots(world):undefined;
    plotGroundRef.current=yard;
    if(occupied&&!terrainAtlasRef.current){
      const atlas=document.createElement('canvas');
      if(buildTerrainDetailAtlas(atlas))terrainAtlasRef.current=atlas;
    }
    const atlas=terrainAtlasRef.current;
    const heights=topographyForWorld(world).heights;
    const drainage=overlay==='terrain'||overlay==='watersheds'?
      hydrologyForWorld(world):null;
    const multiShore=isMultiIslandLayout(world.settings.layout);
    const ocean=tiled?surfaceCoastalDepth(world):null;
    if(ocean)paintTerrainMosaic(ctx,world,CELL,index=>{
      const {biome}=world.tiles[index],x=index%W,y=Math.floor(index/W);
      if(!multiShore&&!visibleCoastTile(x,y,W,H,biome,world.settings.seed))return;
      const grain=pixelTerrainHash(x,y,world.settings.seed);
      const cover=woodlandHabitat(biome)?woodlandCover(woodland,index):undefined;
      const upland=world.settings.landforms?highlandColor(biome,heights[index],grain):undefined;
      return {color:upland??overheadTerrainColor(biome,ocean[index],cover),grain,water:biome==='water'};
    },ATLAS_SEA);
    if(yard)paintPlotGround(ctx,yard,CELL);
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      const tile=world.tiles[y*W+x],biome=BIOME_INFO[tile.biome];
      if(!multiShore&&!visibleCoastTile(x,y,W,H,tile.biome,world.settings.seed))continue;
      const px=x*CELL,py=y*CELL;
      const index=y*W+x,h=heights[index];
      const cover=tiled&&woodlandHabitat(tile.biome)?woodlandCover(woodland,index):undefined;
      const grain=tiled?pixelTerrainHash(x,y,world.settings.seed):0;
      const upland=tiled&&world.settings.landforms?highlandColor(tile.biome,h,grain):undefined;
      if(overlay==='watersheds'&&drainage){
        ctx.fillStyle=tile.biome==='water'?'#285d7a':
          BASIN_COLORS[(drainage.basin[index]>>>0)%BASIN_COLORS.length];
        ctx.fillRect(px,py,CELL,CELL);
        if(drainage.pondDepth[index]>=6&&tile.biome!=='water'){
          // Potential impoundment, deliberately not converted into water.
          ctx.fillStyle='#4b8a98';ctx.fillRect(px+1,py+1,4,4);
        }
      }
      if(!tiled&&overlay!=='watersheds'&&overlay!=='elevation'){
        paintTerrain(ctx,tile.biome,biome.color,x,y,world.settings.seed);
      }
      if(!tiled&&overlay!=='watersheds')paintRelief(ctx,x,y,h,{north:y>0?heights[index-W]:h,
        south:y<H-1?heights[index+W]:h,
        west:x>0?heights[index-1]:h,
        east:x<W-1?heights[index+1]:h},
        tile.biome,overlay==='elevation'?'elevation':'terrain');
      const scenery=tile.biome==='water'?ocean&&ocean[index]<=2&&grain%9===0:
        showBuildings?showAtlasScenery(tile.biome,x,y,world.settings.seed,showResidents,cover):grain%3!==0;
      const insideTree=treeCover?.has(index);
      const fruit=lifeSites&&!insideTree&&(showBuildings||grain%3===0)?surfaceFruitAt(world,index,lifeSites):undefined;
      if(fruit){
        const model=blockFruitTree(fruit.kind,fruit.variant,fruitStage(world,fruit,cycle),season);
        const art=blockSceneryArt(model,{x:px+CELL/2,y:py+CELL/2},OVERHEAD_BLOCK_VIEW,showBuildings?.78:.39);
        if(art){
          paintAtlasBuilding(ctx,art);
          if(showBuildings)fruitSprites.push({...art,target:fruit});
        }
      }else if(occupied&&!occupied.has(index)&&!yard?.clear.has(index)&&!insideTree&&scenery){
        const water=tile.biome==='water';
        const shore=y>0&&(world.tiles[index-W].biome==='water')!==water||
          y<H-1&&(world.tiles[index+W].biome==='water')!==water||
          x>0&&(world.tiles[index-1].biome==='water')!==water||
          x<W-1&&(world.tiles[index+1].biome==='water')!==water;
        const detail=terrainDetailAt(tile.biome,x,y,world.settings.seed,h,shore,cover);
        const natural=upland&&h>=175?'snowstone':terrainBlockProp(detail.motif);
        const prop=yard?.fringe.has(index)&&isTreeKind(natural)?'scrub':natural;
        if(prop){
          const tree=isTreeKind(prop);
          paintBlockScenery(ctx,blockProp(prop,detail.variant,season),{x:px+CELL/2,y:py+CELL/2},
            OVERHEAD_BLOCK_VIEW,tree?(showBuildings?.78:.39):showBuildings?.56:.28);
        }else if(atlas)paintTerrainDetailFromAtlas(ctx,atlas,detail,x,y,!showBuildings);
        else if(showBuildings)paintTerrainDetail(ctx,detail,x,y);
      }
      if(overlay==='resources'&&tile.biome!=='water'){
        const fullness=Math.min(1,tile.food/Math.max(1,biome.food*world.settings.resourceLevel));
        ctx.fillStyle=fullness>.66?'rgba(117,255,176,.34)':
          fullness>.32?'rgba(233,202,99,.35)':'rgba(255,88,124,.45)';
        ctx.fillRect(px,py,CELL,CELL);
      }
    }
    if(drainage&&overlay==='watersheds'){
      const center=(i:number)=>({x:(i%W+.5)*CELL,y:(Math.floor(i/W)+.5)*CELL});
      for(const {from,to,tier} of atlasRivers(drainage,showBuildings||overlay==='watersheds')){
        const a=center(from),end=center(to);
        const middle={x:(a.x+end.x)/2,y:(a.y+end.y)/2};
        const b=world.tiles[to].biome==='water'?middle:end;
        paintRiverSegment(ctx,a,b,tier,overlay==='watersheds');
      }
    }
    if(overlay==='deposits'){
      for(const d of world.deposits??[]){
        const x=d.index%W,y=Math.floor(d.index/W),px=x*CELL,py=y*CELL;
        if(d.amount<.1)continue;
        paintDeposit(ctx,d.kind,x,y,d.amount,d.capacity);
        ctx.fillStyle='rgba(8,14,27,.8)';
        ctx.fillRect(px,py+5,6,1);
        ctx.fillStyle=RESOURCE_COLORS[d.kind];
        ctx.fillRect(px,py+5,6*d.amount/d.capacity,1);
      }
    }
    if(showBuildings&&overlay==='terrain'){
      const worn=wornPathTiles(world.trails??[],world.width,world.height);
      for(const s of world.settlements){
        for(const id of s.infrastructure?.roads??[]){
          if(!worn.has(id)&&!yard?.streetLinks.has(id))continue;
          const x=id%W,y=Math.floor(id/W);
          const walk=boardwalkSite(world,id);
          if(!walk&&springFlood(world,id))continue;
          ctx.fillStyle=walk?'#9c7956':'rgba(239,207,151,.65)';
          ctx.fillRect(x*CELL+1,y*CELL+2,CELL-2,2);
          if(walk){
            ctx.fillStyle='#dac197';
            ctx.fillRect(x*CELL+1,y*CELL+2,1,2);ctx.fillRect(x*CELL+4,y*CELL+2,1,2);
          }
        }
      }
    }
    if(sceneryTier>0&&overlay==='terrain')for(const road of world.transport?.roads??[]){
      if(road.condition<=25)continue;
      const x=road.index%W,y=Math.floor(road.index/W);
      const walk=boardwalkSite(world,road.index);
      ctx.fillStyle=walk?'#ae8b63':'rgba(229,185,111,.85)';
      ctx.fillRect(x*CELL,y*CELL+2,CELL,3);
      if(walk){
        ctx.fillStyle='#d9bd8c';
        for(let beam=0;beam<CELL;beam+=2)ctx.fillRect(x*CELL+beam,y*CELL+2,1,3);
      }
      if(showBuildings){
        ctx.fillStyle='#725f53';ctx.fillRect(x*CELL+2,y*CELL+3,2,1);
      }
    }
    if(sceneryTier>0&&overlay==='terrain')for(const bridge of world.transport?.bridges??[]){
      if(bridge.condition<=25)continue;
      const x=bridge.index%W,y=Math.floor(bridge.index/W);
      ctx.fillStyle='#f2d1a0';ctx.fillRect(x*CELL,y*CELL+1,CELL,4);
      ctx.fillStyle='#876b58';ctx.fillRect(x*CELL+1,y*CELL+2,1,3);
      ctx.fillRect(x*CELL+4,y*CELL+2,1,3);
    }
    if(showBuildings){
      const center=(x:number,y:number)=>({x:(x+.5)*CELL,y:(y+.5)*CELL});
      for(const ruin of world.ruins??[]){
        const model=blockLandmark('ruin',false,structureSite(world,ruin)),p=center(ruin.x,ruin.y);
        paintBlockContact(ctx,model,p,OVERHEAD_BLOCK_VIEW,1.08);
        paintBlockScenery(ctx,model,p,OVERHEAD_BLOCK_VIEW,1.08);
      }
      for(const site of world.ancientSites??[]){
        if(!visibleAtlasSite(world,site))continue;
        const model=blockLandmark(site.kind,(site.visits??site.visitors.length)>0,structureSite(world,site));
        const p=center(site.x,site.y);
        paintBlockContact(ctx,model,p,OVERHEAD_BLOCK_VIEW,1.08);
        paintBlockScenery(ctx,model,p,OVERHEAD_BLOCK_VIEW,1.08);
      }
      for(const s of world.settlements){
        if(s.infrastructure?.buildings.length)continue;
        const model=blockSettlement(settlementStage(s),s.species,structureSite(world,s)),p=center(s.x,s.y);
        paintBlockContact(ctx,model,p,OVERHEAD_BLOCK_VIEW,1);
        paintBlockScenery(ctx,model,p,OVERHEAD_BLOCK_VIEW,1);
      }
    }
    const plots:AtlasBuilding[]=[];
    if(showBuildings){
      const buildings=world.settlements.flatMap(town=>
        (town.infrastructure?.buildings??[]).map(b=>({b,town})));
      const arranged=buildings.map(({b,town})=>{
        const plot=yard?.buildings.get(b.y*W+b.x);
        return {b,model:plot?.model??structureForBuilding(world,town,b).model,
          at:plot?.placement.at??b,fit:plot?.placement.scale??1};
      }).sort((a,b)=>a.at.y-b.at.y);
      for(const {b,model,at,fit} of arranged){
        const art=blockBuildingArt(buildingArtRef.current,model,OVERHEAD_BLOCK_VIEW,1.2);
        if(!art)continue;
        const unit=buildingVisualScale(b.type)*fit;
        const p={x:(at.x+.5)*CELL,y:(at.y+.5)*CELL};
        paintBlockContact(ctx,model,p,OVERHEAD_BLOCK_VIEW,unit*1.2);
        plots.push({building:b,...placeBlockArt(art,p,unit)});
      }
      for(const plot of plots)paintAtlasBuilding(ctx,plot);
    }
    if(overlay==='terrain'&&world.worldTree)paintOverheadWorldTree(ctx,world,CELL);
    buildingPlotsRef.current=plots;
    fruitSpritesRef.current=fruitSprites;
    backgroundStamp.current={tiles:world.tiles,
      topography:world.topography,settlementKey,
      ruins:world.ruins,deposits:world.deposits,transport:world.transport,
      ancientSites:world.ancientSites,
      woodland,sceneryTier,overlay,seed:world.settings.seed,street:showResidents,regional,
      terrainCells,skylands:world.skylands,worldTree:world.worldTree,
      width:canvas.width,height:canvas.height,season,feederKey,ripe,fruitHarvest:world.fruitHarvest};
    }
    else if(stamp)stamp.tiles=world.tiles;
    const current=new Map(world.agents.map(a=>[a.id,
      world.descent?.mode==='mortal'&&world.descent.agentId===a.id?
        {x:a.x,y:a.y}:mortalWorldPoint(a,world)]));
    const previous=prior.current;
    const now=performance.now();
    const day=world.dayOfYear??0;
    if(!previous||previous.seed!==world.settings.seed||
      world.year<previous.year||world.year-previous.year>1||
      world.year===previous.year&&day<previous.day){
      motions.current.clear();facing.current.clear();spriteCache.current.clear();
    }else if(world.year>previous.year||day!==previous.day||
      [...current].some(([id,to])=>{
        const from=previous.positions.get(id);
        return !!from&&(from.x!==to.x||from.y!==to.y);
      })){
      const duration=visualMotionDuration(speed);
      const nextMotions=new Map<number,Motion>();
      const agentsById=new Map(world.agents.map(a=>[a.id,a]));
      for(const [id,to] of current){
        const isMortal=world.descent?.mode==='mortal'&&id===world.descent.agentId;
        const old=motions.current.get(id);
        const from=isMortal&&old?.to&&previous.positions.has(id)?
          motionFrame(old,now):previous.positions.get(id);
        if(!from)continue;
        if(canAnimate(from,to)){
          const direction=directionBetween(from,to,facing.current.get(id));
          facing.current.set(id,direction);
          nextMotions.set(id,{from,to,start:now,
            duration:isMortal&&agentsById.has(id)?
              mortalMovementDelay(agentsById.get(id)!)+25:duration,
            facing:direction});
        }
      }
      motions.current=nextMotions;
    }
    prior.current={year:world.year,day,seed:world.settings.seed,positions:current};
    for(const id of [...facing.current.keys()])if(!current.has(id))facing.current.delete(id);
    if(spriteCache.current.size>6500)spriteCache.current.clear();
    // Presentation-only visibility data, cached for this world update.
    const scene=populationScene(world);
    const atmosphere=atmosphereRef.current??document.createElement('canvas');
    atmosphereRef.current=atmosphere;
    if(atmosphere.width!==mapWidth)atmosphere.width=mapWidth;
    if(atmosphere.height!==mapHeight)atmosphere.height=mapHeight;
    if(overlay==='terrain')updateAtmosphereLayer(atmosphere,
      world.settings.seed,world.year,day,'overhead');
    const scrollParent=canvas.closest<HTMLElement>('.evo-map-scroll')??canvas.parentElement;
    const bounds=()=>{
      const screen=canvas.getBoundingClientRect();
      const width=screen.width||canvas.width,height=screen.height||canvas.height;
      const scroll=fillWidth&&scrollParent&&canvas.parentElement?
        atlasScrollGeometry(scrollParent,canvas.parentElement):scrollParent;
      const x=(scroll?.scrollLeft??0)/width*W;
      const y=(scroll?.scrollTop??0)/height*H;
      const w=(scrollParent?.clientWidth??width)/width*W;
      const h=(scrollParent?.clientHeight??height)/height*H;
      return {minX:Math.max(0,Math.floor(x)-3),minY:Math.max(0,Math.floor(y)-3),
        maxX:Math.min(W-1,Math.ceil(x+w)+3),
        maxY:Math.min(H-1,Math.ceil(y+h)+3)};
    };
    const animatingCloseup=zoom>=4&&(selected!==null||followId!==null);
    const boats=overlay==='terrain'||overlay==='trade'?activeVessels(world):[];
    const animalTime=animalCalendarTime(world);
    const animals=overlay==='terrain'&&showResidents?surfaceAnimals(world).map(track=>{
      const pose=animalPose(track,animalTime,false);
      return {...pose,model:blockAnimal(track.kind,pose.facing,0,track.variant,track.young),unit:track.young?.44:.64};
    }):[];
    const crew=new Set(boats.flatMap(ship=>ship.crew===undefined?[]:[ship.crew]));
    const pedestrians=crew.size?world.agents.filter(a=>!crew.has(a.id)):world.agents;
    let handle=0,lastFrame=-Infinity,previouslyWalking=false;
    let cachedVisible:ReturnType<typeof renderedPopulation>|null=null;
    let lastFollowX=NaN,lastFollowY=NaN;
    let lastReport=-Infinity;
    const draw=(timestamp:number)=>{
      // Animation is presentation-only and capped to limit large-world GPU work.
      if(timestamp-lastFrame<1000/(previouslyWalking?24:5)){
        handle=requestAnimationFrame(draw);return;
      }
      lastFrame=timestamp;
      const drawStart=performance.now();
      visible.setTransform(density,0,0,density,0,0);
      visible.clearRect(0,0,mapWidth,mapHeight);
      visible.imageSmoothingEnabled=false;
      visible.drawImage(background,0,0,mapWidth,mapHeight);
      if(overlay==='terrain'){
        visible.drawImage(atmosphere,0,0);
        paintVolcanicSquares(visible,world,CELL);
      }
      if(river&&overlay==='terrain')paintRiverCourse(visible,river,index=>({
        x:(index%W+.5)*CELL,y:(Math.floor(index/W)+.5)*CELL,
      }),mapWidth/(canvas.clientWidth||mapWidth));
      if(overlay==='trade'){
        visible.fillStyle='rgba(12,29,33,.26)';
        visible.fillRect(0,0,mapWidth,mapHeight);
        paintTradeRoutes(visible,world.shipments??[],index=>({
          x:(index%W+.5)*CELL,y:(Math.floor(index/W)+.5)*CELL,
        }),mapWidth/(canvas.clientWidth||mapWidth));
      }
      for(const ship of boats){
        const {x,y}=seaPoint(W,ship.at);
        paintBlockScenery(visible,blockSailboat(ship.heading,ship.merchant),
          {x:(x+.5)*CELL,y:(y+.5)*CELL},OVERHEAD_BLOCK_VIEW,.59);
      }
      const viewport=animals.length?bounds():null;
      for(const animal of animals){
        const {x,y,model,unit}=animal;
        if(viewport&&(x<viewport.minX||x>viewport.maxX||y<viewport.minY||y>viewport.maxY))continue;
        paintBlockScenery(visible,model,{x:(x+.5)*CELL,y:(y+.5)*CELL},OVERHEAD_BLOCK_VIEW,unit);
      }
      // Visible footprints come from actual adjacent positions in the world,
      // never a guessed line between two distant yearly snapshots.
      // Cull sprites outside the camera; preserve tracked character and tile.
      const ordered=cachedVisible??(cachedVisible=renderedPopulation(
        pedestrians,scene,{bounds:bounds(),zoom,focusId:followId??personId,
          focusOnly:!showResidents||overlay==='trade'}));
      const tracked=ordered.find(a=>a.id===(followId??personId));
      if(showResidents&&tracked?.cognition?.trail.length){
        const points=tracked.cognition.trail.map(id=>
          ({x:id%W,y:Math.floor(id/W)}));
        visible.save();visible.strokeStyle='rgba(248,220,145,.75)';
        visible.lineWidth=1.2;visible.beginPath();
        for(let i=1;i<points.length;i++){
          if(Math.max(Math.abs(points[i].x-points[i-1].x),
            Math.abs(points[i].y-points[i-1].y))!==1)continue;
          visible.moveTo(points[i-1].x*CELL+3,points[i-1].y*CELL+3);
          visible.lineTo(points[i].x*CELL+3,points[i].y*CELL+3);
        }
        visible.stroke();
        const route=tracked.cognition.route;
        if(route&&route.indices.length>route.cursor+1){
          visible.beginPath();visible.setLineDash([2,3]);
          visible.strokeStyle='rgba(129,218,207,.7)';
          for(let i=route.cursor+1;i<route.indices.length;i++){
            const from=route.indices[i-1],to=route.indices[i];
            visible.moveTo((from%W)*CELL+3,Math.floor(from/W)*CELL+3);
            visible.lineTo((to%W)*CELL+3,Math.floor(to/W)*CELL+3);
          }
          visible.stroke();
        }
        visible.restore();
      }
      const positions=new Map<number,Point>();
      let active=false;
      for(const a of ordered){
        const movement=motions.current.get(a.id);
        const frame=movement?motionFrame(movement,timestamp):null;
        const destination=current.get(a.id);
        const x=frame?.x??destination?.x??a.x;
        const y=frame?.y??destination?.y??a.y;
        positions.set(a.id,{x,y});
        if(frame?.walking)active=true;
        const px=x*CELL,py=y*CELL;
        if(zoom<3){
          // One world tile is 6×6 native pixels. A person is deliberately
          // smaller than that tile even at normal overview zoom.
          visible.fillStyle='#081323';visible.fillRect(px+2,py+3,1,1);
          visible.fillStyle=SPECIES_INFO[a.species].color;
          visible.fillRect(px+2,py+1,1,2);
          continue;
        }
        const direction=frame?.facing??facing.current.get(a.id)??'south';
        const focus=selected?.x===a.x&&selected?.y===a.y||followId===a.id;
        const resting=focus&&!frame?.walking&&animatingCloseup;
        const stride=frame?.stride??(resting&&Math.floor(timestamp/650)%4===1?2:0);
        const pose=frame?.walking?'walk':actionPose(
          a.cognition?.today?.action??a.dailyLife?.activity);
        const key=spriteKey(a)+':'+direction+':'+stride+':'+pose;
        let sprite=spriteCache.current.get(key);
        if(!sprite){
          sprite=document.createElement('canvas');
          sprite.width=PERSON_SPRITE_WIDTH;sprite.height=PERSON_SPRITE_HEIGHT;
          const painter=sprite.getContext('2d');
          if(painter)paintPerson(painter,a,0,0,direction,stride,pose);
          spriteCache.current.set(key,sprite);
        }
        // Far away: cheap map symbols. Close up: recognizable pixel people.
        // The atlas is cached by identity, direction and animation frame, so
        // changing zoom only alters blit size, not animation or simulation.
        const {width,height}=personSpriteSize(zoom,focus);
        visible.drawImage(sprite,px+3-Math.floor(width/2),py+5-height,width,height);
        if(a.awakening){
          // Tiny, non-colliding pixel motes show awakened gifts without making
          // a person the size of a whole tile or changing map selection.
          const gift=INNATE_TRAIT_INFO[innateTrait(world.settings.seed,a)];
          const color=TRAIT_DOMAIN_INFO[gift.domain].color;
          visible.fillStyle=color;
          visible.fillRect(px+1,py-3,1,1);
          visible.fillRect(px+5,py-7,1,1);
          if(zoom>=5)visible.fillRect(px+2,py-10,1,1);
        }
        if(a.mind?.expedition?.stage==='travel'){
          visible.fillStyle='#7d5947';visible.fillRect(px-4,py-6,3,5);
          visible.fillStyle='#d1b68a';visible.fillRect(px-3,py-6,1,2);
        }
        if(a.artifacts?.length){
          visible.fillStyle='#efd48b';visible.fillRect(px+7,py-10,2,2);
          visible.fillStyle='#fff3c3';visible.fillRect(px+7,py-11,1,1);
        }
        if(a.partnerId!==undefined){
          visible.fillStyle='#ffe1b3';visible.fillRect(px+6,py-8,2,2);
        }
      }
      if(showResidents&&overlay!=='trade')for(const shipment of world.shipments??[]){
        const p=positions.get(shipment.carrierId);if(!p)continue;
        const px=p.x*CELL,py=p.y*CELL;
        if(shipment.mode==='sea'){
          visible.fillStyle='#332f3b';visible.fillRect(px-3,py+3,12,2);
          visible.fillStyle='#c0925c';visible.fillRect(px-2,py+1,10,3);
          visible.fillStyle='#f5e8c5';visible.fillRect(px+2,py-8,1,10);
          visible.fillRect(px-1,py-7,3,6);
          visible.fillStyle='#d3dbea';visible.fillRect(px+3,py-5,3,5);
          visible.fillStyle='#825e50';visible.fillRect(px+5,py+2,2,1);
        }else{
          visible.fillStyle='#3d3340';visible.fillRect(px-2,py+1,10,4);
          visible.fillStyle='#d4ae79';visible.fillRect(px-1,py,8,4);
          visible.fillStyle='#b2835c';visible.fillRect(px,py-2,5,2);
          visible.fillStyle='#242d39';visible.fillRect(px,py+5,2,2);
          visible.fillRect(px+5,py+5,2,2);
        }
      }
      if(skylands)paintOverheadSkylands(visible,skylands,CELL);
      if(selected&&world.descent?.mode!=='mortal'){
        const plot=plotGroundRef.current?.buildings.get(selected.y*W+selected.x);
        if(plot?.outline.length)paintPlotOutline(visible,plot,(x,y)=>({x:(x+.5)*CELL,y:(y+.5)*CELL}),.42);
        else{
          const marked=ordered.find(a=>a.x===selected.x&&a.y===selected.y);
          const marker=marked?positions.get(marked.id):selected;
          const px=(marker?.x??selected.x)*CELL,py=(marker?.y??selected.y)*CELL;
          visible.strokeStyle='#fff3b4';visible.lineWidth=2;
          visible.strokeRect(px+.5,py+.5,CELL-1,CELL-1);
          visible.strokeStyle='#15192e';visible.lineWidth=1;
          visible.strokeRect(px-.5,py-.5,CELL+1,CELL+1);
        }
      }
      if(followId!==null){
        const tracked=positions.get(followId);
        if(tracked&&(Math.abs(tracked.x-lastFollowX)>.06||
          Math.abs(tracked.y-lastFollowY)>.06)){
          lastFollowX=tracked.x;lastFollowY=tracked.y;
          onFollowPosition?.(tracked.x,tracked.y);
        }
      }
      previouslyWalking=active;
      if(onDiagnostics&&timestamp-lastReport>=1000){
        lastReport=timestamp;
        onDiagnostics({drawn:ordered.length,
          frameMs:Math.max(0,performance.now()-drawStart)});
      }
      // A stationary selected person no longer forces perpetual idle repaints.
      if(active)handle=requestAnimationFrame(draw);
      else handle=0;
    };
    draw(now);
    // Recalculate visibility after scrolling, without changing world state.
    const onScroll=()=>{cachedVisible=null;
      if(!handle)handle=requestAnimationFrame(draw);};
    scrollParent?.addEventListener('scroll',onScroll,{passive:true});
    return ()=>{
      scrollParent?.removeEventListener('scroll',onScroll);
      cancelAnimationFrame(handle);
    };
  },[world.year,world.agents,world.tiles,world.settlements,world.ruins,
    world.deposits,world.transport,world.shipments,world.settings.seed,world.woodland,
    world.settings.regionalGeography,
    terrainCells,season,ripe,world.fruitHarvest,world.wildlife,density,mapWidth,mapHeight,river,
    overlay,selected,zoom,speed,followId,personId,fillWidth,onFollowPosition,onDiagnostics,
    world.topography,world.dayOfYear,world.ancientSites,world.trails,world.skylands,world.worldTree,skylands]);
  const select=(event:MouseEvent<HTMLCanvasElement>)=>{
    const rect=event.currentTarget.getBoundingClientRect();
    const px=(event.clientX-rect.left)/rect.width*world.width*CELL;
    const py=(event.clientY-rect.top)/rect.height*world.height*CELL;
    if(skylands&&onSkyland&&brush.kind==='inspect'){
      const island=overheadSkylandHit(skylands,px/CELL,py/CELL);
      if(island!==undefined){onSkyland(island);return;}
    }
    if(brush.kind==='inspect'&&atlasLevel(zoom)!=='world'){
      const building=atlasBuildingAt(buildingPlotsRef.current,px,py);
      if(building){onSelect(building.x,building.y);return;}
      const fruits=fruitSpritesRef.current;
      for(let i=fruits.length-1;i>=0;i--){
        const {target}=fruits[i];
        if(opaqueArtAt(fruits[i],px,py)){onSelect(target.x,target.y);return;}
      }
    }
    const x=Math.floor(px/CELL),y=Math.floor(py/CELL);
    if(x<0||x>=world.width||y<0||y>=world.height)return;
    if(brush.kind==='inspect')onSelect(x,y);
    else onEdit(x,y);
  };
  const keyboard=(event:KeyboardEvent<HTMLCanvasElement>)=>{
    if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter',' '].includes(event.key))return;
    event.preventDefault();
    const current=selected??{x:Math.floor(world.width/2),y:Math.floor(world.height/2)};
    let {x,y}=current;
    if(event.key==='ArrowUp')y=Math.max(0,y-1);
    if(event.key==='ArrowDown')y=Math.min(world.height-1,y+1);
    if(event.key==='ArrowLeft')x=Math.max(0,x-1);
    if(event.key==='ArrowRight')x=Math.min(world.width-1,x+1);
    if(event.key==='Enter'||event.key===' '){
      if(brush.kind!=='inspect')onEdit(x,y);
    }else onSelect(x,y);
  };
  return <><canvas ref={canvasRef} className="evo-world-canvas"
    width={world.width*cellPixels} height={world.height*cellPixels}
    style={{width:fillWidth?'100%':(zoom*100)+'%'}}
    role="grid" tabIndex={0}
    aria-label={'Interactive fantasy map: '+world.width+' by '+world.height+
      ' cells. Click to '+(brush.kind==='inspect'?'inspect a location':
        brush.kind==='spawn'?'place a '+brush.species:
          brush.kind==='food'?'replenish food':'paint '+brush.biome)+
      '. Arrow keys move the selection; Enter applies the selected brush.'}
    onClick={select} onKeyDown={keyboard}/>
    {fillWidth&&overlay==='terrain'&&
      <AtlasWater world={world} width={mapWidth} height={mapHeight} square={1.1} showFish={atlasLevel(zoom)!=='world'} project={p=>{
        if(skylands&&overheadSkylandHit(skylands,p.x,p.y)!==undefined)return;
        if(!isMultiIslandLayout(world.settings.layout)&&!visibleCoastTile(Math.floor(p.x),
          Math.floor(p.y),world.width,world.height,'water',world.settings.seed))return;
        return {x:p.x*CELL,y:p.y*CELL};
      }}/>}
    {fillWidth&&overlay==='terrain'&&showClouds&&<AtlasClouds world={world} width={mapWidth}
      unit={CELL/(Math.SQRT2*VISUAL_TERRAIN_SIDE)} view={cloudView} project={overheadCloud} ground={overheadCloud}/>}
  </>;
}
