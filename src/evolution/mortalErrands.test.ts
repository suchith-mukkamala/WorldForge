import {beforeAll,describe,expect,it} from 'vitest';
import {createWorld,isWorld,type World} from './engine';
import {advanceWorldDays} from './calendar';
import {createMortal} from './divineDescent';
import {adventureDistance,adventureMapFor,adventureRegion,useAdventureGate} from './adventureMap';
import {mortalTileCapacity} from './mortalGameplay';
import {abandonErrand,acceptErrand,availableErrands,buyMeal,deliverErrand,errandObjective,
  gatherErrand,journalFor,noticeBoard} from './mortalErrands';
import {ERRAND_AMOUNT,errandReward,type Errand} from './errandRecords';
import {compactWorld,readSavedWorld} from './storage';
import {stockOf} from './economy';
import type {Point} from './motion';

let settled:World;
beforeAll(()=>{
  settled=createMortal(advanceWorldDays(createWorld({seed:108,size:'small',
    layout:'archipelago'}),365*6),{name:'Mira Reed',species:'human',background:'scout',
    appearance:{skin:0,hair:0,hairStyle:0,outfit:'wanderer'}}).world;
});
const actor=(world:World)=>world.agents.find(agent=>agent.id===world.descent?.agentId)!;
const town=(world:World,id:number)=>world.settlements.find(settlement=>settlement.id===id)!;
const region=(world:World)=>adventureRegion(world,adventureMapFor(world),actor(world));
const objective=(world:World)=>errandObjective(world,adventureMapFor(world),
  region(world),journalFor(world).active!);
function nextTo(world:World,point:Point):World{
  const scene=region(world),player=actor(world);
  const spots=[point,...[[-1,0],[0,1],[1,0],[0,-1],[-1,-1],[-1,1],[1,-1],[1,1]]
    .map(([x,y])=>({x:point.x+x,y:point.y+y}))];
  const spot=spots.find(p=>p.x>=0&&p.x<world.width&&p.y>=0&&p.y<world.height&&
    scene.area.has(p.y*world.width+p.x)&&world.tiles[p.y*world.width+p.x].biome!=='water'&&
    world.agents.filter(a=>a.id!==player.id&&a.x===p.x&&a.y===p.y).length<
      mortalTileCapacity(world,p.x,p.y));
  if(!spot)throw Error('This errand site has no space for the mortal');
  return {...world,agents:world.agents.map(a=>a.id===player.id?{...a,...spot}:a)};
}
const atBoard=(world:World)=>nextTo(world,noticeBoard(world,region(world))!);

describe('town errands',()=>{
  it('gathers real food and pays once when the mortal returns to the board',()=>{
    const initial=atBoard(settled),from=region(initial).settlement!;
    const offer=availableErrands(initial,region(initial)).find(e=>e.kind==='forage')!;
    expect(offer).toBeDefined();
    const accepted=acceptErrand(initial,offer).world;
    expect(acceptErrand(accepted,offer).world).toBe(accepted);
    expect(deliverErrand(accepted).world).toBe(accepted);
    expect(gatherErrand(accepted).world).toBe(accepted);
    const patch=objective(accepted).point!;
    const patchIndex=patch.y*initial.width+patch.x;
    const field=nextTo(accepted,patch);
    const collected=gatherErrand(field).world;
    expect(collected.tiles[patchIndex].food)
      .toBeCloseTo(initial.tiles[patchIndex].food-ERRAND_AMOUNT);
    expect(gatherErrand(collected).world).toBe(collected);
    const arrived=atBoard(collected),finished=deliverErrand(arrived).world;
    expect(town(finished,from.id).economy!.food).toBeCloseTo(from.economy!.food+ERRAND_AMOUNT);
    expect(town(finished,from.id).economy!.coins).toBe(from.economy!.coins-errandReward(offer));
    expect(journalFor(finished).coins).toBe(errandReward(offer));
    expect(finished.events.at(-1)?.message).toContain('brought 3 food');
    expect(deliverErrand(finished).world).toBe(finished);
    expect(availableErrands(finished,region(finished))).not.toContainEqual(offer);
    expect(availableErrands(advanceWorldDays(finished,7),region(finished))).toContainEqual(offer);
    expect(readSavedWorld(compactWorld(finished))).toEqual(finished);
  });

  it('carries supplies across a ferry and credits the recipient after a reload',()=>{
    const initial=atBoard(settled),from=region(initial).settlement!;
    const offer=availableErrands(initial,region(initial)).find(e=>
      e.kind==='delivery') as Extract<Errand,{kind:'delivery'}>;
    expect(offer).toBeDefined();
    const loaded=acceptErrand(initial,offer).world;
    expect(stockOf(town(loaded,from.id),offer.good))
      .toBeCloseTo(stockOf(from,offer.good)-ERRAND_AMOUNT);
    const restored=readSavedWorld(compactWorld(loaded))!;
    const dock=objective(restored).point!;
    const embark=nextTo(restored,dock),scene=region(embark);
    const ferry=scene.gates.find(g=>g.ferry&&adventureDistance(g.point,dock)===0)!;
    const arrived=useAdventureGate(embark,scene,actor(embark),ferry);
    expect(arrived.moved).toBe(true);
    expect(region(arrived.world).settlement?.id).toBe(offer.to);
    expect(journalFor(arrived.world).active?.carrying).toBe(true);
    const finished=deliverErrand(atBoard(arrived.world)).world;
    const receiving=town(initial,offer.to);
    expect(stockOf(town(finished,offer.to),offer.good))
      .toBeCloseTo(stockOf(receiving,offer.good)+ERRAND_AMOUNT);
    expect(journalFor(finished).coins).toBe(6);
    expect(isWorld(finished)).toBe(true);
    expect(initial.rngState).toBe(finished.rngState);
  });

  it('returns canceled supplies at their origin without paying a reward',()=>{
    const initial=atBoard(settled),from=region(initial).settlement!;
    const offer=availableErrands(initial,region(initial)).find(e=>
      e.kind==='delivery') as Extract<Errand,{kind:'delivery'}>;
    const aborted=abandonErrand(acceptErrand(initial,offer).world).world;
    expect(stockOf(town(aborted,from.id),offer.good)).toBe(stockOf(from,offer.good));
    expect(journalFor(aborted).active).toBeUndefined();
    expect(journalFor(aborted).coins).toBe(0);
  });

  it('buys a meal from real town stock without overdrawing the purse',()=>{
    const initial=atBoard(settled),from=region(initial).settlement!.id;
    const funded:World={...initial,
      descent:{...initial.descent!,journal:{coins:2,history:[]}},
      settlements:initial.settlements.map(s=>s.id!==from?s:{
        ...s,economy:{...s.economy!,food:5},
      }),
      agents:initial.agents.map(a=>a.id===actor(initial).id?{...a,energy:60}:a)};
    const fed=buyMeal(funded).world;
    expect(actor(fed).energy).toBe(78);
    expect(town(fed,from).economy!.food).toBe(4);
    expect(town(fed,from).economy!.coins).toBe(town(funded,from).economy!.coins+2);
    expect(journalFor(fed).coins).toBe(0);
    expect(buyMeal(fed).world).toBe(fed);
    expect(isWorld({...fed,descent:{...fed.descent!,
      journal:{...journalFor(fed),coins:-1}}})).toBe(false);
  });
});
