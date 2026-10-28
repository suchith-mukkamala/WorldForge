/** WorldForge v1.1 — deterministic, hand-drawn pixel art from simulation data.
 * Art reads the world but never consumes its RNG or mutates an agent.
 */
import type {Agent,Species} from './engine';
import {traitProfile} from './family';
import {ARCHITECTURE,type Building} from './construction';
import {RESOURCE_COLORS,type ResourceKind} from './resources';
import type {Facing,SpritePose} from './motion';
import type {AncientKind} from './knowledge';

export const PERSON_SPRITE_WIDTH=16;
export const PERSON_SPRITE_HEIGHT=22;
/** Six different hand-pixeled silhouettes, painted at map resolution.
 * An explored site has a lit doorway; abandoned cultures retain their tint. */
export function paintAncientSite(ctx:CanvasRenderingContext2D,
  kind:AncientKind,x:number,y:number,visited:boolean):void{
  const p=(color:string,dx:number,dy:number,w:number,h:number)=>{
    ctx.fillStyle=color;ctx.fillRect(x+dx,y+dy,w,h);
  };
  const stone='#746e79',shade='#353647',edge='#b6a2a0',gold='#e6c380';
  p('#202636',-5,5,15,3);
  if(kind==='temple'){
    p(stone,-3,-4,12,9);p(gold,-5,-7,16,2);p('#a58976',-3,-5,12,2);
    p(edge,-1,-3,2,7);p(edge,5,-3,2,7);p(shade,2,0,2,5);
    p('#d9b05d',1,-8,3,1);p('#baa68b',-4,5,14,1);
  }else if(kind==='library'||kind==='archive'){
    p('#5a6d79',-4,-5,14,11);p('#b6c9c1',-3,-8,12,3);
    p('#dfc8a0',-2,-4,3,7);p('#90745b',2,-4,5,7);
    p('#d8ddbb',3,-3,1,5);p('#9fc0b0',5,-3,1,5);
    p('#d6e5d9',0,-9,5,1);p(shade,-1,2,3,4);
  }else if(kind==='crypt'){
    p('#5a555f',-5,-5,15,11);p('#a8a0a0',-3,-7,11,3);
    p('#242332',0,-3,5,9);p('#6f6572',1,-4,3,2);
    p('#ddd2c1',1,0,3,2);p('#242332',1,0,1,1);p('#242332',3,0,1,1);
    p('#c1a0b2',-6,1,2,3);p('#c1a0b2',9,0,2,4);
  }else if(kind==='vault'){
    p('#655568',-4,-6,13,12);p('#a494b3',-3,-8,11,3);
    p('#2d293b',-1,-3,7,9);p('#997baa',0,-2,5,6);
    p('#dbc596',2,0,2,2);p('#554a62',-5,4,15,2);
  }else{
    p(stone,-5,-2,4,8);p(edge,-5,-6,4,3);
    p(stone,4,-5,4,11);p(edge,3,-7,6,2);
    p('#a99ca0',-2,3,5,3);p('#6d717c',8,4,3,2);
    p('#85818a',0,-6,4,2);p('#58606c',-4,-4,12,1);
    p('#8b9a7c',-3,5,2,2);
  }
  if(visited){p('#f7db8a',2,3,2,2);p('#f3e4bf',2,2,1,1);}
  else{p('#728f9d',2,3,2,2);}
}
export type PixelPerson=Pick<Agent,'id'|'species'|'ancestry'|'genes'> &
  Partial<Pick<Agent,'age'|'work'|'development'>>;
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
  const role=person.work?.job??person.development?.career??'wanderer';
  const elder=ageLookFor(person)==='elder';
  return {skin:base.skin[v%base.skin.length],
    hair:elder?'#d1d0d2':base.hair[(v>>>3)%base.hair.length],
    eyes:person.species==='demon'?'#ffe1a4':'#243448',
    outfit:garment[role]??garment.wanderer,
    trim:speciesAccent[person.species],boots:'#423b43',
    accent:preferred?speciesAccent[preferred]:speciesAccent[person.species],
    ageLook:ageLookFor(person),secondary:preferred};
}

export function spriteKey(person:PixelPerson):string{
  return [person.id,person.species,ageLookFor(person),
    person.work?.job??person.development?.career??'-',
    Math.round(person.genes.vigor*100),
    Object.entries(person.ancestry).map(([k,v])=>k+Math.round(v*100)).join('')]
    .join(':');
}

/** Draw at native 16 × 22 pixel resolution; scale with nearest-neighbor only. */
export function paintPerson(ctx:CanvasRenderingContext2D,person:PixelPerson,
  ox=0,oy=0,facing:Facing='south',stride:0|1|2|3=0,
  pose:SpritePose='idle'):void{
  const c=appearanceFor(person),p=(color:string,x:number,y:number,w:number,h:number)=>{
    ctx.fillStyle=color;ctx.fillRect(ox+x,oy+y,w,h);
  };
  const short=person.species==='dwarf'?2:c.ageLook==='young'?3:0;
  const top=short>=3?7:4;
  const skin=c.skin,ink='#252a39';
  // Cast shadow, feet and garment silhouette; independent of camera scale.
  p('#26304088',3,20,10,1);
  p(ink,4,17,4,4);p(ink,9,17,4,4);
  p(c.boots,4,19,4,2);p(c.boots,9,19,4,2);
  if(person.species==='demon'){
    p('#4f394f',12,16,2,3);p('#9b6273',14,17,1,2);
  }
  if(person.species==='elf'){
    p('#2f5c4e',3,11,10,8);p('#81b999',3,17,2,2);p('#81b999',11,17,2,2);
  }
  p(ink,3,10,10,9-short);p(c.outfit,4,11,8,7-short);
  p(ink,2,12,2,5-short);p(ink,12,12,2,5-short);
  p(c.outfit,3,12,2,4-short);p(c.outfit,11,12,2,4-short);
  p(skin,3,16-short,2,2);p(skin,11,16-short,2,2);
  p(c.trim,6,12,1,5-short);p('#433d4b',5,17-short,7,1);
  p('#edcd91',9,17-short,2,1);
  // Neck, distinctive face and hairline.
  p(ink,4,top+1,8,7);p(skin,5,top+2,6,6);
  p('#b77b69',7,top+7,2,1);p(c.eyes,6,top+5,1,1);p(c.eyes,9,top+5,1,1);
  if(person.species==='human'){
    p(c.hair,4,top,8,3);p(c.hair,4,top+2,2,3);
    p(c.hair,11,top+2,1,2);
  }else if(person.species==='elf'){
    p(c.hair,4,top,8,3);p(c.hair,4,top+2,1,5);
    p(skin,2,top+5,3,2);p(skin,11,top+5,3,2);
    p(c.accent,2,top+5,1,1);p(c.accent,13,top+5,1,1);
    p('#d4edcb',6,top+1,4,1);
  }else if(person.species==='dwarf'){
    p(c.hair,4,top,8,3);
    p(c.hair,4,top+6,8,4);p(c.hair,6,top+10,4,2);
    p('#f0c997',7,top+8,2,1);p(c.trim,5,top,6,1);
  }else{
    p(c.hair,4,top,8,3);p('#4d3b56',4,top+2,2,2);
    p(ink,3,top-2,3,4);p(ink,10,top-2,3,4);
    p('#d4a4a7',4,top-2,1,3);p('#d4a4a7',11,top-2,1,3);
    p('#faac84',6,top+5,1,1);p('#faac84',9,top+5,1,1);
  }
  if(c.ageLook==='young'){
    p(skin,5,top+7,6,2);p(c.outfit,4,16,8,2);
  }
  if(person.work?.job==='miner'||person.work?.job==='builder'){
    p('#e5bd76',5,top-1,6,2);
    if(person.work.job==='miner')p('#fff0aa',7,top-1,2,2);
  }else if(person.work?.job==='farmer'){
    p('#a99457',3,top+1,10,1);p('#c0a76b',5,top-1,6,3);
  }else if(person.work?.job==='trader'){
    p('#e4c58f',12,15-short,3,4);p('#59495a',13,16-short,1,1);
  }else if(person.work?.job==='artisan'){
    p('#c8a7a3',6,14,5,4-short);p('#6f526d',8,15,1,2);
  }
  // A mixed-heritage accent is inherited visually, never re-rolled by zoom.
  if(c.secondary)p(c.accent,10,12,2,2);
  if(facing==='north'){
    // No eyes from behind: hairstyle, cloak and shoulder straps reveal the back.
    p(ink,4,top+1,8,8);p(c.hair,5,top+1,6,7);
    p('#374556',5,12,6,6-short);p(c.outfit,7,12,2,5-short);
    p(c.trim,6,12,1,5-short);
  }else if(facing==='east'||facing==='west'){
    // A single visible eye and a side silhouette distinguish left and right.
    const side=facing==='east'?1:-1;
    p(skin,5,top+3,6,5);
    p(c.hair,side===1?5:9,top+2,2,5);
    p(c.eyes,side===1?9:6,top+5,1,1);
    p('#a36f67',side===1?11:4,top+7,1,1);
    p(c.trim,side===1?11:4,13,1,4-short);
  }
  if(stride===1||stride===3){
    // Four-step gait: alternating foot contact and arm counter-swing.
    p('#282d3a',4,18,4,3);p(c.boots,3,19,4,2);
    p('#282d3a',9,17,4,3);p(c.boots,10,18,4,2);
    p(skin,2,15-short,2,2);p(skin,12,17-short,2,2);
  }
  if(stride===2){
    p(ink,4,17,4,3);p(c.boots,5,19,4,2);
    p(ink,9,18,4,3);p(c.boots,8,19,4,2);
    p(skin,3,17-short,2,2);p(skin,11,15-short,2,2);
  }
  if(stride===3){
    p(c.boots,4,19,4,2);p(c.boots,11,19,3,2);
    p(skin,3,17-short,2,2);
  }
  if(pose==='study'){
    p('#3e536e',2,13,5,5);p('#e8d6a3',3,13,3,4);
    p('#a28e6a',5,14,1,2);
  }else if(pose==='work'){
    p('#b4a3a0',13,12,2,7);p('#e9c58b',12,11,4,3);
  }else if(pose==='talk'){
    p(skin,12,12,2,4);p('#f7ebc2',14,top+1,2,2);
  }else if(pose==='rest'){
    p(c.hair,5,top+3,7,2);p('#a36e67',6,top+6,4,1);
  }else if(pose==='explore'){
    p(skin,12,12,2,3);p('#f7d79a',13,11,2,2);
  }
}

export type PixelRect={x:number;y:number;width:number;height:number;color:string};
/** Native SVG can use the same sprite commands without bitmap upscaling. */
export function pixelRectsFor(person:PixelPerson,facing:Facing='south',
  stride:0|1|2|3=0,pose:SpritePose='idle'):PixelRect[]{
  const pixels:PixelRect[]=[];
  const recorder={fillStyle:'',fillRect(x:number,y:number,width:number,height:number){
    pixels.push({x,y,width,height,color:recorder.fillStyle});
  }};
  paintPerson(recorder as unknown as CanvasRenderingContext2D,
    person,0,0,facing,stride,pose);
  return pixels;
}

export function paintTerrain(ctx:CanvasRenderingContext2D,biome:string,
  color:string,x:number,y:number,seed:number):void{
  const px=x*6,py=y*6,h=hash(seed+x*919+y*1733);
  const p=(c:string,dx:number,dy:number,w:number,h:number)=>{
    ctx.fillStyle=c;ctx.fillRect(px+dx,py+dy,w,h);
  };
  p(color,0,0,6,6);
  if(biome==='forest'){
    p('#275643',1,2,4,4);p('#438d64',1,1,4,3);
    p('#76b177',2,0,2,2);p('#745b43',3,4,1,2);
    if(h%3===0)p('#b0ce8a',1,2,1,1);
  }else if(biome==='water'){
    p('#28546e',0,5,6,1);p('#5195b7',h%3,1,3,1);
    if(h%4===0)p('#88bcd0',3,3,2,1);
  }else if(biome==='mountain'){
    p('#606b81',0,5,6,1);p('#79879b',1,2,4,3);
    p('#b7c5ca',2,0,2,2);p('#dbe2de',3,0,1,1);
  }else if(biome==='cave'){
    p('#1d2636',1,2,4,4);p('#45435a',0,0,6,1);
    p('#67738c',2,4,1,1);if(h%2)p('#82aeb7',4,4,1,2);
  }else if(biome==='volcanic'){
    p('#513a4f',0,5,6,1);p('#a95659',1,1,4,2);
    p('#e9a26d',h%3+1,3,2,1);p('#472c40',4,0,1,2);
  }else if(biome==='plains'){
    p('#7fa576',h%4,1,1,3);p('#c3c489',2,4,2,1);
    if(h%5===0){p('#e5ce9b',4,2,1,1);p('#597c64',4,3,1,1);}
  }else if(biome==='wasteland'){
    p('#876b74',h%3,4,3,1);p('#b9959a',4,1,1,2);
    if(h%4===0)p('#d5ab9d',1,2,2,1);
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

/** Meaningful visual silhouettes for the nine autonomously built structures. */
export function paintBuilding(ctx:CanvasRenderingContext2D,b:Building):void{
  const x=b.x*6-2,y=b.y*6-3,style=ARCHITECTURE[b.culture];
  const p=(c:string,dx:number,dy:number,w:number,h:number)=>{
    ctx.fillStyle=c;ctx.fillRect(x+dx,y+dy,w,h);
  };
  const broken=b.stage==='ruin'||b.stage==='abandoned';
  if(broken){
    p('#343646',0,5,11,4);p('#757080',1,4,3,4);p('#9b8b93',6,6,4,2);
    p('#2d3644',4,6,2,2);return;
  }
  if(b.stage!=='complete'){
    p('#4d4a4a',0,7,11,2);
    if(b.stage!=='foundation'){
      p('#bd916b',1,3,1,5);p('#bd916b',9,3,1,5);
      p('#e3c38f',1,3,9,1);
    }
    p('#e5d09b',0,10,Math.max(1,Math.round(b.progress/10)),1);
    return;
  }
  if(b.type==='farm'){
    p('#5d744d',0,5,12,5);
    for(let row=0;row<3;row++){
      p('#a17b50',1,5+row*2,10,1);
      p('#b4d379',2+row,4+row*2,2,2);
      p('#7aa260',7,5+row,2,2);
    }
    p('#e7d8aa',8,0,3,4);p(style.roof,7,0,5,2);return;
  }
  if(b.type==='well'){
    p('#d6c5af',2,6,8,3);p('#476e7e',3,5,6,3);
    p('#8a7969',2,2,1,5);p('#8a7969',9,2,1,5);
    p(style.roof,1,1,10,2);p('#b7e1dc',5,6,2,1);return;
  }
  if(b.type==='dock'){
    p('#463f49',0,7,12,3);p('#b68c69',0,5,12,2);
    p('#e2bb87',2,4,2,5);p('#e2bb87',9,4,2,5);
    p('#8d695c',5,2,2,4);p('#f6dfb6',6,1,1,4);return;
  }
  if(b.type==='market'){
    p('#b3987d',1,5,10,4);p('#e7cd9a',1,8,10,1);
    for(let i=0;i<5;i++)p(i%2?style.roof:'#e6d5a9',1+i*2,2,2,4);
    p('#584854',2,7,2,2);p('#5b7b60',7,7,2,2);return;
  }
  if(b.type==='shelter'){
    p('#524f59',0,8,11,2);p('#c5ad82',1,5,9,3);
    p(style.roof,3,2,5,4);p('#6e5361',5,6,2,3);return;
  }
  p('#293344',0,5,12,5);p(style.wall,1,4,10,5);
  const roofSize=b.type==='communal'?10:8;
  p(style.roof,1,2,roofSize,3);p('#e0c6a0',3,1,roofSize-3,1);
  if(b.type==='communal'){
    p(style.wall,4,-3,4,6);p(style.roof,3,-4,6,2);
    p('#e5d5aa',5,-1,2,2);
  }else if(b.type==='workshop'){
    p('#645b5a',8,-2,2,5);p('#a7a7a1',8,-3,2,1);
    p('#ecab70',2,6,2,2);
  }else if(b.type==='storage'){
    p('#94714f',2,5,8,4);p('#d5b58a',4,6,1,3);
    p('#d5b58a',7,6,1,3);
  }else{
    p('#3b3342',5,6,3,3);p('#e4c88c',2,5,2,2);
    if(b.type==='house')p('#d9bda2',9,0,2,3);
  }
  p(style.trim,1,4,1,3);
}
