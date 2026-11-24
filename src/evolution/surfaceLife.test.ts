import {describe,expect,it} from 'vitest';
import {adventureMapFor,adventureRegion} from './adventureMap';
import {blockAnimal,blockFruitTree} from './blockModels';
import {advanceWorldDays} from './calendar';
import {createMortal} from './divineDescent';
import {createWorld} from './engine';
import {gatherFruit} from './fruitForaging';
import {FRUIT,fruitStage,fruitTreeAt,type FruitKind} from './fruitTrees';
import {riverLinks} from './riverSeasons';
import {VISUAL_SEASONS} from './sceneAtmosphere';
import {seaNeighbors,seaPoint} from './shipSave';
import {packSimulationWorld,receiveSimulationWorld} from './simulationProtocol';
import {compactWorld,readSavedWorld} from './storage';
import {adventureFruitAt,animalPose,surfaceAnimals,surfaceFruitAt,surfaceLifeObstacles} from './surfaceLife';
import {fitsHabitat} from './wildlife';

const make=(seed=321721)=>createWorld({seed,size:'small',layout:'continents',riverlands:true,
  regionalBiomes:true,starting:{human:0,elf:0,dwarf:0,demon:0}});
const growingDays={mulberry:0,cherry:92,apple:183,baobab:274};

describe('seasonal Surface life',()=>{
  it('moves each distinct fruit through blossom, green, and ripe stages',()=>{
    const world=make(),trees=world.tiles.flatMap((_,i)=>fruitTreeAt(world,i)??[]);
    expect(trees.length).toBeGreaterThan(10);
    const sameSeed=make();
    expect(sameSeed.tiles.flatMap((_,i)=>fruitTreeAt(sameSeed,i)??[])).toEqual(trees);
    const uniqueBlocks=new Set(trees.map(({x,y})=>[Math.floor(x/4),Math.floor(y/4)].join(',')));
    expect(uniqueBlocks.size).toBe(trees.length);
    for(const kind of Object.keys(growingDays) as FruitKind[]){
      const tree={index:0,x:0,y:0,kind,variant:0},season=FRUIT[kind].season;
      const day=growingDays[kind],previous=(VISUAL_SEASONS.indexOf(season)+3)%4;
      expect(fruitStage({...world,dayOfYear:[0,92,183,274][previous]},tree)).toBe('bloom');
      expect(fruitStage({...world,dayOfYear:day+13},tree)).toBe('green');
      expect(fruitStage({...world,dayOfYear:day+14},tree)).toBe('ripe');
      const ripe=blockFruitTree(kind,0,'ripe',season),bare=blockFruitTree(kind,0,'picked',season);
      expect(ripe.faces.some(face=>face.color===FRUIT[kind].color)).toBe(true);
      expect(ripe.faces.length).toBeGreaterThan(bare.faces.length);
    }
  });

  it('lets a mortal harvest a reachable tree once and resets it in the new year',()=>{
    const world=make(),start=createMortal(world,{name:'Ari Flint',species:'human',background:'scout',
      appearance:{skin:1,hair:1,hairStyle:1,outfit:'wanderer'}});
    const map=adventureMapFor(start.world);
    const tree=world.tiles.flatMap((_,i)=>surfaceFruitAt(world,i)??[]).find(candidate=>{
      const actor={...start.agent,x:candidate.x,y:candidate.y};
      return adventureFruitAt(start.world,map,adventureRegion(start.world,map,actor),candidate.index);
    })!;
    expect(tree).toBeDefined();
    const day=growingDays[tree.kind],clock={...start.world,dayOfYear:day+14};
    const actor={...start.agent,x:tree.x,y:tree.y,energy:60};
    const near={...clock,agents:[actor]};
    const unripe={...near,dayOfYear:day+13};
    expect(gatherFruit(unripe,tree.index).world).toBe(unripe);
    const result=gatherFruit(near,tree.index);
    expect(result.world.agents[0].energy).toBe(60+FRUIT[tree.kind].energy);
    expect(result.world.rngState).toBe(near.rngState);
    expect(result.world.settlements).toBe(near.settlements);
    const restored=readSavedWorld(compactWorld(result.world))!;
    expect(fruitStage(restored,tree)).toBe('picked');
    expect(gatherFruit(restored,tree.index).world).toBe(restored);
    const later=advanceWorldDays(restored,1),packed=packSimulationWorld(restored,later);
    expect(packed.retained).toContain('fruitHarvest');
    const afterTick=receiveSimulationWorld(restored,structuredClone({kind:'advanced',id:1,elapsedMs:0,...packed}));
    expect(afterTick.fruitHarvest).toEqual(restored.fruitHarvest);
    const nextYear=advanceWorldDays({...afterTick,dayOfYear:364},1);
    expect(nextYear.fruitHarvest).toBeUndefined();
    expect(fruitStage({...nextYear,dayOfYear:day+14},tree)).toBe('ripe');
  });

  it('keeps seeded animal paths on connected, unobstructed habitat',()=>{
    const world=make(),tracks=surfaceAnimals(world),streams=riverLinks(world);
    const blocked=surfaceLifeObstacles(world);
    expect(tracks.length).toBeGreaterThan(8);
    expect(surfaceAnimals(make())).toEqual(tracks);
    expect(surfaceAnimals({...world,wildlife:[]})).toEqual([]);
    for(const track of tracks){
      const indexes=track.points.map(p=>Math.round(p.y)*world.width+Math.round(p.x));
      const home=seaPoint(world.width,track.home);
      indexes.forEach((i,step)=>{
        const next=indexes[(step+1)%indexes.length],point=seaPoint(world.width,i);
        expect(fitsHabitat(track.kind,world.tiles[i].biome)).toBe(true);
        expect(blocked.has(i)||streams.has(i)).toBe(false);
        expect(Math.max(Math.abs(home.x-point.x),Math.abs(home.y-point.y))).toBeLessThanOrEqual(2);
        expect(i===next||seaNeighbors(i,world.width,world.tiles.length).includes(next)).toBe(true);
      });
    }
    const walker=tracks.find(track=>track.points.length>1)!;
    const passing=animalPose(walker,walker.period*30.5-walker.phase);
    expect(passing.stride).toBeGreaterThan(0);
    const standing=blockAnimal(walker.kind,passing.facing,0,walker.variant,walker.young);
    const moving=blockAnimal(walker.kind,passing.facing,passing.stride,walker.variant,walker.young);
    expect(standing.feet).not.toEqual(moving.feet);
  });
});
