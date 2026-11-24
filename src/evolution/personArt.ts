import {blockAnimal,blockCharacter,characterModelKey,type CharacterLook} from './blockModels';
import {blockBuildingArt,createBlockStamp,DESCENT_BLOCK_VIEW,paintPlacedBlock,placeBlockArt,
  type BlockImage,type BlockStamp,type BlockView} from './blockScenery';
import type {Facing,Point,SpritePose} from './motion';
import {personBlockLook,type PixelPerson} from './pixelArt';
import {animalBlockUnit,DESCENT_PERSON_UNIT} from './personSpriteScale';
import type {AnimalPose,AnimalTrack} from './surfaceLife';

const SOURCE_UNIT=1.16;
const personStamps=new Map<string,BlockImage>();
const animalStamps=new Map<string,BlockStamp>();

/** Cache the projected geometry independently of world position and zoom.
 * The same high-resolution stamp can serve every close-up of a scene. */
export function paintVoxelCharacter(ctx:CanvasRenderingContext2D,look:CharacterLook,at:Point,
  view:BlockView,unit:number,facing:Facing='south',step:0|1|2|3=0,pose:SpritePose='idle'){
  const key=characterModelKey(look,facing,step,pose)+'|'+view.key;
  let art=personStamps.get(key);
  if(!art){
    const stamp=createBlockStamp(blockCharacter(look,facing,step,pose),view,SOURCE_UNIT);
    if(!stamp)return;
    const {image,anchor,density}=stamp;
    art={image,anchor,density};
    if(personStamps.size>=720){
      const oldest=personStamps.keys().next().value;
      if(oldest!==undefined)personStamps.delete(oldest);
    }
    personStamps.set(key,art);
  }
  ctx.fillStyle='#172a2c63';
  ctx.fillRect(at.x-3.5*unit,at.y-.45*unit,7*unit,1.6*unit);
  ctx.fillStyle='#19242b8a';
  ctx.fillRect(at.x-2.2*unit,at.y,4.4*unit,1.1*unit);
  ctx.imageSmoothingEnabled=false;
  paintPlacedBlock(ctx,placeBlockArt(art,at,unit/SOURCE_UNIT));
}

export function paintVoxelPerson(ctx:CanvasRenderingContext2D,person:PixelPerson,at:Point,
  view=DESCENT_BLOCK_VIEW,unit=DESCENT_PERSON_UNIT,facing:Facing='south',step:0|1|2|3=0,pose:SpritePose='idle'){
  paintVoxelCharacter(ctx,personBlockLook(person),at,view,unit,facing,step,pose);
}

/** Wildlife is rasterized at full detail and placed at its real fraction of
 * a person's scale. Small birds keep their silhouettes in close-up views. */
export function animalSprite(animal:AnimalTrack,pose:AnimalPose,at:Point,view:BlockView,
  personUnit:number,trackDepth=false){
  const model=blockAnimal(animal.kind,pose.facing,pose.stride,animal.variant,animal.young);
  const art=blockBuildingArt(animalStamps,model,view,SOURCE_UNIT,trackDepth);
  return art&&placeBlockArt(art,at,animalBlockUnit(animal.kind,animal.young,personUnit)/SOURCE_UNIT);
}
