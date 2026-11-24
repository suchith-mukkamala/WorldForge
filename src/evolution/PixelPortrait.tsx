import {useEffect,useRef} from 'react';
import type {CSSProperties} from 'react';
import {SPECIES_INFO} from './engine';
import {PERSON_SPRITE_HEIGHT,PERSON_SPRITE_WIDTH,PERSON_PORTRAIT_VIEW,PERSON_PORTRAIT_FEET,PERSON_PORTRAIT_UNIT,
  spriteKey,type PixelPerson} from './pixelArt';
import {paintVoxelPerson} from './personArt';
import {INNATE_TRAIT_INFO,TRAIT_DOMAIN_INFO} from './innateTraits';

const DENSITY=3;
/** Portraits show the same cube body used on the map at a closer camera angle. */
export function PixelPortrait({person,name,compact=false}:{person:PixelPerson;
  name:string;compact?:boolean}){
  const canvas=useRef<HTMLCanvasElement>(null);
  const key=spriteKey(person);
  const gift=person.innateTrait?INNATE_TRAIT_INFO[person.innateTrait]:undefined;
  const glow=gift?TRAIT_DOMAIN_INFO[gift.domain].color:'#b8e8ce';
  useEffect(()=>{
    const ctx=canvas.current?.getContext('2d');if(!ctx)return;
    ctx.setTransform(DENSITY,0,0,DENSITY,0,0);
    ctx.clearRect(0,0,PERSON_SPRITE_WIDTH,PERSON_SPRITE_HEIGHT);
    paintVoxelPerson(ctx,person,PERSON_PORTRAIT_FEET,PERSON_PORTRAIT_VIEW,PERSON_PORTRAIT_UNIT);
  },[key]);
  return <span className={'evo-pixel-portrait'+(compact?' is-compact':'')+
      (person.awakening?' is-awakened':'')}
    style={{borderColor:SPECIES_INFO[person.species].color+'88',
      '--awaken-color':glow} as CSSProperties}>
    <canvas ref={canvas} width={PERSON_SPRITE_WIDTH*DENSITY}
      height={PERSON_SPRITE_HEIGHT*DENSITY} role="img"
      aria-label={'Pixel-art portrait of '+name+', '+SPECIES_INFO[person.species].name+
        (person.awakening?', awakened innate gift':'')}/>
    <span className="evo-pixel-portrait-ground" aria-hidden="true"/>
  </span>;
}
