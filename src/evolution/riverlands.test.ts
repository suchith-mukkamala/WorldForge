import {describe,expect,it} from 'vitest';
import {adventureMapFor,adventureRegion,walkAdventure,type AdventureRegion} from './adventureMap';
import {blockProp} from './blockModels';
import {createMortal} from './divineDescent';
import {createWorld,isWorld,type World,type WorldSettings} from './engine';
import {hydrologyForWorld} from './hydrology';
import {surveyLandmark} from './mortalSurveys';
import {riverCourses} from './riverCourses';
import {visibleAtlasSite} from './riverDiscoveries';
import {springFlood} from './riverSeasons';
import {compactWorld,readSavedWorld} from './storage';
import {Shore,surfaceGrid} from './surfaceGrid';
import {terrainRenderGrid} from './terrainCells';
import {SEA_LEVEL,topographyForWorld} from './topography';

const settings:Partial<WorldSettings>={
  seed:321721,size:'small',layout:'continents',landforms:'varied',
  regionalGeography:true,regionalBiomes:true,terrainCells:true,
  starting:{human:0,elf:0,dwarf:0,demon:0},
};
const trailWorld=createWorld({...settings,riverlands:true});
const legacyWorld=createWorld(settings);
const course=riverCourses(trailWorld)[0];
const directions=[[1,0],[-1,0],[0,1],[0,-1]] as const;
const coordinates=(width:number,index:number)=>[index%width,Math.floor(index/width)] as const;
const neighbors=(width:number,index:number)=>{
  const [x,y]=coordinates(width,index);
  return directions.filter(([dx,dy])=>x+dx>=0&&x+dx<width&&y+dy>=0)
    .map(([dx,dy])=>(y+dy)*width+x+dx);
};
const mortal=()=>{
  const {world,agent}=createMortal({...trailWorld,dayOfYear:116},{
    name:'Rill Reed',species:'human',background:'scout',
    appearance:{skin:0,hair:1,hairStyle:0,outfit:'wanderer'},
  },course.mouth);
  return {world,agent,region:adventureRegion(world,adventureMapFor(world),agent)};
};

function walkTo(world:World,region:AdventureRegion,target:number):World{
  const {width}=world,actor=world.agents.find(a=>a.id===world.descent!.agentId)!;
  const start=actor.y*width+actor.x,queue=[start],previous=new Map([[start,-1]]);
  for(let cursor=0;cursor<queue.length&&!previous.has(target);cursor++){
    for(const i of neighbors(width,queue[cursor])){
      if(!region.area.has(i)||previous.has(i))continue;
      previous.set(i,queue[cursor]);queue.push(i);
    }
  }
  expect(previous.has(target)).toBe(true);
  const path:number[]=[];
  for(let i=target;i!==start;i=previous.get(i)!)path.unshift(i);
  let from=start;
  for(const index of path){
    const [x,y]=coordinates(width,index),[px,py]=coordinates(width,from);
    const step=walkAdventure(world,region,x-px,y-py,false);
    expect(step.moved,step.reason).toBe(true);
    world=step.world;from=index;
  }
  return world;
}

describe('Riverlands',()=>{
  it('shapes saved terrain and connects named stops to actual downstream water',()=>{
    const {width,tiles,ancientSites}=trailWorld,heights=topographyForWorld(trailWorld).heights;
    const formerHeights=topographyForWorld(legacyWorld).heights;
    const drainage=hydrologyForWorld(trailWorld);
    expect(isWorld(trailWorld)).toBe(true);
    expect(readSavedWorld(compactWorld(trailWorld))).toEqual(trailWorld);
    expect(readSavedWorld(compactWorld(legacyWorld))).toEqual(legacyWorld);
    expect(ancientSites?.map(s=>s.kind)).toEqual(expect.arrayContaining([
      'glacial-lake','canyon','caldera','barrier-islands','hidden-spring','broken-bridge','waterfall-cave',
    ]));
    expect(tiles.some((t,i)=>t.biome==='water'&&heights[i]>SEA_LEVEL&&
      legacyWorld.tiles[i].biome!=='water')).toBe(true);
    expect(tiles.some((t,i)=>t.biome!=='water'&&legacyWorld.tiles[i].biome==='water')).toBe(true);
    const caldera=ancientSites!.find(s=>s.kind==='caldera')!;
    expect(tiles.some((t,i)=>t.biome==='volcanic'&&Math.abs(heights[i]-formerHeights[i])>=20&&
      Math.max(Math.abs(i%width-caldera.x),Math.abs(Math.floor(i/width)-caldera.y))<=6)).toBe(true);
    expect(course.stops.map(stop=>stop.kind)).toEqual(['source','falls','valley','ford','mouth']);
    expect(course.delta).toBe(true);
    expect(tiles[course.outlet].biome).toBe('water');
    expect(course.path.map(i=>drainage.flowTo[i])).toEqual([...course.path.slice(1),course.outlet]);
  });

  it('keeps a uniform visual grid and changes the banks with the season',()=>{
    const spring=surfaceGrid(trailWorld),summer=surfaceGrid({...trailWorld,dayOfYear:116});
    expect(spring.columns).toBe(trailWorld.width*8);
    expect(spring.rows).toBe(trailWorld.height*8);
    expect(summer.shore).toHaveLength(spring.columns*spring.rows);
    expect(terrainRenderGrid(trailWorld).columns).toBe(trailWorld.width*4);
    expect(Array.from(new Set(spring.shore))).toEqual(expect.arrayContaining([
      Shore.wetSand,Shore.drySand,Shore.shallows,Shore.foam,Shore.flood,
    ]));
    expect(summer.shore.includes(Shore.flood)).toBe(false);
    expect(summer.shore.filter(s=>s===Shore.gravel).length)
      .toBeGreaterThan(spring.shore.filter(s=>s===Shore.gravel).length);
    expect(blockProp('larch',0,'Harvest')).not.toEqual(blockProp('larch',0,'Highsun'));
  });

  it('lets a mortal walk the river, chart an unmarked spring, and keep that discovery',()=>{
    const {world,agent,region}=mortal();
    const spring=world.ancientSites!.find(site=>site.kind==='hidden-spring')!;
    expect(agent.y*world.width+agent.x).toBe(course.path[0]);
    expect(visibleAtlasSite(world,spring)).toBe(false);
    const there=walkTo(world,region,spring.y*world.width+spring.x);
    const surveyed=surveyLandmark(there,spring.id);
    expect(surveyed.message).toMatch(/Hidden spring/);
    expect(visibleAtlasSite(surveyed.world,spring)).toBe(true);
    const end=walkTo(surveyed.world,region,course.mouth);
    const saved=readSavedWorld(compactWorld(end))!;
    expect(saved.descent?.place).toEqual({kind:'river',mouth:course.mouth});
    expect(visibleAtlasSite(saved,spring)).toBe(true);
    expect(saved.agents.find(a=>a.id===agent.id)).toMatchObject({
      x:course.mouth%world.width,y:Math.floor(course.mouth/world.width),
    });
  });

  it('blocks a flooded bank and allows the same step over a maintained boardwalk',()=>{
    const {world,region}=mortal();
    const bloom={...world,dayOfYear:0};
    const target=[...region.area].find(i=>springFlood(bloom,i)&&neighbors(world.width,i)
      .some(n=>region.area.has(n)&&!springFlood(bloom,n)))!;
    expect(target).toBeDefined();
    const from=neighbors(world.width,target).find(n=>region.area.has(n)&&!springFlood(bloom,n))!;
    const there={...walkTo(world,region,from),dayOfYear:0};
    const [x,y]=coordinates(world.width,target),[px,py]=coordinates(world.width,from);
    expect(walkAdventure(there,region,x-px,y-py,false)).toMatchObject({
      moved:false,reason:expect.stringMatching(/floodwater/),
    });
    const bridged={...there,transport:{roads:[{index:target,built:0,sponsorId:1,condition:100}],bridges:[]}};
    expect(walkAdventure(bridged,region,x-px,y-py,false).moved).toBe(true);
  });
});
