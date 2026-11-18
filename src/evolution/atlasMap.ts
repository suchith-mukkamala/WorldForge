import type {Point} from './motion';
import type {MapScrollGeometry} from './mapGestures';

export const ATLAS_TOWN_ZOOM=2.5;
export const ATLAS_STREET_ZOOM=4;
export const ATLAS_PLACE_ZOOM=3.5;

export function atlasLevel(zoom:number){
  if(zoom>=ATLAS_STREET_ZOOM)return 'street';
  if(zoom>=ATLAS_TOWN_ZOOM)return 'town';
  return 'world';
}

export function atlasScrollGeometry(viewport:HTMLElement,sheet:HTMLElement):MapScrollGeometry{
  return {scrollLeft:viewport.scrollLeft-sheet.offsetLeft,
    scrollTop:viewport.scrollTop-sheet.offsetTop,
    scrollWidth:sheet.offsetWidth,scrollHeight:sheet.offsetHeight};
}

type Marker=Point&{id:number;name:string};
type LabelSide='left'|'right';
type Box={left:number;right:number;top:number;bottom:number};
const MARKER_RADIUS=15;
const LABEL_HEIGHT=23;
const overlaps=(a:Box,b:Box)=>a.left<b.right&&a.right>b.left&&
  a.top<b.bottom&&a.bottom>b.top;

/** Leave every town reachable and give names space around neighboring pins. */
export function atlasLabelSides(markers:readonly Marker[],size:Point):Map<number,LabelSide>{
  const dots=markers.map(({x,y})=>({left:x-MARKER_RADIUS,right:x+MARKER_RADIUS,
    top:y-MARKER_RADIUS,bottom:y+MARKER_RADIUS}));
  const labels=new Map<number,LabelSide>(),used:Box[]=[];
  for(const {id,name,x,y} of markers){
    const width=Math.min(138,name.length*8+14);
    const top=y-LABEL_HEIGHT/2,bottom=y+LABEL_HEIGHT/2;
    if(top<2||bottom>size.y-2)continue;
    for(const side of ['right','left'] as const){
      const left=side==='right'?x+MARKER_RADIUS:x-MARKER_RADIUS-width;
      const box={left,right:left+width,top,bottom};
      if(left<2||box.right>size.x-2||
        dots.some(dot=>overlaps(dot,box))||used.some(label=>overlaps(label,box)))continue;
      used.push(box);
      labels.set(id,side);
      break;
    }
  }
  return labels;
}
