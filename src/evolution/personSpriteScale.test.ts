import {describe,expect,it} from 'vitest';
import {blockAnimal,blockCharacter,type BlockModel} from './blockModels';
import {blockRasterPixels,depthBlockView,DESCENT_BLOCK_VIEW,OVERHEAD_BLOCK_VIEW,type BlockView} from './blockScenery';
import {createWorld} from './engine';
import {animalBlockUnit,DEPTH_PERSON_UNIT,DESCENT_PERSON_UNIT,OVERHEAD_PERSON_UNIT} from './personSpriteScale';
import {personBlockLook} from './pixelArt';

function projectedSize(model:BlockModel,view:BlockView,unit:number){
  const frame=160,pixels=blockRasterPixels(model,view,unit*5,frame,frame,{x:80,y:128});
  let north=frame,south=0,populated=0;
  for(let index=0;index<pixels.length;index++)if(pixels[index]){
    const y=Math.floor(index/frame);
    north=Math.min(north,y);south=Math.max(south,y);
    populated++;
  }
  return {height:south-north+1,populated};
}

describe('shared cube scale for people and wildlife',()=>{
  const person=createWorld({seed:91,size:'small'}).agents.find(agent=>agent.species==='human')!;
  const view=depthBlockView({yaw:0,pitch:30});
  it('keeps wildlife visibly smaller than an adult in the atlas and in Descend',()=>{
    const character=blockCharacter(personBlockLook({...person,age:32}),'south');
    const cameras=[[view,DEPTH_PERSON_UNIT],[OVERHEAD_BLOCK_VIEW,OVERHEAD_PERSON_UNIT],
      [DESCENT_BLOCK_VIEW,DESCENT_PERSON_UNIT]] as const;
    for(const [projection,unit] of cameras){
      const reference=projectedSize(character,projection,unit);
      for(const kind of ['grazer','browser','wader','flock'] as const){
        const animal=blockAnimal(kind,'east',0,1,false);
        const size=projectedSize(animal,projection,animalBlockUnit(kind,false,unit));
        expect(size.populated).toBeGreaterThan(2);
        expect(size.height).toBeLessThan(reference.height*.83);
        expect(size.populated).toBeLessThan(reference.populated*.74);
        expect(animalBlockUnit(kind,true,unit)).toBeLessThan(animalBlockUnit(kind,false,unit));
      }
    }
  });

  it('has solid body depth, different age silhouettes, and turning footfalls',()=>{
    const look=personBlockLook({...person,age:32});
    const adult=blockCharacter(look),child=blockCharacter({...look,ageLook:'young'});
    expect(Math.max(...adult.faces.map(face=>face.z))).toBeGreaterThan(Math.max(...child.faces.map(face=>face.z)));
    expect(new Set(adult.faces.map(face=>face.direction)).size).toBe(5);
    expect(blockCharacter(look,'west').feet).not.toEqual(adult.feet);
    expect(blockCharacter(look,'south',1,'walk').feet).not.toEqual(adult.feet);
    expect(blockCharacter(look,'south',0,'study').faces.some(face=>face.color==='#ead6a4')).toBe(true);
  });
});
