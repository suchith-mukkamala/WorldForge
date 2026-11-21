import {blockBuilding,extendBlockFootings,type BlockModel} from './blockModels';
import type {Building} from './construction';
import {pixelTerrainHash} from './depthWorldArt';
import {DEPTH_TILE_WIDTH} from './depthProjection';
import type {Biome,Settlement,World} from './engine';
import {mortalBuildingEntrance} from './mortalGameplay';
import type {Point} from './motion';
import {regionalBuildingStyle} from './riverArchitecture';
import {bankSides,DOCK_BANK_DROP,floodplains,riverBank,riverLinks,waterSeason} from './riverSeasons';
import {TERRAIN_ELEVATION_UNITS} from './terrainCells';
import {surfaceHasWater,VISUAL_TERRAIN_SIDE,type SurfaceGrid} from './surfaceGrid';
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

const compass=bankSides;
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
    downslope:slope?.side??compass[0],shore:coast&&Math.abs(coast.drop)<=DOCK_BANK_DROP?coast.side:undefined,
    water:flow??coast?.side};
}

/** Use the simulation's doorway in both atlas views and the walkable scene. */
export function structureForBuilding(world:World,town:Settlement|undefined,building:Building){
  const habitat=structureSite(world,building);
  const bank=building.type==='watermill'&&riverBank(world,building.y*world.width+building.x);
  const site=bank?{...habitat,water:bank}:habitat;
  const entry=town&&mortalBuildingEntrance(world,town,building);
  const door=entry&&(entry.x!==building.x||entry.y!==building.y)?
    {x:entry.x-building.x,y:entry.y-building.y}:undefined;
  const model=blockBuilding(building,pixelTerrainHash(building.x,building.y,world.settings.seed),
    {door,regional:regionalBuildingStyle(world,building),site});
  return {model,site,door};
}

export const streetStructureUnit=(type:Building['type'])=>
  type==='communal'?1.6:type==='shelter'?1.9:1.82;

export function structureFootprint(model:BlockModel,site:StructureSite,type?:Building['type']){
  const side=type==='dock'?site.shore:type==='watermill'?site.water:undefined;
  const limit=type==='dock'?0:4;
  return side?model.feet.filter(({x,y})=>(x+.5)*side.x+(y+.5)*side.y<limit):model.feet;
}

export function surfaceHeightAt(grid:SurfaceGrid,x:number,y:number):number{
  const sx=Math.min(grid.columns-1,Math.max(0,Math.floor((x+.5)*VISUAL_TERRAIN_SIDE)));
  const sy=Math.min(grid.rows-1,Math.max(0,Math.floor((y+.5)*VISUAL_TERRAIN_SIDE)));
  const index=sy*grid.columns+sx;
  return (grid.ground[index]+grid.water[index])/TERRAIN_ELEVATION_UNITS;
}

function footingProfile(grid:SurfaceGrid,model:BlockModel,at:Point,unit:number,
  bearing:readonly Point[]){
  const side=VISUAL_TERRAIN_SIDE,step=unit/(DEPTH_TILE_WIDTH/2)*side;
  const centerX=(at.x+.5)*side,centerY=(at.y+.5)*side;
  const within=(n:number,total:number)=>Math.min(total-1,Math.max(0,n));
  const ranges=(left:number,top:number,right:number,bottom:number)=>[
    within(Math.floor(centerX+left*step),grid.columns),
    within(Math.floor(centerY+top*step),grid.rows),
    within(Math.ceil(centerX+right*step)-1,grid.columns),
    within(Math.ceil(centerY+bottom*step)-1,grid.rows),
  ];
  let height=model.feet.length?-Infinity:surfaceHeightAt(grid,at.x,at.y);
  const samples=model.feet.map(({x,y})=>{
    const [left,top,right,bottom]=ranges(x,y,x+1,y+1);
    let lowest=Infinity;
    for(let row=top;row<=bottom;row++)for(let column=left;column<=right;column++){
      const i=row*grid.columns+column,z=(grid.ground[i]+grid.water[i])/TERRAIN_ELEVATION_UNITS;
      height=Math.max(height,z);lowest=Math.min(lowest,z);
    }
    return lowest;
  });
  let wet=false,low=Infinity;
  if(bearing.length){
    const xs=bearing.map(f=>f.x),ys=bearing.map(f=>f.y);
    const [left,top,right,bottom]=ranges(Math.min(...xs),Math.min(...ys),
      Math.max(...xs)+1,Math.max(...ys)+1);
    for(let row=top;row<=bottom;row++)for(let column=left;column<=right;column++){
      const i=row*grid.columns+column,z=(grid.ground[i]+grid.water[i])/TERRAIN_ELEVATION_UNITS;
      wet ||=surfaceHasWater(grid,i);
      low=Math.min(low,z);height=Math.max(height,z);
    }
  }
  return {height,samples,drop:bearing.length?height-low:0,wet};
}

/** Keep the foundation on the rendered steps. On a cliff edge, fit the
 * footprint onto a nearby dry bench before adding masonry. */
export function placeStructure(grid:SurfaceGrid,model:BlockModel,at:Point,unit:number,
  site:StructureSite,type?:Building['type']){
  const limit=model.footing==='timber'?28:14;
  const bearing=structureFootprint(model,site,type);
  const profileAt=(point:Point,scale:number)=>footingProfile(grid,model,point,unit*scale,bearing);
  const waterfront=type==='dock'?site.shore:type==='watermill'?site.water:undefined;
  const offset=waterfront&&{x:waterfront.x*.25,y:waterfront.y*.25};
  const initial=offset?{x:at.x+offset.x,y:at.y+offset.y}:at;
  const origin=profileAt(initial,1);
  if(!origin.wet&&origin.drop<=limit)return {at:initial,scale:1,profile:origin};

  const offsets=[...(offset?[offset]:[]),{x:0,y:0}];
  for(const distance of [.25,.375,.5]){
    for(const side of compass)offsets.push({x:side.x*distance,y:side.y*distance});
    for(const x of [-distance,distance])for(const y of [-distance,distance])offsets.push({x,y});
  }
  const inside=(p:Point)=>p.x>=-.5&&p.y>=-.5&&
    p.x<grid.columns/VISUAL_TERRAIN_SIDE-.5&&p.y<grid.rows/VISUAL_TERRAIN_SIDE-.5;
  const floor=surfaceHeightAt(grid,at.x,at.y);
  for(const scale of [1,.82,.66,.51,.39]){
    for(const shift of offsets){
      const point={x:at.x+shift.x,y:at.y+shift.y};
      if(!inside(point))continue;
      const profile=profileAt(point,scale);
      if(!profile.wet&&profile.drop<=limit&&(origin.wet||profile.height>=floor-12))
        return {at:point,scale,profile};
    }
  }

  // Center very narrow plots on one complete square, keeping legacy sites
  // accessible from their original doorway without changing saved coordinates.
  const side=VISUAL_TERRAIN_SIDE;
  const extent=Math.max(1,...model.feet.flatMap(({x,y})=>[Math.abs(x),Math.abs(y),Math.abs(x+1),Math.abs(y+1)]));
  const scale=Math.min(.39,(DEPTH_TILE_WIDTH/2)/(side*unit*extent*2.1));
  const nearby:Point[]=[];
  for(let dy=-side;dy<side;dy++)for(let dx=-side;dx<side;dx++){
    const point={x:at.x+(dx+.5)/side,y:at.y+(dy+.5)/side};
    if(inside(point))nearby.push(point);
  }
  nearby.sort((a,b)=>Math.hypot(a.x-at.x,a.y-at.y)-Math.hypot(b.x-at.x,b.y-at.y));
  for(const point of nearby){
    const profile=profileAt(point,scale);
    if(!profile.wet&&(origin.wet||profile.height>=floor-12))return {at:point,scale,profile};
  }
  return {at:initial,scale,profile:profileAt(initial,scale)};
}

export function structureFootings(placed:ReturnType<typeof placeStructure>,model:BlockModel,
  terrainUnitsPerVoxel:number,site:StructureSite){
  const {height,samples}=placed.profile;
  const depths=samples.map(value=>Math.ceil((height-value)/(terrainUnitsPerVoxel*placed.scale)));
  const material=model.footing==='timber'?site.material.wood:site.material.stone;
  return {height,depths,at:placed.at,scale:placed.scale,
    model:extendBlockFootings(model,depths,material,site.material.course)};
}

export function fitStructure(grid:SurfaceGrid,model:BlockModel,at:Point,unit:number,
  terrainUnitsPerVoxel:number,site:StructureSite){
  return structureFootings(placeStructure(grid,model,at,unit,site),model,terrainUnitsPerVoxel,site);
}
