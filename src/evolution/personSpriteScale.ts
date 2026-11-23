// Keep a consistent footprint as the camera magnifies the map.
export const ATLAS_PERSON_SIZE={width:3,height:5} as const;

export function personSpriteSize(zoom:number,focused:boolean):
  {width:number;height:number;detailed:boolean}{
  void focused;
  return {...ATLAS_PERSON_SIZE,detailed:zoom>=5};
}
