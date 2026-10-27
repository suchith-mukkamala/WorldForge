import {describe,expect,it} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createWorld,isWorld} from './engine';
import {PixelPortrait} from './PixelPortrait';
import {PeopleDirectory} from './PeopleDirectory';
import {appearanceFor,paintBuilding,paintPerson,paintTerrain,spriteKey} from './pixelArt';
import {BUILDING_TYPES,prepareInfrastructure} from './construction';

describe('WorldForge v1.1 — faithful, detailed pixel art',()=>{
  it('gives species distinct, deterministic silhouettes and keeps RNG untouched',()=>{
    const w=createWorld({size:'small',seed:919});
    const original=JSON.stringify(w);
    const people=w.agents.slice(0,4);
    for(const a of people){
      expect(appearanceFor(a)).toEqual(appearanceFor(a));
      expect(spriteKey(a)).toBe(spriteKey(a));
    }
    expect(new Set(people.map(a=>appearanceFor(a).skin)).size).toBeGreaterThan(1);
    expect(JSON.stringify(w)).toBe(original);
    expect(isWorld(w)).toBe(true);
  });

  it('reflects age, career, inheritance and species in a pixel identity',()=>{
    const w=createWorld({size:'small',seed:13});
    const person={...w.agents[0],age:1};
    expect(appearanceFor(person).ageLook).toBe('young');
    const adult={...person,age:40};
    expect(spriteKey(adult)).not.toBe(spriteKey(person));
    const trader={...adult,work:{job:'trader' as const,settlementId:1}};
    expect(appearanceFor(trader).outfit).not.toBe(appearanceFor(adult).outfit);
    expect(spriteKey(trader)).not.toBe(spriteKey(adult));
    const mixed={...adult,ancestry:{human:.5,elf:.5,dwarf:0,demon:0}};
    expect(appearanceFor(mixed).secondary).toBe('elf');
    expect(appearanceFor(mixed).accent).not.toBe(appearanceFor(adult).accent);
  });

  it('renders a real accessible portrait inside individual profiles',()=>{
    const w=createWorld({size:'small',seed:920});
    const a=w.agents[0];
    const portrait=renderToStaticMarkup(createElement(PixelPortrait,
      {person:a,name:'A character'}));
    expect(portrait).toContain('Pixel-art portrait of A character');
    expect(portrait).toContain('width="16" height="22"');
    const page=renderToStaticMarkup(createElement(PeopleDirectory,{world:w,
      selectedId:a.id,onOpen:()=>{},onFavorite:()=>{},onRename:()=>{},
      onFindOnMap:()=>{}}));
    expect(page).toContain('evo-pixel-portrait');
    expect(page).toContain('Pixel-art portrait');
  });

  it('draws unique detailed people, habitats and architecture without world writes',()=>{
    const w=createWorld({size:'small',seed:921});
    prepareInfrastructure(w);
    const pixels:{color:string;area:number}[]=[];
    const recorder={fillStyle:'',fillRect(_x:number,_y:number,width:number,height:number){
      pixels.push({color:recorder.fillStyle,area:width*height});
    }};
    const fake=recorder as unknown as CanvasRenderingContext2D;
    const original=JSON.stringify(w);
    for(const a of w.agents.slice(0,4))paintPerson(fake,a);
    const spritePixels=pixels.length;
    expect(spritePixels).toBeGreaterThan(65);
    paintTerrain(fake,'forest','#337252',2,3,w.settings.seed);
    paintTerrain(fake,'water','#295f80',3,3,w.settings.seed);
    expect(pixels.length).toBeGreaterThan(spritePixels+4);
    const b={id:1,type:'market' as const,x:12,y:15,culture:'human' as const,
      stage:'complete' as const,progress:100,condition:100,started:0,
      spent:{wood:11,stone:8,clay:7},labor:19};
    paintBuilding(fake,b);
    expect(pixels.length).toBeGreaterThan(spritePixels+10);
    expect(JSON.stringify(w)).toBe(original);
  });

  it('gives all nine construction types distinct readable pixel silhouettes',()=>{
    const shapes=new Set<string>();
    for(const type of BUILDING_TYPES){
      const cells:string[]=[];
      const brush={fillStyle:'',fillRect(x:number,y:number,width:number,height:number){
        cells.push([x,y,width,height,brush.fillStyle].join(':'));
      }};
      paintBuilding(brush as unknown as CanvasRenderingContext2D,{
        id:1,type,x:5,y:5,culture:'elf',stage:'complete',progress:100,
        condition:100,started:0,spent:{wood:1,stone:1,clay:1},labor:10});
      expect(cells.length).toBeGreaterThan(3);
      shapes.add(cells.join('|'));
    }
    expect(shapes.size).toBe(BUILDING_TYPES.length);
  });
});
