import {useEffect,useRef} from 'react';
import type {PlacedArt} from './atlasBuildingArt';
import {paintPlacedBlock,type BlockView} from './blockScenery';
import {PERSON_PORTRAIT_VIEW} from './pixelArt';
import type {Point} from './motion';
import {realmPeopleName,type RealmResident} from './underworld';
import {paintRealmResident} from './underworldArt';

const width=24,height=34,feet=28,density=3;
export const REALM_ATLAS_PERSON_UNIT=.43;
export const REALM_ATLAS_PERSON_HEIGHT=20*REALM_ATLAS_PERSON_UNIT;

type Foreground={at:Point;unit:number;shapes:readonly PlacedArt[]};

export function RealmAtlasResident({resident,point,scale,foreground,view=PERSON_PORTRAIT_VIEW}:{
  resident:RealmResident;point:Point;scale:number;foreground?:Foreground;view?:BlockView;
}){
  const canvas=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{
    const ctx=canvas.current?.getContext('2d');
    if(!ctx)return;
    ctx.setTransform(density,0,0,density,0,0);
    ctx.clearRect(0,0,width,height);
    paintRealmResident(ctx,resident,width/2,feet,view,1);
    if(foreground){
      const {at,unit,shapes}=foreground;
      ctx.save();
      ctx.imageSmoothingEnabled=false;
      ctx.globalCompositeOperation='destination-out';
      ctx.translate(width/2-at.x/unit,feet-at.y/unit);
      ctx.scale(1/unit,1/unit);
      for(const shape of shapes)paintPlacedBlock(ctx,shape);
      ctx.restore();
    }
  },[resident.id,resident.people,foreground,view]);
  return <canvas ref={canvas} className="realm-atlas-resident" width={width*density} height={height*density} role="img"
    aria-label={`${resident.name}, ${realmPeopleName(resident.people)}`}
    style={{left:point.x*100+'%',top:point.y*100+'%',width:width*scale*100+'%',
      transform:`translate(-50%, ${-feet/height*100}%)`}}/>;
}
