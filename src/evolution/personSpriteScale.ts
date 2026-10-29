/** Screen-readable character silhouettes without paying the cost at world scale.
 * The final two tiers intentionally exaggerate the sprite footprint: a native
 * world tile is only six pixels, too small to show a 16 × 22 character atlas.
 */
export function personSpriteSize(zoom:number,focused:boolean):
  {width:number;height:number;detailed:boolean}{
  if(zoom>=7)return {width:focused?15:13,height:focused?21:18,detailed:true};
  if(zoom>=5)return {width:focused?11:9,height:focused?16:13,detailed:true};
  return {width:3,height:5,detailed:false};
}
