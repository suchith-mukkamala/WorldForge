import {useEffect,useRef} from 'react';
import type {Point} from './motion';
import {realmPeopleName,type RealmResident} from './underworld';
import {paintRealmResident} from './underworldArt';

const width=12,height=22,feet=19;
export const REALM_ATLAS_PERSON_UNIT=.48;
export const REALM_ATLAS_PERSON_HEIGHT=feet*REALM_ATLAS_PERSON_UNIT;

export function RealmAtlasResident({resident,point,scale}:{resident:RealmResident;point:Point;scale:number}){
  const canvas=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{
    const ctx=canvas.current?.getContext('2d');
    if(!ctx)return;
    ctx.clearRect(0,0,width,height);
    paintRealmResident(ctx,resident,width/2,feet);
  },[resident.people]);
  return <canvas ref={canvas} className="realm-atlas-resident" width={width} height={height} role="img"
    aria-label={`${resident.name}, ${realmPeopleName(resident.people)}`}
    style={{left:point.x*100+'%',top:point.y*100+'%',width:width*scale*100+'%',
      transform:`translate(-50%, ${-feet/height*100}%)`}}/>;
}
