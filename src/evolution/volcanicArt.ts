import {terrainHash} from './biomeGeneration';
import type {createDepthProjector} from './depthProjection';
import type {DepthPicking} from './depthTerrain';
import type {World} from './engine';
import type {Point} from './motion';
import {seaPoint} from './shipSave';
import {surfaceHeightAt} from './structureGround';
import type {SurfaceGrid} from './surfaceGrid';
import {TERRAIN_CELL_SIDE,TERRAIN_ELEVATION_UNITS} from './terrainCells';
import {SEA_LEVEL,topographyForWorld} from './topography';
import {lavaField,volcanicDay,type LavaCell} from './volcanism';

const SIDE=TERRAIN_CELL_SIDE,UNIT=TERRAIN_ELEVATION_UNITS;
const cold=['#54434b','#493d44','#3c3740','#5e4649'];
const heat=['#a34840','#ca583f','#e87347','#fa9857'];
const fresh=['#764244','#86504a','#694349','#95564d'];
const grainAt=(index:number,salt:number)=>{
  const key=Math.imul(index+1079,374761393)^Math.imul(salt+127,668265263);
  return Math.imul(key^key>>>13,1274126177)>>>0;
};

function cellColor(cell:LavaCell,marine:boolean,day:number,plant:boolean,square=0){
  const grain=grainAt(cell[0],square)&3;
  if(cell[2]>=3){
    const shade=grainAt(cell[0],day)^grainAt(cell[0],square);
    const intensity=cell[2]<8?0:cell[2]<24?1:2;
    return heat[Math.min(3,intensity+(shade>>>26&1))];
  }
  if(cell[2]>0)return fresh[grain];
  if(marine)return cell[1]+cell[3]>(SEA_LEVEL-3)*UNIT?'#4a535d9e':undefined;
  if(plant&&grain!==0)return;
  return cold[grain];
}

export function paintVolcanicSquares(ctx:CanvasRenderingContext2D,world:World,unit:number,
  offset:Point={x:0,y:0},bounds?:{origin:Point;width:number;height:number}){
  const byTile=lavaField(world).byTile;
  if(!byTile.size)return;
  const columns=world.width*SIDE,square=unit/SIDE,day=volcanicDay(world);
  const paint=(tile:number,patches:readonly LavaCell[])=>{
    const biome=world.tiles[tile].biome,marine=biome==='water';
    const plant=biome==='forest'||biome==='taiga'||biome==='savanna'||biome==='plains';
    for(const patch of patches){
      const x=patch[0]%columns*square-offset.x,y=Math.floor(patch[0]/columns)*square-offset.y;
      for(let v=0;v<2;v++)for(let u=0;u<2;u++){
        const color=cellColor(patch,marine,day,plant,v*2+u);
        if(!color)continue;
        ctx.fillStyle=color;
        ctx.fillRect(x+u*square/2,y+v*square/2,square/2,square/2);
      }
      if(patch[2]>12&&terrainHash(patch[0],day,world.settings.seed)>(marine?.63:.88)){
        ctx.fillStyle=marine?'#eadecb98':'#ffcd83';
        ctx.fillRect(x+square/2,y,square/2,square/2);
        if(marine)ctx.fillRect(x,y-square/2,square/2,square/2);
      }
    }
  };
  if(!bounds){for(const [tile,cells] of byTile)paint(tile,cells);return;}
  const {origin,width,height}=bounds;
  for(let y=Math.max(0,origin.y);y<Math.min(world.height,origin.y+height);y++){
    for(let x=Math.max(0,origin.x);x<Math.min(world.width,origin.x+width);x++){
      const tile=y*world.width+x,patches=byTile.get(tile);
      if(patches)paint(tile,patches);
    }
  }
}

export function paintRaisedVolcanism(ctx:CanvasRenderingContext2D,world:World,
  projector:ReturnType<typeof createDepthProjector>,hit:DepthPicking,density:number,ground?:SurfaceGrid){
  const byTile=lavaField(world).byTile;
  if(!byTile.size)return;
  const elevations=topographyForWorld(world).heights,day=volcanicDay(world);
  const columns=world.width*SIDE,step=1/SIDE;
  for(const [tile,patches] of byTile){
    const {x,y}=seaPoint(world.width,tile),biome=world.tiles[tile].biome,marine=biome==='water';
    const plant=biome==='forest'||biome==='taiga'||biome==='savanna'||biome==='plains';
    for(const patch of patches){
      const color=cellColor(patch,marine,day,plant);
      if(!color)continue;
      const u=x-.5+(patch[0]%SIDE)*step,v=y-.5+(Math.floor(patch[0]/columns)%SIDE)*step;
      const p=(dx:number,dy:number)=>{
        const px=u+dx,py=v+dy;
        const z=ground?surfaceHeightAt(ground,px,py):marine&&elevations[tile]<=SEA_LEVEL?
          SEA_LEVEL-9:elevations[tile];
        return projector.projectSmooth(px,py,z+.1);
      };
      const center=p(step/2,step/2),cx=Math.floor(center.x*density),cy=Math.floor(center.y*density);
      if(cx<0||cx>=hit.width||cy<0||cy>=hit.height||hit.ids[cy*hit.width+cx]!==tile+1)continue;
      const a=p(0,0),b=p(step,0),c=p(step,step),d=p(0,step);
      ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(a.x,a.y);
      ctx.lineTo(b.x,b.y);ctx.lineTo(c.x,c.y);ctx.lineTo(d.x,d.y);ctx.closePath();ctx.fill();
    }
  }
}
