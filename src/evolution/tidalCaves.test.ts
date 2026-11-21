import {describe,expect,it} from 'vitest';
import {adventureMapFor,adventureRegion,walkAdventure} from './adventureMap';
import {createMortal,setDescentMode} from './divineDescent';
import {createWorld,type World} from './engine';
import {hydrologyForWorld} from './hydrology';
import {launchShip,landShip,landingSites,shipMooring} from './mortalSailing';
import {cavesInSight,enterTideCave,inspectCaveFind,leaveTideCave,occupiedTidalCave,
  waitForCaveTide,walkTideCave} from './mortalTidalCaves';
import {directionBetween} from './motion';
import {oceanBasins} from './regionalGeography';
import {controlsMortal,MAX_LANDING_RISE,seaNeighbors,seaPoint} from './shipSave';
import {compactWorld,readSavedWorld} from './storage';
import {cavePoint,caveWalkable,CaveFloor,tidalCaveRoom,type TidalCaveRoom} from './tidalCaveRoom';
import {CAVE_WIDTH,chartedTidalCaves,coastTide,tidalApproach,tidalCaves,validTidalSites,
  type TidalCave} from './tidalCaves';
import {topographyForWorld} from './topography';

const empty={human:0,elf:0,dwarf:0,demon:0};
const neighbor=(index:number,width:number,size:number)=>seaNeighbors(index,width,size).filter(i=>i>=0);
const paths=(room:TidalCaveRoom,start:number)=>{
  const seen=new Map([[start,start]]),todo=[start];
  for(const step of todo)for(const next of neighbor(step,CAVE_WIDTH,room.cells.length)){
    if(!caveWalkable(room,next)||seen.has(next))continue;
    seen.set(next,step);todo.push(next);
  }
  return seen;
};

function sailToCave(world:World,cave:TidalCave){
  const {width,tiles}=world,shore=seaPoint(width,cave.shore);
  const {heights}=topographyForWorld(world),water=neighbor(cave.shore,width,tiles.length)
    .find(i=>tiles[i].biome==='water'&&Math.abs(heights[i]-heights[cave.shore])<=MAX_LANDING_RISE)!;
  const {agent,world:created}=createMortal(world,{name:'Mira Tide',species:'human',background:'scout',
    appearance:{skin:0,hair:1,hairStyle:0,outfit:'wanderer'}});
  const at=seaPoint(width,water);
  const afloat:World={...created,dayOfYear:8,agents:[{...agent,...shore}],
    descent:{...created.descent!,place:{kind:'wild',...shore,expedition:true},
      ship:{shore:cave.shore,at:water,underway:true,heading:directionBetween(at,shore),landfalls:[]}}};
  return {afloat,agent};
}

function walkTo(world:World,target:number){
  let next=world;
  const {room,inside}=occupiedTidalCave(next)!;
  const seen=paths(room,inside.cell),route=[];
  expect(seen.has(target)).toBe(true);
  for(let step=target;step!==inside.cell;step=seen.get(step)!)route.unshift(step);
  for(const step of route){
    const from=cavePoint(occupiedTidalCave(next)!.inside.cell),to=cavePoint(step);
    const result=walkTideCave(next,to.x-from.x,to.y-from.y);
    expect(result.moved).toBe(true);
    next=result.world;
  }
  return next;
}

describe('Tidal caves',()=>{
  it('sets different chambers on navigable coasts with dry paths through them',()=>{
    const shapes=new Set<string>(),stone=new Set<string>();
    let shortcuts=0;
    for(const seed of [4466,6755,7497,4094]){
      const world=createWorld({seed,size:'small',layout:'archipelago',starting:empty,
        regionalGeography:true,regionalBiomes:true,riverlands:true,worldTree:true});
      const caves=tidalCaves(world),legacy={...world,tidalSites:undefined};
      expect(caves).toEqual(tidalCaves(legacy));
      expect(caves.length).toBeGreaterThan(0);
      expect(validTidalSites(caves,world.width,world.height)).toBe(true);
      const drainage=hydrologyForWorld(world),ocean=oceanBasins(world,drainage);
      const {tiles,width}=world,{heights}=topographyForWorld(world);
      for(const cave of caves){
        expect(tiles[cave.mouth].biome).not.toBe('water');
        expect(tiles[cave.shore].biome).not.toBe('water');
        expect(tiles[cave.water].biome).toBe('water');
        expect(ocean.has(drainage.basin[cave.water])).toBe(true);
        expect(neighbor(cave.shore,width,tiles.length).some(i=>tiles[i].biome==='water'&&
          Math.abs(heights[i]-heights[cave.shore])<=MAX_LANDING_RISE)).toBe(true);
        expect(tidalApproach(world,cave.mouth)).toBe(true);
        expect(tidalApproach(world,cave.shore)).toBe(true);
        stone.add(cave.stone);
        const room=tidalCaveRoom(cave),reachable=paths(room,room.entrance);
        shapes.add(room.cells.join(''));
        expect(room.cells.includes(CaveFloor.water)).toBe(true);
        expect(reachable.has(room.find)).toBe(true);
        if(cave.farShore!==undefined){
          expect(tiles[cave.farShore].biome).not.toBe('water');
          expect(tidalApproach(world,cave.farShore)).toBe(true);
          expect(reachable.has(room.farExit!)).toBe(true);
          shortcuts++;
        }
      }
    }
    expect(stone.size).toBeGreaterThan(1);
    expect(shapes.size).toBeGreaterThan(8);
    expect(shortcuts).toBeGreaterThan(0);
  });

  it('charts a cave from a boat, finds it on foot and preserves the discovery on reload',()=>{
    const world=createWorld({seed:4466,size:'small',layout:'archipelago',starting:empty,
      regionalGeography:true,regionalBiomes:true,riverlands:true});
    const cave=tidalCaves(world).find(candidate=>candidate.mouth!==candidate.shore&&
      candidate.farShore!==undefined)!;
    expect(cave).toBeDefined();
    const {afloat,agent}=sailToCave({...world,tidalSites:undefined},cave);
    const map=adventureMapFor(afloat);
    expect(chartedTidalCaves(afloat)).toEqual([]);
    expect(cavesInSight(afloat,map)).toContainEqual(cave);
    expect(landingSites(afloat,map)).toContain(cave.shore);
    expect(enterTideCave(afloat,cave.mouth).moved).toBe(false);
    const landed=landShip(afloat,cave.shore).world;
    expect(chartedTidalCaves(landed)).toContainEqual({cave,find:undefined});
    expect(enterTideCave(landed,cave.mouth)).toMatchObject({moved:false,reason:expect.stringMatching(/tide/)});
    const waited=waitForCaveTide(landed,cave.mouth).world;
    expect(coastTide(waited).low).toBe(true);
    expect(waited.dayOfYear).toBe(12);
    const entered=enterTideCave(waited,cave.mouth);
    expect(entered.moved).toBe(true);
    const {room}=occupiedTidalCave(entered.world)!;
    const inside=readSavedWorld(compactWorld(entered.world))!;
    expect(occupiedTidalCave(inside)?.inside).toEqual({mouth:cave.mouth,cell:room.entrance});
    expect(inspectCaveFind(inside).world).toBe(inside);
    expect(walkTideCave(inside,0,2).moved).toBe(false);
    expect(walkAdventure(inside,adventureRegion(inside,adventureMapFor(inside),inside.agents[0]),0,1).moved).toBe(false);
    expect(controlsMortal(setDescentMode(inside,'divine').descent,agent.id)).toBe(true);
    const atFind=walkTo(inside,room.find),inspected=inspectCaveFind(atFind);
    expect(inspected.message).toMatch(/coastal journal/);
    const reloaded=readSavedWorld(compactWorld(inspected.world))!;
    expect(inspectCaveFind(reloaded).world).toBe(reloaded);
    expect(chartedTidalCaves(reloaded)).toContainEqual({cave,find:cave.find});
    expect(leaveTideCave(reloaded,true).moved).toBe(false);
    const far=leaveTideCave(walkTo(reloaded,room.farExit!),true);
    expect(far.moved).toBe(true);
    expect(far.world.agents[0]).toMatchObject(seaPoint(world.width,cave.farShore!));
    expect(shipMooring(far.world,adventureMapFor(far.world))?.shore).toBe(cave.shore);
    const high=leaveTideCave({...reloaded,dayOfYear:18});
    expect(high.moved).toBe(true);
    expect(high.world.agents[0]).toMatchObject(seaPoint(world.width,cave.mouth));
    expect(launchShip(high.world,shipMooring(high.world,adventureMapFor(high.world))!).moved).toBe(true);
  });

  it('keeps the tide continuous across the new year and allows visits after the calendar cap',()=>{
    expect(coastTide({year:0,dayOfYear:364})).toEqual({low:true,untilLow:0});
    expect(coastTide({year:1,dayOfYear:0})).toEqual({low:true,untilLow:0});
    expect(coastTide({year:1,dayOfYear:1})).toEqual({low:false,untilLow:6});
    expect(coastTide({year:9999,dayOfYear:1}).low).toBe(true);
  });
});
