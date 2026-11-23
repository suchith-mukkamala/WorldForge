import {paintVolcanicSquares} from './volcanicArt';
import {WORLD_TREE_CROWN_RADIUS,WORLD_TREE_DESCENT_UNIT} from './worldTree';
import {worldTreeModel} from './worldTreeArt';
import {useEffect,useRef} from 'react';
import {adventureCamera,adventureFrameSize} from './adventureCamera';
import {ADVENTURE_TILE as TILE} from './adventureArt';
import {ATLAS_SEA,overheadTerrainColor} from './atlasTerrain';
import {blockSailboat,blockTidalMouth,blockProp,terrainBlockProp} from './blockModels';
import {DESCENT_BLOCK_VIEW,paintBlockScenery} from './blockScenery';
import type {World} from './engine';
import {canAnimate,motionFrame,samePoint,type Motion,type Point} from './motion';
import {coastalLife} from './coastalLife';
import {seaPoint,type MortalShip} from './shipSave';
import {surfaceGrid,VISUAL_TERRAIN_SIDE as SIDE,type SurfaceGrid} from './surfaceGrid';
import {surfacePatchPixels} from './terrainCellArt';
import {terrainDetailAt} from './terrainDetails';
import {pixelTerrainHash} from './depthWorldArt';
import {waterSeason} from './riverSeasons';
import {activeVessels} from './vessels';
import {coastTide,type TidalCave} from './tidalCaves';

type Props={world:World;ship:MortalShip;landings:readonly number[];caves:readonly TidalCave[];onLand:(i:number)=>void};
export const SAIL_STEP_MS=112;

export function SailingCanvas(props:Props){
  const ref=useRef<HTMLCanvasElement>(null),latest=useRef(props);
  const viewport=useRef({x:0,y:0,width:312,height:184});
  latest.current=props;
  useEffect(()=>{
    const canvas=ref.current,ctx=canvas?.getContext('2d',{alpha:false});
    const land=document.createElement('canvas'),brush=land.getContext('2d',{alpha:false});
    if(!canvas||!ctx||!brush)return;
    let frame=0,stamp:{source:World;origin:Point;size:Point;grid:SurfaceGrid}|null=null;
    const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
    const start=seaPoint(latest.current.world.width,latest.current.ship.at);
    let motion:Motion={from:start,to:start,duration:1,start:0,facing:latest.current.ship.heading};
    let previous:Props|null=null,lastFrame=-Infinity,wasMoving=false;
    let frameSize={width:312,height:184},density=3;
    const resize=()=>{
      const box=canvas.getBoundingClientRect();
      if(box.width<=0||box.height<=0)return;
      frameSize=adventureFrameSize(box.width,box.height);
      density=Math.max(2,Math.min(6,Math.ceil(box.width/frameSize.width*devicePixelRatio)));
      canvas.width=frameSize.width*density;canvas.height=frameSize.height*density;
      ctx.setTransform(density,0,0,density,0,0);ctx.imageSmoothingEnabled=false;
      lastFrame=-Infinity;previous=null;
    };
    const observer=new ResizeObserver(resize);observer.observe(canvas);resize();
    const draw=(now:number)=>{
      frame=requestAnimationFrame(draw);
      const view=latest.current,{world,ship,landings,caves}=view;
      const next=seaPoint(world.width,ship.at);
      if(!samePoint(next,motion.to)){
        const from=motionFrame(motion,now);
        motion={from:canAnimate(from,next)?from:next,to:next,start:now,
          duration:reducedMotion.matches?1:SAIL_STEP_MS*.93,facing:ship.heading};
      }
      const boat=motionFrame(motion,now);
      if(view===previous&&(!boat.walking&&!wasMoving||boat.walking&&now-lastFrame<15))return;
      lastFrame=now;previous=view;wasMoving=boat.walking;
      const p={x:(boat.x+.5)*TILE,y:(boat.y+.5)*TILE};
      const offset=adventureCamera(p,frameSize,{width:world.width*TILE,height:world.height*TILE});
      viewport.current={...offset,...frameSize};
      const origin={x:Math.floor(offset.x/TILE/3)*3-1,y:Math.floor(offset.y/TILE/3)*3-1};
      const size={x:Math.ceil(frameSize.width/TILE)+5,y:Math.ceil(frameSize.height/TILE)+5};
      const source=stamp?.source;
      const changed=!source||source.tiles!==world.tiles||source.topography!==world.topography||
        source.terrainCells!==world.terrainCells||waterSeason(source)!==waterSeason(world);
      if(!stamp||changed||!samePoint(stamp.origin,origin)||!samePoint(stamp.size,size)){
        const depths=coastalLife(world).depths;
        const grid=surfaceGrid(world);
        land.width=size.x*SIDE;land.height=size.y*SIDE;
        const pixels=surfacePatchPixels(world,{origin,width:size.x,height:size.y},index=>{
          const biome=world.tiles[index].biome;
          const grain=pixelTerrainHash(index%world.width,Math.floor(index/world.width),world.settings.seed);
          return {color:overheadTerrainColor(biome,depths[index]),grain,water:biome==='water'};
        },ATLAS_SEA);
        brush.putImageData(new ImageData(new Uint8ClampedArray(pixels.buffer),land.width,land.height),0,0);
        stamp={source:world,origin,size,grid};
      }
      const {columns,rows,openWater,treeCover}=stamp.grid;
      const waterAt=(x:number,y:number)=>{
        const col=Math.floor((x+offset.x)*SIDE/TILE),row=Math.floor((y+offset.y)*SIDE/TILE);
        return col>=0&&row>=0&&col<columns&&row<rows&&!!openWater?.[row*columns+col];
      };
      ctx.drawImage(land,origin.x*TILE-offset.x,origin.y*TILE-offset.y,size.x*TILE,size.y*TILE);
      paintVolcanicSquares(ctx,world,TILE,offset,{origin,width:size.x,height:size.y});
      for(const vessel of activeVessels(world)){
        if(!vessel.merchant)continue;
        const {x,y}=seaPoint(world.width,vessel.at);
        if(x<origin.x||y<origin.y||x>=origin.x+size.x||y>=origin.y+size.y)continue;
        paintBlockScenery(ctx,blockSailboat(vessel.heading,true),
          {x:(x+.5)*TILE-offset.x,y:(y+.5)*TILE-offset.y},DESCENT_BLOCK_VIEW,1.47,waterAt);
      }
      const entrances=new Set(caves.map(cave=>cave.mouth));
      for(let y=Math.max(0,origin.y);y<Math.min(world.height,origin.y+size.y);y++){
        for(let x=Math.max(0,origin.x);x<Math.min(world.width,origin.x+size.x);x++){
          const index=y*world.width+x,biome=world.tiles[index].biome;
          if(biome==='water'||landings.includes(index)||treeCover?.has(index)||entrances.has(index))continue;
          const grain=pixelTerrainHash(x,y,world.settings.seed);
          if(grain%8!==0)continue;
          const detail=terrainDetailAt(biome,x,y,world.settings.seed,world.topography?.heights[index]??75,false);
          const kind=terrainBlockProp(detail.motif);
          if(kind)paintBlockScenery(ctx,blockProp(kind,detail.variant,waterSeason(world)),
            {x:(x+.5)*TILE-offset.x,y:(y+.5)*TILE-offset.y},DESCENT_BLOCK_VIEW,1.25);
        }
      }
      const low=coastTide(world).low;
      for(const cave of caves){
        const {x,y}=seaPoint(world.width,cave.mouth);
        if(x<origin.x-1||y<origin.y-1||x>=origin.x+size.x+1||y>=origin.y+size.y+1)continue;
        const model=blockTidalMouth(cave.stone,cave.face,cave.seed,low);
        paintBlockScenery(ctx,model,{x:(x+.5)*TILE-offset.x,y:(y+.5)*TILE-offset.y},
          DESCENT_BLOCK_VIEW,1.64);
      }
      if(landings.length){
        ctx.strokeStyle='#ffe5a0';ctx.lineWidth=1;
        for(const landing of landings){
          const target=seaPoint(world.width,landing);
          ctx.strokeRect(target.x*TILE-offset.x+3,target.y*TILE-offset.y+3,TILE-6,TILE-6);
        }
      }
      const tree=world.worldTree;
      if(tree&&Math.abs(boat.x-tree.x)<WORLD_TREE_CROWN_RADIUS&&
        Math.abs(boat.y-tree.y)<WORLD_TREE_CROWN_RADIUS*2){
        const {model,unitScale}=worldTreeModel(world);
        paintBlockScenery(ctx,model,{x:(tree.x+.5)*TILE-offset.x,y:(tree.y+.5)*TILE-offset.y},
          DESCENT_BLOCK_VIEW,WORLD_TREE_DESCENT_UNIT*unitScale);
      }
      const x=p.x-offset.x,y=p.y-offset.y;
      if(boat.walking&&!reducedMotion.matches){
        const wake={x:motion.to.x-motion.from.x,y:motion.to.y-motion.from.y};
        for(let i=0;i<6;i++)for(const side of [-1,1]){
          ctx.fillStyle=i<2?'#dbf0ddc0':i<4?'#a7d9d899':'#8fc3cd68';
          const spread=2+i*.86,distance=8+i*3;
          const px=Math.round(x-wake.x*distance+wake.y*spread*side);
          const py=Math.round(y-wake.y*distance-wake.x*spread*side);
          ctx.fillRect(px,py,i<3?2:1,i<3?2:1);
        }
      }
      paintBlockScenery(ctx,blockSailboat(ship.heading),{x,y},DESCENT_BLOCK_VIEW,1.34,waterAt);
    };
    frame=requestAnimationFrame(draw);
    return ()=>{observer.disconnect();cancelAnimationFrame(frame);};
  },[]);
  return <canvas className="adventure-canvas" ref={ref} width={312} height={184}
    role="img" aria-label="Sailing view" onClick={event=>{
      const box=event.currentTarget.getBoundingClientRect(),view=viewport.current;
      const x=Math.floor((view.x+(event.clientX-box.left)*view.width/box.width)/TILE);
      const y=Math.floor((view.y+(event.clientY-box.top)*view.height/box.height)/TILE);
      if(x>=0&&x<props.world.width&&y>=0&&y<props.world.height&&
        props.landings.includes(y*props.world.width+x))props.onLand(y*props.world.width+x);
    }}/>;
}
