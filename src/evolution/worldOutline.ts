import type {Biome} from './engine';

/** Soft, seeded ocean horizon around the playable square simulation grid.
 * Land is NEVER masked: existing citizens, cities and resources remain visible
 * even in old saves that placed them near an edge. Only peripheral open water
 * disappears into the scene's ocean-colored background. */
export function visibleCoastTile(x:number,y:number,width:number,height:number,
  biome:Biome,seed:number):boolean{
  if(biome!=='water')return true;
  const dx=(x+.5-width/2)/(width*.5),dy=(y+.5-height/2)/(height*.5);
  const angle=Math.atan2(dy,dx);
  const roughness=.065*Math.sin(angle*5+seed*.013)+
    .055*Math.cos(angle*9-seed*.007)+.027*Math.sin(angle*17+seed*.003);
  return Math.hypot(dx,dy)<.91+roughness;
}
