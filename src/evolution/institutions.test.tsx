import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {createWorld,isWorld,stepWorld,type Settlement} from './engine';
import {prepareInfrastructure} from './construction';
import {advanceEconomy,createEconomy,stockOf} from './economy';
import {advanceInstitutions,accordBetween,guildOf,validInstitutions} from './institutions';
import {SettlementView} from './SettlementView';
import {PeopleDirectory} from './PeopleDirectory';
import {compactWorld,readSavedWorld} from './storage';

function peopleWorld(){
  const w=createWorld({size:'small',seed:1820,
    starting:{human:8,elf:5,dwarf:0,demon:0}});
  const humans=w.agents.filter(a=>a.species==='human');
  const elves=w.agents.filter(a=>a.species==='elf');
  humans.forEach((a,i)=>{
    a.x=20+i%4;a.y=20+Math.floor(i/4);a.age=25;
    a.energy=95;a.health=95;
    a.development!.values.community=82;
    a.development!.values.independence=20;
  });
  elves.forEach((a,i)=>{
    a.x=38+i%3;a.y=20+Math.floor(i/3);a.age=36;
    a.energy=95;a.health=95;
    a.development!.values.community=84;
    a.development!.values.independence=25;
  });
  for(let y=18;y<=24;y++)for(let x=17;x<=43;x++)
    w.tiles[y*w.width+x]={biome:'plains',food:7};
  const west:Settlement={id:w.nextSettlementId++,x:21,y:21,name:'Masonsbridge',
    species:'human',population:8,stores:40,founded:0,emptyYears:0,
    economy:createEconomy()};
  const east:Settlement={id:w.nextSettlementId++,x:39,y:21,name:'Starhaven',
    species:'elf',population:5,stores:40,founded:0,emptyYears:0,
    economy:createEconomy()};
  w.settlements=[west,east];prepareInfrastructure(w);
  return {w,west,east,humans,elves};
}

describe('WorldForge v1.0 — autonomous guilds and diplomacy',()=>{
  it('forms a voluntary worker guild and transfers real training to its members',()=>{
    const {w,west,humans}=peopleWorld();w.year=12;
    for(const a of humans.slice(0,4))
      a.work={job:'miner',settlementId:west.id};
    humans[3].development!.values.independence=95; // A dissenter stays independent.
    advanceInstitutions(w);
    const guild=w.institutions!.guilds.find(g=>g.job==='miner')!;
    expect(guild).toBeDefined();
    expect(guild.members).toHaveLength(3);
    expect(guild.members).not.toContain(humans[3].id);
    expect(guildOf(w,humans[0].id)?.id).toBe(guild.id);
    const before=humans[0].development!.skills.craft;
    w.year=13;advanceInstitutions(w);
    expect(humans[0].development!.skills.craft).toBeGreaterThan(before);
    expect(guild.leaderId).toBeGreaterThan(0);
    expect(guild.treasury).toBeGreaterThan(0);
    expect(validInstitutions(w)).toBe(true);
    const profile=renderToStaticMarkup(<PeopleDirectory world={w}
      selectedId={humans[0].id} onOpen={()=>{}} onFavorite={()=>{}}
      onRename={()=>{}} onFindOnMap={()=>{}}/>);
    expect(profile).toContain('GUILD MEMBERSHIP');
    expect(profile).toContain('Miner');
  });

  it('allows two different species to negotiate accords, aid, and embargoes',()=>{
    const {w,west,east}=peopleWorld();w.year=20;
    w.tradeRelations=[{a:west.id,b:east.id,completed:5,
      failures:0,trust:70,lastYear:18}];
    advanceInstitutions(w);
    expect(accordBetween(w,west.id,east.id)?.kind).toBe('trade');
    w.year++;w.tradeRelations[0].completed=9;w.tradeRelations[0].trust=91;
    advanceInstitutions(w);
    expect(accordBetween(w,west.id,east.id)?.kind).toBe('aid');
    w.year++;w.tradeRelations[0].trust=10;
    w.tradeRelations[0].disputeUntil=w.year+15;
    advanceInstitutions(w);
    expect(accordBetween(w,west.id,east.id)?.kind).toBe('embargo');
    expect(w.events.some(e=>e.type==='diplomacy'&&
      e.message.includes('embargo'))).toBe(true);
    expect(validInstitutions(w)).toBe(true);
    const html=renderToStaticMarkup(<SettlementView world={w}
      selectedId={west.id} playing={false} onTogglePlay={()=>{}}
      onFindOnMap={()=>{}} onAdvance={()=>{}}/>);
    expect(html).toContain('EMBARGO ACCORD');
    expect(html).toContain('WORKER GUILDS');
  });

  it('physically sends emergency provisions under a mutual-aid treaty, free to buyer',()=>{
    const {w,west,east,humans}=peopleWorld();w.year=21;
    west.economy!.food=255;east.economy!.food=0;east.economy!.coins=0;
    west.infrastructure!.stock.wood=40;
    w.institutions={guilds:[],nextGuildId:1,
      accords:[{a:west.id,b:east.id,kind:'aid',since:20,support:85}]};
    for(const a of humans)a.work=undefined;
    advanceEconomy(w);
    const aid=w.shipments?.find(t=>t.good==='food'&&t.destinationId===east.id);
    expect(aid).toBeDefined();
    expect(aid!.payment).toBe(0);
    expect(stockOf(east,'food')).toBe(0);
    expect(w.events.some(e=>e.message.includes('emergency aid'))).toBe(true);
    const carrier=w.agents.find(a=>a.id===aid!.carrierId)!;
    carrier.x=east.x;carrier.y=east.y;
    w.year++;
    advanceEconomy(w);
    expect(east.economy!.coins).toBe(0);
    expect(stockOf(east,'food')).toBeGreaterThan(0);
    expect(east.economy!.imports).toBe(1);
  });

  it('upgrades pre-institution worlds deterministically without breaking saves',()=>{
    const {w}=peopleWorld();
    w.institutions=undefined;
    expect(isWorld(w)).toBe(true);
    const a=stepWorld(w),b=stepWorld(w);
    expect(a).toEqual(b);
    expect(a.institutions).toBeDefined();
    expect(isWorld(a)).toBe(true);
    expect(readSavedWorld(compactWorld(a))).toEqual(a);
  });
});
