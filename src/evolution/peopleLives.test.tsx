import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {createWorld,isWorld,stepWorld,type World} from './engine';
import {PeopleDirectory} from './PeopleDirectory';
import {godModeShortcut} from './appShortcuts';
import {compactWorld,loadBrowserWorldSnapshot,readSavedWorld,
  resolveStartupSave,writeBrowserSnapshot} from './storage';
import {initialCognition} from './mindII';
import {advanceCulture} from './culture';
import {createEconomy} from './economy';

const noop=()=>{};

function memoryStorage(){
  const data=new Map<string,string>();
  return {getItem:(key:string)=>data.get(key)??null,
    setItem:(key:string,value:string)=>{data.set(key,value);},
    removeItem:(key:string)=>{data.delete(key);}};
}
describe('people lives, kin and customs',()=>{
  it('loads a save from before milestones and settlement customs',()=>{
    const fresh=createWorld({seed:42,size:'small',
      starting:{human:4,elf:0,dwarf:0,demon:0}});
    const old=JSON.parse(JSON.stringify(fresh)) as World;
    delete old.culture?.customs;
    for(const record of old.lineage)
      record.moments=record.moments?.filter(moment=>moment.kind!=='milestone');
    const plain=JSON.stringify(old);
    const loaded=readSavedWorld(plain);
    expect(loaded).toEqual(old);
    expect(isWorld(loaded)).toBe(true);
    // The post-#82 browser snapshot path must accept this older plain JSON
    // and must not treat a missing customs field as a corrupt save.
    const browser=memoryStorage();
    expect(writeBrowserSnapshot(browser,plain,40)).toBe('stored');
    expect(loadBrowserWorldSnapshot(browser)).toEqual({world:old,savedAt:40});
    expect(resolveStartupSave({
      localRaw:plain,localTimeRaw:'40',legacyRaw:null,database:null,
      storageBlocked:false,
    })).toEqual({kind:'restored',world:old,source:'local'});
    const packed=compactWorld(old);
    expect(packed.startsWith('{"format":"evo-packed-v3"')).toBe(true);
    expect(readSavedWorld(packed)).toEqual(old);
    const lived=stepWorld(loaded!);
    expect(isWorld(lived)).toBe(true);
    expect(lived.culture?.customs).toBeUndefined();
    expect(readSavedWorld(compactWorld(lived))).toEqual(lived);
  });

  it('leaves the atlas P pause key unused by the People directory',()=>{
    const world=createWorld({seed:15,size:'small',
      starting:{human:1,elf:0,dwarf:0,demon:0}});
    const html=renderToStaticMarkup(createElement(PeopleDirectory,{
      world,selectedId:null,onOpen:noop,onFavorite:noop,onRename:noop,
      onFindOnMap:noop}));
    expect(html).toContain('SEARCH PEOPLE');
    const search={tagName:'INPUT'},rename={tagName:'INPUT'},filter={tagName:'SELECT'};
    expect(godModeShortcut({key:'p',target:search})).toBeNull();
    expect(godModeShortcut({key:'P',target:rename})).toBeNull();
    expect(godModeShortcut({key:'p',target:filter})).toBeNull();
  });

  it('records coming of age when a youth crosses maturity',()=>{
    const world=createWorld({seed:7,size:'small',
      starting:{human:1,elf:0,dwarf:0,demon:0}});
    const youth=world.agents[0];
    youth.age=15;
    const next=stepWorld(world);
    const record=next.lineage.find(item=>item.id===youth.id);
    expect(record?.moments?.some(moment=>moment.kind==='milestone'&&
      moment.text==='Came of age at 16.')).toBe(true);
    expect(isWorld(next)).toBe(true);
  });

  it('writes an ambition into the chronicle on the following year',()=>{
    const world=createWorld({seed:9,size:'small',
      starting:{human:1,elf:0,dwarf:0,demon:0}});
    const person=world.agents[0];
    person.age=40;
    person.cognition=initialCognition();
    person.cognition.ambition={purpose:'explore',since:{year:0,day:4},
      commitment:8,reason:'Finished journeys made unfamiliar places feel necessary.'};
    const next=stepWorld(world);
    const text=next.lineage.find(item=>item.id===person.id)?.moments
      ?.find(moment=>moment.kind==='milestone')?.text??'';
    expect(text.startsWith('Chose a lasting ambition: exploration.')).toBe(true);
    expect(isWorld(next)).toBe(true);
    const again=stepWorld(next);
    const milestones=again.lineage.find(item=>item.id===person.id)?.moments
      ?.filter(moment=>moment.text.startsWith('Chose a lasting ambition'))??[];
    expect(milestones).toHaveLength(1);
  });

  it('rejects a malformed custom and keeps a real one through a save',()=>{
    const world=createWorld({seed:11,size:'small',
      starting:{human:8,elf:0,dwarf:0,demon:0}});
    let camp={x:2,y:2};
    for(let y=2;y<world.height-4&&camp.y===2;y++)for(let x=2;x<world.width-4;x++){
      let open=true;
      for(let dy=0;dy<3&&open;dy++)for(let dx=0;dx<3;dx++)
        if(world.tiles[(y+dy)*world.width+x+dx].biome==='water')open=false;
      if(open){camp={x,y};break;}
    }
    const people=world.agents;
    for(const [index,agent] of people.entries()){
      agent.x=camp.x+index%3;agent.y=camp.y+Math.floor(index/3);agent.age=30;
      agent.development!.values.tradition=80;
      agent.development!.values.community=70;
    }
    world.settlements.push({id:world.nextSettlementId++,x:camp.x,y:camp.y,
      name:'Old Hearth',species:'human',population:8,stores:30,founded:0,
      emptyYears:0,economy:createEconomy()});
    world.year=8;
    world.history.at(-1)!.year=8;
    advanceCulture(world,()=>.5);
    expect(world.culture?.customs?.[0].custom).toBe('ancestors');
    expect(world.culture?.history.some(moment=>moment.kind==='custom')).toBe(true);
    expect(isWorld(world)).toBe(true);
    expect(readSavedWorld(compactWorld(world))).toEqual(world);
    const broken=structuredClone(world);
    broken.culture!.customs![0].custom='destiny' as 'hearth';
    expect(isWorld(broken)).toBe(false);
  });

  it('shows temperament, kin links and the new directory filters',()=>{
    const world=createWorld({seed:15,size:'small',
      starting:{human:2,elf:0,dwarf:0,demon:0}});
    const [parent,child]=world.lineage;
    child.parents=[parent.id,parent.id+9];
    child.generation=1;
    parent.children=[child.id];
    const html=renderToStaticMarkup(createElement(PeopleDirectory,{
      world,selectedId:child.id,onOpen:noop,onFavorite:noop,onRename:noop,
      onFindOnMap:noop}));
    expect(html).toContain('CHARACTER &amp; KIN');
    expect(html).toContain('TEMPERAMENT');
    expect(html).toContain('Parent');
    expect(html).toContain('SETTLEMENT');
    expect(html).toContain('LIFE STAGE');
    expect(html).toContain('AMBITION');
    expect(html).toContain('Age, oldest first');
    expect(html).toContain(parent.name??'');
  });
});
