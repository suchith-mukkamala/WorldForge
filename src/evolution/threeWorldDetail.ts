/** Presentation-only detail policy. Camera changes must never affect world simulation. */
export type SceneryDetail=0|1|2;

export function sceneryDetailForZoom(zoom:number):SceneryDetail{
  return zoom>=3.5?2:zoom>=1.8?1:0;
}

/** Keep the WebGL backing buffer reasonably sharp without allocating an 8x GPU canvas. */
export function threeWorldRasterScale(zoom:number):number{
  return Math.min(2.25,Math.max(1,Number.isFinite(zoom)?zoom:1));
}

/** Deterministic decoration; never use or consume the world's random generator. */
export function sceneryVariation(seed:number,x:number,y:number):number{
  let v=Math.imul(x+seed,73856093)^Math.imul(y-seed,19349663);
  v=Math.imul(v^(v>>>16),2246822519);
  return (v^(v>>>13))>>>0;
}
