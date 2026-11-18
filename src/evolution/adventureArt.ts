import type {Biome,World} from './engine';
import {ARCHITECTURE,buildingTier,type Building} from './construction';
import {pixelTerrainHash} from './depthWorldArt';
import {adventureDistance,type AdventureLandscape,type AdventureRegion} from './adventureMap';
import type {Point} from './motion';

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
};
const paving:Record<AdventureLandscape,readonly [string,string,string]> = {
  meadow:['#917551','#c0a471','#d3b984'],
  woodland:['#5f6948','#a69861','#c6ad76'],
  coast:['#927452','#d9b98b','#ead2a4'],
  highland:['#636d6b','#8f9790','#bcc0ad'],
  ash:['#6f5159','#9a756c','#c39380'],
};
const accents:Record<AdventureLandscape,string> = {
  meadow:'#d9ac5e',woodland:'#8eca96',coast:'#83d5cd',highland:'#c9bbdc',ash:'#f19b75',
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

function tree(ctx:CanvasRenderingContext2D,px:number,py:number,pine:boolean,variant:number){
  shadow(ctx,px+13,py+20,10,4);
  rect(ctx,'#4d4339',px+11,py+8,4,13);
  rect(ctx,'#9c7652',px+11,py+11,2,9);
  if(pine){
    poly(ctx,'#264e46',[px+12,py-15,px+20,py-2,px+18,py-2,px+25,py+9,
      px+21,py+9,px+27,py+16,px+3,py+16,px+8,py+8,px+4,py+8,px+9,py]);
    poly(ctx,variant%2?'#438368':'#3a7457',[px+12,py-12,px+18,py-1,px+15,py-1,
      px+22,py+8,px+16,py+8,px+22,py+13,px+5,py+13,px+10,py+5,px+7,py+5]);
    rect(ctx,'#7eaa6b',px+10,py-1,5,2);
    rect(ctx,'#6a9f73',px+8,py+6,6,2);
    rect(ctx,'#93b37c',px+13,py+9,4,1);
    return;
  }
  const canopy=variant%3===0?'#54875b':variant%3===1?'#669c66':'#698b52';
  poly(ctx,'#294d42',[px+6,py-7,px+15,py-10,px+23,py-6,px+26,py+1,
    px+25,py+11,px+20,py+16,px+9,py+16,px+1,py+11,px,py+4]);
  poly(ctx,canopy,[px+5,py-3,px+12,py-8,px+20,py-6,px+23,py-1,px+23,py+8,
    px+18,py+12,px+7,py+12,px+2,py+7,px+2,py+1]);
  rect(ctx,'#8db573',px+8,py-3,8,2);
  rect(ctx,'#7ba66a',px+4,py+2,9,3);
  rect(ctx,'#abd08a',px+11,py+2,4,1);
  rect(ctx,'#3c6e52',px+16,py+5,6,4);
  rect(ctx,'#4f8361',px+9,py+9,6,2);
}

export type AdventureProp='tree'|'pine'|'rocks'|'flowers'|'reeds'|'embers'|'lantern';
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
  if(biome==='forest'){
    if(seed<35)return seed%3===0?'pine':'tree';
    if(seed<54)return 'flowers';
  }else if(biome==='mountain'||biome==='cave'){
    if(seed<28)return 'rocks';
    if(seed<38)return 'pine';
  }else if(biome==='volcanic'||biome==='wasteland'){
    if(seed<25)return 'rocks';
    if(seed<43)return 'embers';
  }else{
    if(seed<14)return region.landscape==='coast'?'reeds':'tree';
    if(seed<39)return 'flowers';
  }
}
export function paintAdventureProp(ctx:CanvasRenderingContext2D,prop:AdventureProp,
  x:number,y:number,variant:number){
  if(prop==='tree'||prop==='pine'){tree(ctx,x,y,prop==='pine',variant);return;}
  if(prop==='lantern'){
    shadow(ctx,x+5,y+20,4,2);
    rect(ctx,'#463b38',x+4,y+8,2,13);
    rect(ctx,'#5e493c',x+2,y+2,6,7);
    rect(ctx,'#f3be6c',x+3,y+4,4,4);
    rect(ctx,'#ffdf9f',x+4,y+4,2,2);
    return;
  }
  if(prop==='rocks'){
    shadow(ctx,x+12,y+19,9,3);
    if(variant%3===0){
      rect(ctx,'#5b6865',x+3,y+16,7,3);
      rect(ctx,'#a5a694',x+3,y+15,5,2);
      rect(ctx,'#5b6865',x+12,y+13,9,5);
      rect(ctx,'#a5a694',x+13,y+12,6,3);
      rect(ctx,'#76887a',x+8,y+18,5,2);
      return;
    }
    poly(ctx,'#536063',[x+3,y+16,x+6,y+9,x+11,y+6,x+19,y+10,x+22,y+17,x+17,y+20,x+5,y+19]);
    poly(ctx,'#969c8d',[x+5,y+15,x+8,y+9,x+13,y+7,x+19,y+10,x+17,y+14,x+10,y+15]);
    rect(ctx,'#b5b4a1',x+10,y+9,5,2);
    rect(ctx,'#6e8070',x+14,y+16,6,2);
    return;
  }
  const color=prop==='embers'?'#e0a16b':prop==='reeds'?'#d8be76':
    ['#e6ba82','#e7a395','#d4d897'][variant%3];
  for(let k=0;k<3;k++){
    const dx=5+k*5,dy=(variant+k*3)%5;
    rect(ctx,prop==='embers'?'#744a4f':'#476b50',x+dx,y+15+dy,2,5);
    rect(ctx,color,x+dx-1,y+14+dy,3,2);
  }
}

function windowLight(ctx:CanvasRenderingContext2D,x:number,y:number){
  rect(ctx,'#344644',x,y,5,6);rect(ctx,'#f3d292',x+1,y+1,3,3);
  rect(ctx,'#614944',x+2,y+1,1,4);
}
export function paintAdventureBuilding(ctx:CanvasRenderingContext2D,b:Building,
  x:number,y:number,landscape:AdventureLandscape,variant:number){
  const arch=ARCHITECTURE[b.culture],ink='#3c353a',trim=arch.trim;
  const roof=landscape==='coast'&&b.culture==='human'?'#4f8a89':arch.roof;
  const log=b.culture==='human'||b.culture==='elf';
  shadow(ctx,x+13,y+21,14,4);
  if(b.stage==='foundation'||b.stage==='abandoned'||b.stage==='ruin'){
    rect(ctx,ink,x+2,y+9,21,12);
    rect(ctx,'#907b68',x+4,y+10,17,9);
    for(let i=0;i<3;i++)rect(ctx,arch.wall,x+4+i*6,y+14-i%2*3,4,5);
    if(b.stage==='foundation'){
      rect(ctx,'#d7b886',x+2,y+8,1,12);rect(ctx,'#d7b886',x+21,y+8,1,12);
    }
    return;
  }
  if(b.type==='farm'){
    rect(ctx,'#594b3c',x+1,y+4,22,18);
    for(let row=0;row<3;row++){
      rect(ctx,'#976f4e',x+2,y+5+row*5,20,3);
      for(let col=0;col<4;col++){
        const yy=y+5+row*5,xx=x+4+col*5;
        rect(ctx,row===2?'#dac073':'#abc177',xx,yy-1,2,3);
        rect(ctx,'#73874d',xx+1,yy,2,2);
      }
    }
    return;
  }
  if(b.type==='well'){
    rect(ctx,ink,x+5,y+12,14,9);rect(ctx,arch.wall,x+6,y+13,12,7);
    rect(ctx,'#4f9495',x+8,y+14,8,4);rect(ctx,trim,x+5,y+11,14,2);
    rect(ctx,ink,x+5,y+4,2,9);rect(ctx,ink,x+17,y+4,2,9);
    poly(ctx,roof,[x+2,y+6,x+7,y,x+16,y,x+22,y+6]);
    return;
  }
  if(b.type==='dock'){
    rect(ctx,ink,x+4,y+3,16,20);
    for(let i=0;i<5;i++)rect(ctx,i%2?'#c29164':'#ddaa76',x+4,y+3+i*4,16,3);
    for(const xx of [4,18])for(const yy of [4,18])rect(ctx,'#6c5244',x+xx,y+yy,3,5);
    return;
  }
  if(b.type==='market'){
    rect(ctx,'#594643',x+2,y+6,20,15);
    rect(ctx,arch.wall,x+3,y+15,18,4);
    for(let i=0;i<5;i++)rect(ctx,i%2?trim:roof,x+2+i*4,y+4,4,9-i%2*2);
    for(let i=0;i<3;i++)rect(ctx,['#86b178','#deb071','#c77b65'][i],
      x+5+i*5,y+14,3,3);
    return;
  }
  const large=b.type==='communal'||buildingTier(b)>=2;
  const shelter=b.type==='shelter';
  const left=x+(shelter?4:1),right=x+(shelter?21:24);
  const roofTop=y-(large?15:shelter?3:9);
  const eave=y+6;
  rect(ctx,ink,left,eave,right-left,16);
  rect(ctx,arch.wall,left+1,eave+1,right-left-2,14);
  if(log){
    rect(ctx,trim,left+1,y+10,right-left-2,1);
    rect(ctx,'#42383b69',left+1,y+16,right-left-2,1);
  }else{
    rect(ctx,'#49465690',left+2,y+13,right-left-4,1);
    rect(ctx,trim,left+2,y+8,right-left-4,1);
    rect(ctx,'#49465690',left+5,y+14,1,5);
    rect(ctx,'#49465690',right-6,y+9,1,6);
  }
  const mid=Math.round((left+right)/2);
  rect(ctx,ink,mid-3,y+12,6,10);
  rect(ctx,log?'#82604a':'#54515b',mid-2,y+13,4,8);
  rect(ctx,'#fbd797',mid+1,y+17,1,1);
  if(!shelter){
    windowLight(ctx,left+3,y+10);
    if(large)windowLight(ctx,right-8,y+10);
  }
  if(b.stage==='frame'){
    rect(ctx,trim,left,eave-5,2,14);rect(ctx,trim,right-2,eave-5,2,14);
    rect(ctx,'#846647',left,eave-5,right-left,2);
    rect(ctx,'#846647',mid,roofTop,2,eave-roofTop);
    return;
  }
  if(b.culture==='dwarf'){
    poly(ctx,ink,[left-2,eave+2,left-1,eave-5,left+3,eave-5,left+3,roofTop+4,
      left+7,roofTop+4,left+7,roofTop,right-7,roofTop,right-7,roofTop+4,
      right-3,roofTop+4,right-3,eave-5,right+1,eave-5,right+2,eave+2]);
    rect(ctx,roof,left+1,eave-4,right-left-2,5);
    rect(ctx,roof,left+4,roofTop+5,right-left-8,eave-roofTop-8);
    rect(ctx,trim,left+7,roofTop+1,right-left-14,2);
  }else{
    const tilt=variant%3-1;
    poly(ctx,ink,[left-3,eave+2,left+1,eave-5,mid+tilt,roofTop,
      right-1,eave-5,right+3,eave+2]);
    poly(ctx,roof,[left-1,eave,left+2,eave-5,mid+tilt,roofTop+2,
      right-2,eave-5,right+1,eave]);
    poly(ctx,'#f9d09a50',[left-1,eave,mid+tilt,roofTop+2,mid+2,eave]);
    if(b.culture==='elf'){
      rect(ctx,'#a1c986',mid-2,roofTop+5,4,2);
      rect(ctx,'#83b38a',left+4,eave-3,right-left-8,1);
    }else{
      rect(ctx,'#201b2c4f',left+4,eave-4,right-left-8,1);
      rect(ctx,'#f9d9a244',left+2,eave-1,right-left-4,1);
    }
  }
  if(b.type==='workshop'||b.culture==='demon'){
    rect(ctx,ink,right-7,roofTop-2,4,10);
    rect(ctx,b.culture==='demon'?'#eea07e':'#b5907a',right-7,roofTop-3,4,2);
  }
  if(b.type==='communal'){
    rect(ctx,trim,mid-1,roofTop-7,1,8);
    rect(ctx,accents[landscape],mid,roofTop-7,7,4);
  }
  if(b.type==='storage'||b.type==='workshop'){
    rect(ctx,ink,right-4,y+16,7,6);
    rect(ctx,'#c69763',right-3,y+16,5,5);
    rect(ctx,'#826347',right-3,y+18,5,1);
  }
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
