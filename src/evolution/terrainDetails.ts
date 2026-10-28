/** v1.9.4 — deterministic decorative terrain, separate from real resources.
 * These are visual motifs, not harvestable deposits, obstacles or new biomes.
 * Hashing never advances the simulation RNG, even for legacy saved worlds.
 */
import type {Biome} from './engine';

export type TerrainMotif='oak'|'pine'|'fern'|'grass'|'flowers'|'pebbles'|
  'reeds'|'boulder'|'scree'|'snowstone'|'crystal'|'stalagmite'|
  'scrub'|'basalt'|'embers'|'ripples'|'shorefoam'|'none';
export type TerrainDetail={motif:TerrainMotif;variant:0|1|2|3};

function hash(seed:number,x:number,y:number):number{
  let n=(seed^Math.imul(x+11939,73856093)^
    Math.imul(y+7193,19349663)^0x9e3779b9)>>>0;
  n=Math.imul(n^(n>>>16),0x7feb352d);
  n=Math.imul(n^(n>>>15),0x846ca68b);
  return (n^(n>>>16))>>>0;
}

/** `shore` means the tile touches a water/land transition. */
export function terrainDetailAt(biome:Biome,x:number,y:number,
  seed:number,elevation:number,shore=false):TerrainDetail{
  const n=hash(seed,x,y),variant=(n>>>6&3) as TerrainDetail['variant'];
  let motif:TerrainMotif='none';
  if(biome==='forest'){
    motif=n%9===0?'fern':elevation>=140||n%3===0?'pine':'oak';
  }else if(biome==='plains'){
    motif=shore&&n%4<2?'reeds':n%8===0?'pebbles':
      n%5===0?'flowers':n%3===0?'grass':'none';
  }else if(biome==='mountain'){
    motif=elevation>=185?'snowstone':n%4===0?'scree':'boulder';
  }else if(biome==='cave'){
    motif=n%3===0?'crystal':'stalagmite';
  }else if(biome==='volcanic'){
    motif=n%4===0?'embers':'basalt';
  }else if(biome==='wasteland'){
    motif=n%3===0?'scrub':n%3===1?'pebbles':'none';
  }else if(biome==='water'){
    motif=shore&&n%3!==0?'shorefoam':n%4!==0?'ripples':'none';
  }
  return {motif,variant};
}

/** Native 6-pixel accents on the existing map texture. High-detail town
 * scenery uses this exact motif selection with larger handcrafted sprites.
 */
export function paintTerrainDetail(ctx:CanvasRenderingContext2D,
  detail:TerrainDetail,x:number,y:number):void{
  const px=x*6,py=y*6,v=detail.variant;
  const p=(color:string,dx:number,dy:number,width:number,height:number)=>{
    ctx.fillStyle=color;ctx.fillRect(px+dx,py+dy,width,height);
  };
  switch(detail.motif){
    case 'oak':
      p('#1f4b42',1,2,5,3);p('#548d68',1,1,4,3);
      p('#8bc18a',2+v%2,0,2,1);p('#755b45',3,5,1,1);break;
    case 'pine':
      p('#284a45',1,4,5,1);p('#2c715c',2,2,3,3);
      p('#6eaf87',3,0,1,3);p('#8dc6a0',2+v%2,2,1,1);break;
    case 'fern':
      p('#2d7759',1,4,5,1);p('#7eaf79',2,2,1,3);
      p('#5c9d6d',3,1,2,2);break;
    case 'grass':
      p('#acc38a',1+v%3,2,1,3);p('#557d5d',3,3,1,2);
      p('#c6c992',4,4,1,1);break;
    case 'flowers':
      p('#65936b',2,2,1,4);p(v%2?'#efc8a3':'#e4acd0',1,1,3,2);
      p('#f3e7b0',2,2,1,1);break;
    case 'pebbles':
      p('#555864',1+v%2,3,3,2);p('#a5aaa9',2+v%2,2,2,1);
      p('#827c83',5,4,1,1);break;
    case 'reeds':
      p('#d6bf79',1,3,1,3);p('#78a87b',2,2,1,4);
      p('#a4be7e',4,1,1,5);break;
    case 'boulder':
      p('#323c51',1,4,5,2);p('#778899',1,2,4,3);
      p('#b0b9b9',2,1,2,2);p('#4b5b71',4,3,2,2);break;
    case 'scree':
      p('#404f61',0,4,3,2);p('#a2afb6',1,3,2,1);
      p('#586a7d',3,2,3,3);p('#d0d4c8',4,2,1,1);break;
    case 'snowstone':
      p('#566e80',1,3,5,3);p('#b7c4c8',1,2,4,2);
      p('#edf1e9',2,0,3,2);p('#dce9e5',1,2,2,1);break;
    case 'crystal':
      p('#253747',2,4,3,2);p('#7dbdcb',2,1,2,4);
      p('#c6e8df',3,0,1,3);break;
    case 'stalagmite':
      p('#202b3c',1,4,5,2);p('#7d8193',2,2,3,3);
      p('#b2b4bc',3,1,1,3);break;
    case 'scrub':
      p('#483f4c',2,3,1,3);p('#ad8a80',1,2,2,1);
      p('#897b77',3,1,2,2);break;
    case 'basalt':
      p('#382d40',1,3,5,3);p('#655367',2,1,3,3);
      p('#ba6e71',4,2,1,1);break;
    case 'embers':
      p('#513747',1,4,5,2);p('#df875d',2+v%2,3,2,1);
      p('#e9ba79',3,2,1,1);break;
    case 'ripples':
      p('#69a5ba',1+v%2,2,3,1);p('#3f829d',2,4,3,1);break;
    case 'shorefoam':
      p('#95c9c9',0,0,4,1);p('#6aa8b4',2,2,3,1);
      p('#d4e2cf',1,0,1,1);break;
  }
}
