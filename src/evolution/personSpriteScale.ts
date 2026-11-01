/** Characters stay tiny at every zoom, including when selected. Detailed
 * portraits belong in the inspector, never stretched over nearby buildings.
 */
export function personSpriteSize(zoom:number,focused:boolean):
  {width:number;height:number;detailed:boolean}{
  void focused;
  return {width:2,height:3,detailed:zoom>=5};
}
