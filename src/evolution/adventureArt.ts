import type {Biome,World} from './engine';
import type {Building} from './construction';
import {blockBuilding,blockLandmark,blockProp} from './blockModels';
import {DESCENT_BLOCK_VIEW,paintBlockScenery} from './blockScenery';
import {biomeTreeAt,isTreeKind,type TreeKind} from './biomeTrees';
import {terrainDetailAt} from './terrainDetails';
import {topographyForWorld} from './topography';
import {pixelTerrainHash} from './depthWorldArt';
import {adventureDistance,type AdventureLandscape,type AdventureRegion} from './adventureMap';
import type {Point} from './motion';
import type {AncientKind} from './knowledge';

export const ADVENTURE_TILE=24;
const T=ADVENTURE_TILE;

const ground:Record<Biome,readonly [string,string,string]> = {
  plains:['#779d62','#628651','#9ab674'],
  forest:['#4b825d','#386c53','#67956b'],
  mountain:['#8a9486','#737e77','#b0b2a0'],
  cave:['#707e76','#596761','#929f8d'],
  wasteland:['#a6836e','#926f65','#ba977e'],
  volcanic:['#855e62','#6b4d59','#aa7772'],
  water:['#408c97','#347b8d','#64b6b5'],
  taiga:['#63867b','#4d766f','#86a297'],
  wetland:['#6e9273','#537661','#91af81'],
  savanna:['#b19c6a','#928257','#c4b278'],
};
const paving:Record<AdventureLandscape,readonly [string,string,string]> = {
  meadow:['#917551','#c0a471','#d3b984'],
  woodland:['#5f6948','#a69861','#c6ad76'],
  coast:['#927452','#d9b98b','#ead2a4'],
  highland:['#636d6b','#8f9790','#bcc0ad'],
  ash:['#6f5159','#9a756c','#c39380'],
  taiga:['#5c6864','#9a9e8f','#c2c5ae'],
  wetlands:['#665d49','#977d58','#c3a272'],
  savanna:['#81654a','#b59160','#ddba84'],
};
const accents:Record<AdventureLandscape,string> = {
  meadow:'#d9ac5e',woodland:'#8eca96',coast:'#83d5cd',highland:'#c9bbdc',ash:'#f19b75',
  taiga:'#a8ccc1',wetlands:'#c3d096',savanna:'#e0b56e',
};
const civicColors=['#e5b978','#e4a296','#a9d4be','#bfb4db','#d7cf84'];

function rect(ctx:CanvasRenderingContext2D,color:string,x:number,y:number,w:number,h:number){
  ctx.fillStyle=color;
  ctx.fillRect(x,y,w,h);
}
function poly(ctx:CanvasRenderingContext2D,color:string,points:number[]){
  ctx.fillStyle=color;
  ctx.beginPath();
  ctx.moveTo(points[0],points[1]);
  for(let i=2;i<points.length;i+=2)ctx.lineTo(points[i],points[i+1]);
  ctx.closePath();
  ctx.fill();
}
function shadow(ctx:CanvasRenderingContext2D,x:number,y:number,width:number,height:number){
  ctx.fillStyle='#19292459';
  ctx.beginPath();
  ctx.ellipse(x,y,width,height,0,0,Math.PI*2);
  ctx.fill();
}

export function paintAdventureLandmark(ctx:CanvasRenderingContext2D,kind:AncientKind,
  x:number,y:number,visited:boolean){
  paintBlockScenery(ctx,blockLandmark(kind,visited),{x:x+12,y:y+13},DESCENT_BLOCK_VIEW,1.62);
}

type ArtMap={
  bridges:ReadonlySet<number>;
  roads:ReadonlySet<number>;
  buildings:ReadonlyMap<number,{building:Building;settlementId:number}>;
};

export function paintAdventureGround(ctx:CanvasRenderingContext2D,world:World,
  region:AdventureRegion,map:ArtMap,origin:Point,columns:number,rows:number){
  const {width,height}=world;
  rect(ctx,'#142624',0,0,ctx.canvas.width,ctx.canvas.height);
  const pathAt=(i:number)=>region.trail.has(i)||map.roads.has(i)||map.bridges.has(i);
  for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
    const x=origin.x+col,y=origin.y+row,px=col*T,py=row*T;
    if(x<0||y<0||x>=width||y>=height)continue;
    const i=y*width+x,biome=world.tiles[i].biome;
    const [base,dark,light]=ground[biome];
    const noise=pixelTerrainHash(x,y,world.settings.seed);
    rect(ctx,base,px,py,T,T);
    if(noise%3===0)rect(ctx,biome==='water'?'#4b99a3':'#fff2a00b',px,py,T,T);
    if(biome==='water'){
      rect(ctx,dark,px+2+noise%8,py+14,9,2);
      rect(ctx,light,px+4+noise%6,py+5+noise%5,8,1);
      rect(ctx,'#adccc77a',px+9+noise%7,py+17,4,1);
    }else{
      for(let k=0;k<4;k++){
        const nx=px+2+(noise>>>((k+1)*4))%18;
        const ny=py+2+(noise>>>(k*5))%18;
        rect(ctx,k%2?dark:light,nx,ny,2+k%2,1);
        if(biome==='forest'&&k%2)rect(ctx,dark,nx+1,ny-2,1,2);
      }
      // Sand and foam trace the true shore, including irregular coves.
      const edges:[[number,number,number,number],number,boolean][]=[
        [[px,py+T-3,T,3],i+width,y<height-1],[[px,py,T,3],i-width,y>0],
        [[px+T-3,py,3,T],i+1,x<width-1],[[px,py,3,T],i-1,x>0],
      ];
      for(const [shape,neighbor,exists] of edges){
        if(exists&&world.tiles[neighbor].biome==='water'){
          rect(ctx,'#d0bf88',...shape);
          if(shape[2]===3)rect(ctx,'#ede0b5',shape[0]+1,py+3,1,T-7);
          else rect(ctx,'#ede0b5',px+3,shape[1]+1,T-7,1);
        }else if(exists&&biome!==world.tiles[neighbor].biome){
          const [nx,ny,w]=shape;
          const tint=ground[world.tiles[neighbor].biome][0]+'99';
          const ripple=4+noise%7;
          if(w===3){
            rect(ctx,tint,nx,ny+3,3,ripple);
            rect(ctx,tint,nx,ny+16,2,5);
          }else{
            rect(ctx,tint,nx+3,ny,ripple,3);
            rect(ctx,tint,nx+16,ny,5,2);
          }
        }
      }
    }
    const bridge=map.bridges.has(i);
    if(pathAt(i)){
      const [edge,fill,edgeLight]=paving[region.landscape];
      const north=y>0&&pathAt(i-width),south=y<height-1&&pathAt(i+width);
      const west=x>0&&pathAt(i-1),east=x<width-1&&pathAt(i+1);
      const xx=west?0:5,yy=north?0:5,ex=east?T:19,ey=south?T:19;
      rect(ctx,edge,px+xx,py+5,ex-xx,14);
      rect(ctx,edge,px+5,py+yy,14,ey-yy);
      rect(ctx,bridge?'#a88154':fill,px+xx,py+7,ex-xx,10);
      rect(ctx,bridge?'#a88154':fill,px+7,py+yy,10,ey-yy);
      for(let k=0;k<3;k++){
        if(bridge)rect(ctx,'#ddaf74',px+6,py+7+k*4,12,1);
        else rect(ctx,edgeLight,px+8+(noise+k*3)%6,py+8+k*3,3,1);
      }
    }
    const distance=adventureDistance({x,y},region.focus);
    const design=(region.settlement?.id??0)%3;
    const plaza=distance<=1&&(design!==0||x===region.focus.x||y===region.focus.y);
    if(region.settlement&&plaza&&biome!=='water'){
      const [edge,fill,edgeLight]=paving[region.landscape];
      rect(ctx,edge,px,py,T,T);
      rect(ctx,fill,px+1,py+1,T-2,T-2);
      if(design===1){
        for(let k=0;k<3;k++){
          rect(ctx,edgeLight,px+1,py+3+k*8,T-2,1);
          rect(ctx,edge,px+7+(k%2)*9,py+4+k*8,1,5);
        }
      }else{
        rect(ctx,edgeLight,px+3,py+3,T-6,1);
        rect(ctx,edgeLight,px+3,py+4,1,T-8);
        rect(ctx,edge,px+4,py+T-4,T-7,1);
        rect(ctx,edge,px+T-4,py+4,1,T-8);
      }
      if(!distance){
        const civic=civicColors[region.settlement.id%civicColors.length];
        if(design===0){
          rect(ctx,edge,px+5,py+5,14,14);
          rect(ctx,civic,px+7,py+7,10,10);
          rect(ctx,edge,px+11,py+4,2,16);
          rect(ctx,edge,px+4,py+11,16,2);
        }else{
          poly(ctx,edge,[px+12,py+3,px+21,py+12,px+12,py+21,px+3,py+12]);
          poly(ctx,civic,[px+12,py+6,px+18,py+12,px+12,py+18,px+6,py+12]);
          rect(ctx,edgeLight,px+11,py+9,2,6);
          if(design===2)rect(ctx,edgeLight,px+9,py+11,6,2);
        }
      }
    }
    if(!region.area.has(i)&&!map.buildings.has(i)&&biome!=='water'){
      const darken=region.place.kind==='route'?'#14332438':'#14282257';
      rect(ctx,darken,px,py,T,T);
      const fence=region.place.kind==='town';
      if(fence&&(noise%4!==0)){
        const edge='#d0a374',post='#715747';
        if(x>0&&region.area.has(i-1)){
          rect(ctx,post,px+1,py,2,T);rect(ctx,edge,px,py+3,4,2);
          rect(ctx,edge,px,py+15,4,2);
        }
        if(y>0&&region.area.has(i-width)){
          rect(ctx,post,px,py+2,T,2);rect(ctx,edge,px+3,py,2,6);
          rect(ctx,edge,px+15,py,2,6);
        }
      }
    }
  }
}

export type AdventureProp=TreeKind|'rocks'|'flowers'|'reeds'|'embers'|'lantern';
export function adventureProp(world:World,map:ArtMap,region:AdventureRegion,
  x:number,y:number):AdventureProp|undefined{
  const i=y*world.width+x,biome=world.tiles[i]?.biome;
  if(!biome||biome==='water'||map.buildings.has(i)||map.bridges.has(i)||
    map.roads.has(i)||region.trail.has(i)||
    region.gates.some(g=>g.point.x===x&&g.point.y===y))return;
  if(region.settlement&&adventureDistance({x,y},region.focus)<=1){
    if(x===region.focus.x-1&&y===region.focus.y-1||
      x===region.focus.x+1&&y===region.focus.y+1)return 'lantern';
    return;
  }
  const seed=pixelTerrainHash(x,y,world.settings.seed)%100;
  const tree=()=>{
    const height=topographyForWorld(world).heights[i];
    const {variant}=terrainDetailAt(biome,x,y,world.settings.seed,height);
    return biomeTreeAt(biome,variant,height);
  };
  if(biome==='forest'){
    if(seed<35)return tree();
    if(seed<54)return 'flowers';
  }else if(biome==='taiga'){
    if(seed<43)return tree();
    if(seed<64)return 'rocks';
  }else if(biome==='wetland'){
    if(seed<18)return tree();
    if(seed<53)return 'reeds';
  }else if(biome==='savanna'){
    if(seed<22)return tree();
    if(seed<43)return 'flowers';
  }else if(biome==='mountain'||biome==='cave'){
    if(seed<28)return 'rocks';
    if(seed<38)return 'pine';
  }else if(biome==='volcanic'||biome==='wasteland'){
    if(seed<25)return 'rocks';
    if(seed<43)return 'embers';
  }else{
    if(seed<14)return region.landscape==='coast'?'reeds':tree();
    if(seed<39)return 'flowers';
  }
}
export function paintAdventureProp(ctx:CanvasRenderingContext2D,prop:AdventureProp,
  x:number,y:number,variant:number){
  const kind=prop==='rocks'?'boulder':prop;
  const large=isTreeKind(kind)||kind==='boulder';
  const anchor={x:x+(kind==='lantern'?5:12),y:y+16};
  paintBlockScenery(ctx,blockProp(kind,variant),anchor,DESCENT_BLOCK_VIEW,large?1.75:1.22);
}

export function paintAdventureBuilding(ctx:CanvasRenderingContext2D,b:Building,
  x:number,y:number,landscape:AdventureLandscape,variant:number,doorSide?:Point){
  const model=blockBuilding(b,variant,{door:doorSide,coastal:landscape==='coast'});
  const size=b.type==='communal'?1.6:b.type==='shelter'?1.97:1.82;
  paintBlockScenery(ctx,model,{x:x+12,y:y+13},DESCENT_BLOCK_VIEW,size);
}

export function paintDoorstep(ctx:CanvasRenderingContext2D,x:number,y:number,side:Point){
  // side points out from the building. Anchor the raised step on the edge
  // of the walkable tile that touches the actual entrance.
  const horizontal=side.y!==0;
  const px=x+(horizontal?7:side.x>0?1:19),py=y+(horizontal?side.y>0?2:5:10);
  const w=horizontal?10:4,h=horizontal?4:8;
  rect(ctx,'#433f38',px-1,py-1,w+2,h+2);
  rect(ctx,'#ad936c',px,py,w,h);
  rect(ctx,'#f0d6a1',px,py,w,1);
}

export function paintAdventureSign(ctx:CanvasRenderingContext2D,x:number,y:number,
  direction:Point,landscape:AdventureLandscape,ferry=false){
  if(ferry){
    const px=x+5+direction.x*20,py=y+18+direction.y*21;
    shadow(ctx,px,py+4,10,3);
    poly(ctx,'#63493d',[px-10,py,px+10,py,px+6,py+5,px-6,py+5]);
    rect(ctx,'#cf9865',px-7,py,14,2);
    rect(ctx,'#725643',px-1,py-9,1,11);
    poly(ctx,'#f0dcb1',[px,py-9,px+7,py-2,px,py-2]);
  }
  shadow(ctx,x+12,y+18,9,3);
  rect(ctx,'#473e38',x+10,y+4,4,15);
  rect(ctx,'#a68056',x+10,y+7,2,11);
  const flag=ferry?accents.coast:accents[landscape];
  rect(ctx,'#483c3d',x+4,y-1,16,10);
  rect(ctx,flag,x+5,y,14,8);
  const cx=x+12,cy=y+4;
  const dx=direction.x,dy=direction.y;
  poly(ctx,'#443432',[cx+dx*4,cy+dy*4,cx-dx*2+dy*3,cy-dy*2-dx*3,
    cx-dx*2-dy*3,cy-dy*2+dx*3]);
}

export function paintErrandMarker(ctx:CanvasRenderingContext2D,x:number,y:number,
  kind:'board'|'gather'){
  if(kind==='board'){
    shadow(ctx,x+13,y+20,10,3);
    rect(ctx,'#493b37',x+5,y+4,3,15);
    rect(ctx,'#493b37',x+17,y+4,3,15);
    rect(ctx,'#754b34',x+3,y,19,13);
    rect(ctx,'#b47b50',x+3,y,19,3);
    rect(ctx,'#f2daa0',x+6,y+4,7,6);
    rect(ctx,'#ecd39f',x+14,y+3,5,6);
    rect(ctx,'#9e6740',x+7,y+6,4,1);
    rect(ctx,'#9e6740',x+15,y+5,3,1);
    rect(ctx,'#ce725e',x+16,y+3,1,2);
  }else{
    shadow(ctx,x+12,y+19,9,3);
    rect(ctx,'#5a483a',x+5,y+13,14,7);
    rect(ctx,'#c08e56',x+6,y+13,12,5);
    rect(ctx,'#94ba69',x+6,y+10,5,4);
    rect(ctx,'#d49660',x+12,y+9,6,5);
    rect(ctx,'#a9634e',x+12,y+11,3,3);
    rect(ctx,'#f1c27d',x+8,y+15,8,2);
    rect(ctx,'#f7e1a0',x+11,y+3,2,4);
    rect(ctx,'#f7e1a0',x+10,y+4,4,2);
  }
}
