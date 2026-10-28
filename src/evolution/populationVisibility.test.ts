import {describe,it,expect} from 'vitest';
import {createWorld,type Agent} from './engine';
import {advanceWorldDays} from './calendar';
import {isVisuallyIndoors,populationScene,renderedPopulation} from './populationVisibility';

function fixture(){
  const world=createWorld({seed:104729,size:'small'});
  const base=world.agents[0];
  if(!base)throw Error('Fixture should include agents');
  return {world,base};
}
describe('v1.8 presentation-only population',()=>{
  it('limits dense crowds with deterministic representatives and preserves focus',()=>{
    const {world,base}=fixture();
    const agents=Array.from({length:600},(_,i)=>({...base,id:i+1,x:8,y:8}));
    const scene=populationScene(world);
    const view={bounds:{minX:0,minY:0,maxX:30,maxY:30},zoom:4,
      maxVisible:24,focusId:550};
    const first=renderedPopulation(agents,scene,view);
    expect(first.length).toBeLessThanOrEqual(3);
    expect(first.some(a=>a.id===550)).toBe(true);
    expect(renderedPopulation([...agents].reverse(),scene,view)
      .map(a=>a.id)).toEqual(first.map(a=>a.id));
    expect(agents.length).toBe(600);
  });
  it('treats only compatible work near completed buildings as visually indoors',()=>{
    const {world,base}=fixture();
    const building={id:1,type:'workshop' as const,x:8,y:8,
      culture:'human' as const,stage:'complete' as const,progress:100,
      condition:100,started:0,spent:{wood:0,stone:0,clay:0},labor:0};
    world.settlements=[{id:1,name:'Test',species:'human',x:8,y:8,
      founded:0,population:1,stores:0,emptyYears:0,
      infrastructure:{land:[],roads:[],stock:{wood:0,stone:0,clay:0},
        buildings:[building],nextBuildingId:2,foundedWithResidents:1}}];
    const scene=populationScene(world);
    const working:Agent={...base,id:101,x:8,y:8,
      cognition:undefined,dailyLife:{activity:'work',reason:'Working',
        year:0,day:0,fatigue:0,socialNeed:0,morale:50,
        acquaintances:[],encounters:[]}};
    const traveling:Agent={...working,id:102,
      dailyLife:{...working.dailyLife!,activity:'travel'}};
    expect(isVisuallyIndoors(working,scene)).toBe(true);
    expect(isVisuallyIndoors(traveling,scene)).toBe(false);
    const view={bounds:{minX:0,minY:0,maxX:20,maxY:20},zoom:4};
    expect(renderedPopulation([working,traveling],scene,view).map(a=>a.id))
      .toEqual([102]);
    expect(renderedPopulation([working,traveling],scene,{...view,focusId:101})
      .map(a=>a.id)).toContain(101);
    world.settlements[0].infrastructure!.buildings[0].stage='foundation';
    expect(isVisuallyIndoors(working,populationScene(world))).toBe(false);
  });
  it('culls off-screen agents without touching the world state',()=>{
    const {world,base}=fixture();
    const agents=[{...base,id:101,x:2,y:2},{...base,id:102,x:70,y:50}];
    const before=JSON.stringify(agents);
    const list=renderedPopulation(agents,populationScene(world),{
      bounds:{minX:0,minY:0,maxX:10,maxY:10},zoom:1});
    expect(list.map(a=>a.id)).toEqual([101]);
    expect(JSON.stringify(agents)).toBe(before);
  });
  it('camera and crowd queries have no impact on deterministic simulation',()=>{
    const {world}=fixture();
    const scene=populationScene(world);
    renderedPopulation(world.agents,scene,{
      bounds:{minX:0,minY:0,maxX:20,maxY:20},zoom:5});
    const a=advanceWorldDays(world,7);
    renderedPopulation(world.agents,scene,{
      bounds:{minX:40,minY:20,maxX:80,maxY:60},zoom:1,focusId:1});
    const b=advanceWorldDays(world,7);
    expect(a).toEqual(b);
  });
});
