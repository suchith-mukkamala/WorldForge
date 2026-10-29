/** Presentation preferences, independent of world saves and the simulation. */
export type WorldPerspective='depth'|'overhead';
export const WORLD_VIEW_KEY='worldforge:view:v1';
export const DEFAULT_WORLD_VIEW:WorldPerspective='depth';
export function readWorldPerspective(storage:Pick<Storage,'getItem'>|null):
  WorldPerspective{
  if(!storage)return DEFAULT_WORLD_VIEW;
  try{
    const value=storage.getItem(WORLD_VIEW_KEY);
    return value==='overhead'||value==='depth'?value:DEFAULT_WORLD_VIEW;
  }catch{return DEFAULT_WORLD_VIEW;}
}
export function writeWorldPerspective(storage:Pick<Storage,'setItem'>|null,
  view:WorldPerspective):void{
  if(!storage)return;
  try{storage.setItem(WORLD_VIEW_KEY,view);}catch{/* Restricted storage is fine. */}
}
