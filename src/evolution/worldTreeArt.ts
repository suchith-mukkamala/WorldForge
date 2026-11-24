import {terrainHash} from './biomeGeneration';
import type {BlockModel} from './blockModels';
import type {BlockView} from './blockScenery';
import {DEPTH_RISE,DEPTH_TILE_WIDTH,type createDepthProjector} from './depthProjection';
import type {Biome} from './engine';
import {surfaceHeightAt} from './structureGround';
import {surfaceGrid} from './surfaceGrid';
import {WORLD_TREE_BLOCK,worldTreeClearings,type WorldTree} from './worldTree';
import {sculptWorldTree,TREE_BRANCH_COUNT,TREE_MODEL_RADIUS,TREE_SUBDIVISIONS,treeBranchAngle,type TreeFoliage} from './worldTreeModel';

type TreeWorld=Parameters<typeof surfaceGrid>[0];
export const worldTreeSubdivisions=(preview:boolean)=>preview?2:TREE_SUBDIVISIONS;
const foliageType=(biome:Biome):TreeFoliage=>
  biome==='taiga'||biome==='mountain'?'conifer':biome==='wetland'?'wetland':
    biome==='savanna'||biome==='wasteland'||biome==='volcanic'?'dry':'woodland';

const treeModels=new WeakMap<WorldTree,Map<string,BlockModel>>();
export function worldTreeModel(world:TreeWorld,grid=surfaceGrid(world),verticalScale=0,preview=false){
  const tree=world.worldTree!,steps=worldTreeSubdivisions(preview);
  const seed=Math.floor(terrainHash(tree.x,tree.y,world.settings.seed+tree.variant)*65535);
  const center=world.tiles[tree.y*world.width+tree.x].biome;
  const habitat=center==='water'?(world.tiles[tree.approach??-1]?.biome??'wetland'):center;
  const tileAt=(dx:number,dy:number)=>{
    const x=Math.round(tree.x+dx),y=Math.round(tree.y+dy);
    return x>=0&&x<world.width&&y>=0&&y<world.height?y*world.width+x:-1;
  };
  const foliage=[foliageType(habitat)];
  for(let b=0;b<TREE_BRANCH_COUNT;b++){
    const angle=treeBranchAngle(seed,b),radius=6.5;
    const biome=world.tiles[tileAt(radius*Math.cos(angle),radius*Math.sin(angle))]?.biome;
    foliage.push(foliageType(biome&&biome!=='water'?biome:habitat));
  }
  const ground=surfaceHeightAt(grid,tree.x,tree.y);

  // Only the base changes with relief and existing structures. Quantizing
  // to the geometry's own resolution avoids rebuilds on camera-only moves.
  const cleared=new Set(world.rootClearings??worldTreeClearings(world));
  const span=Math.ceil(7.2*steps),width=span*2+1;
  const profile=new Int8Array(width*width),clear=new Uint8Array(width*width);
  const profileIndex=(x:number,y:number)=>(y+span)*width+x+span;
  if(cleared.size||verticalScale)for(let y=-span;y<=span;y++)for(let x=-span;x<=span;x++){
    const dx=(x+.5)/steps*WORLD_TREE_BLOCK,dy=(y+.5)/steps*WORLD_TREE_BLOCK;
    const i=profileIndex(x,y);
    if(cleared.size)clear[i]=+cleared.has(tileAt(dx,dy));
    if(!verticalScale)continue;
    const floor=surfaceHeightAt(grid,tree.x+dx,tree.y+dy);
    profile[i]=Math.max(-steps*8,Math.min(steps*8,Math.floor((floor-ground)*verticalScale*steps)));
  }
  const key=[world.settings.seed,tree.x,tree.y,tree.variant,steps,foliage.join(','),
    verticalScale?profile.join(','):'',cleared.size?clear.join(''):''].join(':');
  let cache=treeModels.get(tree);
  if(!cache){cache=new Map();treeModels.set(tree,cache);}
  let model=cache.get(key);
  if(!model){
    model=sculptWorldTree(key,tree,seed,foliage,steps,(x,y)=>{
      const i=profileIndex(Math.floor(x*steps),Math.floor(y*steps));
      return {level:profile[i]/steps,clear:!!clear[i]};
    });
    if(cache.size>=4)cache.delete(cache.keys().next().value!);
    cache.set(key,model);
  }
  return {model,ground,unitScale:1/steps};
}

export function projectWorldTree(world:TreeWorld,projector:ReturnType<typeof createDepthProjector>,
  view:BlockView,grid=surfaceGrid(world),preview=false){
  const tree=world.worldTree!,unit=DEPTH_TILE_WIDTH/2*WORLD_TREE_BLOCK;
  const verticalScale=projector.riseScale/(DEPTH_RISE*view.rise*unit);
  const {model,ground,unitScale}=worldTreeModel(world,grid,verticalScale,preview);
  return {model,at:projector.projectSmooth(tree.x,tree.y,ground),unit:unit*unitScale,
    order:projector.depth(tree.x,tree.y,ground)};
}

const overhead=new WeakMap<BlockModel,HTMLCanvasElement>();
export function paintOverheadWorldTree(ctx:CanvasRenderingContext2D,world:TreeWorld,cell:number){
  const tree=world.worldTree!;
  const {model}=worldTreeModel(world);
  let stamp=overhead.get(model);
  if(!stamp){
    const half=TREE_SUBDIVISIONS*TREE_MODEL_RADIUS;
    stamp=document.createElement('canvas');stamp.width=half*2;stamp.height=half*2;
    const paint=stamp.getContext('2d');
    if(!paint)return;
    // The mesh compiler emits faces bottom to top. Draw the highest leaves
    // last and keep holes at the tips transparent in the flat atlas.
    for(const face of model.faces){
      if(face.direction!==0)continue;
      paint.fillStyle=face.color;
      paint.fillRect(face.x+half,face.y+half,1,1);
    }
    overhead.set(model,stamp);
  }
  const span=2*TREE_MODEL_RADIUS*WORLD_TREE_BLOCK;
  ctx.drawImage(stamp,(tree.x+.5-span/2)*cell,(tree.y+.5-span/2)*cell,cell*span,cell*span);
}
