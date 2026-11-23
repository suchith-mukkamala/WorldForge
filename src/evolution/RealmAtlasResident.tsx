import {useEffect,useRef} from 'react';
import type {PlacedArt} from './atlasBuildingArt';
import {paintPlacedBlock} from './blockScenery';
import type {Point} from './motion';
import {realmPeopleName,type RealmResident} from './underworld';
import {paintRealmResident} from './underworldArt';

const width=12,height=22,feet=19;
export const REALM_ATLAS_PERSON_UNIT=.48;
export const REALM_ATLAS_PERSON_HEIGHT=feet*REALM_ATLAS_PERSON_UNIT;

type Foreground={at:Point;unit:number;shapes:readonly PlacedArt[]};

export function RealmAtlasResident({resident,point,scale,foreground}:{
  resident:RealmResident;point:Point;scale:number;foreground?:Foreground;
}){
  const canvas=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{
    const ctx=canvas.current?.getContext('2d');
    if(!ctx)return;
    ctx.clearRect(0,0,width,height);
    paintRealmResident(ctx,resident,width/2,feet);
    if(foreground){
      const {at,unit,shapes}=foreground;
      ctx.save();
      ctx.imageSmoothingEnabled=false;
      ctx.globalCompositeOperation='destination-out';
      ctx.setTransform(1/unit,0,0,1/unit,width/2-at.x/unit,feet-at.y/unit);
      for(const shape of shapes)paintPlacedBlock(ctx,shape);
      ctx.restore();
    }
  },[resident.id,resident.people,foreground]);
  return <canvas ref={canvas} className="realm-atlas-resident" width={width} height={height} role="img"
    aria-label={`${resident.name}, ${realmPeopleName(resident.people)}`}
    style={{left:point.x*100+'%',top:point.y*100+'%',width:width*scale*100+'%',
      transform:`translate(-50%, ${-feet/height*100}%)`}}/>;
}
