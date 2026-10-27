import {useEffect,useRef} from 'react';
import {SPECIES_INFO} from './engine';
import {paintPerson,PERSON_SPRITE_HEIGHT,PERSON_SPRITE_WIDTH,
  spriteKey,type PixelPerson} from './pixelArt';

/** Profile, atlas and map art use the same deterministic sprite recipe. */
export function PixelPortrait({person,name,compact=false}:{person:PixelPerson;
  name:string;compact?:boolean}){
  const canvas=useRef<HTMLCanvasElement>(null);
  const key=spriteKey(person);
  useEffect(()=>{
    const ctx=canvas.current?.getContext('2d');if(!ctx)return;
    ctx.clearRect(0,0,PERSON_SPRITE_WIDTH,PERSON_SPRITE_HEIGHT);
    ctx.imageSmoothingEnabled=false;
    paintPerson(ctx,person);
  },[key]);
  return <span className={'evo-pixel-portrait'+(compact?' is-compact':'')}
    style={{borderColor:SPECIES_INFO[person.species].color+'88'}}>
    <canvas ref={canvas} width={PERSON_SPRITE_WIDTH}
      height={PERSON_SPRITE_HEIGHT} role="img"
      aria-label={'Pixel-art portrait of '+name+', '+SPECIES_INFO[person.species].name}/>
    <span className="evo-pixel-portrait-ground" aria-hidden="true"/>
  </span>;
}
