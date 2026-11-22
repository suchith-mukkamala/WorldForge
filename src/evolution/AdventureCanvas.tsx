import {paintVolcanicSquares} from './volcanicArt';
import {volcanoPhase} from './volcanism';
import {surfaceGrid} from './surfaceGrid';
import {WORLD_TREE_CROWN_RADIUS,WORLD_TREE_DESCENT_UNIT,WORLD_TREE_TRUNK_CLEARANCE} from './worldTree';
import {worldTreeModel} from './worldTreeArt';
import {useEffect,useRef} from 'react';
import type {Agent,World} from './engine';
import {adventurePlaceKey} from './adventurePlaces';
import type {AdventureGate,AdventureMap,AdventureRegion} from './adventureMap';
import {ADVENTURE_TILE as TILE,adventureProp,adventurePropArt,paintAdventureStructure,
  paintAdventureGround,paintAdventureSign,
  paintDoorstep,paintErrandMarker} from './adventureArt';
import {actionPose,canAnimate,motionFrame,samePoint,type Facing,type Motion,
  type Point,type SpritePose} from './motion';
import {adventureCamera,adventureFrameSize} from './adventureCamera';
import {paintPerson} from './pixelArt';
import {isOpenBuilding,mortalMovementDelay} from './mortalGameplay';
import {pixelTerrainHash} from './depthWorldArt';
import {waterSeason} from './riverSeasons';
import {blockLandmark,blockSailboat,blockSettlement,blockShipyard,blockTidalMouth,blockCrater,blockRealmHouse} from './blockModels';
import {settlementStage,type Building} from './construction';
import {streetStructureUnit,structureSite} from './structureGround';
import {buildingPlots,paintPlotGround,paintPlotOutline,type BuildingPlots} from './buildingPlots';
import {blockSceneryArt,DESCENT_BLOCK_VIEW,paintBlockContact} from './blockScenery';
import {opaqueArtAt,overlappingArt,paintAtlasBuilding,type PlacedArt} from './atlasBuildingArt';
import {isTreeKind} from './biomeTrees';
import {mortalWorldPoint} from './spatialDetails';
import {coastalLife,fishPose,paintFish,type Fish} from './coastalLife';
import type {AncientSite} from './knowledge';
import {shipMooring} from './mortalSailing';
import {seaPoint} from './shipSave';
import {directionBetween} from './motion';
import {coastTide,type TidalCave} from './tidalCaves';

type Props={world:World;map:AdventureMap;region:AdventureRegion;actor:Agent;facing:Facing;
  marked:Point|null;caves?:readonly TidalCave[];focused?:Point;board?:Point;gather?:Point;landmarks:readonly AncientSite[];
  onSelect:(point:Point)=>void};

type Scenery={x:number;y:number;depth:number;opacity:number;
  draw?:(ctx:CanvasRenderingContext2D,x:number,y:number)=>void;
  art?:PlacedArt;canopy?:boolean;worldTree?:boolean;building?:Building;target?:Point};

function sceneScenery({world,map,region,landmarks,caves}:Props,origin:Point,cols:number,rows:number,plots:BuildingPlots){
  const scenery:Scenery[]=[];
  const signs=new Map<number,AdventureGate>();
  const caveTiles=new Map(caves?.map(cave=>[cave.mouth,cave]));
  const low=coastTide(world).low;
  const craters=new Map((world.volcanicLayout?.vents??[]).map(vent=>[vent.index,vent]));
  const outpost=world.underworld?.outpost;
  const tree=world.worldTree,treeCover=tree?surfaceGrid(world).treeCover:undefined;
  const ruins=new Map(landmarks.map(site=>[site.y*world.width+site.x,site]));
  const yards=new Map([...map.shipyards.values()].map(site=>[site.shore,site]));
  const boats=new Map([...yards.values()].map(site=>[site.water,site.shore]));
  const mooring=shipMooring(world,map);
  if(mooring)boats.set(mooring.water,mooring.shore);
  for(const gate of region.gates)signs.set(gate.point.y*world.width+gate.point.x,gate);
  for(let y=Math.max(0,origin.y);y<Math.min(world.height,origin.y+rows);y++){
    for(let x=Math.max(0,origin.x);x<Math.min(world.width,origin.x+cols);x++){
      const index=y*world.width+x,site=map.buildings.get(index),sign=signs.get(index);
      const ruin=ruins.get(index),townCenter=region.settlement,cave=caveTiles.get(index);
      const hub=townCenter?.x===x&&townCenter.y===y&&!townCenter.infrastructure?.buildings.length?
        townCenter:undefined;
      const opacity=region.area.has(index)||site&&site.settlementId===region.settlement?.id?
        1:.72;
      const variant=pixelTerrainHash(x,y,world.settings.seed);
      const depth=y*TILE+12;
      const plot=plots.buildings.get(index);
      const yard=yards.get(index),berth=boats.get(index);
      if(yard){
        const water=seaPoint(world.width,yard.water),side={x:water.x-x,y:water.y-y};
        const model=blockShipyard(side,structureSite(world,{x,y}));
        const p={x:(x+.5+side.x*.14)*TILE,y:(y+.5+side.y*.14)*TILE};
        const art=blockSceneryArt(model,p,DESCENT_BLOCK_VIEW,1.46);
        scenery.push({x,y,depth,opacity,art,target:{x,y}});
      }else if(plot){
        const {model,door,building,placement:{at,scale}}=plot;
        const unit=streetStructureUnit(building.type)*scale;
        const p={x:(at.x+.5)*TILE,y:(at.y+.5)*TILE};
        const art=blockSceneryArt(model,p,DESCENT_BLOCK_VIEW,unit);
        scenery.push({...at,depth:p.y,opacity,art,building,draw:(ctx,px,py)=>
          paintBlockContact(ctx,model,{x:px+TILE/2,y:py+TILE/2},DESCENT_BLOCK_VIEW,unit)});
        if(door&&isOpenBuilding(building)){
          const entry={x:x+door.x,y:y+door.y};
          if(region.area.has(entry.y*world.width+entry.x))
            scenery.push({...entry,depth:entry.y*TILE+12,opacity:1,draw:(ctx,px,py)=>
              paintDoorstep(ctx,px,py,door)});
        }
      }
      if(berth!==undefined){
        const shore=seaPoint(world.width,berth),water={x,y};
        const art=blockSceneryArt(blockSailboat(directionBetween(shore,water)),
          {x:(x+.5)*TILE,y:(y+.5)*TILE},DESCENT_BLOCK_VIEW,1.18);
        scenery.push({x,y,depth,opacity:.95,art,target:shore});
      }
      if(sign)scenery.push({x,y,depth:depth-7,opacity:1,draw:(ctx,px,py)=>
        paintAdventureSign(ctx,px+6,py-4,sign.direction,region.landscape,!!sign.ferry)});
      if(ruin){
        const model=blockLandmark(ruin.kind,(ruin.visits??ruin.visitors.length)>0,structureSite(world,ruin));
        scenery.push({x,y,depth,opacity,draw:(ctx,px,py)=>paintAdventureStructure(ctx,model,px,py)});
      }
      if(hub){
        const model=blockSettlement(settlementStage(hub),hub.species,structureSite(world,hub));
        scenery.push({x,y,depth,opacity,draw:(ctx,px,py)=>paintAdventureStructure(ctx,model,px,py,1.35)});
      }
      if(cave){
        const model=blockTidalMouth(cave.stone,cave.face,cave.seed,low);
        const art=blockSceneryArt(model,{x:(x+.5)*TILE,y:(y+.58)*TILE},DESCENT_BLOCK_VIEW,1.62);
        scenery.push({x,y,depth:depth+3,opacity:1,art,target:{x,y}});
      }
      const vent=craters.get(index),hold=outpost===index&&world.tiles[index].biome!=='water';
      if(vent&&world.tiles[index].biome!=='water'||hold){
        const model=vent?blockCrater(vent.index%8,volcanoPhase(world,vent)!=='Dormant'):blockRealmHouse(true,1);
        const art=blockSceneryArt(model,{x:(x+.5)*TILE,y:(y+.58)*TILE},DESCENT_BLOCK_VIEW,1.5);
        scenery.push({x,y,depth:depth+3,opacity:1,art,target:{x,y}});
      }
      const natural=!vent&&!hold&&!cave&&!treeCover?.has(index)&&!ruin&&!hub&&!yard&&!plots.clear.has(index)?
        adventureProp(world,map,region,x,y):undefined;
      const prop=plots.fringe.has(index)&&isTreeKind(natural)?'scrub':natural;
      if(prop){
        const art=adventurePropArt(prop,x*TILE,y*TILE,variant,waterSeason(world));
        if(art)scenery.push({x,y,depth:y*TILE+16,opacity,art,canopy:isTreeKind(prop)});
      }
    }
  }
  if(tree&&tree.x>=origin.x-WORLD_TREE_CROWN_RADIUS&&tree.x<origin.x+cols+WORLD_TREE_CROWN_RADIUS&&
    tree.y>=origin.y-WORLD_TREE_CROWN_RADIUS&&tree.y<origin.y+rows+WORLD_TREE_CROWN_RADIUS*2){
    const p={x:(tree.x+.5)*TILE,y:(tree.y+.5)*TILE};
    const {model,unitScale}=worldTreeModel(world);
    const art=blockSceneryArt(model,p,DESCENT_BLOCK_VIEW,WORLD_TREE_DESCENT_UNIT*unitScale);
    scenery.push({x:tree.x,y:tree.y,depth:p.y,opacity:1,art,canopy:true,worldTree:true});
  }
  return scenery;
}

export function AdventureCanvas(props:Props){
  const canvas=useRef<HTMLCanvasElement>(null);
  const latest=useRef(props);
  latest.current=props;
  const viewport=useRef({x:0,y:0,width:312,height:184});
  const visibleArt=useRef<{sprites:Scenery[];faded:Set<Scenery>}|null>(null);
  useEffect(()=>{
    const element=canvas.current,ctx=element?.getContext('2d',{alpha:false});
    if(!element||!ctx)return;
    const background=document.createElement('canvas');
    const ground=background.getContext('2d',{alpha:false});
    if(!ground)return;
    const actorMotion:Motion={from:latest.current.actor,to:latest.current.actor,start:0,
      duration:1,facing:latest.current.facing};
    let previous:Props|null=null,lastKey='',lastFrame=-Infinity;
    let origin={x:Infinity,y:Infinity};
    let foreground:Scenery[]=[];
    let plots:BuildingPlots|undefined;
    let faded=new Set<Scenery>();
    let people:Agent[]=[];
    let swimmers:Fish[]=[];
    let caveStamp='';
    let frameSize={width:312,height:184},density=1;
    let frame=0;
    const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
    const resize=()=>{
      const {width,height}=element.getBoundingClientRect();
      if(width<=0||height<=0)return;
      frameSize=adventureFrameSize(width,height);
      density=Math.min(6,Math.max(3,Math.ceil(width/frameSize.width*window.devicePixelRatio)));
    };
    const observer=new ResizeObserver(resize);
    observer.observe(element);
    resize();
    const paint=(now:number)=>{
      frame=requestAnimationFrame(paint);
      const view=latest.current,{world,map,region,actor,marked,focused,board,gather}=view;
      const scene=adventurePlaceKey(region.place);
      const changed=previous!==view;
      const active=now-actorMotion.start<actorMotion.duration;
      if(now-lastFrame<(active||changed?25:swimmers.length&&!reducedMotion.matches?55:125))return;
      lastFrame=now;
      actorMotion.facing=view.facing;
      if(scene!==lastKey||!samePoint(actorMotion.to,actor)){
        const from=motionFrame(actorMotion,now);
        const slide=scene===lastKey&&canAnimate(actorMotion.to,actor);
        actorMotion.from=slide?from:actor;
        actorMotion.to=actor;
        actorMotion.start=now;
        actorMotion.duration=slide?mortalMovementDelay(actor)*.88:1;
      }
      const player=motionFrame(actorMotion,now);
      const {width:nativeWidth,height:nativeHeight}=frameSize;
      if(element.width!==nativeWidth*density||element.height!==nativeHeight*density){
        element.width=nativeWidth*density;element.height=nativeHeight*density;
        ctx.setTransform(density,0,0,density,0,0);
        ctx.imageSmoothingEnabled=false;
        origin={x:Infinity,y:Infinity};
      }
      const {x,y}=adventureCamera({x:(player.x+.5)*TILE,y:(player.y+.84)*TILE},frameSize,
        {width:map.width*TILE,height:map.height*TILE});
      viewport.current={x,y,width:nativeWidth,height:nativeHeight};
      const grid={x:Math.floor(x/TILE)-1,y:Math.floor(y/TILE)-1};
      const cols=Math.ceil(nativeWidth/TILE)+4,rows=Math.ceil(nativeHeight/TILE)+4;
      const plotsChanged=!plots||previous?.map!==map||previous?.world.topography!==world.topography||
        previous.world.terrainCells!==world.terrainCells||waterSeason(previous.world)!==waterSeason(world);
      if(!plots||plotsChanged)plots=buildingPlots(world);
      const caveKeys=view.caves?.length?view.caves.map(cave=>cave.mouth).join(',')+':'+coastTide(world).low:'';
      const ventKeys=world.volcanicLayout?.vents.map(vent=>vent.index+volcanoPhase(world,vent)).join(',');
      const entrances=caveKeys+'|'+(ventKeys??'')+'|'+world.underworld?.outpost;
      const restage=!samePoint(grid,origin)||plotsChanged||previous?.region!==region||caveStamp!==entrances;
      if(restage){
        caveStamp=entrances;
        origin=grid;
        background.width=cols*TILE*density;background.height=rows*TILE*density;
        ground.setTransform(density,0,0,density,0,0);
        paintAdventureGround(ground,world,region,map,origin,cols,rows);
        paintPlotGround(ground,plots,TILE,origin,cols,rows);
        foreground=sceneScenery(view,origin,cols,rows,plots).sort((a,b)=>a.depth-b.depth||a.x-b.x);
        swimmers=coastalLife(world).fish.filter(fish=>fish.x+fish.width>=grid.x&&
          fish.x<grid.x+cols&&fish.y+fish.height>=grid.y&&fish.y<grid.y+rows);
      }
      if(restage||previous?.focused?.x!==focused?.x||previous?.focused?.y!==focused?.y){
        faded=new Set<Scenery>();
        const target=focused&&foreground.find(s=>s.building&&samePoint(s.building,focused));
        if(target?.art)for(const sprite of foreground){
          if(sprite.canopy&&sprite.depth>=target.depth&&sprite.art&&overlappingArt(sprite.art,target.art))
            faded.add(sprite);
        }
        visibleArt.current={sprites:foreground,faded};
      }
      ctx.drawImage(background,origin.x*TILE-x,origin.y*TILE-y,cols*TILE,rows*TILE);
      paintVolcanicSquares(ctx,world,TILE,{x,y},{origin,width:cols,height:rows});
      for(const fish of swimmers){
        const pose=fishPose(fish,reducedMotion.matches?0:now);
        const tile=Math.floor(pose.y)*world.width+Math.floor(pose.x);
        if(map.bridges.has(tile))continue;
        paintFish(ctx,fish,{x:pose.x*TILE-x,y:pose.y*TILE-y},3,
          reducedMotion.matches?0:pose.lift,1/density);
      }
      if(restage||previous?.world.agents!==world.agents){
        people=world.agents.filter(a=>a.id!==actor.id&&a.x>=origin.x&&
          a.x<origin.x+cols&&a.y>=origin.y&&a.y<origin.y+rows&&
          region.area.has(a.y*world.width+a.x));
      }
      const sprites:Scenery[]=foreground.slice();
      const marker=(point:Point,kind:'board'|'gather')=>sprites.push({...point,
        depth:point.y*TILE+14,opacity:1,draw:(ctx,px,py)=>paintErrandMarker(ctx,px,py,kind)});
      if(board)marker(board,'board');
      if(gather)marker(gather,'gather');
      const drawCharacter=(agent:Agent,at:Point,facing:Motion['facing'],
        stride:0|1|2|3,pose:SpritePose,isPlayer:boolean)=>{
        sprites.push({x:at.x,y:at.y,depth:at.y*TILE+19,opacity:1,
          draw:(context,px,py)=>{
            if(isPlayer){
              context.fillStyle='#f1cc7fbd';
              context.fillRect(px+5,py+18,14,3);
              context.fillRect(px+8,py+17,8,5);
              context.fillStyle='#284035';
              context.fillRect(px+7,py+18,10,2);
            }
            const bob=!isPlayer&&Math.floor((now+agent.id*153)/650)%2===0?1:0;
            paintPerson(context,agent,px+4,py-2+bob,facing,stride,pose);
          }});
      };
      for(const person of people){
        const activity=person.cognition?.today?.action;
        drawCharacter(person,mortalWorldPoint(person,world),'south',0,actionPose(activity),false);
      }
      drawCharacter(actor,player,player.facing,player.stride,player.walking?'walk':'idle',true);

      const plot=focused&&plots?.buildings.get(focused.y*world.width+focused.x);
      if(plot)paintPlotOutline(ctx,plot,(u,v)=>({x:(u+.5)*TILE-x,y:(v+.5)*TILE-y}),.85);
      if(marked){
        const px=marked.x*TILE-x,py=marked.y*TILE-y;
        ctx.strokeStyle='#ffe4a1';
        ctx.lineWidth=1;
        ctx.strokeRect(px+2.5,py+2.5,TILE-5,TILE-5);
        ctx.fillStyle='#fff1b9cc';
        ctx.fillRect(px+9,py+2,6,2);
      }
      sprites.sort((a,b)=>a.depth-b.depth||a.x-b.x);
      for(const sprite of sprites){
        const playerX=(player.x+.5)*TILE,playerY=(player.y+.55)*TILE;
        const treeCoversPlayer=sprite.worldTree&&sprite.art&&
          (Math.hypot(sprite.x-player.x,sprite.y-player.y)<WORLD_TREE_TRUNK_CLEARANCE||
            sprite.depth>=playerY&&opaqueArtAt(sprite.art,playerX,playerY));
        ctx.globalAlpha=sprite.opacity*(treeCoversPlayer?.19:faded.has(sprite)?.26:1);
        sprite.draw?.(ctx,Math.round(sprite.x*TILE)-x,Math.round(sprite.y*TILE)-y);
        if(sprite.art)paintAtlasBuilding(ctx,sprite.art,x,y);
      }
      ctx.globalAlpha=1;
      previous=view;
      lastKey=scene;
    };
    frame=requestAnimationFrame(paint);
    return ()=>{observer.disconnect();cancelAnimationFrame(frame);};
  },[]);
  return <canvas className="adventure-canvas" ref={canvas} width={312} height={184}
    aria-label={props.region.name+' exploration map'} role="img"
    onClick={event=>{
      const element=event.currentTarget,box=element.getBoundingClientRect();
      const x=viewport.current.x+(event.clientX-box.left)*viewport.current.width/box.width;
      const y=viewport.current.y+(event.clientY-box.top)*viewport.current.height/box.height;
      const scene=visibleArt.current;
      if(scene)for(let i=scene.sprites.length-1;i>=0;i--){
        const sprite=scene.sprites[i];
        if(!sprite.art||scene.faded.has(sprite)||!opaqueArtAt(sprite.art,x,y))continue;
        const target=sprite.target??sprite.building;
        if(target){props.onSelect(target);return;}
        break;
      }
      props.onSelect({x:Math.floor(x/TILE),y:Math.floor(y/TILE)});
    }}/>;
}
