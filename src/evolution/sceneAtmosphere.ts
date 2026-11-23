/** v2.1.5 — layered pixel-art atmosphere shared by overhead and raised views.
 * The colors, seasonal motes and distant haze are a deterministic
 * presentation of the calendar. They do not create weather or modify biomes,
 * ecology, RNG, visibility, collisions or the 2.5D picking buffer.
 */
export const VISUAL_SEASONS=['Bloom','Highsun','Harvest','Frost'] as const;
export type VisualSeason=typeof VISUAL_SEASONS[number];
export function visualSeason(day:number):VisualSeason{
  const safe=Number.isFinite(day)?Math.max(0,Math.floor(day)):0;
  return VISUAL_SEASONS[Math.floor((safe%365)/365*4)];
}
export type Atmosphere={
  season:VisualSeason;wash:string;highlight:string;
  particle:string;density:number;
};
function seasonPalette(season:VisualSeason):Atmosphere{
  switch(season){
    case 'Bloom':return {season,wash:'rgba(111,157,132,.040)',
      highlight:'rgba(250,229,171,.096)',
      particle:'#deebac',density:50};
    case 'Highsun':return {season,wash:'rgba(236,180,106,.041)',
      highlight:'rgba(255,222,148,.105)',
      particle:'#f9d590',density:34};
    case 'Harvest':return {season,wash:'rgba(183,109,93,.062)',
      highlight:'rgba(249,179,116,.092)',
      particle:'#f3a66f',density:58};
    case 'Frost':return {season,wash:'rgba(117,162,206,.072)',
      highlight:'rgba(213,235,255,.082)',
      particle:'#e7f3ff',density:74};
  }
}
const CHANNELS=/[\d.]+/g;
function mixColor(a:string,b:string,t:number):string{
  const left=a.match(CHANNELS)?.map(Number)??[];
  const right=b.match(CHANNELS)?.map(Number)??[];
  const channels=left.map((value,i)=>value+(right[i]-value)*t);
  if(a.startsWith('#')){
    // Seasonal particles use hex RGB; interpolate without a second overlay.
    const l=[1,3,5].map(i=>parseInt(a.slice(i,i+2),16));
    const r=[1,3,5].map(i=>parseInt(b.slice(i,i+2),16));
    return '#'+l.map((v,i)=>Math.round(v+(r[i]-v)*t)
      .toString(16).padStart(2,'0')).join('');
  }
  return `rgba(${channels.slice(0,3).map(Math.round).join(',')},${Number(channels[3].toFixed(4))})`;
}
/** Crossfade the first two months of each season from the previous palette.
 * A sudden quarter-year color jump otherwise resembles a frozen world tick.
 * Month-sized playback steps still encounter intermediate lighting rather
 * than jumping across the entire fade. No simulation rules or RNG change. */
export function sceneAtmosphere(day:number):Atmosphere{
  const safe=Number.isFinite(day)?Math.max(0,Math.floor(day)):0;
  const index=Math.min(3,Math.floor((safe%365)/365*4));
  const start=Math.ceil(index*365/4);
  const progress=Math.min(1,Math.max(0,((safe%365)-start)/60));
  const next=seasonPalette(VISUAL_SEASONS[index]);
  if(progress>=1)return next;
  const previous=seasonPalette(VISUAL_SEASONS[(index+3)%4]);
  if(progress===0)return {...previous,season:next.season};
  return {season:next.season,
    wash:mixColor(previous.wash,next.wash,progress),
    highlight:mixColor(previous.highlight,next.highlight,progress),
    particle:mixColor(previous.particle,next.particle,progress),
    density:Math.round(previous.density+(next.density-previous.density)*progress)};
}
const hash=(v:number)=>{
  v=Math.imul(v^(v>>>16),0x7feb352d);
  v=Math.imul(v^(v>>>15),0x846ca68b);
  return (v^(v>>>16))>>>0;
};
/** A frame-sized overlay costs O(1) independent of world population or tiles.
 * No animation loop: scenery changes when simulated days change. */
export function paintSceneAtmosphere(ctx:CanvasRenderingContext2D,
  seed:number,year:number,day:number,view:'overhead'|'depth'):void{
  const width=ctx.canvas.width,height=ctx.canvas.height;
  if(!width||!height)return;
  const atmosphere=sceneAtmosphere(day);
  ctx.save();
  // Soft directional light makes tall walls and treetops feel distinct without
  // smoothing the native pixel grid underneath.
  ctx.fillStyle=atmosphere.wash;
  ctx.fillRect(0,0,width,height);
  const sunlight=ctx.createLinearGradient(0,0,width*.9,height*.9);
  sunlight.addColorStop(0,atmosphere.highlight);
  sunlight.addColorStop(.43,'rgba(255,239,205,.025)');
  sunlight.addColorStop(1,'rgba(7,18,40,.10)');
  ctx.fillStyle=sunlight;ctx.fillRect(0,0,width,height);
  // Distinct seasonal particles at fixed positions. Frost snowfall, harvest
  // leaves, spring pollen and highsummer fireflies are artistic accents only.
  const countParticles=Math.min(110,atmosphere.density+
    (view==='depth'?18:0));
  ctx.fillStyle=atmosphere.particle;
  for(let i=0;i<countParticles;i++){
    const n=hash(seed^Math.imul(i+1,0x85ebca6b)^year*991);
    const px=(n%width+day*(i%3+1))%width;
    const py=((n>>>12)%height+Math.floor(day*(i%5+1)/3))%height;
    const size=view==='depth'&&n%7===0?2:1;
    ctx.globalAlpha=.18+((n>>>23)%6)*.075;
    ctx.fillRect(px,py,size,size);
    if(atmosphere.season==='Harvest'&&i%7===0)
      ctx.fillRect(px+1,py+1,size,1);
  }
  ctx.restore();
}

/** Rasterize only when the calendar or canvas size changes. Reusing one
 * transparent layer prevents dozens of gradient/particle paint operations
 * on every walk-animation frame and while scrolling a large world.
 * The cache lives only in rendering memory, never in saved worlds. */
const atmosphereStamps=new WeakMap<HTMLCanvasElement,string>();
export function updateAtmosphereLayer(canvas:HTMLCanvasElement,
  seed:number,year:number,day:number,view:'overhead'|'depth'):boolean{
  const stamp=[seed,year,day,view,canvas.width,canvas.height].join(':');
  if(atmosphereStamps.get(canvas)===stamp)return false;
  const ctx=canvas.getContext('2d');
  if(!ctx)return false;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  paintSceneAtmosphere(ctx,seed,year,day,view);
  atmosphereStamps.set(canvas,stamp);
  return true;
}
