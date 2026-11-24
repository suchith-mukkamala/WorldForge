/** WorldForge v1.1 — deterministic, hand-drawn pixel art from simulation data.
 * Art reads the world but never consumes its RNG or mutates an agent.
 */
import type {Agent,Species} from './engine';
import {traitProfile} from './family';
import {RESOURCE_COLORS,type ResourceKind} from './resources';
import type {Facing,SpritePose} from './motion';
import {blockCharacter,type CharacterLook} from './blockModels';
import {blockRasterPixels,depthBlockView} from './blockScenery';

export const PERSON_SPRITE_WIDTH=16;
export const PERSON_SPRITE_HEIGHT=22;
export type PixelPerson=Pick<Agent,'id'|'species'|'ancestry'|'genes'> &
  Partial<Pick<Agent,'age'|'work'|'development'|'innateTrait'|'awakening'|
    'appearance'>>;
export type AgeLook='young'|'adult'|'elder';
export type PixelAppearance={skin:string;hair:string;eyes:string;outfit:string;
  trim:string;boots:string;accent:string;ageLook:AgeLook;secondary?:Species};

const hash=(n:number)=>Math.imul(n^0x7f4a7c15,2246822519)>>>0;
const shades={
  human:{skin:['#e1b788','#bd845f','#f2cfaa','#9f705d'],
    hair:['#392b32','#7d5237','#d5ae77','#a95d45']},
  elf:{skin:['#b8e2c3','#84b79f','#e2dcc5','#8ac5b3'],
    hair:['#e8deb2','#7ad3a1','#5b8b75','#d8a3b4']},
  dwarf:{skin:['#dfab84','#b98467','#edceaa','#a27565'],
    hair:['#774b33','#c2814c','#51424a','#dfba88']},
  demon:{skin:['#98718e','#b57778','#755b86','#d09a97'],
    hair:['#292434','#5b3652','#b4869a','#413b51']},
} satisfies Record<Species,{skin:string[];hair:string[]}>;
export const mortalColorOptions=(species:Species)=>shades[species];
const garment:Record<string,string>={
  farmer:'#799d62',woodcutter:'#8b7159',miner:'#708baa',
  builder:'#b39165',artisan:'#8f6fa3',trader:'#b37679',
  forager:'#799d62',scholar:'#7d81b3',wanderer:'#638d93',
};
const speciesAccent:Record<Species,string>={human:'#f0c889',elf:'#8fd8b2',
  dwarf:'#d7a77a',demon:'#df83a3'};

export function ageLookFor(person:PixelPerson):AgeLook{
  const age=person.age;
  if(age===undefined)return 'adult';
  const profile=traitProfile(person.ancestry);
  return age<profile.maturity*.72?'young':
    age>profile.lifespan*.78?'elder':'adult';
}

/** Stable visible identity across map zoom, portraits, saves and rerenders. */
export function appearanceFor(person:PixelPerson):PixelAppearance{
  const base=shades[person.species],v=hash(person.id*71+Math.round(
    person.genes.vigor*100));
  const preferred=(Object.keys(person.ancestry) as Species[])
    .filter(s=>s!==person.species&&person.ancestry[s]>=.18)
    .sort((a,b)=>person.ancestry[b]-person.ancestry[a])[0];
  const role=person.appearance?.outfit??person.work?.job??
    person.development?.career??'wanderer';
  const elder=ageLookFor(person)==='elder';
  return {skin:base.skin[person.appearance?.skin??v%base.skin.length],
    hair:elder?'#d1d0d2':base.hair[person.appearance?.hair??
      (v>>>3)%base.hair.length],
    eyes:person.species==='demon'?'#ffe1a4':'#243448',
    outfit:garment[role]??garment.wanderer,
    trim:speciesAccent[person.species],boots:'#423b43',
    accent:preferred?speciesAccent[preferred]:speciesAccent[person.species],
    ageLook:ageLookFor(person),secondary:preferred};
}

export function spriteKey(person:PixelPerson):string{
  return [person.id,person.species,ageLookFor(person),
    person.work?.job??person.development?.career??'-',
    person.appearance?Object.values(person.appearance).join('-'):'seeded',
    Math.round(person.genes.vigor*100),
    Object.entries(person.ancestry).map(([k,v])=>k+Math.round(v*100)).join('')]
    .join(':');
}

export const PERSON_PORTRAIT_VIEW=depthBlockView({yaw:336,pitch:33});
export const PERSON_PORTRAIT_UNIT=.77;
export const PERSON_PORTRAIT_FEET={x:8,y:19};

const looks=new WeakMap<PixelPerson,CharacterLook>();
export function personBlockLook(person:PixelPerson):CharacterLook{
  let look=looks.get(person);
  if(!look){
    look={...appearanceFor(person),people:person.species,
      hairStyle:person.appearance?.hairStyle??hash(person.id+1949)%3,job:person.work?.job};
    looks.set(person,look);
  }
  return look;
}

export type PixelRect={x:number;y:number;width:number;height:number;color:string};

/** The settlement plan and the canvas render the same cube bodies. */
export function pixelRectsFor(person:PixelPerson,facing:Facing='south',
  stride:0|1|2|3=0,pose:SpritePose='idle'):PixelRect[]{
  const {x,y}=PERSON_PORTRAIT_FEET;
  const width=PERSON_SPRITE_WIDTH,height=PERSON_SPRITE_HEIGHT;
  const cells=blockRasterPixels(blockCharacter(personBlockLook(person),facing,stride,pose),
    PERSON_PORTRAIT_VIEW,PERSON_PORTRAIT_UNIT,width,height,{x,y});
  const rects:PixelRect[]=[{x:x-3,y,width:6,height:1,color:'#26304070'}];
  for(let row=0;row<height;row++){
    for(let col=0;col<width;){
      const color=cells[row*width+col];
      let end=col+1;
      while(end<width&&cells[row*width+end]===color)end++;
      if(color){
        const rgb=((color&255)<<16)|(color&0xff00)|((color>>>16)&255);
        rects.push({x:col,y:row,width:end-col,height:1,color:'#'+rgb.toString(16).padStart(6,'0')});
      }
      col=end;
    }
  }
  return rects;
}

export function paintTerrain(ctx:CanvasRenderingContext2D,biome:string,
  color:string,x:number,y:number,seed:number,cover?:number):void{
  const px=x*6,py=y*6,h=hash(seed+x*919+y*1733);
  const p=(c:string,dx:number,dy:number,w:number,h:number)=>{
    ctx.fillStyle=c;ctx.fillRect(px+dx,py+dy,w,h);
  };
  p(color,0,0,6,6);
  if(cover!==undefined){
    // The canopy palette and sparse undergrowth describe mixed woodland.
    if(h%3===0){
      p(cover>.45?'#4b8168':'#9ba978',h%4,4,2,1);
      p(cover>.45?'#38675b':'#6e916e',1+h%3,1,1,2);
    }
  }else if(biome==='forest'){
    p('#275643',1,2,4,4);p('#438d64',1,1,4,3);
    p('#76b177',2,0,2,2);p('#745b43',3,4,1,2);
    if(h%3===0)p('#b0ce8a',1,2,1,1);
    p('#214838',0,5,2,1);p('#5b9b6c',0,1,2,1);
    if(h%7===0)p('#e6c98e',4,1,1,1);
  }else if(biome==='water'){
    p('#28546e',0,5,6,1);p('#5195b7',h%3,1,3,1);
    if(h%4===0)p('#88bcd0',3,3,2,1);
    p('#1f4965',1,4,3,1);if(h%9===0)p('#b2d9d8',1,2,2,1);
  }else if(biome==='mountain'){
    p('#606b81',0,5,6,1);p('#79879b',1,2,4,3);
    p('#b7c5ca',2,0,2,2);p('#dbe2de',3,0,1,1);
    p('#4e5d72',4,4,2,2);p('#d6d7cf',1,1,1,1);
  }else if(biome==='cave'){
    p('#1d2636',1,2,4,4);p('#45435a',0,0,6,1);
    p('#67738c',2,4,1,1);if(h%2)p('#82aeb7',4,4,1,2);
    p('#a1acba',1,0,1,1);p('#2a3948',3,3,2,1);
  }else if(biome==='volcanic'){
    p('#513a4f',0,5,6,1);p('#a95659',1,1,4,2);
    p('#e9a26d',h%3+1,3,2,1);p('#472c40',4,0,1,2);
    p('#39273d',0,0,2,2);p('#ffbe77',3,4,1,1);
  }else if(biome==='plains'){
    p('#7fa576',h%4,1,1,3);p('#c3c489',2,4,2,1);
    if(h%5===0){p('#e5ce9b',4,2,1,1);p('#597c64',4,3,1,1);}
    p('#416e5b',0,5,2,1);p('#aec18b',4,0,1,2);
    if(h%7===0)p('#d1a6b0',1,1,1,1);
  }else if(biome==='wasteland'){
    p('#876b74',h%3,4,3,1);p('#b9959a',4,1,1,2);
    if(h%4===0)p('#d5ab9d',1,2,2,1);
    p('#614d62',0,5,3,1);p('#c6a28f',2,0,1,1);
  }
}

/** Pixel-scale directional relief and a dedicated contour heightmap.
 * Presentation only: shades are based on persisted terrain values, not
 * additional RNG or the camera. Small 6px pixels retain the retro look.
 */
export function paintRelief(ctx:CanvasRenderingContext2D,
  x:number,y:number,height:number,
  neighbors:{north:number;east:number;south:number;west:number},
  biome:string,mode:'terrain'|'elevation'='terrain'):void{
  const px=x*6,py=y*6;
  const p=(color:string,dx:number,dy:number,width:number,depth:number)=>{
    ctx.fillStyle=color;ctx.fillRect(px+dx,py+dy,width,depth);
  };
  if(mode==='elevation'){
    const colors=['#234966','#3b7182','#5d866b','#74936a','#8c9a72',
      '#b19f7c','#9b918b','#bcc1c4','#e8e7d9'];
    const band=biome==='water'?0:Math.min(8,Math.floor(height/30));
    p(colors[band],0,0,6,6);
    // A hairline every 30 height units conveys real geological contours.
    const contour=(a:number)=>Math.floor(a/30)<Math.floor(height/30);
    if(contour(neighbors.north))p('#f1e7ca',0,0,6,1);
    if(contour(neighbors.west))p('#eadbb4',0,1,1,5);
    if(height>185&&biome!=='water')p('#f4f2dd',2,2,2,2);
    return;
  }
  // Simple north-west sun lighting and south-east occlusion. Adjacent
  // heights come from the world grid, not invented sprite geometry.
  const north=height-neighbors.north,west=height-neighbors.west;
  const south=height-neighbors.south,east=height-neighbors.east;
  if(north>9)p('rgba(238,229,190,.36)',0,0,6,1);
  if(west>10)p('rgba(233,231,192,.25)',0,1,1,4);
  if(south>8)p('rgba(15,29,43,.37)',0,5,6,1);
  if(east>9)p('rgba(18,29,47,.34)',5,1,1,4);
  if(north< -14)p('rgba(19,32,47,.38)',0,0,6,1);
  if(west< -14)p('rgba(21,35,47,.3)',0,1,1,4);
  // Subtle high-altitude snow and rocky transitions without altering biomes.
  if(height>=188&&biome==='mountain'){
    p('#e3e8df',2,0,2,1);
    if(height>=203)p('#d6dfe0',1,2,3,1);
  }
  if(biome!=='water'&&(neighbors.north<48||neighbors.west<48)&&
    height<95)p('rgba(227,200,146,.52)',1,0,4,1);
  if(biome==='water'&&neighbors.north>48)
    p('rgba(181,226,217,.64)',0,0,6,1);
}

/** Draw one continuous pixel-art stream segment, including the receiving
 * cell's center. A stream is a graphical overlay, not a new water biome.
 */
export function paintHydrologyStream(ctx:CanvasRenderingContext2D,
  x:number,y:number,toX:number,toY:number,tier:number,
  watersheds=false):void{
  if(tier<1||Math.abs(toX-x)>1||Math.abs(toY-y)>1)return;
  const px=x*6+3,py=y*6+3,dx=(toX-x)*6,dy=(toY-y)*6;
  const width=tier===3?3:tier===2?2:1;
  const tint=watersheds?'#a2e9ee':'#4aadd0';
  // Discrete positions keep the retro style crisp across diagonal turns.
  for(let step=0;step<=6;step++){
    const sx=Math.round(px+dx*step/6),sy=Math.round(py+dy*step/6);
    if(tier>=2){
      ctx.fillStyle=watersheds?'#315c75':'#204c64';
      ctx.fillRect(sx-2,sy-2,width+2,width+2);
    }
    ctx.fillStyle=tint;
    ctx.fillRect(sx-1,sy-1,width,width);
  }
  ctx.fillStyle='#c8eff0';
  ctx.fillRect(px-1,py-1,1,1);
}

export function paintDeposit(ctx:CanvasRenderingContext2D,kind:ResourceKind,
  x:number,y:number,amount:number,capacity:number):void{
  if(amount<.1)return;
  const px=x*6,py=y*6,full=Math.min(1,amount/Math.max(.1,capacity));
  const p=(c:string,dx:number,dy:number,w:number,h:number)=>{
    ctx.fillStyle=c;ctx.fillRect(px+dx,py+dy,w,h);
  };
  const color=RESOURCE_COLORS[kind];
  if(kind==='tree'){
    p('#4f483c',3,2,1,5);
    p('#1b4c46',1,1,5,3);p(color,2,-1,3,4);
    p('#82b782',2,0,2,1);
    if(full<.4)p('#283e3f',1,1,4,2);
  }else{
    p('#373f4c',1,4,5,2);p(color,2,1,3,4);
    p('#ebded0',2,2,1,1);p('#445061',4,3,2,2);
    if(full<.4)p('#303f4d',3,1,2,3);
  }
}
