import {terrainHash} from './biomeGeneration';
import {blockWorldTree,type BlockModel,type TreeFoliage,type WorldTreeRoot} from './blockModels';
import type {Biome,World} from './engine';
import {TERRAIN_ELEVATION_UNITS} from './terrainCells';
import {WORLD_TREE_BLOCK,worldTreeClearings} from './worldTree';
import {Shore,surfaceGrid,surfaceHasWater,VISUAL_TERRAIN_SIDE} from './surfaceGrid';

type TreeWorld=Partial<Pick<World,'settlements'|'ancientSites'|'ruins'>>&Pick<World,'worldTree'|'width'|'height'|'tiles'|'settings'|'topography'|
  'terrainCells'|'dayOfYear'|'skylands'>;
export {WORLD_TREE_BLOCK};
const foliageType=(biome:Biome):TreeFoliage=>
  biome==='taiga'||biome==='mountain'?'conifer':biome==='wetland'?'wetland':
    biome==='savanna'||biome==='wasteland'||biome==='volcanic'?'dry':'woodland';

export function worldTreeModel(world:TreeWorld,grid=surfaceGrid(world),verticalScale=0){
  const tree=world.worldTree!;
  const seed=Math.floor(terrainHash(tree.x,tree.y,world.settings.seed+tree.variant)*65535);
  const center=world.tiles[tree.y*world.width+tree.x].biome;
  const biomeAt=(dx:number,dy:number)=>{
    const x=Math.round(tree.x+dx),y=Math.round(tree.y+dy);
    return x>=0&&x<world.width&&y>=0&&y<world.height?world.tiles[y*world.width+x].biome: center;
  };
  const habitat=center==='water'?(world.tiles[tree.approach??-1]?.biome??'wetland'):center;
  const foliage=[foliageType(habitat)];
  for(let b=0;b<9;b++){
    const angle=b*2.39996+(seed%629)/100;
    const biome=biomeAt(24*Math.cos(angle),24*Math.sin(angle));
    foliage.push(foliageType(biome==='water'?habitat:biome));
  }
  const sample=(x:number,y:number)=>{
    const col=Math.floor((tree.x+.5+(x+.5)*WORLD_TREE_BLOCK)*VISUAL_TERRAIN_SIDE);
    const row=Math.floor((tree.y+.5+(y+.5)*WORLD_TREE_BLOCK)*VISUAL_TERRAIN_SIDE);
    return col<0||row<0||col>=grid.columns||row>=grid.rows?-1:row*grid.columns+col;
  };
  const ground=grid.ground[sample(-.5,-.5)]/TERRAIN_ELEVATION_UNITS;
  const roots:WorldTreeRoot[]=[];
  const cleared=new Set(worldTreeClearings(world)),clearBase=new Set<number>();
  if(cleared.size)for(let y=-6;y<=6;y++)for(let x=-6;x<=6;x++){
    const left=Math.floor(tree.x+.5+x*WORLD_TREE_BLOCK),top=Math.floor(tree.y+.5+y*WORLD_TREE_BLOCK);
    const right=Math.ceil(tree.x+.5+(x+1)*WORLD_TREE_BLOCK)-1;
    const bottom=Math.ceil(tree.y+.5+(y+1)*WORLD_TREE_BLOCK)-1;
    for(let v=Math.max(0,top);v<=Math.min(world.height-1,bottom);v++){
      for(let u=Math.max(0,left);u<=Math.min(world.width-1,right);u++){
        if(cleared.has(v*world.width+u))clearBase.add((y+6)*13+x+6);
      }
    }
  }
  for(let y=-4;y<=4;y++)for(let x=-4;x<=4;x++){
    const radius=Math.hypot(x+.5,y+.5);
    const noise=terrainHash(x,y,seed+117);
    const height=radius<4.4?4-radius*.55:0;
    if(height<=0||clearBase.has((y+6)*13+x+6))continue;
    const i=sample(x,y);
    if(i<0||radius>3.8&&(surfaceHasWater(grid,i)||grid.shore[i]===Shore.rootTrail))continue;
    const elevation=grid.ground[i]/TERRAIN_ELEVATION_UNITS;
    const offset=Math.max(-32,Math.min(32,Math.round((elevation-ground)*verticalScale)));
    const biome=biomeAt((x+.5)*WORLD_TREE_BLOCK,(y+.5)*WORLD_TREE_BLOCK);
    const moss=(biome==='wetland'||biome==='forest'||biome==='taiga')&&radius>3&&noise>.32;
    roots.push({x,y,ground:offset-1,height:Math.ceil(height)+1,moss});
  }
  return {model:blockWorldTree(seed,foliage,roots,clearBase),ground};
}

const overhead=new WeakMap<BlockModel,HTMLCanvasElement>();
export function paintOverheadWorldTree(ctx:CanvasRenderingContext2D,world:TreeWorld,cell:number){
  const tree=world.worldTree!;
  const {model}=worldTreeModel(world);
  let stamp=overhead.get(model);
  if(!stamp){
    stamp=document.createElement('canvas');stamp.width=32;stamp.height=32;
    const paint=stamp.getContext('2d');
    if(!paint)return;
    const tops=model.faces.filter(face=>face.direction===0).sort((a,b)=>a.z-b.z);
    for(const face of tops){
      paint.fillStyle=face.color;
      paint.fillRect(face.x+16,face.y+16,1,1);
    }
    overhead.set(model,stamp);
  }
  const span=32*WORLD_TREE_BLOCK;
  ctx.drawImage(stamp,(tree.x+.5-span/2)*cell,(tree.y+.5-span/2)*cell,cell*span,cell*span);
}
