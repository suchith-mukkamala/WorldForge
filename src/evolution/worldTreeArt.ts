import {terrainHash} from './biomeGeneration';
import {blockWorldTree,type BlockModel,type TreeFoliage,type WorldTreeRoot} from './blockModels';
import type {Biome,World} from './engine';
import {TERRAIN_ELEVATION_UNITS} from './terrainCells';
import {Shore,surfaceGrid,surfaceHasWater,VISUAL_TERRAIN_SIDE} from './surfaceGrid';

type TreeWorld=Pick<World,'worldTree'|'width'|'height'|'tiles'|'settings'|'topography'|
  'terrainCells'|'dayOfYear'|'skylands'>;
export const WORLD_TREE_BLOCK=.25;
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
  const foliage=[foliageType(center)];
  for(let b=0;b<9;b++){
    const angle=b*2.39996+(seed%629)/100;
    const biome=biomeAt(3*Math.cos(angle),3*Math.sin(angle));
    foliage.push(foliageType(biome==='water'?center:biome));
  }
  const sample=(x:number,y:number)=>{
    const col=Math.floor((tree.x+.5+(x+.5)*WORLD_TREE_BLOCK)*VISUAL_TERRAIN_SIDE);
    const row=Math.floor((tree.y+.5+(y+.5)*WORLD_TREE_BLOCK)*VISUAL_TERRAIN_SIDE);
    return col<0||row<0||col>=grid.columns||row>=grid.rows?-1:row*grid.columns+col;
  };
  const ground=grid.ground[sample(-.5,-.5)]/TERRAIN_ELEVATION_UNITS;
  const roots:WorldTreeRoot[]=[];
  for(let y=-14;y<=14;y++)for(let x=-14;x<=14;x++){
    const radius=Math.hypot(x+.5,y+.5);
    const noise=terrainHash(x,y,seed+117);
    const angle=Math.atan2(y+.5,x+.5);
    let height=radius<4.4?4-radius*.55:0;
    for(let root=0;root<5;root++){
      const direction=root*Math.PI*2/5+(seed%628)/100;
      const bend=(terrainHash(root,2,seed)-.5)*radius*.13;
      const extent=8+terrainHash(root,3,seed)*6;
      const delta=angle-direction-bend;
      const cross=radius*Math.abs(Math.sin(delta));
      if(Math.cos(delta)>0&&radius<extent&&cross<2.1-radius*.10+noise*.35)
        height=Math.max(height,3.9*(1-radius/extent)+.6);
    }
    if(height<=0)continue;
    const i=sample(x,y);
    if(i<0||radius>3.8&&(surfaceHasWater(grid,i)||grid.shore[i]===Shore.rootTrail))continue;
    const elevation=grid.ground[i]/TERRAIN_ELEVATION_UNITS;
    const offset=Math.max(-32,Math.min(32,Math.round((elevation-ground)*verticalScale)));
    const biome=biomeAt((x+.5)*WORLD_TREE_BLOCK,(y+.5)*WORLD_TREE_BLOCK);
    const moss=(biome==='wetland'||biome==='forest'||biome==='taiga')&&radius>3&&noise>.32;
    roots.push({x,y,ground:offset-1,height:Math.ceil(height)+1,moss});
  }
  return {model:blockWorldTree(seed,foliage,roots),ground};
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
