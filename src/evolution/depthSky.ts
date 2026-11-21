/** Pixel sky for the empty headroom above the raised map.
 * Bands are mixes of the existing sea color and an existing haze pixel.
 * Clouds and gulls reuse highlight colors already used on water and snow.
 * Terrain, sprites, and biome palettes are not recolored.
 */
import {ATLAS_SEA} from './atlasTerrain';
import {terrainPixel} from './terrainCellArt';

export const SKY_HAZE='#e7f3ff';
export const CLOUD_COLORS=['#d8e6d9','#e7f3ff','#b2d9d8','#a9ded6'] as const;
export const GULL_LIGHT='#e7f3ff';
export const GULL_SHADE='#d8e6d9';
export const SKY_STEPS=6;

export function mixHex(from:string,to:string,t:number):string{
  const amount=Math.min(1,Math.max(0,t));
  const channel=(hex:string,index:number)=>parseInt(hex.slice(1+index*2,3+index*2),16);
  const mix=(index:number)=>Math.round(channel(from,index)+(channel(to,index)-channel(from,index))*amount);
  return '#'+[0,1,2].map(index=>mix(index).toString(16).padStart(2,'0')).join('');
}

/** Stepped rows: pale at the top of the headroom, exact sea color at the bottom
 * so the band meets the ocean fill without a hard edge. */
export function skyColor(row:number,band:number):string{
  const safe=Math.max(1,band);
  const down=1-Math.min(1,Math.max(0,row)/safe);
  const step=Math.min(SKY_STEPS-1,Math.floor(down*SKY_STEPS));
  if(step<=0)return ATLAS_SEA;
  return mixHex(ATLAS_SEA,SKY_HAZE,step/(SKY_STEPS-1)*.32);
}

export type PixelStamp={x:number;y:number;w:number;h:number;color:string};
const hash=(value:number)=>{
  let v=value>>>0;
  v=Math.imul(v^(v>>>16),0x7feb352d);
  v=Math.imul(v^(v>>>15),0x846ca68b);
  return (v^(v>>>16))>>>0;
};

/** Cloud blocks and gulls scale with the headroom so they stay readable
 * when the whole map is fitted on screen, and stay chunky pixels up close. */
export function skyStamps(seed:number,width:number,band:number):PixelStamp[]{
  if(band<12||width<16)return [];
  const stamps:PixelStamp[]=[];
  const chunk=Math.max(2,Math.round(band/26));
  const count=Math.min(14,Math.max(5,Math.round(width/(band*2.4))));
  const sky=Math.max(1,Math.floor(band*.7));
  for(let i=0;i<count;i++){
    const n=hash(seed^Math.imul(i+1,0x9e3779b1));
    const w=chunk*(4+(n>>>16&3));
    const span=Math.max(1,width-w-chunk*4);
    const x=n%span;
    const y=(n>>>8)%Math.max(1,sky-chunk*2);
    const color=CLOUD_COLORS[(n>>>28)%CLOUD_COLORS.length];
    stamps.push({x,y,w,h:chunk,color});
    stamps.push({x:x+chunk,y:y+chunk,w:Math.max(chunk*2,w-chunk*2),h:chunk,color});
    if((n>>>20&3)===0){
      const g=Math.max(1,Math.round(chunk/2));
      const gx=Math.min(width-g*4,x+w+chunk*2);
      const gy=Math.min(Math.max(0,sky-g*2),y+chunk*2);
      stamps.push({x:gx,y:gy,w:g,h:g,color:GULL_LIGHT});
      stamps.push({x:gx+g*2,y:gy,w:g,h:g,color:GULL_LIGHT});
      stamps.push({x:gx+g,y:gy+g,w:g,h:g,color:GULL_SHADE});
    }
  }
  return stamps;
}

/** Paint only the headroom band. Later terrain writes replace any overlap. */
export function paintDepthSky(pixels:Uint32Array,width:number,height:number,
  seed:number,band:number):void{
  const rows=Math.max(0,Math.min(height,Math.floor(band)));
  if(!rows||width<=0)return;
  for(let y=0;y<rows;y++){
    pixels.fill(terrainPixel(skyColor(y,rows)),y*width,(y+1)*width);
  }
  for(const stamp of skyStamps(seed,width,rows)){
    const color=terrainPixel(stamp.color);
    const x0=Math.max(0,stamp.x),y0=Math.max(0,stamp.y);
    const x1=Math.min(width,stamp.x+stamp.w),y1=Math.min(rows,stamp.y+stamp.h);
    for(let y=y0;y<y1;y++)pixels.fill(color,y*width+x0,y*width+x1);
  }
}
