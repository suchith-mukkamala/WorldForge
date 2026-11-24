import type {LandAnimal} from './surfaceLife';

// Keep a consistent footprint as the camera magnifies the map.
export const ATLAS_PERSON_SIZE={width:3,height:5} as const;
export const DEPTH_PERSON_UNIT=.25;
export const OVERHEAD_PERSON_UNIT=.34;
export const DESCENT_PERSON_UNIT=1.02;

const animalSize:Record<LandAnimal,number>={grazer:.83,browser:.86,wader:.64,flock:.46};

/** The animal model's dimensions are measured in the same cube units as
 * an adult person. A fawn or chick keeps its own smaller proportions. */
export function animalBlockUnit(kind:LandAnimal,young:boolean,personUnit:number){
  return personUnit*animalSize[kind]*(young?.70:1);
}
