import {WORLD_TREE_CROWN_RADIUS,WORLD_TREE_DESCENT_UNIT} from './worldTree';
import {worldTreeModel} from './worldTreeArt';
import {useEffect,useRef} from 'react';
import {adventureCamera,adventureFrameSize} from './adventureCamera';
import {ADVENTURE_TILE as TILE} from './adventureArt';
import {ATLAS_SEA,overheadTerrainColor} from './atlasTerrain';
import {blockSailboat,blockProp,terrainBlockProp} from './blockModels';
import {DESCENT_BLOCK_VIEW,paintBlockScenery} from './blockScenery';
import type {World} from './engine';
import {canAnimate,motionFrame,samePoint,type Motion,type Point} from './motion';
import {coastalDepth} from './oceanDepth';
import {seaPoint,type MortalShip} from './shipSave';
import {surfaceGrid,VISUAL_TERRAIN_SIDE as SIDE} from './surfaceGrid';
import {cellPixel,firstTerrainSquare,terrainPixel,terrainSwatches} from './terrainCellArt';
import {terrainDetailAt} from './terrainDetails';
import {pixelTerrainHash} from './depthWorldArt';
import {waterSeason} from './riverSeasons';
import {activeVessels} from './vessels';

type Props={world:World;ship:MortalShip;landings:readonly number[];onLand:(i:number)=>void};
export const SAIL_STEP_MS=112;

export function SailingCanvas(props:Props){
  const ref=useRef<HTMLCanvasElement>(null),latest=useRef(props);
  const viewport=useRef({x:0,y:0,width:312,height:184});
  latest.current=props;
  useEffect(()=>{
    const canvas=ref.current,ctx=canvas?.getContext('2d',{alpha:false});
    const land=document.createElement('canvas'),brush=land.getContext('2d',{alpha:false});
    if(!canvas||!ctx||!brush)return;
    let frame=0,stamp:{source:World;origin:Point;size:Point}|null=null;
    let ocean:Uint8Array|undefined,treeCover:ReadonlySet<number>|undefined;
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
      const view=latest.current,{world,ship,landings}=view;
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
        if(!ocean||source?.tiles!==world.tiles)ocean=coastalDepth(world.width,world.height,
          i=>world.tiles[i].biome==='water');
        const grid=surfaceGrid(world);
        treeCover=grid.treeCover;
        const width=size.x*SIDE,height=size.y*SIDE;
        land.width=width;land.height=height;
        const image=brush.createImageData(width,height),pixels=new Uint32Array(image.data.buffer);
        pixels.fill(terrainPixel(ATLAS_SEA));
        for(let ty=0;ty<size.y;ty++)for(let tx=0;tx<size.x;tx++){
          const x=origin.x+tx,y=origin.y+ty;
          if(x<0||y<0||x>=world.width||y>=world.height)continue;
          const index=y*world.width+x,biome=world.tiles[index].biome;
          const grain=pixelTerrainHash(x,y,world.settings.seed);
          const palette=terrainSwatches(overheadTerrainColor(biome,ocean[index]),biome==='water');
          const base=firstTerrainSquare(world.width,grid.columns,index);
          for(let row=0;row<SIDE;row++)for(let col=0;col<SIDE;col++){
            pixels[(ty*SIDE+row)*width+tx*SIDE+col]=cellPixel(grid,base+row*grid.columns+col,palette,grain);
          }
        }
        brush.putImageData(image,0,0);
        stamp={source:world,origin,size};
      }
      ctx.drawImage(land,origin.x*TILE-offset.x,origin.y*TILE-offset.y,size.x*TILE,size.y*TILE);
      for(const vessel of activeVessels(world)){
        if(!vessel.merchant)continue;
        const {x,y}=seaPoint(world.width,vessel.at);
        if(x<origin.x||y<origin.y||x>=origin.x+size.x||y>=origin.y+size.y)continue;
        paintBlockScenery(ctx,blockSailboat(vessel.heading,true),
          {x:(x+.5)*TILE-offset.x,y:(y+.5)*TILE-offset.y},DESCENT_BLOCK_VIEW,1.47);
      }
      for(let y=Math.max(0,origin.y);y<Math.min(world.height,origin.y+size.y);y++){
        for(let x=Math.max(0,origin.x);x<Math.min(world.width,origin.x+size.x);x++){
          const index=y*world.width+x,biome=world.tiles[index].biome;
          if(biome==='water'||landings.includes(index)||treeCover?.has(index))continue;
          const grain=pixelTerrainHash(x,y,world.settings.seed);
          if(grain%8!==0)continue;
          const detail=terrainDetailAt(biome,x,y,world.settings.seed,world.topography?.heights[index]??75,false);
          const kind=terrainBlockProp(detail.motif);
          if(kind)paintBlockScenery(ctx,blockProp(kind,detail.variant,waterSeason(world)),
            {x:(x+.5)*TILE-offset.x,y:(y+.5)*TILE-offset.y},DESCENT_BLOCK_VIEW,1.25);
        }
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
        ctx.fillStyle='#c3e0d397';
        for(let i=0;i<4;i++)ctx.fillRect(x-wake.x*(8+i*3)+wake.y*(i%2?4:-4),
          y-wake.y*(8+i*3)+wake.x*(i%2?4:-4),2,2);
      }
      paintBlockScenery(ctx,blockSailboat(ship.heading),{x,y},DESCENT_BLOCK_VIEW,1.34);
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
