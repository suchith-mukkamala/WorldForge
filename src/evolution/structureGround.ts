import {blockBuilding,extendBlockFootings,type BlockModel} from './blockModels';
import type {Building} from './construction';
import {pixelTerrainHash} from './depthWorldArt';
import {DEPTH_TILE_WIDTH} from './depthProjection';
import type {Biome,Settlement,World} from './engine';
import {mortalBuildingEntrance} from './mortalGameplay';
import type {Point} from './motion';
import {regionalBuildingStyle} from './riverArchitecture';
import {floodplains,riverLinks,waterSeason} from './riverSeasons';
import {TERRAIN_ELEVATION_UNITS} from './terrainCells';
import {VISUAL_TERRAIN_SIDE,type SurfaceGrid} from './surfaceGrid';
import {topographyForWorld} from './topography';

const materials={
  meadow:{stone:'#87857a',course:'#a29a83',earth:'#7e7258',wood:'#9b7957',wall:'#cbb08a',roof:'#95735b'},
  forest:{stone:'#68766c',course:'#899079',earth:'#626b4d',wood:'#705b43',wall:'#a28b67',roof:'#647d55'},
  alpine:{stone:'#78818b',course:'#9b9fa1',earth:'#777d76',wood:'#776758',wall:'#a5a7a3',roof:'#566578'},
  taiga:{stone:'#757e7b',course:'#a1a59a',earth:'#6e7b69',wood:'#6d5849',wall:'#ab987b',roof:'#59747a'},
  wetland:{stone:'#5f766b',course:'#89967a',earth:'#68775b',wood:'#977754',wall:'#b8ad82',roof:'#587b68'},
  dry:{stone:'#9d8062',course:'#bc9e73',earth:'#8e694c',wood:'#aa7f51',wall:'#d1aa79',roof:'#aa644f'},
  ash:{stone:'#62606b',course:'#82717a',earth:'#715e61',wood:'#765b52',wall:'#9e796d',roof:'#744f59'},
  coast:{stone:'#7a8e8a',course:'#a6ada0',earth:'#8e876a',wood:'#a08760',wall:'#c2b89a',roof:'#518584'},
};
type SiteKind=keyof typeof materials;
type MaterialPalette=typeof materials[SiteKind];
export type StructureSite={kind:SiteKind;material:MaterialPalette;wet:boolean;snow:boolean;
  steep:boolean;downslope:Point;shore?:Point;water?:Point};

const compass:readonly Point[]=[{x:0,y:1},{x:1,y:0},{x:0,y:-1},{x:-1,y:0}];
const biomeSite:Record<Biome,SiteKind>={
  forest:'forest',mountain:'alpine',cave:'alpine',taiga:'taiga',wetland:'wetland',
  plains:'meadow',savanna:'dry',wasteland:'dry',volcanic:'ash',water:'coast',
};

export function structureSite(world:World,at:Point):StructureSite{
  const {width,height,tiles,settings}=world;
  const index=at.y*width+at.x,biome=tiles[index].biome;
  const heights=topographyForWorld(world).heights,level=heights[index];
  const nearby=compass.flatMap(side=>{
    const x=at.x+side.x,y=at.y+side.y;
    if(x<0||y<0||x>=width||y>=height)return [];
    const i=y*width+x;
    return [{side,i,drop:level-heights[i]}];
  });
  const coast=nearby.filter(({i})=>tiles[i].biome==='water')
    .sort((a,b)=>Math.abs(a.drop)-Math.abs(b.drop))[0];
  const land=nearby.filter(({i})=>tiles[i].biome!=='water');
  const slope=land.sort((a,b)=>b.drop-a.drop)[0];
  const steep=land.some(({drop})=>Math.abs(drop)>=8);
  const wet=biome==='wetland'||!!settings.riverlands&&floodplains(world)[index]===1;
  const kind=wet?'wetland':coast&&biome!=='volcanic'&&biome!=='taiga'&&level<114?
    'coast':biomeSite[biome];
  const snow=waterSeason(world)==='Frost'&&(kind==='taiga'||level>=126&&kind==='alpine')||level>=183;
  const stream=riverLinks(world).get(index)?.reduce((best,edge)=>
    edge.tier>best.tier?edge:best);
  const flow=stream&&(stream.dx?{x:Math.sign(stream.dx),y:0}:{x:0,y:Math.sign(stream.dy)});
  return {kind,material:materials[kind],wet,snow,steep,
    downslope:slope?.side??compass[0],shore:coast&&Math.abs(coast.drop)<=28?coast.side:undefined,
    water:flow??coast?.side};
}

/** Use the simulation's doorway in both atlas views and the walkable scene. */
export function structureForBuilding(world:World,town:Settlement|undefined,building:Building){
  const site=structureSite(world,building),entry=town&&mortalBuildingEntrance(world,town,building);
  const door=entry&&(entry.x!==building.x||entry.y!==building.y)?
    {x:entry.x-building.x,y:entry.y-building.y}:undefined;
  const model=blockBuilding(building,pixelTerrainHash(building.x,building.y,world.settings.seed),
    {door,regional:regionalBuildingStyle(world,building),site});
  return {model,site,door};
}

export const streetStructureUnit=(type:Building['type'])=>
  type==='communal'?1.6:type==='shelter'?1.9:1.82;

export function surfaceHeightAt(grid:SurfaceGrid,x:number,y:number):number{
  const sx=Math.min(grid.columns-1,Math.max(0,Math.floor((x+.5)*VISUAL_TERRAIN_SIDE)));
  const sy=Math.min(grid.rows-1,Math.max(0,Math.floor((y+.5)*VISUAL_TERRAIN_SIDE)));
  const index=sy*grid.columns+sx;
  return (grid.ground[index]+grid.water[index])/TERRAIN_ELEVATION_UNITS;
}

/** One voxel unit covers the same ground in the stamp and terrain projection.
 * Start the level platform at its highest bearing point and fill downhill to
 * the actual step below each foot, using the same heights as the renderer. */
export function fitStructure(grid:SurfaceGrid,model:BlockModel,at:Point,unit:number,
  terrainUnitsPerVoxel:number,site:StructureSite){
  const side=VISUAL_TERRAIN_SIDE,step=unit/(DEPTH_TILE_WIDTH/2)*side;
  const centerX=(at.x+.5)*side,centerY=(at.y+.5)*side;
  const within=(n:number,total:number)=>Math.min(total-1,Math.max(0,n));
  let height=model.feet.length?-Infinity:surfaceHeightAt(grid,at.x,at.y);
  const samples=model.feet.map(({x,y})=>{
    const left=within(Math.floor(centerX+x*step),grid.columns);
    const right=within(Math.ceil(centerX+(x+1)*step)-1,grid.columns);
    const top=within(Math.floor(centerY+y*step),grid.rows);
    const bottom=within(Math.ceil(centerY+(y+1)*step)-1,grid.rows);
    let lowest=Infinity;
    for(let row=top;row<=bottom;row++)for(let column=left;column<=right;column++){
      const i=row*grid.columns+column,z=(grid.ground[i]+grid.water[i])/TERRAIN_ELEVATION_UNITS;
      height=Math.max(height,z);lowest=Math.min(lowest,z);
    }
    return lowest;
  });
  const depths=samples.map(value=>Math.ceil((height-value)/terrainUnitsPerVoxel));
  const material=model.footing==='timber'?site.material.wood:site.material.stone;
  return {height,depths,model:extendBlockFootings(model,depths,material,site.material.course)};
}

export function paintStructureApproach(ctx:CanvasRenderingContext2D,p:Point,side:Point,
  tile:number,site:StructureSite){
  const start=tile*.13,end=tile*.83,width=tile*.28;
  const length=end-start;
  const x=side.x?p.x+(side.x<0?-end:start):p.x-width/2;
  const y=side.y?p.y+(side.y<0?-end:start):p.y-width/2;
  ctx.fillStyle=site.wet?'#534c40a8':site.material.earth+'bd';
  ctx.fillRect(x,y,side.x?length:width,side.y?length:width);
  const plank=Math.max(1,tile/13);
  ctx.fillStyle=site.wet?site.material.wood:site.material.course+'a0';
  for(let offset=plank;offset<length;offset+=plank*2){
    if(side.x)ctx.fillRect(x+offset,y+width*.12,plank,width*.76);
    else ctx.fillRect(x+width*.12,y+offset,width*.76,plank);
  }
}
