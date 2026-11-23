import {terrainHash} from './biomeGeneration';
import {ARCHITECTURE,buildingTier,type Building,type SettlementStage} from './construction';
import type {Species} from './engine';
import type {AncientKind} from './knowledge';
import type {Facing,Point} from './motion';
import type {TerrainMotif} from './terrainDetails';
import type {TreeKind} from './biomeTrees';
import type {VisualSeason} from './sceneAtmosphere';
import type {RegionalBuildingStyle} from './riverArchitecture';
import type {StructureSite} from './structureGround';
import type {CaveStone} from './tidalCaves';
import type {RealmFormationKind} from './realmScenery';
import type {RealmLink} from './underworld';

export const BLOCK_FACES=[
  {dx:0,dy:0,dz:1,quad:[[0,0,1],[1,0,1],[1,1,1],[0,1,1]],light:1.18},
  {dx:1,dy:0,dz:0,quad:[[1,0,0],[1,1,0],[1,1,1],[1,0,1]],light:.76},
  {dx:-1,dy:0,dz:0,quad:[[0,0,0],[0,1,0],[0,1,1],[0,0,1]],light:.94},
  {dx:0,dy:1,dz:0,quad:[[0,1,0],[1,1,0],[1,1,1],[0,1,1]],light:.89},
  {dx:0,dy:-1,dz:0,quad:[[0,0,0],[1,0,0],[1,0,1],[0,0,1]],light:.71},
] as const;
type Face={x:number;y:number;z:number;direction:number;color:string};
export type BlockModel={key:string;faces:readonly Face[];feet:readonly Point[];footing:'stone'|'timber';sculpted?:boolean};

const stride=32,layer=stride*stride;
const cell=(x:number,y:number,z:number)=>x+16+(y+16)*stride+z*layer;
const models=new Map<string,BlockModel>();

/** Build the exposed faces of a lattice of unit cubes. Covered faces are
 * discarded, so a solid house costs about as much to project as a hollow one. */
function model(key:string,make:(grid:BlockGrid)=>void,quarter=0,
  footing:BlockModel['footing']='stone'):BlockModel{
  const cached=models.get(key);
  if(cached)return cached;
  const grid=new BlockGrid(quarter);
  make(grid);
  const faces:Face[]=[];
  const feet:Point[]=[];
  for(const [index,color] of grid.cells){
    const z=Math.floor(index/layer),plane=index-z*layer;
    const x=plane%stride-16,y=Math.floor(plane/stride)-16;
    if(z===0)feet.push({x,y});
    BLOCK_FACES.forEach(({dx,dy,dz},direction)=>{
      if(!grid.cells.has(cell(x+dx,y+dy,z+dz)))faces.push({x,y,z,direction,color});
    });
  }
  const compiled={key,faces,feet,footing};
  if(models.size>=260)models.clear();
  models.set(key,compiled);
  return compiled;
}

const fittedModels=new Map<string,BlockModel>();
/** Extend only load-bearing columns. Adjacent material meets at each riser
 * so stepped foundations show masonry on the downhill sides. */
export function extendBlockFootings(source:BlockModel,depths:readonly number[],
  stone:string,course:string):BlockModel{
  if(!depths.some(Boolean))return source;
  const key=source.key+':footings:'+stone+':'+course+':'+depths.join(',');
  const cached=fittedModels.get(key);
  if(cached)return cached;
  const supports=new Map(source.feet.map(({x,y},i)=>[cell(x,y,0),depths[i]]));
  const faces=[...source.faces];
  for(const [i,{x,y}] of source.feet.entries()){
    const depth=depths[i];
    for(let direction=1;direction<BLOCK_FACES.length;direction++){
      const {dx,dy}=BLOCK_FACES[direction],neighbor=supports.get(cell(x+dx,y+dy,0))??0;
      for(let z=-depth;z<-neighbor;z++)
        faces.push({x,y,z,direction,color:(z+(x+y)%2)%3===0?course:stone});
    }
  }
  const grounded={...source,key,faces};
  if(fittedModels.size>=260)fittedModels.clear();
  fittedModels.set(key,grounded);
  return grounded;
}

class BlockGrid {
  readonly cells=new Map<number,string>();
  lift=0;
  constructor(private readonly quarter:number){}
  box(x:number,y:number,z:number,width:number,depth:number,height:number,color:string,turn=0){
    const quarter=(this.quarter+turn)%4;
    for(let k=z;k<z+height;k++)for(let j=y;j<y+depth;j++)for(let i=x;i<x+width;i++){
      const u=quarter===1?-j-1:quarter===2?-i-1:quarter===3?j:i;
      const v=quarter===1?i:quarter===2?-j-1:quarter===3?-i-1:j;
      this.cells.set(cell(u,v,k+this.lift),color);
    }
  }
}

/** Round clusters carved on the same cube lattice as the atlas scenery. */
export function blockCloud(shape:number):BlockModel{
  return model('cloud:'+shape,grid=>{
    const lobes=[
      {x:-7,y:0,z:2.5,rx:6.4,ry:3.8,rz:2.6},
      {x:-3,y:1,z:4,rx:5.4,ry:5.2,rz:4.2},
      {x:3,y:-1,z:4.7,rx:5.5,ry:5.4,rz:4.4},
      {x:8,y:0,z:3.1,rx:5.5,ry:3.5,rz:3.1},
    ].map((p,i)=>({...p,y:p.y+(terrainHash(shape,i,1412)-.5)*4,
      z:p.z+(terrainHash(shape,i,5729)-.5)*2.3}));
    const tints=['#b1cdd5','#cbe2e2','#ddebe6','#ebf4ea'];
    for(let z=0;z<11;z++)for(let y=-8;y<=8;y++)for(let x=-14;x<=14;x++){
      const edge=terrainHash(x+37*z,y,shape+932);
      if(!lobes.some(p=>((x-p.x)/p.rx)**2+((y-p.y)/p.ry)**2+((z-p.z)/p.rz)**2<.93+edge*.19))continue;
      const tone=Math.min(tints.length-1,Math.floor(z*.37+edge*.9));
      grid.box(x,y,z,1,1,1,tints[tone]);
    }
  });
}

export type BlockProp=TreeKind|'boulder'|'snowstone'|'basalt'|'crystal'|
  'flowers'|'grass'|'reeds'|'fern'|'scrub'|'embers'|'lantern';

export function terrainBlockProp(motif:TerrainMotif):BlockProp|undefined{
  if(motif==='ripples'||motif==='shorefoam'||motif==='none')return;
  if(motif==='pebbles'||motif==='scree')return 'boulder';
  if(motif==='stalagmite')return 'crystal';
  return motif;
}

function regionalTree(grid:BlockGrid,kind:TreeKind,variant:number,season?:VisualSeason):void{
  const tall=variant%2,lean=variant%3-1;
  if(kind==='birch'){
    grid.box(-1,-1,0,2,2,11+tall,'#d0c8a7');
    grid.box(-1,0,2,1,1,1,'#706d65');
    grid.box(0,-1,4,1,1,1,'#706d65');
    grid.box(-2,-2,6,4,4,4,season==='Harvest'?'#ae834a':'#73a872');
    grid.box(-1+lean,-2,9,4,4,3,season==='Harvest'?'#c49d5e':'#8cb47b');
    grid.box(-1+lean,-1,12,2,2,2+tall,season==='Harvest'?'#d8b66c':'#aac88a');
  }else if(kind==='spruce'||kind==='larch'){
    const spruce=kind==='spruce',tiers=spruce?4:3;
    const foliage=spruce?['#315954','#3f746e','#5f9181']:
      season==='Harvest'||!season?['#81653d','#b58c45','#d3af64']:
        season==='Frost'?['#786a5a','#918479','#b6b1a3']:['#536746','#708a56','#92a36b'];
    grid.box(-1,-1,0,2,2,spruce?8:12,'#725744');
    for(let tier=0;tier<tiers;tier++){
      const radius=tiers-tier,z=(spruce?3:5)+tier*(spruce?3:4)+tall;
      grid.box(-radius,-radius+1,z,radius*2,radius*2-2,1,foliage[0]);
      grid.box(-radius+1,-radius,z,radius*2-2,radius*2,1,foliage[1]);
      grid.box(1-radius,1-radius,z+1,Math.max(2,radius*2-2),Math.max(2,radius*2-2),2,foliage[1]);
      grid.box(-1,-1,z+2,2,2,spruce?2:1,foliage[2]);
    }
    grid.box(-1,0,16+tall,1,1,1,spruce&&variant===2?'#a5bab2':foliage[2]);
  }else if(kind==='willow'){
    grid.box(-1,-1,0,2,2,8,'#796543');
    grid.box(-3,-2,6,6,4,4,'#71925e');
    grid.box(-4,-3,7,8,6,2,'#7d9e66');
    grid.box(-2+lean,-2,9,5,4,2,'#a0b578');
    for(let i=0;i<4;i++){
      const z=2+(i+variant)%3;
      grid.box(-4+i*2,2,z,1,1,7-z,'#567c59');
      grid.box(-3+i*2,-3,z+1,1,1,6-z,'#65895a');
    }
    grid.box(3,-1,4,1,2,4,'#63865b');
  }else if(kind==='acacia'){
    grid.box(-1,-1,0,2,2,5,'#85674a');
    grid.box(0,-1,3,2,2,4,'#977953');
    grid.box(-3,-1,5,4,2,1,'#866c4f');
    grid.box(-4,-2,6,5,4,2,'#758450');
    grid.box(0,-3,7,6,6,2,'#849457');
    grid.box(-3,-1,8,6,3,1,'#9da963');
    grid.box(1,-2,9,4,4,1,'#a7ae68');
  }else if(kind==='baobab'){
    grid.box(-2,-2,0,4,4,7,'#a68e6b');
    grid.box(-1,-1,7,2,2,3,'#b09771');
    grid.box(-4,0,6,8,1,2,'#a78e69');
    grid.box(0,-3,7,1,6,2,'#a78e69');
    grid.box(-4,-1,8,3,3,2,'#8f9e60');
    grid.box(2,-2,8,3,3,2,'#9da76f');
    grid.box(-1,-3,10,3,3,2,'#a7b071');
  }
}

export function blockProp(kind:BlockProp,seed:number,season?:VisualSeason):BlockModel{
  const variant=(seed>>>0)%4;
  const canopy=kind==='larch'||kind==='birch'||kind==='oak'?season:undefined;
  return model(kind+':'+variant+(canopy?':'+canopy:''),grid=>{
    if(kind==='oak'||kind==='pine'){
      const tall=variant%2,lean=variant%3-1;
      const needles=['#366a54','#3e7d61','#588e6b','#78a17b'];
      const leaves=season==='Harvest'?['#865f3d','#a0744a','#b58755','#d2a760']:
        ['#376f50','#4e8d5f','#65a471',
        variant===2?'#b49b58':variant===3?'#8aaa78':'#82ad75'];
      grid.box(-1,-1,0,2,2,6+tall,'#75543f');
      grid.box(-2,-1,0,4,2,1,'#6a503e');
      if(kind==='pine'){
        for(let crown=0;crown<3;crown++){
          const span=8-crown*2,z=3+crown*3+tall;
          grid.box(-span/2+1,-span/2,z,span-2,span,1,needles[crown]);
          grid.box(-span/2,-span/2+1,z,span,span-2,1,needles[crown]);
          grid.box(-span/2+1,-span/2+1,z+1,span-2,span-2,2,needles[crown+1]);
        }
        grid.box(-1,-1,11+tall,2,2,2,variant===2?'#a5b6a3':needles[3]);
      }else{
        grid.box(-3,-2,4,6,4,4,leaves[0]);
        grid.box(-2,-3,5,5,6,3,leaves[1]);
        grid.box(-4+lean,-1,5,3,3,3,leaves[1]);
        grid.box(-2+lean,-2,7,5,4,3,leaves[2]);
        grid.box(-1+lean,-1,10,3,2,1+tall,leaves[3]);
        grid.box(2,-3,7,2,3,2,leaves[2]);
        grid.box(2,-2,9,1,2,1,leaves[3]);
      }
      return;
    }
    if(kind==='birch'||kind==='spruce'||kind==='larch'||kind==='willow'||kind==='acacia'||kind==='baobab'){
      regionalTree(grid,kind,variant,season);
      return;
    }
    if(kind==='boulder'||kind==='snowstone'||kind==='basalt'||kind==='crystal'){
      const stone=kind==='basalt'?'#656173':kind==='crystal'?'#69908e':'#849190';
      const cap=kind==='snowstone'?'#c9d4d1':kind==='crystal'?'#83bab7':stone;
      grid.box(-3,-2,0,5,4,1,stone);
      grid.box(-2,-2,1,3,3,1+variant%2,stone);
      grid.box(-1,-1,2+variant%2,2,2,1,cap);
      grid.box(1,1,0,2,2,1,cap);
      if(kind==='crystal'){
        grid.box(-2,0,1,1,1,4,cap);
        grid.box(1,-2,0,1,1,3,'#9acbc2');
      }
      return;
    }
    if(kind==='lantern'){
      grid.box(-1,-1,0,2,2,1,'#625648');
      grid.box(0,0,1,1,1,5,'#70553f');
      grid.box(-1,-1,6,3,3,2,'#e6ac63');
      grid.box(-1,-1,8,3,3,1,'#654e42');
      return;
    }
    const stem=kind==='embers'?'#835452':kind==='scrub'?'#7c8760':'#619266';
    const tip=kind==='flowers'?['#e8c185','#daa2a4','#cad28e','#e5ac83'][variant]:
      kind==='reeds'?'#d5c483':kind==='embers'?'#e9a368':'#8db581';
    for(let tuft=0;tuft<3;tuft++){
      const x=tuft*2-3,y=(variant+tuft*3)%5-2,h=2+(tuft+variant)%3;
      grid.box(x,y,0,1,1,h,stem);
      grid.box(x,y,h,1,1,1,tip);
      if(kind==='fern')grid.box(x-1,y,h-1,3,1,1,stem);
    }
  });
}

const STONE='#827e78',WOOD='#927353',PLANK='#bd9469',BEAM='#654e41';
const quarterForDoor=(side?:Point)=>side?.y===-1?2:side?.x===-1?1:side?.x===1?3:0;
const compassTurn=(side?:Point)=>side?.y===1?1:side?.x===-1?2:side?.y===-1?3:0;

function boatHull(grid:BlockGrid,merchant:boolean){
  const sides=[1,2,4,5,5,5,5,5,5,4,3,2];
  for(const [row,width] of sides.entries()){
    const x=-Math.floor(width/2),y=row-6;
    grid.box(x,y,0,width,1,2,merchant?'#704d3a':'#745541');
    grid.box(x,y,2,width,1,1,row%2===0?PLANK:WOOD);
    for(const edge of [x,x+width-1])grid.box(edge,y,3,1,1,1,BEAM);
  }
  grid.box(-1,-6,2,1,2,3,'#be8d5f');
  grid.box(-1,4,3,3,1,1,'#ae875e');
}

export function blockSailboat(heading:Facing,merchant=false):BlockModel{
  const quarter={north:0,east:1,south:2,west:3}[heading];
  return model('sailboat:'+heading+':'+merchant,grid=>{
    boatHull(grid,merchant);
    grid.box(0,0,3,1,1,12,BEAM);
    grid.box(0,-1,12,1,3,1,'#815938');
    const canvas=merchant?'#dad9bc':'#f0deb1';
    for(let z=5;z<13;z++){
      const width=7-Math.floor((z-5)*.65);
      for(let col=0;col<width;col++){
        const x=col-Math.floor(width/2),y=x+Number(col>width/2);
        grid.box(x,y,z,1,2,1,z===6?'#b27c5e':col===0?'#d4bc90':canvas);
      }
    }
    grid.box(0,0,14,2,1,1,merchant?'#679389':'#be7650');
    if(merchant)grid.box(-1,2,3,2,2,2,'#b98b67');
  },quarter,'timber');
}

export function blockShipyard(water:Point,site:StructureSite):BlockModel{
  const quarter=quarterForDoor({x:-water.x,y:-water.y});
  const {wood,course,stone,wall,roof}=site.material;
  return model('shipyard:'+quarter+':'+site.kind,grid=>{
    grid.box(-5,-3,0,10,7,1,stone);
    grid.box(-5,0,1,5,4,5,wall);
    grid.box(-5,0,6,5,5,1,roof);
    grid.box(-4,1,7,3,4,1,roof);
    grid.box(-4,3,1,2,1,4,BEAM);
    grid.box(-1,3,3,1,1,2,'#e2b987');
    for(let row=-9;row<=0;row++)grid.box(-3,row,1,7,1,1,row%2===0?PLANK:wood);
    for(const x of [-3,3])for(const y of [-9,-5,-2])grid.box(x,y,0,1,1,4,BEAM);
    grid.box(-1,-5,2,3,4,1,BEAM);
    grid.box(-1,-5,3,3,1,1,wood);
    grid.box(-1,-2,3,3,1,1,wood);
    grid.box(0,-6,3,1,5,1,course);
    grid.box(3,2,1,2,1,2,wood);
    grid.box(3,2,3,2,1,1,PLANK);
  },quarter,'timber');
}
function tint(color:string,local:string|undefined,amount:number):string{
  if(!local)return color;
  const a=parseInt(color.slice(1),16),b=parseInt(local.slice(1),16);
  return '#'+[16,8,0].map(shift=>Math.round((a>>shift&255)*(1-amount)+(b>>shift&255)*amount)
    .toString(16).padStart(2,'0')).join('');
}

function steppedRoof(grid:BlockGrid,left:number,back:number,z:number,width:number,depth:number,
  culture:Species,roof:string,accent:string,snow=false){
  const flat=culture==='dwarf';
  const steps=flat?Math.min(3,Math.ceil(depth/2)):Math.ceil(width/2);
  for(let step=0;step<steps;step++){
    const x=left+step,y=back+(flat?step:0),w=width-2*step,d=depth-(flat?2*step:0);
    grid.box(x,y,z+step,w,d,1,step===steps-1?accent:roof);
    // Trim the eaves and run darker seams between the individual shingles.
    if(!step){
      grid.box(x,y,z,w,1,1,tint(roof,BEAM,.3));
      grid.box(x,y+d-1,z,w,1,1,tint(roof,BEAM,.3));
    }
    if(snow&&step>=1&&step<steps-1&&w>1&&d>2){
      grid.box(x,y+1,z+step,1,d-2,1,'#c0cdd0');
      grid.box(x+w-1,y+2,z+step,1,Math.max(1,d-4),1,'#a9b9bc');
    }
  }
}

type ArchitectureOptions={door?:Point;regional?:RegionalBuildingStyle;site?:StructureSite};
export function blockBuilding(b:Building,variant:number,options:ArchitectureOptions={}):BlockModel{
  const {type,culture,stage}=b,tier=buildingTier(b),style=ARCHITECTURE[culture];
  const {site,regional,door}=options,material=site?.material;
  variant=(variant>>>0)%3;
  const shore=type==='dock'?site?.shore:undefined;
  const quarter=shore?quarterForDoor({x:-shore.x,y:-shore.y}):
    quarterForDoor(type==='farm'&&site?.steep?site.downslope:door);
  const stone=material?.stone??STONE,course=material?.course??'#a59880';
  const wood=material?.wood??WOOD,earth=material?.earth??'#795c45';
  const weathered=b.condition<46;
  const roof=tint(regional==='riverside'?'#477b78':style.roof,material?.roof,.48);
  const roofRidge=tint(culture==='dwarf'?'#8e9bb1':culture==='elf'?'#70a882':roof,style.trim,.24);
  const wheelTurn=(compassTurn(site?.water)-quarter+4)%4;
  const pier=type==='dock'&&(!site||!!shore);
  const raised=(stage==='complete'||stage==='finishing')&&
    (site?.wet||regional==='stilts')&&
    type!=='farm'&&type!=='well'&&type!=='dock'&&type!=='granary'&&type!=='watermill';
  return model([type,culture,stage,tier,variant,quarter,regional,site?.kind,site?.snow,
    site?.steep,raised,pier,wheelTurn,weathered].join(':'),grid=>{
    const width=type==='communal'?12:type==='shelter'?6:
      type==='storage'||type==='granary'||tier>=2||type==='house'&&variant===2?10:8;
    const depth=type==='communal'||type==='house'&&variant===1?10:type==='shelter'?6:8;
    const x=-width/2,y=-depth/2;
    const wall=tint(tier>=2&&culture==='human'?'#a6a096':style.wall,
      weathered?stone:material?.wall,weathered?.54:.4);
    const h=type==='communal'?9:type==='shelter'||type==='storage'?4+tier:5+tier;
    const foundation=type==='farm'?earth:type==='dock'?wood:stone;
    const ready=stage==='complete'||stage==='finishing';
    if(raised){
      for(const u of [x,x+width-1])for(const v of [y,y+depth-1])
        grid.box(u,v,0,1,1,4,wood);
      grid.box(x,y,2,width,1,1,BEAM);
      grid.box(x,y+depth-1,2,width,1,1,BEAM);
      grid.box(x-1,y-1,3,width+2,depth+2,1,PLANK);
      for(let step=0;step<3;step++)grid.box(-2,y+depth+3-step,0,4,1,step+1,wood);
      grid.lift=3;
    }
    if(!ready||type!=='granary'&&!pier){
      grid.box(x,y,0,width,depth,1,foundation);
      if(!raised&&type!=='farm'&&type!=='dock')for(const u of [x,x+width-2])
        for(const v of [y,y+depth-2])grid.box(u,v,0,2,2,1,course);
    }
    if(stage==='foundation'||stage==='abandoned'||stage==='ruin'){
      grid.box(x,y,1,width,1,1,wall);
      grid.box(x,y+1,1,1,depth-1,1,wall);
      if(stage!=='foundation'){
        grid.box(x,y,2,stage==='abandoned'?width:3,1,2,wall);
        grid.box(x,y+depth-3,1,2,3,2,stone);
        grid.box(x+width-3,y+1,1,2,2,1,wall);
        if(stage==='abandoned')grid.box(x+width-1,y,1,1,depth-2,3,wall);
      }else grid.box(x+width-1,y+depth-1,1,1,1,1,wall);
      grid.box(x+width-2,y+depth,0,2,1,1,course);
      grid.box(x-1,y+1,0,1,2,1,stone);
      return;
    }
    if(stage==='frame'){
      for(const u of [x,x+width-1])for(const v of [y,y+depth-1])
        grid.box(u,v,1,1,1,h,WOOD);
      for(const u of [x,x+width-1])grid.box(u,y,h,1,depth,1,PLANK);
      for(const v of [y,y+depth-1])grid.box(x,v,h,width,1,1,PLANK);
      grid.box(x,y+depth-2,Math.floor(h/2),width,1,1,wood);
      grid.box(x+1,y+depth,0,2,1,2,stone);
      return;
    }
    if(type==='farm'){
      if(regional==='terraces'||site?.steep){
        for(let stripe=0;stripe<3;stripe++){
          const row=y+stripe*2,z=3-stripe;
          grid.box(x,row,1,width,2,z,stone);
          grid.box(x+1,row,z+1,width-2,1,1,earth);
          grid.box(x,row+1,z+1,width,1,1,course);
          for(let col=x+1;col<x+width-1;col+=2)
            grid.box(col,row,z+2,1,1,1,stripe%2?'#aeb86e':'#789c5a');
        }
        return;
      }
      for(let row=y+1;row<y+depth;row+=2){
        grid.box(x+1,row,1,width-2,1,1,earth);
        for(let col=x+1;col<x+width-1;col+=2)
          grid.box(col,row,2,1,1,1,row%3===0?'#c0b063':'#80a063');
      }
      if(site?.wet)grid.box(x+width-2,y+1,1,1,depth-2,1,'#548d8a');
      grid.box(x,y,1,width,1,1,wood);
      for(const u of [x,x+width-1])grid.box(u,y,1,1,1,2,BEAM);
      for(const u of [x,x+width-1])grid.box(u,y+depth-1,1,1,1,2,wood);
      return;
    }
    if(type==='well'){
      grid.box(-3,-3,1,6,6,1,'#4d8990');
      grid.box(-2,-1,1,3,1,1,'#79aba8');
      for(const u of [-3,2]){
        grid.box(u,-3,1,1,6,2,stone);
        grid.box(u,-3,3,1,6,1,course);
        grid.box(u,0,4,1,1,4,wood);
      }
      for(const v of [-3,2])grid.box(-2,v,1,4,1,3,stone);
      grid.box(-3,0,6,7,1,1,BEAM);
      grid.box(0,0,3,1,1,3,'#cab88b');
      grid.box(0,0,2,2,2,1,wood);
      steppedRoof(grid,-4,-3,8,8,6,'human',roof,roofRidge,site?.snow);
      return;
    }
    if(type==='dock'){
      const tip=pier?-8:-3;
      for(let row=tip;row<=5;row++)grid.box(-3,row,1,6,1,1,row%2?PLANK:wood);
      for(const u of [-3,2])for(const v of [tip,-1,4]){
        grid.box(u,v,0,1,1,4,BEAM);
        grid.box(u,v,4,1,1,1,PLANK);
      }
      grid.box(-3,tip,2,6,1,1,wood);
      grid.box(-2,3,2,2,2,2,PLANK);
      grid.box(-2,3,4,2,2,1,wood);
      grid.box(1,0,2,1,2,2,BEAM);
      grid.box(1,0,4,1,2,1,'#b9aa83');
      if(pier){
        grid.box(3,tip+2,0,1,2,2,wood);
        grid.box(-1,5,0,2,2,1,wood);
      }else{
        grid.box(-3,-3,2,1,4,3,wood);
        grid.box(-3,-3,5,6,4,1,roof);
      }
      if(regional==='fishery'){
        grid.box(1,-3,2,2,3,1,'#6c9896');
        grid.box(-2,-2,2,2,2,2,'#c39c67');
      }
      return;
    }
    if(type==='market'){
      for(const u of [x,x+width-1])for(const v of [y,y+depth-1])
        grid.box(u,v,1,1,1,5,BEAM);
      grid.box(x+1,0,1,width-2,2,2,wood);
      for(let i=0;i<3;i++)grid.box(x+1+i*2,1,3,2,1,1,['#98ae68','#dfa360','#ba7363'][i]);
      grid.box(x,y+depth-1,1,2,2,2,wood);
      grid.box(x+width-2,y+depth-1,1,2,2,2,wood);
      for(let col=x-1;col<=x+width;col++){
        const stripe=col%2?roof:style.trim;
        grid.box(col,y,6,1,depth,1,stripe);
        grid.box(col,y+1,7,1,depth-2,1,stripe);
        if(col%2)grid.box(col,y+depth-1,5,1,1,1,stripe);
      }
      return;
    }
    if(type==='watermill'){
      grid.box(-4,-4,1,8,8,2,stone);
      grid.box(-4,-4,3,8,8,4,wall);
      grid.box(-1,3,1,2,1,3,'#52473e');
      grid.box(-3,3,4,1,1,2,'#c9a475');
      steppedRoof(grid,-5,-5,7,10,10,culture,roof,roofRidge,site?.snow);
      grid.box(4,-3,0,4,6,1,'#547c7d',wheelTurn);
      for(const y of [-3,2])grid.box(5,y,0,2,1,2,stone,wheelTurn);
      for(const z of [1,6])grid.box(4,-2,z,2,4,1,wood,wheelTurn);
      for(const y of [-3,2])grid.box(4,y,2,2,1,4,wood,wheelTurn);
      grid.box(4,-3,3,2,6,1,PLANK,wheelTurn);
      grid.box(4,-1,1,2,2,6,wood,wheelTurn);
      grid.box(4,-1,3,3,2,2,'#d5b88b',wheelTurn);
      return;
    }
    if(type==='granary'){
      for(const u of [x,x+width-2])for(const v of [y,y+depth-2]){
        grid.box(u,v,0,2,2,1,stone);
        grid.box(u,v,1,1,1,3,wood);
      }
      grid.box(x,y,4,width,depth,1,BEAM);
      grid.box(x+1,y+1,5,width-2,depth-2,4,'#b69863');
      grid.box(x+1,y+depth-2,5,width-2,1,1,wood);
      grid.box(x+1,y+depth-2,8,width-2,1,1,wood);
      grid.box(-1,y+depth-2,5,2,1,3,'#5d4b3e');
      grid.box(-1,y+depth-1,3,2,1,2,PLANK);
      grid.box(-1,y+depth,0,2,1,3,PLANK);
      grid.box(x+1,y+depth-2,7,2,1,1,style.trim);
      grid.box(x+width-3,y+depth-2,7,2,1,1,style.trim);
      grid.box(x-1,y+depth-3,0,2,2,2,'#ad8d62');
      steppedRoof(grid,x,y,9,width,depth,culture,roof,roofRidge,site?.snow);
      return;
    }
    if(type==='shelter'){
      grid.box(x,y,1,width,2,h-1,wood);
      grid.box(x,y+2,1,1,depth-2,h-2,wall);
      grid.box(x+width-1,y+depth-1,1,1,1,h,BEAM);
      grid.box(x+1,y+depth-2,1,3,1,1,PLANK);
      grid.box(-1,y+depth,0,2,2,1,stone);
      steppedRoof(grid,x-1,y-1,h+1,width+2,depth+2,'human',
        tint(roof,'#af9a6a',.4),roofRidge,site?.snow);
      return;
    }
    grid.box(x,y,1,width,depth,h,wall);
    for(const u of [x,x+width-1])for(const v of [y,y+depth-1])
      grid.box(u,v,1,1,1,h,culture==='dwarf'?style.trim:BEAM);
    // Door and windows occupy individual blocks on the wall they belong to.
    grid.box(-1,y+depth-1,1,2,1,Math.min(3,h-1),'#4b4144');
    grid.box(0,y+depth-1,2,1,1,1,'#997757');
    grid.box(x,y+depth-1,1,width,1,1,stone);
    grid.box(-1,y+depth,0,2,2,1,course);
    const light=stage==='finishing'?'#756c63':'#dfbb79';
    for(const u of [x+1,x+width-3]){
      grid.box(u,y+depth-1,3,2,1,2,type==='storage'?wood:light);
      grid.box(u,y+depth,2,2,1,1,style.trim);
      if(type!=='storage')grid.box(u,y+depth-1,4,2,1,1,tint(light,BEAM,.32));
    }
    grid.box(x,-2,3,1,2,2,light);
    grid.box(x+width-1,0,3,1,2,2,light);
    grid.box(-1,y,3,2,1,2,light);
    steppedRoof(grid,x-1,y-1,h+1,width+2,depth+2,culture,roof,roofRidge,site?.snow);
    if(stage==='finishing'){
      grid.box(x-1,y+depth,0,1,1,h+2,WOOD);
      grid.box(x+2,y+depth,0,1,1,h+2,WOOD);
      grid.box(x-1,y+depth,h-1,4,1,1,PLANK);
    }
    if(type==='workshop'||site?.snow||culture==='demon'||(variant===1&&tier>=1)){
      grid.box(x+width-3,y+1,h+1,2,2,5,culture==='demon'?'#a77172':STONE);
      grid.box(x+width-3,y+1,h+6,2,2,1,BEAM);
    }
    if(type==='storage'||type==='workshop'){
      grid.box(x-1,y+depth-2,0,2,2,2,PLANK);
      grid.box(x-1,y+depth-2,2,2,2,1,wood);
      grid.box(x+1,y+depth-1,1,3,1,3,type==='storage'?'#5f5146':stone);
      if(type==='workshop'){
        grid.box(x+width,y+1,0,3,3,1,stone);
        grid.box(x+width,y+1,1,3,2,3,wood);
        grid.box(x+width+1,y+1,4,1,1,1,'#5f6770');
      }
    }
    if(type==='communal'){
      grid.box(x,y,h+1,3,3,6,wall);
      grid.box(x-1,y-1,h+7,5,5,1,roof);
      grid.box(x,y,h+8,3,3,1,roof);
      grid.box(x+1,y+1,h+9,1,1,2,style.trim);
      grid.box(-3,y+depth,0,6,3,1,course);
      for(const u of [-3,2])grid.box(u,y+depth+1,1,1,1,5,stone);
      grid.box(-4,y+depth-1,6,8,3,1,roofRidge);
    }
    if(type==='house'&&tier>=2){
      grid.box(-2,y+depth+1,0,4,2,1,course);
      for(const u of [-2,1])grid.box(u,y+depth+1,1,1,1,4,wood);
      grid.box(-3,y+depth-1,5,6,4,1,roofRidge);
      if(tier===3)grid.box(1,y+depth-1,h-2,2,1,2,style.trim);
    }
  },quarter,raised||pier?'timber':'stone');
}

const ranks:readonly SettlementStage[]=['encampment','hamlet','village','town','city'];
export function blockSettlement(stage:SettlementStage,culture:Species,site?:StructureSite):BlockModel{
  return model(['hub',stage,culture,site?.kind,site?.snow].join(':'),grid=>{
    const style=ARCHITECTURE[culture],rank=ranks.indexOf(stage),radius=rank+3;
    const stone=site?.material.stone??STONE,wood=site?.material.wood??WOOD;
    const roof=tint(style.roof,site?.material.roof,.45);
    grid.box(-radius,-radius,0,radius*2,radius*2,1,rank>=2?stone:site?.material.earth??'#a99371');
    if(!rank){
      grid.box(-2,-2,1,4,3,1,wood);
      grid.box(-2,-2,2,3,3,1,roof);
      grid.box(-2,-2,3,2,3,1,style.trim);
      grid.box(-1,1,1,3,2,1,stone);
      grid.box(0,1,2,1,1,2,'#cc884f');
      grid.box(0,1,4,1,1,1,'#f2ca87');
    }else{
      const h=rank+3;
      grid.box(-radius+1,-radius+1,1,radius*2-2,radius*2-2,h,tint(style.wall,site?.material.wall,.35));
      grid.box(-2,radius-2,1,4,1,3,'#544748');
      grid.box(-2,radius-1,0,4,2,1,site?.material.course??PLANK);
      for(const x of [-radius+1,radius-2]){
        grid.box(x,radius-1,1,1,1,h,wood);
        grid.box(x,radius-1,h,1,1,1,style.trim);
      }
      steppedRoof(grid,-radius,-radius,h+1,radius*2,radius*2,culture,roof,style.trim,site?.snow);
      if(rank>=3){
        grid.box(radius-4,-radius+1,h,3,3,6,stone);
        grid.box(radius-5,-radius,h+6,5,5,1,roof);
        grid.box(radius-4,-radius+1,h+7,3,3,1,roof);
        grid.box(radius-3,-radius+2,h+8,1,1,3,wood);
      }
    }
    grid.box(radius-1,radius-1,1,1,1,rank+5,BEAM);
    grid.box(radius-1,radius-1,rank+5,3,1,2,style.trim);
  });
}

export function blockLandmark(kind:AncientKind,visited=false,site?:StructureSite):BlockModel{
  const stone=site?.material.stone??STONE,cap=site?.material.course??'#a6aa9f';
  const wood=site?.material.wood??WOOD,earth=site?.material.earth??'#72766a';
  return model(['site',kind,visited,site?.kind,site?.snow].join(':'),grid=>{
    if(kind==='hidden-spring'||kind==='glacial-lake'){
      grid.box(-4,-2,0,8,4,1,earth);
      grid.box(-3,-3,0,6,6,1,stone);
      grid.box(-3,-2,0,6,4,1,'#639c9f');
      grid.box(-2,-1,0,4,2,1,'#8fbab7');
      grid.box(-3,-2,1,2,2,2,cap);
      grid.box(2,0,1,2,2,1,kind==='glacial-lake'?'#b6c7c6':stone);
      return;
    }
    if(kind==='broken-bridge'){
      for(const y of [-4,1]){
        grid.box(-3,y,0,6,3,2,stone);
        grid.box(-3,y,1,6,1,1,cap);
        grid.box(-2,y,2,4,2,1,PLANK);
        grid.box(-2,y,3,1,1,3,BEAM);
        grid.box(1,y,3,1,1,2,BEAM);
      }
      grid.box(-3,-1,0,6,2,1,'#518987');
      grid.box(-1,0,1,4,1,1,wood);
      grid.box(-3,3,0,3,2,1,earth);
      return;
    }
    if(kind==='waterfall-cave'){
      grid.box(-4,-4,0,8,8,1,'#587d82');
      grid.box(-4,-3,1,8,5,5,stone);
      grid.box(-3,-2,6,6,3,2,cap);
      grid.box(-2,1,1,4,1,4,'#273944');
      grid.box(2,1,1,2,1,5,'#7fb0b5');
      grid.box(1,2,1,3,1,1,'#a0c6bf');
      grid.box(-4,2,0,2,2,1,cap);
      return;
    }
    if(kind==='canyon'||kind==='caldera'||kind==='barrier-islands'){
      const ridge=kind==='caldera'?'#786469':kind==='barrier-islands'?'#b39d75':stone;
      grid.box(-3,-3,0,6,6,1,earth);
      grid.box(-3,-2,1,2,3,3,ridge);
      grid.box(1,-1,1,2,3,2,ridge);
      grid.box(-4,-1,0,1,3,1,ridge);
      grid.box(-1,-1,1,2,2,1,kind==='caldera'?'#d49267':'#abbbaf');
      return;
    }
    if(kind==='standing-stones'){
      for(const [x,y,height] of [[-3,-3,5],[1,-3,7],[-4,1,6],[2,1,8],[0,3,4]]){
        grid.box(x,y,0,2,2,height,stone);
        grid.box(x,y,height,1,2,1,cap);
        grid.box(x+1,y+1,0,2,1,1,earth);
      }
      grid.box(-1,-1,0,2,2,2,visited?'#c8b672':cap);
      return;
    }
    if(kind==='watchtower'){
      grid.box(-4,-4,0,8,8,2,stone);
      grid.box(-3,-3,2,6,6,10,tint(stone,cap,.32));
      grid.box(-1,2,2,2,1,4,'#465051');
      grid.box(-2,3,0,4,2,1,cap);
      grid.box(-4,-4,11,8,8,2,cap);
      for(const [x,y] of [[-4,-4],[2,-4],[-4,2],[2,2]])grid.box(x,y,13,2,2,2,stone);
      for(const z of [5,8])grid.box(2,0,z,1,1,2,'#4b5357');
      grid.box(1,-2,13,2,2,2,'#706450');
      if(visited)grid.box(1,-2,15,2,2,1,'#d3a969');
      return;
    }
    const accent=visited?'#bcc5a5':cap;
    if(kind==='ruin'){
      grid.box(-5,-3,0,8,2,1,earth);
      grid.box(-4,-3,0,2,6,1,stone);
      grid.box(-4,-3,1,2,4,4,stone);
      grid.box(-2,-3,1,5,1,2,cap);
      grid.box(-4,1,1,2,2,2,cap);
      grid.box(2,0,0,2,3,2,stone);
      grid.box(0,2,0,2,2,1,cap);
      grid.box(-1,0,0,1,2,1,'#68826a');
      return;
    }
    if(kind==='crypt'||kind==='vault'){
      const vault=kind==='vault',width=vault?10:8;
      grid.box(-width/2,-4,0,width,8,1,stone);
      grid.box(-width/2,-4,1,width,7,vault?5:3,stone);
      grid.box(-3,-3,vault?6:4,6,6,2,cap);
      grid.box(-2,-2,vault?8:6,4,3,1,stone);
      grid.box(-2,2,1,4,1,3,vault?'#5e626d':'#444b52');
      grid.box(-2,3,0,4,2,1,accent);
      if(vault)for(const x of [-4,3])grid.box(x,2,1,1,2,6,cap);
      return;
    }
    const temple=kind==='temple',archive=kind==='archive',width=archive?12:10;
    grid.box(-width/2,-4,0,width,8,1,stone);
    grid.box(-2,4,0,4,2,1,accent);
    grid.box(-width/2+1,-4,1,width-2,4,5,tint(stone,cap,.25));
    for(const x of temple?[-4,-2,1,3]:[-width/2,width/2-2]){
      grid.box(x,1,1,temple?1:2,2,5,stone);
      grid.box(x,1,5,temple?1:2,2,1,cap);
    }
    grid.box(-width/2,-4,6,width,8,1,accent);
    steppedRoof(grid,-width/2,-4,7,width,8,temple?'human':'dwarf',stone,
      temple?'#bfaa79':accent,site?.snow);
    if(!temple){
      for(const x of [-3,2])grid.box(x,-1,3,1,1,2,'#526671');
      if(archive)grid.box(3,-3,7,2,2,4,cap);
    }
    if(visited)grid.box(-1,2,1,2,1,2,'#b9a875');
  });
}

export function blockTidalMouth(stone:CaveStone,face:Facing,seed:number,low:boolean):BlockModel{
  const variant=seed%12,ledge=face==='west'?-1:face==='east'?1:0;
  const [base,strata,edge,moss]=stone==='basalt'?['#4f5360','#3b404f','#72717a','#647567']:
    stone==='reef'?['#8c8e75','#727b6b','#b8b697','#72866a']:
      ['#91877a','#726b68','#b5a396','#778467'];
  return model(['tidal-mouth',stone,face,variant,+low].join(':'),g=>{
    // Face the fixed overhead camera, using the seaward side for the talus.
    g.box(-4,-3,0,8,6,1,strata);
    g.box(-5,-3,1,10,1,8,'#1b2832');
    for(let x=-7;x<=6;x++){
      const arch=Math.max(0,Math.floor(9.4-((x+.5)/5.6)**2*5));
      const top=arch+2+(variant+x+37)%3;
      const rim=Math.abs(x+.5)>4.4;
      const front=1+(rim?(variant+x+33)%3:0);
      for(let y=-4;y<=front;y++){
        const peak=top-Math.floor(Math.abs(y+1)*.8);
        for(let z=rim?0:arch;z<=peak;z++){
          if((x+y+variant+21)%7===0&&z===peak&&Math.abs(x)>3)continue;
          const tone=z===peak&&(x+y+variant+25)%5>1?edge:(z+y+9)%4===0?strata:base;
          g.box(x,y,z,1,1,1,tone);
        }
      }
    }
    for(const [x,y,z] of [[-6,2,3],[5,1,5],[2,-1,10],[-4,-3,7]]){
      if((x+y+variant+20)%3!==0)g.box(x,y,z,2,2,1,moss);
    }
    const sill=low?(stone==='basalt'?'#8a806b':'#c0aa83'):'#4f9398';
    g.box(-4,2,0,8,3,1,sill);
    g.box(-3+ledge,5,0,6,1,1,low?'#9a8f76':'#377b89');
    g.box(-7+ledge,2,0,2,3,1,strata);
    g.box(5+ledge,2,0,2,2,2,base);
    if(!low){
      g.box(-4,3,1,8,1,1,'#88b4ae');
      g.box(-2,5,1,4,1,1,'#599ca3');
    }
  });
}

export function blockCrater(variant:number,hot:boolean):BlockModel{
  return model('volcanic-shaft:'+variant+':'+Number(hot),g=>{
    for(let y=-5;y<=5;y++)for(let x=-7;x<=7;x++){
      const r=Math.hypot(x/7,y/5),grain=(Math.imul(x+13,131)^Math.imul(y+17,99)^variant)>>>0;
      if(r>1+(grain%4)*.03)continue;
      const rim=r>=.53,depth=rim?2+(grain%4)+Number(y<0):1;
      const cap=rim?['#665257','#78605d','#594951','#806661'][grain&3]:
        hot?['#a24038','#d1593a','#fc8d4b','#b0443b'][grain&3]:
          ['#252832','#22242d','#292735','#2d2931'][grain&3];
      if(depth>1)g.box(x,y,0,1,1,depth-1,'#433641');
      g.box(x,y,depth-1,1,1,1,cap);
    }
    g.box(-3,4,0,6,2,1,'#564651');
    g.box(-2,6,0,4,1,1,'#6c5559');
  });
}

export function blockRealmHouse(ash:boolean,variant:number):BlockModel{
  return model('realm-house:'+Number(ash)+':'+variant,g=>{
    const dark=ash?'#514348':'#343247',wall=ash?'#84695e':'#635c76',roof=ash?'#ad765b':'#7b6c8a';
    const course=ash?'#755851':'#55516a',hot=ash?'#ffbb6a':'#e1d4a0',tall=variant%3===0?2:0;
    g.box(-5,-4,0,10,9,1,dark);
    g.box(-5,-4,1,10,9,1,course);
    g.box(-4,-3,2,8,7,5+tall,wall);
    g.box(-4,-3,5,8,7,1,course);
    g.box(-5,-4,7+tall,10,9,1,roof);
    if(ash){
      g.box(-4,-4,8+tall,8,8,1,course);
      g.box(-3,-4,9+tall,6,7,2,roof);
      g.box(-2,-3,11+tall,4,5,1,wall);
    }else{
      g.box(-4,-4,8+tall,8,8,1,dark);
      for(const x of [-4,2])for(const y of [-4,2])g.box(x,y,9+tall,2,2,2,roof);
      g.box(-2,-2,9+tall,4,4,1,course);
    }
    g.box(-2,4,2,4,1,4,dark);
    g.box(-2,4,6,4,1,1,course);
    for(const x of [-4,3])g.box(x,4,4,1,1,2,hot);
    g.box(4,0,4,1,2,2,hot);
    if(variant%2===0){
      g.box(2,-2,9+tall,2,2,4,course);
      g.box(2,-2,13+tall,2,2,1,dark);
    }
    g.box(-2,5,0,4,1,1,course);
  });
}

export function blockRealmFord(eastWest:boolean):BlockModel{
  return model('realm-ford:'+Number(eastWest),g=>{
    for(const y of [-5,-1,3]){
      g.box(-3,y,0,6,3,1,'#6e5a59');
      g.box(-2,y,1,4,3,1,'#ae9175');
      g.box(-2,y,2,4,1,1,'#cdb18c');
    }
  },Number(eastWest));
}

const fungusPalettes=[
  ['#3a6260','#63c0ab','#388b97','#65cbc4','#c6ffe1'],
  ['#5f4f72','#bca4e4','#7e539d','#b87ecc','#f3bcf4'],
  ['#566c50','#aacf83','#559764','#9ac97d','#e4f5a7'],
] as const;
const gemPalettes=[
  ['#493c6e','#7252a0','#ae83d5','#eacffa'],
  ['#325c7a','#4689a9','#79c9d9','#c5f2ef'],
  ['#7b453c','#b66d45','#ecad65','#fff0a4'],
] as const;

function caveMushroom(g:BlockGrid,x:number,y:number,height:number,radius:number,variant:number){
  const [stalk,gills,cap,capLit,spots]=fungusPalettes[variant];
  const canopy=height+Math.floor(radius*.66);
  g.box(x-1,y-1,0,3,3,4,stalk);
  g.box(x,y,3,2,2,canopy-3,gills);
  g.box(x-3,y,0,7,1,1,stalk);
  g.box(x,y-2,0,1,5,1,stalk);
  for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){
    const r=Math.hypot(dx/radius,dy/(radius*.86));
    const grain=(Math.imul(dx+20,67)^Math.imul(dy+20,97)^variant)&15;
    if(r>1+(grain%3)*.018)continue;
    const rim=r>.72,lift=Math.floor((1-r)*radius*.66);
    g.box(x+dx,y+dy,height+lift-1,1,1,1,rim||grain%3===0?gills:stalk);
    g.box(x+dx,y+dy,height+lift,1,1,rim?1:2,grain<2?spots:grain<5?capLit:cap);
  }
}

function caveCrystal(g:BlockGrid,x:number,y:number,width:number,height:number,variant:number){
  const [stone,body,facet,tip]=gemPalettes[variant];
  for(let z=0;z<height;z++){
    const shift=Math.floor(z*2/height),edge=z>height-5?Math.min(width-2,Math.floor((z-height+5)/2)):0;
    const w=width-edge;
    g.box(x+shift,y+edge,z,w,w,1,z<2?stone:z>=height-3?tip:body);
    g.box(x+shift+w-1,y+edge,z,1,Math.max(1,w-1),1,z>=height-4?tip:facet);
  }
}

export function blockRealmFormation(kind:RealmFormationKind,variant:number,landmark=false):BlockModel{
  return model('realm-formation:'+kind+':'+variant+':'+Number(landmark),g=>{
    if(kind==='fungus'){
      caveMushroom(g,-1,-1,(landmark?23:19)+variant*2,landmark?8:6,variant);
      caveMushroom(g,4,3,8+variant,3,(variant+1)%3);
      caveMushroom(g,-5,2,6+variant*2,2,variant);
    }else if(kind==='crystal'){
      g.box(-5,-4,0,11,8,2,'#464059');
      caveCrystal(g,-2,-2,landmark?6:5,(landmark?26:22)+variant*2,variant);
      caveCrystal(g,-6,1,3,10+variant,variant);
      caveCrystal(g,3,2,4,14-variant,variant);
      caveCrystal(g,0,4,3,7+variant,variant);
    }else if(kind==='spire'){
      const [shadow,rock,edge]=variant===2?['#302737','#58424a','#825b58']:
        ['#26263a','#453c55','#75637a'];
      for(const [x,y,r,h] of [[-3,-2,3,18+variant*4],[2,0,2,13],[0,3,2,8]]){
        g.box(x-r,y-r,0,2*r+1,2*r+1,2,shadow);
        g.box(x-r+1,y-r+1,2,2*r,2*r,h-6,rock);
        g.box(x-r+1,y-r+1,h-4,2*r-1,2*r-1,3,edge);
        g.box(x-r+1,y-r+2,h-1,2*r-2,2*r-2,2,rock);
        g.box(x-r+1,y+r,2,1,1,h-5,shadow);
      }
      g.box(-6,2,0,3,2,2,edge);g.box(3,-3,0,4,2,3,rock);
    }else if(kind==='vent'){
      g.box(-6,-5,0,12,10,2,'#696262');
      g.box(-5,-4,2,10,8,1,'#aaa47e');
      g.box(-4,-3,3,8,6,1,'#d6bf88');
      g.box(-3,-2,4,6,4,1,'#78a8a0');
      g.box(-2,-1,5,4,2,1,'#9de2ca');
      g.box(-5,2,3,2,2,2,'#e5ce98');g.box(4,-3,2,2,3,3,'#bfac7b');
      if(landmark){
        g.box(-4,4,0,9,4,2,'#908373');
        g.box(-3,5,2,7,3,1,'#dbc597');
        g.box(-2,6,3,5,2,1,'#97c8ad');
        g.box(-1,3,4,2,2,1,'#83b9ae');
      }
    }else{
      g.box(-5,-4,0,10,8,2,'#8b8076');
      g.box(-3,-3,2,7,6,1,'#c2b397');
      g.box(-2,-2,3,4,4,2,'#e0cea6');
      g.box(-1,-1,5,2,2,1,'#f1dca8');
      g.box(3,3,0,3,2,2,'#a89c92');
    }
  },variant);
}

const realmStonework=[
  ['#492f37','#9d624e','#d68b5d','#75464b','#ffc779'],
  ['#29424e','#397b75','#63b19b','#315859','#cbf6b5'],
  ['#303749','#567b8d','#6b9fa0','#415c70','#a5eedb'],
  ['#483953','#827aa0','#b29bc9','#615780','#f3d4ee'],
] as const;

export function blockRealmDwelling(town:number,variant:number,hall:boolean):BlockModel{
  return model('realm-dwelling:'+town+':'+variant+':'+Number(hall),g=>{
    const [foot,wall,roof,trim,light]=realmStonework[town];
    const radius=hall?6:4;
    const z=7+variant%2+(hall?3:0);
    g.box(-radius-1,-radius,0,2*radius+2,2*radius+2,1,foot);
    g.box(-radius-1,-radius,1,2*radius+2,2*radius+1,1,trim);
    g.box(-radius,-radius+1,2,2*radius,2*radius,z-2,wall);
    g.box(-radius,-radius+1,z-2,2*radius,2*radius,1,trim);
    g.box(-radius-1,-radius,z,2*radius+2,2*radius+1,1,roof);
    for(const x of [-radius+1,radius-2]){
      g.box(x,radius+1,3,1,1,3,trim);
      g.box(x,radius+1,4,1,1,2,light);
      g.box(radius,x+1,4,1,2,2,light);
    }
    g.box(-1,radius+1,2,2,1,4,foot);
    g.box(-2,radius+1,6,4,1,1,roof);
    g.box(-2,radius+2,0,4,2,1,trim);
    if(town===0){
      g.box(-radius,-radius,z+1,2*radius,2*radius-1,2,trim);
      g.box(-radius+1,-radius+1,z+3,2*radius-2,2*radius-3,1,roof);
      g.box(radius-3,-radius+1,z+2,3,3,hall?10:5,wall);
      g.box(radius-3,-radius+1,z+(hall?12:7),3,3,1,foot);
      g.box(-radius+1,-radius,z+1,2,2,3,light);
    }else if(town===1){
      g.lift=z-3;
      caveMushroom(g,-1,-1,hall?12:9,hall?7:5,variant%2===0?0:2);
    }else if(town===2){
      g.box(-radius,-radius+1,z+1,2*radius,2*radius-1,2,trim);
      const tower=hall?8:4;
      g.box(-2,-2,z+2,4,4,tower,foot);
      g.box(-2,-2,z+tower+2,4,4,2,light);
      g.box(-3,-3,z+tower+4,6,6,1,roof);
      g.box(-2,-2,z+tower+5,4,4,1,trim);
    }else{
      g.box(-radius,-radius+1,z+1,2*radius,2*radius-1,2,trim);
      g.lift=z+3;
      caveCrystal(g,-2,-2,5,hall?12:7,variant%2);
      caveCrystal(g,-radius+1,1,3,hall?8:4,0);
    }
  },variant);
}

export function blockRealmDock(bank:Facing):BlockModel{
  const turn={south:0,west:1,north:2,east:3}[bank];
  return model('realm-dock:'+bank,g=>{
    for(const x of [-3,2])for(const y of [-5,2,8])g.box(x,y,0,1,1,7,'#3b444f');
    for(let y=-6;y<10;y++){
      const ramp=y>=8?2:y>=6?1:0;
      g.box(-3,y,3,6,1,1+ramp,y%3===0?'#a18265':'#766658');
    }
    for(let y=-5;y<=8;y+=3)g.box(-3,y,4,1,1,2,'#5c5956');
    g.box(-3,4,6,1,1,1,'#92e5c9');g.box(2,-5,6,1,1,1,'#f5b87e');
  },turn,'timber');
}

export function blockRealmGate(kind:RealmLink['kind']):BlockModel{
  return model('realm-gate:'+kind,g=>{
    const stone=kind==='roots'?'#506357':'#5e5263',trim=kind==='falls'?'#4693a0':'#998373';
    g.box(-6,-5,0,12,10,1,stone);
    g.box(-3,-3,1,6,7,1,'#292736');
    for(const x of [-5,3]){
      g.box(x,-4,1,2,5,6,stone);
      g.box(x,-4,5,2,5,1,trim);
      g.box(x,1,1,2,3,3,stone);
      g.box(x,1,4,2,3,1,kind==='crater'?'#e8a762':'#8ac4ae');
    }
    g.box(-5,-4,7,10,2,2,stone);
    g.box(-3,-4,9,6,2,1,trim);
    if(kind==='falls'){
      g.box(-2,-2,1,4,1,11,'#69b2b5');
      for(let z=3;z<11;z+=3)g.box(-1,-1,z,2,1,1,'#b9ded2');
    }else if(kind==='roots'){
      g.box(-4,-4,8,3,3,8,'#616852');
      g.box(-3,-4,12,2,2,8,'#7e8161');
      g.box(2,-4,7,3,2,4,'#798166');
    }
  });
}
