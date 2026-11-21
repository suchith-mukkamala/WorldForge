import type {Building} from './construction';
import {DEPTH_TILE_WIDTH} from './depthProjection';
import {buildingVisualScale} from './depthSprites';
import type {World} from './engine';
import type {Point} from './motion';
import {bankSides,riverLinks} from './riverSeasons';
import {placeStructure,structureFootprint,structureForBuilding} from './structureGround';
import {Shore,surfaceGrid,surfaceHasWater,VISUAL_TERRAIN_SIDE as SIDE} from './surfaceGrid';
import {TERRAIN_ELEVATION_UNITS} from './terrainCells';
import {bridgeTiles,roadTiles} from './transport';

type PlotEdge={from:Point;to:Point;height:number};
export type PlotSquare={color:string;kind:'yard'|'path'|'step'|'boardwalk'};
export type BuildingPlot=ReturnType<typeof structureForBuilding>&{
  building:Building;placement:ReturnType<typeof placeStructure>;outline:PlotEdge[];
};

function streetAccess(world:World,start:number,streets:ReadonlySet<number>,blocked:ReadonlySet<number>,
  bridges:ReadonlySet<number>,streams:ReturnType<typeof riverLinks>){
  const {width,height,tiles}=world;
  const pending=[{id:start,path:[start]}],seen=new Set([start]);
  for(const {id,path} of pending){
    if(streets.has(id))return path;
    if(path.length===7)continue;
    const x=id%width,y=Math.floor(id/width);
    for(const side of bankSides){
      const nx=x+side.x,ny=y+side.y,next=ny*width+nx;
      if(nx<0||ny<0||nx>=width||ny>=height||seen.has(next)||blocked.has(next))continue;
      seen.add(next);
      if(!bridges.has(next)&&(tiles[next].biome==='water'||streams.has(next)))continue;
      pending.push({id:next,path:[...path,next]});
    }
  }
  return [start];
}

export function buildingPlots(world:World,grid=surfaceGrid(world)){
  const {width,height,tiles}=world,{columns,rows}=grid;
  const buildings=new Map<number,BuildingPlot>(),squares=new Map<number,PlotSquare>();
  const clear=new Set<number>(),fringe=new Set<number>(),decoratedTiles=new Set<number>();
  const streetLinks=new Set<number>();
  const blocked=new Set(world.settlements.flatMap(town=>(town.infrastructure?.buildings??[])
    .map(b=>b.y*width+b.x)));
  for(const site of world.ancientSites??[])blocked.add(site.y*width+site.x);
  const bridges=bridgeTiles(world),roads=roadTiles(world),streams=riverLinks(world);
  const inGrid=(x:number,y:number)=>x>=0&&y>=0&&x<columns&&y<rows;
  const toSquare=(value:number)=>Math.floor((value+.5)*SIDE);
  const fromSquare=(value:number)=>value/SIDE-.5;
  const tileOf=(x:number,y:number)=>Math.floor(y/SIDE)*width+Math.floor(x/SIDE);
  const routes=new Map<number,PlotSquare>();

  for(const town of world.settlements){
    const streets=new Set([...roads,...bridges,...(town.infrastructure?.roads??[])]);
    for(const building of town.infrastructure?.buildings??[]){
      const id=building.y*width+building.x,look=structureForBuilding(world,town,building);
      const {model,site,door}=look;
      const unit=1.2*buildingVisualScale(building.type);
      const placement=placeStructure(grid,model,building,unit,site,building.type);
      const {at,scale}=placement,span=unit*scale/(DEPTH_TILE_WIDTH/2);
      const feet=structureFootprint(model,site,building.type);
      const left=at.x+Math.min(0,...feet.map(f=>f.x))*span;
      const right=at.x+Math.max(0,...feet.map(f=>f.x+1))*span;
      const top=at.y+Math.min(0,...feet.map(f=>f.y))*span;
      const bottom=at.y+Math.max(0,...feet.map(f=>f.y+1))*span;
      const margin=.26,outline:PlotEdge[]=[];
      const yard=new Set<number>();
      const rimX=Math.ceil((right+margin+.5)*SIDE),rimY=Math.ceil((bottom+margin+.5)*SIDE);
      for(let y=toSquare(top-margin);y<rimY;y++)for(let x=toSquare(left-margin);x<rimX;x++){
        if(!inGrid(x,y))continue;
        const i=y*columns+x,tile=tileOf(x,y);
        if(surfaceHasWater(grid,i)||grid.water[i]>=4||blocked.has(tile)&&tile!==id)continue;
        const border=x===rimX-1||y===rimY-1||x===toSquare(left-margin)||y===toSquare(top-margin);
        if(border&&(x*13+y*7)%9===0)continue;
        yard.add(i);decoratedTiles.add(tile);
        const color=border?site.material.earth+'a8':(x*17+y*31)%9===0?
          site.material.course+'b8':site.material.earth+'ec';
        squares.set(i,{kind:'yard',color});
      }
      for(const i of yard){
        const x=i%columns,y=Math.floor(i/columns);
        for(const side of bankSides){
          if(inGrid(x+side.x,y+side.y)&&yard.has(i+side.x+side.y*columns))continue;
          const a=fromSquare(x+Number(side.x>0)),b=fromSquare(y+Number(side.y>0));
          outline.push({from:{x:a,y:b},to:{x:a+Math.abs(side.y)/SIDE,y:b+Math.abs(side.x)/SIDE},
            height:(grid.ground[i]+grid.water[i])/TERRAIN_ELEVATION_UNITS});
        }
      }

      // Allow native trees at the edge of the clearing, beyond the space
      // needed by the walls, eaves and pedestrian lane around the building.
      for(let y=Math.max(0,Math.ceil(top-1.1));y<=Math.min(height-1,bottom+1.1);y++){
        for(let x=Math.max(0,Math.ceil(left-1.1));x<=Math.min(width-1,right+1.1);x++){
          const distance=Math.hypot(Math.max(0,left-x,x-right),Math.max(0,top-y,y-bottom));
          if(distance<=margin+.32)clear.add(y*width+x);
          else if(distance<=1.1)fringe.add(y*width+x);
        }
      }

      buildings.set(id,{...look,building,placement,outline});
      if(!door)continue;
      const entrance=id+door.x+door.y*width;
      const access=streetAccess(world,entrance,streets,blocked,bridges,streams);
      const entry={x:entrance%width,y:Math.floor(entrance/width)};
      const front=door.x>0?right-at.x:door.x<0?at.x-left:door.y>0?bottom-at.y:at.y-top;
      const lead=Math.min(front+.065,Math.max(0,(entry.x-at.x)*door.x+(entry.y-at.y)*door.y));
      const stoop={x:at.x+door.x*lead,y:at.y+door.y*lead};
      const turn=door.x?{x:stoop.x,y:entry.y}:{x:entry.x,y:stoop.y};
      const points=[at,stoop,turn,...access.map(i=>({x:i%width,y:Math.floor(i/width)}))];
      for(let p=1;p<points.length;p++){
        const a=points[p-1],b=points[p];
        if(a.x===b.x&&a.y===b.y)continue;
        const horizontal=a.y===b.y;
        const from=toSquare(horizontal?a.x:a.y),to=toSquare(horizontal?b.x:b.y);
        const cross=toSquare(horizontal?a.y:a.x),direction=Math.sign(to-from)||1;
        for(let along=from;along!==to+direction;along+=direction){
          for(let across=cross-1;across<=cross;across++){
            const x=horizontal?along:across,y=horizontal?across:along;
            if(!inGrid(x,y))continue;
            const i=y*columns+x,tile=tileOf(x,y);
            if(blocked.has(tile)&&tile!==id)continue;
            const prior=horizontal?i-direction:i-direction*columns;
            const wet=surfaceHasWater(grid,i)||grid.shore[i]===Shore.flood||grid.water[i]>=3||
              tiles[tile].biome==='wetland'||bridges.has(tile);
            const step=!wet&&Math.abs(grid.ground[i]-(grid.ground[prior]??grid.ground[i]))>=6;
            const kind=wet?'boardwalk':step?'step':'path';
            const color=wet?(along%2?site.material.wood:'#ba9569'):
              step?site.material.course:(along%4===0?site.material.course:site.material.earth);
            routes.set(i,{kind,color});decoratedTiles.add(tile);
          }
        }
      }
      const connected=access[access.length-1];
      if(streets.has(connected))streetLinks.add(connected);
      for(const tile of access.slice(0,-1))clear.add(tile);
      clear.add(entrance);
    }
  }
  for(const [i,path] of routes)squares.set(i,path);
  return {buildings,squares,clear,fringe,decoratedTiles,streetLinks,columns};
}

export type BuildingPlots=ReturnType<typeof buildingPlots>;

export function paintPlotGround(ctx:CanvasRenderingContext2D,plots:BuildingPlots,tile:number,
  origin:Point={x:0,y:0},width=Infinity,height=Infinity){
  const unit=tile/SIDE,minX=origin.x*SIDE,minY=origin.y*SIDE;
  for(const [index,{color}] of plots.squares){
    const x=index%plots.columns-minX,y=Math.floor(index/plots.columns)-minY;
    if(x<0||y<0||x>=width*SIDE||y>=height*SIDE)continue;
    ctx.fillStyle=color;ctx.fillRect(x*unit,y*unit,unit,unit);
  }
}

export function paintPlotOutline(ctx:CanvasRenderingContext2D,plot:BuildingPlot,
  project:(x:number,y:number,height:number)=>Point,lineWidth:number){
  if(!plot.outline.length)return;
  ctx.beginPath();
  for(const {from,to,height} of plot.outline){
    const a=project(from.x,from.y,height),b=project(to.x,to.y,height);
    ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);
  }
  ctx.lineWidth=lineWidth*2;ctx.strokeStyle='#292d25';ctx.stroke();
  ctx.lineWidth=lineWidth;ctx.strokeStyle='#ffe3a1';ctx.stroke();
}
