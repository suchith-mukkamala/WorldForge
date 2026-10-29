/** Shared geometry for smooth trackpad pinching and scrolling.
 * Keep the world point underneath the cursor stationary while zooming the
 * existing pixel canvas; does not affect any world or camera simulation.
 */
export type MapScrollGeometry={
  scrollLeft:number;scrollTop:number;scrollWidth:number;scrollHeight:number;
};
export type PointerOffset={x:number;y:number};
export type WorldZoomAnchor={
  xFraction:number;yFraction:number;offsetX:number;offsetY:number;
};
export function captureWorldZoomAnchor(
  viewport:MapScrollGeometry,pointer:PointerOffset):WorldZoomAnchor{
  return {
    xFraction:(viewport.scrollLeft+pointer.x)/Math.max(1,viewport.scrollWidth),
    yFraction:(viewport.scrollTop+pointer.y)/Math.max(1,viewport.scrollHeight),
    offsetX:pointer.x,offsetY:pointer.y,
  };
}
export function restoreWorldZoomAnchor(anchor:WorldZoomAnchor,
  viewport:Pick<MapScrollGeometry,'scrollWidth'|'scrollHeight'>):PointerOffset{
  return {x:anchor.xFraction*viewport.scrollWidth-anchor.offsetX,
    y:anchor.yFraction*viewport.scrollHeight-anchor.offsetY};
}
export function gestureZoomFactor(deltaY:number,deltaMode:number):number{
  const normalized=deltaY*(deltaMode===1?14:deltaMode===2?400:1);
  return Math.exp(-Math.max(-120,Math.min(120,normalized))*.007);
}
export function boundedMapZoom(value:number):number{
  if(!Number.isFinite(value))return 1;
  return Math.max(1,Math.min(8,Math.round(value*1000)/1000));
}
