import {ARCHITECTURE,buildingTier,type Building,type SettlementStage} from './construction';
import type {Species} from './engine';
import type {AncientKind} from './knowledge';
import type {Point} from './motion';
import type {TerrainMotif} from './terrainDetails';
import type {TreeKind} from './biomeTrees';

export const BLOCK_FACES=[
  {dx:0,dy:0,dz:1,quad:[[0,0,1],[1,0,1],[1,1,1],[0,1,1]],light:1.18},
  {dx:1,dy:0,dz:0,quad:[[1,0,0],[1,1,0],[1,1,1],[1,0,1]],light:.76},
  {dx:-1,dy:0,dz:0,quad:[[0,0,0],[0,1,0],[0,1,1],[0,0,1]],light:.94},
  {dx:0,dy:1,dz:0,quad:[[0,1,0],[1,1,0],[1,1,1],[0,1,1]],light:.89},
  {dx:0,dy:-1,dz:0,quad:[[0,0,0],[1,0,0],[1,0,1],[0,0,1]],light:.71},
] as const;
type Face={x:number;y:number;z:number;direction:number;color:string};
export type BlockModel={key:string;faces:readonly Face[]};

const stride=32,layer=stride*stride;
const cell=(x:number,y:number,z:number)=>x+16+(y+16)*stride+z*layer;
const models=new Map<string,BlockModel>();

/** Build the exposed faces of a lattice of unit cubes. Covered faces are
 * discarded, so a solid house costs about as much to project as a hollow one. */
function model(key:string,make:(grid:BlockGrid)=>void,quarter=0):BlockModel{
  const cached=models.get(key);
  if(cached)return cached;
  const grid=new BlockGrid(quarter);
  make(grid);
  const faces:Face[]=[];
  for(const [index,color] of grid.cells){
    const x=index%stride-16,y=Math.floor(index/stride)%stride-16,z=Math.floor(index/layer);
    BLOCK_FACES.forEach(({dx,dy,dz},direction)=>{
      if(!grid.cells.has(cell(x+dx,y+dy,z+dz)))faces.push({x,y,z,direction,color});
    });
  }
  const compiled={key,faces};
  if(models.size>=260)models.clear();
  models.set(key,compiled);
  return compiled;
}

class BlockGrid {
  readonly cells=new Map<number,string>();
  constructor(private readonly quarter:number){}
  box(x:number,y:number,z:number,width:number,depth:number,height:number,color:string){
    for(let k=z;k<z+height;k++)for(let j=y;j<y+depth;j++)for(let i=x;i<x+width;i++){
      const u=this.quarter===1?-j-1:this.quarter===2?-i-1:this.quarter===3?j:i;
      const v=this.quarter===1?i:this.quarter===2?-j-1:this.quarter===3?-i-1:j;
      this.cells.set(cell(u,v,k),color);
    }
  }
}

export type BlockProp=TreeKind|'boulder'|'snowstone'|'basalt'|'crystal'|
  'flowers'|'grass'|'reeds'|'fern'|'scrub'|'embers'|'lantern';

export function terrainBlockProp(motif:TerrainMotif):BlockProp|undefined{
  if(motif==='ripples'||motif==='shorefoam'||motif==='none')return;
  if(motif==='pebbles'||motif==='scree')return 'boulder';
  if(motif==='stalagmite')return 'crystal';
  return motif;
}

function regionalTree(grid:BlockGrid,kind:TreeKind,variant:number):void{
  const tall=variant%2,lean=variant%3-1;
  if(kind==='birch'){
    grid.box(-1,-1,0,2,2,11+tall,'#d0c8a7');
    grid.box(-1,0,2,1,1,1,'#706d65');
    grid.box(0,-1,4,1,1,1,'#706d65');
    grid.box(-2,-2,6,4,4,4,'#73a872');
    grid.box(-1+lean,-2,9,4,4,3,'#8cb47b');
    grid.box(-1+lean,-1,12,2,2,2+tall,'#aac88a');
  }else if(kind==='spruce'||kind==='larch'){
    const spruce=kind==='spruce',tiers=spruce?4:3;
    const foliage=spruce?['#315954','#3f746e','#5f9181']:
      ['#77643b','#a88848','#c9a861'];
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

export function blockProp(kind:BlockProp,seed:number):BlockModel{
  const variant=(seed>>>0)%4;
  return model(kind+':'+variant,grid=>{
    if(kind==='oak'||kind==='pine'){
      const tall=variant%2,lean=variant%3-1;
      const needles=['#366a54','#3e7d61','#588e6b','#78a17b'];
      const leaves=['#376f50','#4e8d5f','#65a471',
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
      regionalTree(grid,kind,variant);
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

function steppedRoof(grid:BlockGrid,left:number,back:number,z:number,width:number,depth:number,
  culture:Species,roof:string,accent:string){
  const flat=culture==='dwarf';
  const steps=flat?3:Math.ceil(width/2);
  for(let step=0;step<steps;step++){
    grid.box(left+step,back+(flat?step:0),z+step,width-2*step,depth-(flat?2*step:0),
      1,step===steps-1?accent:roof);
  }
}

type ArchitectureOptions={door?:Point;coastal?:boolean};
export function blockBuilding(b:Building,variant:number,options:ArchitectureOptions={}):BlockModel{
  const {type,culture,stage}=b,tier=buildingTier(b),style=ARCHITECTURE[culture];
  variant=(variant>>>0)%3;
  const door=options.door;
  const quarter=door?.y&&door.y<0?2:door?.x?door.x<0?1:3:0;
  const roof=options.coastal&&culture==='human'?'#518588':style.roof;
  const roofRidge=culture==='dwarf'?'#8e9bb1':culture==='elf'?'#70a882':roof;
  return model([type,culture,stage,tier,variant,quarter,roof].join(':'),grid=>{
    const width=type==='communal'?12:type==='shelter'?6:
      type==='storage'||type==='granary'||tier>=2||type==='house'&&variant===2?10:8;
    const depth=type==='communal'||type==='house'&&variant===1?10:type==='shelter'?6:8;
    const x=-width/2,y=-depth/2;
    const wall=tier>=2&&culture==='human'?'#a6a096':style.wall;
    const h=type==='communal'?9:type==='shelter'||type==='storage'?4+tier:5+tier;
    const foundation=type==='farm'?'#795c45':type==='dock'?WOOD:STONE;
    if(type!=='granary'||stage!=='complete')grid.box(x,y,0,width,depth,1,foundation);
    if(stage==='foundation'||stage==='abandoned'||stage==='ruin'){
      grid.box(x,y,1,width,1,1,wall);
      grid.box(x,y+1,1,1,depth-1,1,wall);
      if(stage!=='foundation'){
        grid.box(x,y,2,stage==='abandoned'?width:3,1,2,wall);
        grid.box(x,y+depth-3,1,2,3,2,STONE);
        grid.box(x+width-3,y+1,1,2,2,1,wall);
        if(stage==='abandoned')grid.box(x+width-1,y,1,1,depth-2,3,wall);
      }else grid.box(x+width-1,y+depth-1,1,1,1,1,wall);
      return;
    }
    if(stage==='frame'){
      for(const u of [x,x+width-1])for(const v of [y,y+depth-1])
        grid.box(u,v,1,1,1,h,WOOD);
      for(const u of [x,x+width-1])grid.box(u,y,h,1,depth,1,PLANK);
      for(const v of [y,y+depth-1])grid.box(x,v,h,width,1,1,PLANK);
      return;
    }
    if(type==='farm'){
      for(let row=y+1;row<y+depth;row+=2){
        grid.box(x+1,row,1,width-2,1,1,'#ac814f');
        for(let col=x+1;col<x+width-1;col+=2)
          grid.box(col,row,2,1,1,1,row%3===0?'#c0b063':'#80a063');
      }
      grid.box(x,y,1,width,1,1,WOOD);
      for(const u of [x,x+width-1])grid.box(u,y,1,1,1,2,BEAM);
      return;
    }
    if(type==='well'){
      grid.box(-3,-3,1,6,6,1,'#629597');
      for(const u of [-3,2])grid.box(u,-3,2,1,6,2,wall);
      for(const v of [-3,2])grid.box(-2,v,2,4,1,2,wall);
      for(const u of [-3,2])grid.box(u,0,4,1,1,3,BEAM);
      for(let step=0;step<3;step++)
        grid.box(-4,-3+step,7+step,8,6-2*step,1,step===2?roofRidge:roof);
      return;
    }
    if(type==='dock'){
      for(let row=-5;row<=5;row++)grid.box(-3,row,1,6,1,1,row%2?PLANK:WOOD);
      for(const u of [-3,2])for(const v of [-5,0,5])
        grid.box(u,v,0,1,1,3,BEAM);
      grid.box(-2,3,2,2,2,2,PLANK);
      return;
    }
    if(type==='market'){
      for(const u of [x,x+width-1])for(const v of [y,y+depth-1])
        grid.box(u,v,1,1,1,5,BEAM);
      grid.box(x+1,0,1,width-2,2,2,WOOD);
      for(let i=0;i<3;i++)grid.box(x+1+i*2,1,3,1,1,1,['#98ae68','#dfa360','#ba7363'][i]);
      for(let col=x-1;col<=x+width;col++){
        const stripe=col%2?roof:style.trim;
        grid.box(col,y,6,1,depth,1,stripe);
        grid.box(col,y+1,7,1,depth-2,1,stripe);
      }
      return;
    }
    if(type==='granary'){
      for(const u of [x,x+width-2])for(const v of [y,y+depth-2]){
        grid.box(u,v,0,2,2,1,STONE);
        grid.box(u,v,1,1,1,3,BEAM);
      }
      grid.box(x,y,4,width,depth,1,BEAM);
      grid.box(x+1,y+1,5,width-2,depth-2,4,'#b69863');
      grid.box(-1,y+depth-2,5,2,1,3,'#5d4b3e');
      grid.box(-1,y+depth-1,3,2,1,2,PLANK);
      grid.box(-1,y+depth,0,2,1,3,PLANK);
      grid.box(x+1,y+depth-2,7,2,1,1,style.trim);
      grid.box(x+width-3,y+depth-2,7,2,1,1,style.trim);
      steppedRoof(grid,x,y,9,width,depth,culture,roof,roofRidge);
      return;
    }
    grid.box(x,y,1,width,depth,h,wall);
    for(const u of [x,x+width-1])for(const v of [y,y+depth-1])
      grid.box(u,v,1,1,1,h,culture==='dwarf'?style.trim:BEAM);
    // Door and windows occupy individual blocks on the wall they belong to.
    grid.box(-1,y+depth-1,1,2,1,Math.min(3,h-1),'#4b4144');
    grid.box(0,y+depth-1,2,1,1,1,'#997757');
    grid.box(-1,y+depth,0,2,1,1,STONE);
    if(type!=='shelter'){
      const light=stage==='finishing'?'#756c63':'#dfbb79';
      for(const u of [x+1,x+width-3]){
        grid.box(u,y+depth-1,3,2,1,2,light);
        grid.box(u,y+depth,2,2,1,1,style.trim);
      }
      grid.box(x,-2,3,1,2,2,light);
      grid.box(x+width-1,0,3,1,2,2,light);
      grid.box(-1,y,3,2,1,2,light);
    }
    steppedRoof(grid,x-1,y-1,h+1,width+2,depth+2,culture,roof,roofRidge);
    if(stage==='finishing'){
      grid.box(x-1,y+depth,0,1,1,h+2,WOOD);
      grid.box(x+2,y+depth,0,1,1,h+2,WOOD);
      grid.box(x-1,y+depth,h-1,4,1,1,PLANK);
    }
    if(type==='workshop'||culture==='demon'||(variant===1&&tier>=1)){
      grid.box(x+width-3,y+1,h+1,2,2,5,culture==='demon'?'#a77172':STONE);
      grid.box(x+width-3,y+1,h+6,2,2,1,BEAM);
    }
    if(type==='storage'||type==='workshop')grid.box(x-1,y+depth-2,0,2,2,2,PLANK);
    if(type==='communal'){
      grid.box(x,y,h+1,3,3,6,wall);
      grid.box(x-1,y-1,h+7,5,5,1,roof);
      grid.box(x,y,h+8,3,3,1,roof);
      grid.box(x+1,y+1,h+9,1,1,2,style.trim);
    }
    if(tier===3&&type==='house')grid.box(1,y+depth-1,h-2,2,1,2,style.trim);
  },quarter);
}

const ranks:readonly SettlementStage[]=['encampment','hamlet','village','town','city'];
export function blockSettlement(stage:SettlementStage,culture:Species):BlockModel{
  return model('hub:'+stage+':'+culture,grid=>{
    const style=ARCHITECTURE[culture],rank=ranks.indexOf(stage),radius=rank+3;
    grid.box(-radius,-radius,0,radius*2,radius*2,1,rank>=2?STONE:'#a99371');
    if(!rank){
      grid.box(-2,-1,1,4,2,1,WOOD);
      grid.box(-1,-1,2,2,2,2,'#cc884f');
      grid.box(-1,0,4,1,1,1,'#f2ca87');
    }else{
      const h=rank+3;
      grid.box(-radius+1,-radius+1,1,radius*2-2,radius*2-2,h,style.wall);
      grid.box(-1,radius-2,1,2,1,3,'#544748');
      steppedRoof(grid,-radius,-radius,h+1,radius*2,radius*2,culture,style.roof,style.roof);
      if(rank>=3){
        grid.box(radius-4,-radius+1,h,3,3,6,style.wall);
        grid.box(radius-4,-radius+1,h+6,3,3,1,style.roof);
      }
    }
    grid.box(radius-1,radius-1,1,1,1,rank+5,BEAM);
    grid.box(radius-1,radius-1,rank+5,3,1,2,style.trim);
  });
}

export function blockLandmark(kind:AncientKind,visited=false):BlockModel{
  return model('site:'+kind+':'+visited,grid=>{
    if(kind==='standing-stones'){
      grid.box(-4,-4,0,8,8,1,'#72766a');
      for(const [x,y,height] of [[-3,-3,5],[1,-3,7],[-4,1,6],[2,1,8],[0,3,4]]){
        grid.box(x,y,1,2,2,height,'#92968b');
        grid.box(x,y,height+1,1,2,1,'#a7a58d');
      }
      grid.box(-1,-1,1,2,2,2,visited?'#c8b672':'#9e9e84');
      return;
    }
    if(kind==='watchtower'){
      grid.box(-4,-4,0,8,8,2,'#83827b');
      grid.box(-3,-3,2,6,6,10,'#979592');
      grid.box(-1,2,2,2,1,4,'#465051');
      grid.box(-4,-4,11,8,8,2,'#a6aa9f');
      for(const [x,y] of [[-4,-4],[2,-4],[-4,2],[2,2]])grid.box(x,y,13,2,2,2,'#878f87');
      grid.box(1,-2,13,2,2,2,'#706450');
      if(visited)grid.box(1,-2,15,2,2,1,'#d3a969');
      return;
    }
    const stone=kind==='library'||kind==='archive'?'#86999e':
      kind==='crypt'||kind==='vault'?'#928b9a':'#969495';
    const cap=visited?'#bcc5a5':'#c1b6a6';
    grid.box(-5,-4,0,10,8,1,STONE);
    const broken=kind==='ruin';
    for(const x of [-4,2]){
      const height=broken&&x>0?3:6;
      grid.box(x,-2,1,2,4,height,stone);
      grid.box(x,-2,height+1,2,4,1,cap);
    }
    if(!broken){
      grid.box(-4,-3,7,8,6,1,cap);
      const sealed=kind==='crypt'||kind==='vault';
      if(sealed){
        grid.box(-3,-3,8,6,6,1,stone);
        grid.box(-2,-2,9,4,4,1,cap);
        grid.box(-1,-2,10,2,2,1,stone);
      }else steppedRoof(grid,-4,-3,8,8,6,kind==='temple'?'human':'dwarf',
        stone,kind==='temple'?'#bfaa79':cap);
      grid.box(-2,-2,1,4,1,6,'#444b52');
      if(visited)grid.box(-1,-1,2,2,1,2,'#b9a875');
    }
    grid.box(-4,1,1,2,2,1,'#64806a');
    grid.box(1,2,1,2,1,1,cap);
  });
}
