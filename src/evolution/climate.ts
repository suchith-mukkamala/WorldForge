/** Climate, weather and habitat choice for the environment.
 *
 * Everything here is a pure function of the seed, calendar and heightfield.
 * It never advances the world RNG. Older saves leave `climateEcology` unset
 * and keep the previous geography, growth and travel costs.
 */
import {terrainHash,terrainHumidity,terrainNoise,terrainTemperature} from './biomeGeneration';
import type {Biome,World} from './engine';
import {generateHydrology,hydrologyForWorld,riverBanks,type Hydrology} from './hydrology';
import {visualSeason,VISUAL_SEASONS,type VisualSeason} from './sceneAtmosphere';
import {SEA_LEVEL,topographyForWorld} from './topography';

export const CLIMATE_BIOMES=['plains','forest','taiga','wetland','savanna'] as const;
export type ClimateBiome=typeof CLIMATE_BIOMES[number];
export function isClimateBiome(biome:string):biome is ClimateBiome{
  return (CLIMATE_BIOMES as readonly string[]).includes(biome);
}
export type Weather='clear'|'overcast'|'rain'|'storm'|'snow'|'drought'|'fog';
export const WEATHER_NAMES:Record<Weather,string>={
  clear:'Clear',overcast:'Overcast',rain:'Rain',storm:'Thunderstorm',snow:'Snow',drought:'Drought',fog:'Fog',
};
const WEATHER_STRAIN:Record<Weather,number>={
  clear:1,overcast:1,drought:1,rain:1.06,fog:1.04,storm:1.18,snow:1.34,
};
const SEASON_SHIFT:Record<VisualSeason,{temperature:number;moisture:number}>={
  Bloom:{temperature:-.04,moisture:.08},
  Highsun:{temperature:.1,moisture:-.1},
  Harvest:{temperature:-.02,moisture:-.03},
  Frost:{temperature:-.16,moisture:.02},
};
const SEASON_PULSE:Record<VisualSeason,Record<Biome,number>>={
  Bloom:{plains:1.22,forest:1.24,taiga:.82,wetland:1.36,savanna:1.12,
    mountain:.9,cave:.85,wasteland:.8,volcanic:.75,water:1},
  Highsun:{plains:1.02,forest:1,taiga:1.18,wetland:1.08,savanna:.58,
    mountain:.95,cave:.9,wasteland:.7,volcanic:.72,water:1},
  Harvest:{plains:.88,forest:.92,taiga:.7,wetland:.9,savanna:.86,
    mountain:.75,cave:.85,wasteland:.78,volcanic:.8,water:1},
  Frost:{plains:.4,forest:.48,taiga:.26,wetland:.46,savanna:.7,
    mountain:.34,cave:.7,wasteland:.55,volcanic:.62,water:1},
};
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
const CARDINALS=[[-1,0],[1,0],[0,-1],[0,1]] as const;

export type ClimateField={
  temperature:Float32Array;
  moisture:Float32Array;
  coast:Uint16Array;
  banks:Float32Array;
  channel:Uint8Array;
  mouth:Uint8Array;
};
type ClimateWorld=Pick<World,'width'|'height'|'tiles'|'settings'|'topography'>;
type HabitatSample={
  temperature:number;moisture:number;river:number;coast:number;
  slope:number;elevation:number;forcedWetland:boolean;
};

export function prevailingWind(seed:number):{x:number;y:number}{
  const angle=terrainHash(4,19,seed+901)*Math.PI*2;
  return {x:Math.cos(angle),y:Math.sin(angle)};
}

/** Lift moisture up a slope and dry it out once the air descends. */
export function orographicMoisture(width:number,height:number,
  heights:readonly number[],base:Float32Array,seed:number):Float32Array{
  const wind=prevailingWind(seed);
  const dirs:[[number,number],...[number,number][]]=[[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
  let step:[number,number]=[-1,0],best=-Infinity;
  for(const [dx,dy] of dirs){
    const length=Math.hypot(dx,dy);
    const dot=dx/length*-wind.x+dy/length*-wind.y;
    if(dot>best){best=dot;step=[dx,dy];}
  }
  const [ux,uy]=step;
  const order=Array.from({length:width*height},(_,index)=>index);
  order.sort((a,b)=>{
    const pa=(a%width)*wind.x+Math.floor(a/width)*wind.y;
    const pb=(b%width)*wind.x+Math.floor(b/width)*wind.y;
    return pa-pb||a-b;
  });
  const moisture=new Float32Array(width*height);
  for(const index of order){
    const x=index%width,y=Math.floor(index/width),local=base[index];
    const nx=x+ux,ny=y+uy;
    if(nx<0||ny<0||nx>=width||ny>=height){moisture[index]=local;continue;}
    const upwind=moisture[ny*width+nx];
    const rise=heights[index]-heights[ny*width+nx];
    const lifted=rise>0?upwind+Math.min(.28,rise*.0032):
      upwind*(.84+Math.max(-.12,rise*.002));
    moisture[index]=clamp(lifted*.78+local*.22,0,1);
  }
  return moisture;
}

function distanceFrom(width:number,height:number,source:(index:number)=>boolean):Uint16Array{
  const distance=new Uint16Array(width*height);
  distance.fill(width+height);
  for(let index=0;index<distance.length;index++)if(source(index))distance[index]=0;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const index=y*width+x;
    if(x)distance[index]=Math.min(distance[index],distance[index-1]+1);
    if(y)distance[index]=Math.min(distance[index],distance[index-width]+1);
  }
  for(let y=height-1;y>=0;y--)for(let x=width-1;x>=0;x--){
    const index=y*width+x;
    if(x+1<width)distance[index]=Math.min(distance[index],distance[index+1]+1);
    if(y+1<height)distance[index]=Math.min(distance[index],distance[index+width]+1);
  }
  return distance;
}

function oceanMask(width:number,height:number,water:(index:number)=>boolean):Uint8Array{
  const ocean=new Uint8Array(width*height),queue:number[]=[];
  const push=(index:number)=>{
    if(index<0||index>=ocean.length||ocean[index]||!water(index))return;
    ocean[index]=1;queue.push(index);
  };
  for(let x=0;x<width;x++){push(x);push((height-1)*width+x);}
  for(let y=0;y<height;y++){push(y*width);push(y*width+width-1);}
  for(let head=0;head<queue.length;head++){
    const index=queue[head],x=index%width,y=Math.floor(index/width);
    if(x>0)push(index-1);
    if(x+1<width)push(index+1);
    if(y>0)push(index-width);
    if(y+1<height)push(index+width);
  }
  return ocean;
}

function blur(source:Float32Array,width:number,height:number):Float32Array{
  let current=source;
  for(let pass=0;pass<2;pass++){
    const next=new Float32Array(current.length);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const index=y*width+x;
      let sum=current[index]*4,weight=4;
      for(const [dx,dy] of CARDINALS){
        const nx=x+dx,ny=y+dy;
        if(nx<0||ny<0||nx>=width||ny>=height)continue;
        sum+=current[ny*width+nx];weight++;
      }
      next[index]=sum/weight;
    }
    current=next;
  }
  return current;
}

/** Rise against neighboring land. The drop into the sea is not a cliff by itself. */
function landSlope(heights:readonly number[],width:number,height:number,index:number):number{
  const x=index%width,y=Math.floor(index/width),here=heights[index];
  let slope=0;
  for(const [dx,dy] of CARDINALS){
    const nx=x+dx,ny=y+dy;
    if(nx<0||ny<0||nx>=width||ny>=height)continue;
    const neighbor=heights[ny*width+nx];
    if(neighbor<=SEA_LEVEL)continue;
    slope=Math.max(slope,Math.abs(here-neighbor));
  }
  return slope;
}

function assemble(width:number,height:number,biomes:readonly {biome:string}[],
  heights:readonly number[],seed:number,drainage:Hydrology):ClimateField{
  const coast=distanceFrom(width,height,index=>biomes[index].biome==='water');
  const ocean=oceanMask(width,height,index=>biomes[index].biome==='water');
  const banks=riverBanks(drainage,width,height);
  const scale=Math.max(6,Math.min(width,height));
  const base=new Float32Array(width*height);
  const temperature=new Float32Array(width*height);
  for(let index=0;index<base.length;index++){
    const x=index%width,y=Math.floor(index/width);
    const humid=(terrainHumidity(x,y,scale,seed)+1)*.5;
    const maritime=Math.exp(-coast[index]/Math.max(2.5,scale*.07));
    base[index]=clamp(humid*.62+maritime*.3+Math.min(1,banks[index])*.22,0,1);
    const latitude=terrainTemperature(x,y,scale,(y+.5)/height,seed);
    temperature[index]=clamp(latitude-Math.max(0,heights[index]-SEA_LEVEL)*.00215,0,1);
  }
  const moisture=blur(orographicMoisture(width,height,heights,base,seed),width,height);
  const mild=blur(temperature,width,height);
  const mouth=new Uint8Array(width*height);
  for(let index=0;index<mouth.length;index++){
    if(biomes[index].biome==='water'||drainage.channel[index]<2)continue;
    const x=index%width,y=Math.floor(index/width);
    const downstream=drainage.flowTo[index];
    if(downstream>=0&&ocean[downstream]){mouth[index]=1;continue;}
    for(const [dx,dy] of CARDINALS){
      const nx=x+dx,ny=y+dy;
      if(nx<0||ny<0||nx>=width||ny>=height)continue;
      if(ocean[ny*width+nx]){mouth[index]=1;break;}
    }
  }
  return {temperature:mild,moisture,coast,banks,channel:drainage.channel,mouth};
}

const fieldCache=new WeakMap<object,{seed:number;regional:boolean;field:ClimateField}>();
export function climateField(world:ClimateWorld):ClimateField{
  const topography=topographyForWorld(world);
  const regional=!!world.settings.regionalGeography;
  const saved=fieldCache.get(topography);
  if(saved&&saved.seed===world.settings.seed&&saved.regional===regional)return saved.field;
  const field=assemble(world.width,world.height,world.tiles,topography.heights,
    world.settings.seed,hydrologyForWorld(world));
  fieldCache.set(topography,{seed:world.settings.seed,regional,field});
  return field;
}

/** Reclassify grassland and woodland from climate. Rock, ash and open water stay. */
export function applyClimateBiomes(width:number,height:number,biomes:readonly Biome[],
  heights:readonly number[],seed:number,followSlopes:boolean):Biome[]{
  const tiles=biomes.map(biome=>({biome}));
  const field=assemble(width,height,tiles,heights,seed,
    generateHydrology(width,height,heights,tiles,seed,followSlopes));
  const next=biomes.slice();
  const pinned=new Uint8Array(biomes.length);
  for(let index=0;index<biomes.length;index++){
    if(!isClimateBiome(biomes[index]))continue;
    next[index]=preferredHabitat(field,index,width,height,heights);
    if(field.mouth[index]||field.channel[index]>=2&&heights[index]<SEA_LEVEL+36)
      pinned[index]=1;
  }
  for(let pass=0;pass<2;pass++){
    const current=next.slice();
    for(let index=0;index<current.length;index++){
      if(pinned[index]||!isClimateBiome(biomes[index]))continue;
      const counts=new Map<Biome,number>();
      const x=index%width,y=Math.floor(index/width);
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        if(!dx&&!dy)continue;
        const nx=x+dx,ny=y+dy;
        if(nx<0||ny<0||nx>=width||ny>=height)continue;
        const neighbor=current[ny*width+nx];
        if(!isClimateBiome(neighbor))continue;
        counts.set(neighbor,(counts.get(neighbor)??0)+1);
      }
      let majority:Biome|undefined,count=0;
      for(const [biome,seen] of counts)if(seen>count){majority=biome;count=seen;}
      if(!majority||count<6||majority===current[index])continue;
      const sample=habitatSample(field,index,width,height,heights);
      if(habitatScore(majority,sample)+.05<habitatScore(current[index],sample))continue;
      next[index]=majority;
    }
  }
  return next;
}

function habitatSample(field:ClimateField,index:number,width:number,height:number,
  heights:readonly number[]):HabitatSample{
  const elevation=heights[index],slope=landSlope(heights,width,height,index);
  const moisture=field.moisture[index];
  const coast=field.coast[index];
  const river=Math.max(field.banks[index],field.channel[index]>=2?.5:field.channel[index]>0?.25:0);
  const marshCoast=coast===1&&slope<9&&elevation<SEA_LEVEL+24&&moisture>.45;
  const corridor=field.channel[index]>=2&&slope<16&&elevation<SEA_LEVEL+36;
  const mouth=!!field.mouth[index]&&slope<22&&elevation<SEA_LEVEL+46;
  return {temperature:field.temperature[index],moisture,river,coast,slope,elevation,
    forcedWetland:marshCoast||corridor||mouth};
}

export function habitatScore(biome:Biome,sample:HabitatSample):number{
  const {temperature,moisture,river,coast,slope,elevation}=sample;
  if(biome==='wetland')
    return (moisture-.46)*2.4+river*.85+(coast<=2?.18:0)+
      Math.max(0,SEA_LEVEL+28-elevation)*.02-
      Math.max(0,slope-10)*.035-Math.max(0,elevation-(SEA_LEVEL+32))*.012;
  if(biome==='taiga')
    return (0.43-temperature)*2.6+(moisture-.28)*1.1-(elevation<SEA_LEVEL+12?.45:0);
  if(biome==='savanna')
    return (temperature-.56)*2.4+(0.4-moisture)*1.8-river*.7-(coast<=1?.15:0);
  if(biome==='forest')
    return (moisture-.48)*2.1-Math.abs(temperature-.5)*1.15+river*.08;
  return .12-Math.abs(moisture-.4)*1.15-Math.abs(temperature-.52)*.85;
}

export function preferredHabitat(field:ClimateField,index:number,width:number,
  height:number,heights:readonly number[]):Biome{
  const sample=habitatSample(field,index,width,height,heights);
  if(sample.forcedWetland)return 'wetland';
  let best:Biome='plains',bestScore=-Infinity;
  for(const biome of CLIMATE_BIOMES){
    const score=habitatScore(biome,sample);
    if(score>bestScore){best=biome;bestScore=score;}
  }
  return best;
}

const MOISTURE_CHAIN:ClimateBiome[]=['savanna','plains','forest','wetland'];
/** Move one habitat step. Cold forest becomes taiga; hot taiga thins to forest first. */
export function stepToward(from:Biome,to:Biome):Biome{
  if(from===to||!isClimateBiome(from)||!isClimateBiome(to))return from;
  if(from==='taiga')return 'forest';
  if(to==='taiga')return from==='forest'?'taiga':from==='wetland'?'forest':'forest';
  const start=MOISTURE_CHAIN.indexOf(from),goal=MOISTURE_CHAIN.indexOf(to);
  if(start<0||goal<0)return from;
  return MOISTURE_CHAIN[start+Math.sign(goal-start)];
}

export function successionBiome(from:Biome,field:ClimateField,index:number,
  width:number,height:number,heights:readonly number[]):{biome:Biome;margin:number}|null{
  if(!isClimateBiome(from))return null;
  const sample=habitatSample(field,index,width,height,heights);
  const to=sample.forcedWetland?'wetland':preferredHabitat(field,index,width,height,heights);
  if(to===from)return null;
  const margin=sample.forcedWetland&&to==='wetland'?
    Math.max(.2,habitatScore('wetland',sample)-habitatScore(from,sample)):
    habitatScore(to,sample)-habitatScore(from,sample);
  if(margin<.12)return null;
  const next=stepToward(from,to);
  return next===from?null:{biome:next,margin};
}

export function seasonalClimate(temperature:number,moisture:number,season:VisualSeason){
  const shift=SEASON_SHIFT[season];
  return {temperature:clamp(temperature+shift.temperature,0,1),
    moisture:clamp(moisture+shift.moisture,0,1)};
}

/** -1 is a dry year in this district, +1 a wet one. Shared by growth and herds. */
export function weatherAnomaly(seed:number,year:number,x:number,y:number):number{
  return terrainHash(Math.floor(x/8),Math.floor(y/8),seed+year*17+90)*2-1;
}

export type WeatherSample={kind:Weather;cover:number;intensity:number};

function weatherPattern(seed:number,year:number,day:number){
  const wind=prevailingWind(seed),date=year*365+day;
  const shift={x:wind.x*date*1.45,y:wind.y*date*1.45};
  return {seed,date,wind,shift,season:visualSeason(day)};
}

function sampleWeather({seed,shift,wind,season}:ReturnType<typeof weatherPattern>,
  temperature:number,moisture:number,x:number,y:number):WeatherSample{
  const shifted=seasonalClimate(temperature,moisture,season);
  // Sample the same pressure field after moving it downwind. Stretch it
  // across the wind so neighboring districts share the front and its edges.
  const dx=x-shift.x,dy=y-shift.y;
  const along=dx*wind.x+dy*wind.y,across=dy*wind.x-dx*wind.y;
  const pressure=terrainNoise(along,across*.62,17,seed+701);
  const eddies=terrainNoise(along+11,across-13,8,seed+1909);
  const cover=clamp(.51+pressure*.49+eddies*.12+(shifted.moisture-.43)*.34,0,1);
  if(cover>.59&&shifted.moisture>.25){
    const intensity=clamp((cover-.59)/.36,.13,1);
    const kind=shifted.temperature<.38?'snow':cover>.80?'storm':'rain';
    return {kind,cover,intensity};
  }
  if(shifted.temperature<.65&&shifted.moisture>.52&&cover>.34&&cover<.53&&eddies>.18){
    return {kind:'fog',cover,intensity:clamp((shifted.moisture-.48)*1.8,.18,.8)};
  }
  if(season==='Highsun'&&shifted.moisture<.32&&shifted.temperature>.61&&cover<.48)
    return {kind:'drought',cover:cover*.28,intensity:0};
  return {kind:cover>=.46?'overcast':'clear',cover,intensity:0};
}

export function weatherAt(temperature:number,moisture:number,day:number,
  x:number,y:number,seed:number,year:number):Weather{
  return sampleWeather(weatherPattern(seed,year,day),temperature,moisture,x,y).kind;
}

type WeatherWorld=ClimateWorld&Pick<World,'dayOfYear'|'year'>;
export type WeatherField=ReturnType<typeof weatherPattern>&{
  width:number;height:number;at:(x:number,y:number)=>WeatherSample;
};
const weatherCache=new WeakMap<ClimateField,WeatherField>();

/** Shared by the local report, travel and the cloud overlays. The
 * heightfield and calendar are enough to restore any saved weather. */
export function weatherField(world:WeatherWorld):WeatherField{
  const climate=climateField(world),day=world.dayOfYear??0,{width,height}=world;
  const seed=world.settings.seed,date=world.year*365+day;
  const previous=weatherCache.get(climate);
  if(previous?.date===date&&previous.seed===seed)return previous;
  const pattern=weatherPattern(seed,world.year,day),samples=new Map<number,WeatherSample>();
  const field={...pattern,width,height,at(x:number,y:number):WeatherSample{
    const col=clamp(Math.floor(x),0,width-1),row=clamp(Math.floor(y),0,height-1),index=row*width+col;
    let sample=samples.get(index);
    if(!sample){
      sample=sampleWeather(pattern,climate.temperature[index],climate.moisture[index],col,row);
      samples.set(index,sample);
    }
    return sample;
  }};
  weatherCache.set(climate,field);
  return field;
}

/** The yearly food pulse averages all four seasons, then a local wet or dry year. */
export function annualGrowthFactor(biome:Biome,temperature:number,moisture:number,
  seed:number,year:number,x:number,y:number):number{
  let sum=0;
  for(const season of VISUAL_SEASONS){
    const shifted=seasonalClimate(temperature,moisture,season);
    let pulse=SEASON_PULSE[season][biome];
    if(season==='Frost')pulse*=.72+shifted.temperature*.55;
    if(season==='Highsun'&&(biome==='savanna'||biome==='wasteland'))
      pulse*=.7+shifted.moisture*.6;
    sum+=pulse;
  }
  let factor=sum/4;
  const anomaly=weatherAnomaly(seed,year,x,y);
  if(anomaly<-.64)factor*=biome==='wetland'||biome==='forest'||biome==='taiga'?.86:.62;
  else if(anomaly>.72)factor*=biome==='savanna'||biome==='wasteland'?1.05:1.16;
  const winter=terrainHash(Math.floor(x/8)+5,Math.floor(y/8)+2,seed+year*13+4);
  if(winter>.86&&temperature<.46)factor*=.76;
  return clamp(factor,.35,1.45);
}

export function describeWeather(world:WeatherWorld,index:number){
  const {temperature,moisture}=climateField(world);
  const {kind}=weatherField(world).at(index%world.width,Math.floor(index/world.width));
  return {kind,title:WEATHER_NAMES[kind],
    detail:'Temperature '+Math.round(temperature[index]*100)+
      ' · moisture '+Math.round(moisture[index]*100)};
}

export function travelStrainAt(world:WeatherWorld,index:number):number{
  if(!world.settings.climateEcology)return 1;
  return WEATHER_STRAIN[weatherField(world).at(index%world.width,Math.floor(index/world.width)).kind];
}
