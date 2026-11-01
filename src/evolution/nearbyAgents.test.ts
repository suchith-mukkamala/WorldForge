import {describe,expect,it} from 'vitest';
import {indexAgentsByTile,nearbyAgents} from './nearbyAgents';
import {createWorld} from './engine';
import {advanceEconomy} from './economy';

describe('v2.4.2 — bounded settlement-neighborhood lookup',()=>{
  it('returns exactly the same agents, in the same order, as a full scan',()=>{
    const width=75;
    const agents=Array.from({length:2800},(_,id)=>({id,
      x:(id*27+Math.floor(id/9))%width,
      y:(id*31+Math.floor(id/11))%70}));
    const index=indexAgentsByTile(agents,width);
    for(let id=0;id<60;id++){
      const town={x:(id*13)%width,y:(id*19)%70};
      const radius=id%2===0?6:7;
      const expected=agents.filter(a=>Math.max(Math.abs(a.x-town.x),
        Math.abs(a.y-town.y))<=radius);
      expect(nearbyAgents(index,width,town,radius)).toEqual(expected);
    }
    expect(nearbyAgents(index,width,{x:0,y:0},0)).toEqual(
      agents.filter(a=>a.x===0&&a.y===0));
  });

  it('never applies an off-camera population cap',()=>{
    const agents=Array.from({length:5000},(_,id)=>({id,x:2,y:3}));
    const index=indexAgentsByTile(agents,20);
    expect(nearbyAgents(index,20,{x:2,y:3},7)).toHaveLength(5000);
    expect(nearbyAgents(index,20,{x:19,y:19},7)).toHaveLength(0);
  });

  it('runs a crowded 2,400-person town with repeatable economic decisions',()=>{
    const world=createWorld({seed:24142,size:'small'});
    const template=world.agents.find(a=>a.x>=3&&a.y>=3&&
      a.x<world.width-3&&a.y<world.height-3)!;
    const town={id:world.nextSettlementId++,name:'Crowdville',
      species:template.species,x:template.x,y:template.y,
      founded:0,population:2400,stores:25,emptyYears:0};
    world.settlements=[town];
    world.year=1; // no dispatch on this accounting year
    world.agents=Array.from({length:2400},(_,i)=>({...template,
      id:i+1,age:42,energy:85,health:95,
      x:town.x+(i%5)-2,y:town.y+(Math.floor(i/5)%5)-2,
      work:undefined}));
    const mirror=structuredClone(world);
    advanceEconomy(world);
    advanceEconomy(mirror);
    expect(world.agents).toHaveLength(2400);
    expect(world.agents.map(a=>a.work)).toEqual(mirror.agents.map(a=>a.work));
    expect(world.settlements[0].economy).toEqual(mirror.settlements[0].economy);
    expect(world.agents.some(a=>a.work!==undefined)).toBe(true);
  });
});
