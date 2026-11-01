import {describe,expect,it} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createWorld,type Agent,type Settlement,type World} from './engine';
import {initialDailyLife,advanceWeeklyLife} from './dailyLife';
import {MortalInterior} from './MortalInterior';
import {livingHousehold,nearestIndoorResident} from './livingHouseholds';
import {INTERIOR_DOOR,INTERIOR_TEMPLATES,moveInside} from './mortalInteriors';
import {interactWithMortal} from './mortalGameplay';
import type {Building} from './construction';
import type {MortalBuilding} from './mortalGameplay';

const fixture=()=>{
  const initial=createWorld({seed:51621,size:'small'});
  const raw=initial.agents.slice(0,3);
  const home={x:raw[0].x,y:raw[0].y};
  const people=raw.map((person,index):Agent=>({...person,
    age:index===1?5:30,
    x:index===2?home.x+4:home.x,y:home.y,
    energy:70,health:90,
    dailyLife:{...initialDailyLife(),activity:index===0?'care':'socialize'},
    development:{...person.development!,householdId:808,
      empathy:90,values:{...person.development!.values,community:90}},
  }));
  const building:Building={id:918,type:'house',x:home.x,y:home.y,
    householdId:808,culture:'human',stage:'complete',progress:100,
    condition:90,started:initial.year,
    spent:{wood:6,stone:2,clay:2},labor:15};
  const settlement:Settlement={id:818,name:'Oak Nest',species:'human',
    x:home.x,y:home.y,founded:initial.year,population:3,stores:12,
    emptyYears:0,infrastructure:{land:[],roads:[],buildings:[building],
      stock:{wood:10,stone:10,clay:10},nextBuildingId:919,
      foundedWithResidents:3}};
  const world:World={...initial,agents:people,settlements:[settlement],
    households:[{id:808,formed:initial.year,home,members:people.map(a=>a.id),
      caregivers:[people[0].id],culture:'human',
      residence:{settlementId:818,buildingId:918}}]};
  const site:MortalBuilding={building,settlementId:818,
    settlementName:'Oak Nest',entrance:home,distance:0};
  return {world,site,people};
};

describe('v2.6.1 — living households',()=>{
  it('shows only real, physically nearby household members',()=>{
    const {world,site,people}=fixture();
    const room=livingHousehold(world,site);
    expect(room.members.map(a=>a.id)).toEqual(people.map(a=>a.id));
    expect(room.present.map(p=>p.agent.id)).toEqual(people.slice(0,2).map(a=>a.id));
    expect(room.away.map(a=>a.id)).toEqual([people[2].id]);
    const cells=new Set(room.present.map(p=>`${p.position.x}:${p.position.y}`));
    expect(cells.size).toBe(room.present.length);
    for(const {position} of room.present){
      expect(INTERIOR_TEMPLATES.house.props.some(prop=>
        prop.kind!=='rug'&&prop.x===position.x&&prop.y===position.y)).toBe(false);
    }
    // Occupants keep their positions while the player moves; the controller
    // rejects walking directly through someone instead of teleporting them.
    const playerAt=room.present[0].position;
    const from={x:playerAt.x,y:playerAt.y+1};
    expect(livingHousehold(world,site).present).toEqual(room.present);
    expect(moveInside('house',from,0,-1,cells)).toEqual(from);
    expect(nearestIndoorResident(world,site,from)?.agent.id).toBe(people[0].id);
    expect(room.present.some(p=>p.action==='Caring for family')).toBe(true);
  });

  it('never turns remote relatives, visitors or unassigned buildings into NPC copies',()=>{
    const {world,site,people}=fixture();
    const solo={...world,agents:world.agents.map(a=>({...a,x:a.x+7}))};
    expect(livingHousehold(solo,site).present).toHaveLength(0);
    expect(livingHousehold(solo,site).away).toHaveLength(3);
    expect(livingHousehold(world,{...site,building:{...site.building,
      householdId:98765}}).members).toHaveLength(0);
    expect(livingHousehold(world,{...site,building:{...site.building,
      type:'workshop'}}).present).toHaveLength(0);
    // A descended household member is represented by the controllable player,
    // and must not be drawn twice as another resident.
    const withPlayer={...world,descent:{agentId:people[0].id,
      mode:'mortal' as const,createdYear:world.year}};
    expect(livingHousehold(withPlayer,site).present.map(p=>p.agent.id))
      .not.toContain(people[0].id);
  });

  it('shows family activities and away notices without changing saved agents',()=>{
    const {world,site}=fixture(),before=JSON.stringify(world);
    const markup=renderToStaticMarkup(createElement(MortalInterior,{
      world,site,position:INTERIOR_DOOR,running:false,message:'',
      onExit:()=>{},onToggleTime:()=>{},onAscend:()=>{},
    }));
    expect(markup).toContain('HOUSEHOLD');
    expect(markup).toContain('Caring for family');
    expect(markup).toContain('2 at home');
    expect(markup).toContain('1 away');
    expect(JSON.stringify(world)).toBe(before);
  });

  it('offers dialogue only for residents next to the player',()=>{
    const {world,site,people}=fixture();
    const near=livingHousehold(world,site).present[0].position;
    const markup=renderToStaticMarkup(createElement(MortalInterior,{
      world,site,position:{x:near.x,y:near.y+1},
      targetId:people[0].id,running:false,message:'',
      onSelectResident:()=>{},onTalk:()=>{},onCloseConversation:()=>{},
      onExit:()=>{},onToggleTime:()=>{},onAscend:()=>{},
    }));
    expect(markup).toContain('Speak with a resident inside this home');
    expect(markup).toContain('ASK ABOUT LIFE');
    const far=renderToStaticMarkup(createElement(MortalInterior,{
      world,site,position:INTERIOR_DOOR,targetId:people[0].id,
      running:false,message:'',onTalk:()=>{},
      onExit:()=>{},onToggleTime:()=>{},onAscend:()=>{},
    }));
    expect(far).not.toContain('Speak with a resident inside this home');
  });

  it('uses genuine social encounters for conversations at home',()=>{
    const {world,people}=fixture();
    const playable={...world,descent:{agentId:people[0].id,
      mode:'mortal' as const,createdYear:world.year}};
    const indoor=interactWithMortal(playable,people[1].id,'greet','home');
    const outdoor=interactWithMortal(playable,people[1].id,'greet');
    expect(indoor.accepted).toBe(true);
    expect(indoor.message).toContain('at home');
    const family=indoor.world.agents[0];
    expect(family.dailyLife!.encounters.at(-1)?.detail).toContain('home');
    expect(family.dailyLife!.morale).toBeGreaterThan(
      outdoor.world.agents[0].dailyLife!.morale);
    expect(family.development!.trust).toBeGreaterThan(
      outdoor.world.agents[0].development!.trust);
    expect(interactWithMortal(indoor.world,people[1].id,'help','home').accepted)
      .toBe(false);
  });

  it('does not make infants deliver adult conversations',()=>{
    const {world,site,people}=fixture();
    const baby={...world,agents:world.agents.map(a=>a.id===people[1].id?
      {...a,age:0}:a),descent:{agentId:people[0].id,
      mode:'mortal' as const,createdYear:world.year}};
    const response=interactWithMortal(baby,people[1].id,'ask','home');
    expect(response.accepted).toBe(false);
    expect(response.world).toBe(baby);
    const infant=livingHousehold(baby,site).present.find(p=>
      p.agent.id===people[1].id)!;
    const markup=renderToStaticMarkup(createElement(MortalInterior,{
      world:baby,site,position:{x:infant.position.x,y:infant.position.y+1},
      targetId:people[1].id,running:false,message:'',onTalk:()=>{},
      onExit:()=>{},onToggleTime:()=>{},onAscend:()=>{},
    }));
    expect(markup).toContain('OFFER CARE');
    expect(markup).not.toContain('ASK ABOUT LIFE');
  });

  it('makes home rest, family care and affordable meals real weekly effects',()=>{
    const {world,people}=fixture(),before=JSON.stringify(world);
    const result=advanceWeeklyLife(world,7);
    const noResidence=advanceWeeklyLife({...world,households:[]},7);
    const a=result.agents.find(p=>p.id===people[0].id)!;
    const child=result.agents.find(p=>p.id===people[1].id)!;
    const baseChild=noResidence.agents.find(p=>p.id===people[1].id)!;
    expect(child.energy).toBeGreaterThan(baseChild.energy);
    expect(child.dailyLife!.morale).toBeGreaterThan(baseChild.dailyLife!.morale);
    expect(child.dailyLife!.encounters.some(e=>e.kind==='comfort'&&
      e.withId===a.id)).toBe(true);
    expect(a.development!.skills.care).toBeGreaterThan(
      noResidence.agents.find(p=>p.id===a.id)!.development!.skills.care);
    expect(result.settlements[0].stores).toBeLessThan(world.settlements[0].stores);
    expect(result.agents.find(p=>p.id===people[2].id)!.energy).toEqual(
      noResidence.agents.find(p=>p.id===people[2].id)!.energy);
    expect(JSON.stringify(world)).toBe(before);
  });

  it('cannot create free meals or home benefits in abandoned residences',()=>{
    const {world}=fixture();
    const emptyStores={...world,settlements:world.settlements.map(s=>({...s,
      stores:0}))};
    expect(advanceWeeklyLife(emptyStores,7).settlements[0].stores).toBe(0);
    const unfinished={...world,settlements:world.settlements.map(s=>({...s,
      infrastructure:{...s.infrastructure!,buildings:s.infrastructure!.buildings
        .map(b=>({...b,stage:'frame' as const}))}}))};
    const next=advanceWeeklyLife(unfinished,7);
    const baseline=advanceWeeklyLife({...unfinished,households:[]},7);
    expect(next.agents).toEqual(baseline.agents);
    expect(next.settlements).toEqual(baseline.settlements);
  });
});
