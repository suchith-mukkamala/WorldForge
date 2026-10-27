import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {WorldforgeApp} from './WorldforgeApp';
import {PeopleDirectory} from './PeopleDirectory';
import {DivineCodex} from './DivineCodex';
import {WorldFamily} from './WorldFamily';
import {
  SPECIES_INFO,advanceWorld,createWorld,isWorld,stepWorld,type World,
  type Settlement,
} from './engine';
import {
  appendLifeMoment,cleanIdentityName,codexOf,generatedGivenName,
  isPersonFavorite,knownSettlements,makeLifeRecord,personName,
  registerSettlement,registerSettlementCollapse,renamePerson,renameSettlement,
  togglePersonFavorite,toggleSettlementFavorite,
} from './identity';
import {compactWorld,readSavedWorld} from './storage';

describe('Evolution Lab v0.3: stable identities and personal histories',()=>{
  it('assigns repeatable fantasy names to each founder without changing the RNG',()=>{
    const a=createWorld({seed:1043,size:'small'});
    const b=createWorld({seed:1043,size:'small'});
    expect(a).toEqual(b);
    expect(a.lineage).toHaveLength(a.agents.length);
    for(const r of a.lineage){
      expect(r.name?.length).toBeGreaterThan(1);
      expect(r.house?.length).toBeGreaterThan(1);
      expect(personName(a,r)).toContain(r.name!);
      expect(r.moments?.[0].kind).toBe('arrival');
      expect(r.moments?.[0].year).toBe(0);
      expect(generatedGivenName(a.settings.seed,r.id,r.species)).toBe(r.name);
    }
    expect(isWorld(a)).toBe(true);
  });
  it('passes a family name to children of mixed heritage',()=>{
    const a=advanceWorld(createWorld({seed:73,size:'small',resourceLevel:1.4}),65);
    const children=a.lineage.filter(r=>r.parents?.length===2);
    expect(children.length).toBeGreaterThan(0);
    for(const child of children.slice(0,12)){
      const parent=a.lineage.find(r=>r.id===child.parents![0]);
      if(parent)expect(child.house).toBe(parent.house);
      expect(child.moments?.[0].kind).toBe('birth');
    }
  });
  it('renames a person immutably and keeps the name through death and serialization',()=>{
    const a=createWorld({seed:199,size:'small'}),id=a.agents[0].id;
    const b=renamePerson(a,id,'Astra the Brave');
    expect(b).not.toBe(a);
    expect(personName(b,b.lineage[0])).toBe('Astra the Brave');
    expect(personName(a,a.lineage[0])).not.toBe('Astra the Brave');
    expect(b.lineage[0].moments?.at(-1)?.kind).toBe('renamed');
    const young=b.agents[0];
    const dying:World={...b,agents:b.agents.map(x=>x.id===id?
      {...x,age:SPECIES_INFO[young.species].lifespan*2}:x)};
    const deceased=stepWorld(dying);
    expect(deceased.lineage.find(r=>r.id===id)?.died).toBe(1);
    expect(deceased.lineage.find(r=>r.id===id)?.moments?.at(-1)?.kind).toBe('death');
    expect(personName(deceased,deceased.lineage.find(r=>r.id===id)!))
      .toBe('Astra the Brave');
    expect(readSavedWorld(compactWorld(deceased))).toEqual(deceased);
  });
  it('rejects malformed user names and does not corrupt records',()=>{
    const a=createWorld();
    for(const bad of ['', ' ', '<script>alert(1)</script>', '\u0000hi',
      'x'.repeat(65),'A']){
      expect(cleanIdentityName(bad)).toBeNull();
      expect(renamePerson(a,a.agents[0].id,bad)).toBe(a);
    }
    expect(cleanIdentityName(' Éowyn  Starleaf ')).toBe('Éowyn Starleaf');
    expect(renamePerson(a,-1,'Valid Name')).toBe(a);
  });
  it('keeps bookmarked favorites after death, and can unfollow deceased people',()=>{
    const a=createWorld({seed:911}),id=a.agents[0].id;
    const followed=togglePersonFavorite(a,id);
    expect(isPersonFavorite(followed,id)).toBe(true);
    expect(isPersonFavorite(a,id)).toBe(false);
    const final=stepWorld({...followed,agents:followed.agents.map(x=>
      x.id===id?{...x,age:999}:x)});
    expect(isPersonFavorite(final,id)).toBe(true);
    expect(final.lineage.find(x=>x.id===id)).toBeDefined();
    expect(readSavedWorld(JSON.stringify(final))).toEqual(final);
    expect(isPersonFavorite(togglePersonFavorite(final,id),id)).toBe(false);
  });
  it('records life milestones with bounded history and linked relatives',()=>{
    const w=createWorld(),id=w.agents[0].id,record=w.lineage[0];
    for(let n=0;n<55;n++){
      appendLifeMoment(w,id,{year:0,kind:'courtship',
        text:'Encounter '+n,relatedIds:[w.agents[1].id]});
    }
    expect(record.moments?.length).toBe(40);
    expect(record.moments?.[0].kind).toBe('arrival');
    expect(record.moments?.at(-1)?.text).toBe('Encounter 54');
    expect(isWorld(w)).toBe(true);
  });
  it('can bookmark, rename and archive a settlement independently of the map',()=>{
    const a=createWorld({size:'small'});
    const site=a.agents[0],settlement:Settlement={
      id:1,species:site.species,name:'Riverwatch',
      x:site.x,y:site.y,founded:0,population:4,stores:10,emptyYears:0,
    };
    const w:World={...a,settlements:[settlement]};
    registerSettlement(w,settlement,site.id);
    expect(w.codex?.settlements[0].founderId).toBe(site.id);
    const marked=toggleSettlementFavorite(w,1);
    expect(codexOf(marked).favoriteSettlements).toContain(1);
    const named=renameSettlement(marked,1,'New Riverwatch');
    expect(named.settlements[0].name).toBe('New Riverwatch');
    expect(knownSettlements(named)[0].name).toBe('New Riverwatch');
    const oldName=marked.settlements[0].name;
    expect(oldName).toBe('Riverwatch');
    const after={...named,year:1};
    registerSettlementCollapse(after,after.settlements[0]);
    expect(knownSettlements(after)[0].collapsed).toBe(1);
    expect(knownSettlements(after)).toHaveLength(1);
    expect(codexOf(after).favoriteSettlements).toContain(1);
    expect(isWorld(after)).toBe(false); // must also update annual history for Y1
  });
  it('opens old v0.2.1 saves without inventing names or retroactive memories',()=>{
    const w=createWorld({seed:252});
    const old:World={...w,codex:undefined,
      lineage:w.lineage.map(({name:_,house:__,moments:___,...r})=>r)};
    expect(isWorld(old)).toBe(true);
    const reloaded=readSavedWorld(JSON.stringify(old));
    expect(reloaded).toEqual(old);
    expect(personName(old,old.lineage[0])).toBe(personName(w,w.lineage[0]));
    const next=stepWorld(old);
    expect(next.codex).toBeDefined();
    expect(isWorld(next)).toBe(true);
    expect(old.lineage[0].moments).toBeUndefined();
  });
  it('rejects forged oversized codex arrays and invalid histories from imports',()=>{
    const a=createWorld();
    expect(isWorld({...a,codex:{favoritePeople:[1,1],
      favoriteSettlements:[],settlements:[]}})).toBe(false);
    expect(isWorld({...a,lineage:a.lineage.map((r,i)=>i===0?
      {...r,moments:[{year:-2,kind:'death',text:'Impossible'}]}:r)})).toBe(false);
    expect(isWorld({...a,codex:{favoritePeople:[],
      favoriteSettlements:[],settlements:[{id:1,species:'human',name:'Bad',
        x:100000,y:4,founded:0}]}})).toBe(false);
  });
});

describe('v0.3 visual integration',()=>{
  it('renders People, Families and Divine Codex navigation',()=>{
    const html=renderToStaticMarkup(<WorldforgeApp/>);
    expect(html).toContain('PEOPLE');
    expect(html).toContain('FAMILIES');
    expect(html).toContain('DIVINE CODEX');
    expect(html).toContain('WORLD INSPECTOR');
  });
  it('renders a searchable directory with generated names, filters and favorites',()=>{
    const world=createWorld({seed:431});
    const html=renderToStaticMarkup(<PeopleDirectory world={world}
      selectedId={world.agents[0].id} onOpen={()=>{}} onFavorite={()=>{}}
      onRename={()=>{}} onFindOnMap={()=>{}}/>);
    expect(html).toContain('People of the World');
    expect(html).toContain(personName(world,world.lineage[0]));
    expect(html).toContain('SEARCH PEOPLE');
    expect(html).toContain('SAVE NAME');
    expect(html).toContain('PERSONAL CHRONICLE');
    expect(html).toContain('ADD TO FAVORITES');
  });
  it('displays family names, a multi-generation tree and individual histories',()=>{
    const world=advanceWorld(createWorld({seed:78,size:'small'}),15);
    const html=renderToStaticMarkup(<WorldFamily world={world}
      focusId={world.agents[0]?.id??null}
      onChoose={()=>{}} onShowOnMap={()=>{}} onFavorite={()=>{}} onRename={()=>{}}/>);
    expect(html).toContain('Family Archives');
    expect(html).toContain('PERSONAL HISTORY');
    expect(html).toContain('FAVORITE');
    expect(html).toContain('ANCESTORS');
    expect(html).toContain('RENAME');
  });
  it('displays bookmarked people, archived settlements and the world chronicle',()=>{
    const world=createWorld({seed:44});
    const followed=togglePersonFavorite(world,world.agents[0].id);
    const html=renderToStaticMarkup(<DivineCodex world={followed}
      onOpenPerson={()=>{}} onFavoritePerson={()=>{}}
      onFavoriteSettlement={()=>{}} onRenameSettlement={()=>{}}
      onFindSettlement={()=>{}}/>);
    expect(html).toContain('The Divine Codex');
    expect(html).toContain('PEOPLE YOU FOLLOW');
    expect(html).toContain(personName(followed,followed.lineage[0]));
    expect(html).toContain('FAMILY HOUSES');
    expect(html).toContain('PLACES OF THE WORLD');
  });
});
