import {useEffect,useRef} from 'react';
import {paintCaveConnections,paintCaveLight,paintCaveRoof} from './caveCutawayArt';
import type {CaveConnection,Caverns} from './realmCaverns';
import type {stackedProjection} from './stackedProjection';
import type {RealmMap} from './underworld';

type Projection=ReturnType<typeof stackedProjection>;

export function CaveCutaway({projection,map,plan,worldSize,connections,elevations,roof}:{projection:Projection;
  map:RealmMap;plan:Caverns;worldSize:{width:number;height:number};connections:readonly CaveConnection[];
  elevations:readonly number[];roof:boolean}){
  const rock=useRef<HTMLCanvasElement>(null),light=useRef<HTMLCanvasElement>(null);
  const {size}=projection,{width,height}=worldSize;
  const scale=Math.min(1,Math.sqrt(1_450_000/(size.width*size.height)));
  const glowScale=Math.min(1,720/size.width);
  const lit=connections.some(site=>site.kind!=='fault');
  useEffect(()=>{
    const canvas=rock.current,ctx=canvas?.getContext('2d');
    if(!canvas||!ctx)return;
    ctx.setTransform(canvas.width/size.width,0,0,canvas.height/size.height,0,0);
    ctx.clearRect(0,0,size.width,size.height);
    if(roof)paintCaveRoof(ctx,projection,map,plan,{width,height});
    paintCaveConnections(ctx,projection,map,plan,{width,height},connections,elevations);
    const glow=light.current,overlay=glow?.getContext('2d');
    if(!glow||!overlay)return;
    overlay.setTransform(glow.width/size.width,0,0,glow.height/size.height,0,0);
    overlay.clearRect(0,0,size.width,size.height);
    paintCaveLight(overlay,projection,map,connections);
  },[projection,map,plan,width,height,connections,elevations,roof]);
  return <>
    <canvas ref={rock} className="strata-cavern" aria-hidden="true" data-chambers={roof?plan.chambers.length:undefined}
      data-connections={connections.map(site=>site.kind).join(' ')}
      width={Math.ceil(size.width*scale)} height={Math.ceil(size.height*scale)}/>
    {lit&&<canvas ref={light} className="strata-cavern strata-cave-glow" aria-hidden="true"
      width={Math.ceil(size.width*glowScale)} height={Math.ceil(size.height*glowScale)}/>}
  </>;
}
