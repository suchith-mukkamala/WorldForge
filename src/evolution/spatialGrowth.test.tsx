import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {BUILDING_TIER_NAMES,COSTS,buildingAppearance,buildingTier,validConstruction,
  improveBuildings,prepareInfrastructure,settlementStage,
  type Building} from './construction';
import {paintDepthBuilding,paintDepthPerson,paintDepthTree} from './depthSprites';
import {DepthCanvas} from './DepthCanvas';
import {createWorld,type Settlement} from './engine';
import {mortalWorldPoint,DEPTH_FOOTPRINT} from './spatialDetails';
import {compactWorld} from './storage';

function readyTown(){
  const w=createWorld({seed:205,size:'small',
    starting:{human:1,elf:0,dwarf:0,demon:0}});
  w.year=4;
  const builder=w.agents[0];
  builder.age=21;builder.born=-17;builder.energy=100;
  builder.development!.career='artisan';
  const s:Settlement={id:1,species:'human',name:'Growing Haven',
    x:builder.x,y:builder.y,founded:0,population:40,stores:0,emptyYears:0};
  w.settlements.push(s);w.nextSettlementId=2;
  prepareInfrastructure(w);
  const infra=s.infrastructure!;
  const available=infra.land.slice(0,12);
  for(const [n,id] of available.entries()){
    infra.buildings.push({id:n+1,type:n===0?'shelter':'house',
      x:id%w.width,y:Math.floor(id/w.width),culture:'human',
      stage:'complete',progress:100,condition:100,started:0,finished:1,
      spent:{...COSTS.house.materials},labor:COSTS.house.labor});
  }
  infra.nextBuildingId=available.length+1;
  infra.stock={wood:100,stone:120,clay:100};
  return {w,s,builder};
}

describe('v2.05 — unequal footprints, free sprite movement and growing homes',()=>{
  it('gives mortals continuous individual positions inside their physical tiles',()=>{
    const w=createWorld({seed:205,size:'small'});
    const a=w.agents[0];
    const p=mortalWorldPoint(a,w);
    expect(p).toEqual(mortalWorldPoint(a,w));
    expect(Math.abs(p.x-a.x)).toBeLessThan(.37);
    expect(Math.abs(p.y-a.y)).toBeLessThan(.37);
    expect(Number.isInteger(p.x)&&Number.isInteger(p.y)).toBe(false);
    expect(mortalWorldPoint(a,{...w,dayOfYear:12})).not.toEqual(p);
    expect(mortalWorldPoint({...a,id:a.id+1},w)).not.toEqual(p);
    expect([DEPTH_FOOTPRINT.person,DEPTH_FOOTPRINT.tree,
      DEPTH_FOOTPRINT.building]).toEqual([1,2,4]);
    expect(a.x).toBe(Math.floor(a.x)); // ecology still has exact tile occupancy
  });

  it('renders a person at smaller scale than a tree and a building',()=>{
    const w=createWorld({seed:205,size:'small'}),a=w.agents[0];
    const rectangles:{width:number;kind:string}[]=[];
    const painter={fillStyle:'',fillRect(_x:number,_y:number,width:number){
      rectangles.push({width,kind:String(painter.fillStyle)});
    }} as unknown as CanvasRenderingContext2D;
    paintDepthPerson(painter,a,{x:22,y:22});
    expect(rectangles.length).toBeGreaterThan(0);
    expect(rectangles.every(r=>r.width===1)).toBe(true);
    rectangles.length=0;
    paintDepthTree(painter,{x:22,y:22},false);
    expect(rectangles.some(r=>r.width===6)).toBe(true);
    rectangles.length=0;
    const {s}=readyTown();
    paintDepthBuilding(painter,s.infrastructure!.buildings[0],{x:22,y:22});
    expect(rectangles.some(r=>r.width===12)).toBe(true);
    expect(rectangles.some(r=>r.kind==='rgba(18,37,45,.32)')).toBe(true);
  });

  it('uses real surplus materials and builders to upgrade a hut into a stone home',()=>{
    const {w,s,builder}=readyTown();
    const buildings=s.infrastructure!.buildings;
    expect(settlementStage(s)).toBe('town');
    expect(buildingTier(buildings[0])).toBe(0);
    expect(buildingAppearance(buildings[0])).toBe('Stick hut');
    const before={...s.infrastructure!.stock};
    expect(improveBuildings(w,s,[builder])).toBe(true);
    expect(buildings[0].tier).toBe(1);
    expect(buildings[0].upgraded).toBe(4);
    expect(s.infrastructure!.stock.wood).toBe(before.wood-3);
    expect(s.infrastructure!.stock.clay).toBe(before.clay-2);
    expect(improveBuildings(w,s,[builder])).toBe(true); // another building
    expect(buildings[0].tier).toBe(1); // not twice in one year
    w.year++;
    expect(improveBuildings(w,s,[builder])).toBe(true);
    expect(buildings[0].tier).toBe(2);
    w.year++;
    expect(improveBuildings(w,s,[builder])).toBe(true);
    expect(buildings[0].tier).toBe(3);
    expect(buildingAppearance(buildings[0])).toBe('Developed home');
    expect(BUILDING_TIER_NAMES).toHaveLength(4);
    expect(validConstruction(w)).toBe(true);
    // This intentionally hand-built town has an artificial population count;
    // its compact payload can still demonstrate persistence of the new tier.
    const packed=JSON.parse(compactWorld(w));
    expect(packed.world.settlements[0].infrastructure.buildings[0].tier).toBe(3);
  });

  it('does not upgrade without workers, materials, or civic development',()=>{
    const {w,s,builder}=readyTown();
    expect(improveBuildings(w,s,[])).toBe(false);
    expect(s.infrastructure!.buildings[0].tier).toBeUndefined();
    s.infrastructure!.stock={wood:0,stone:0,clay:0};
    expect(improveBuildings(w,s,[builder])).toBe(false);
    s.infrastructure!.stock={wood:100,stone:100,clay:100};
    s.population=0;
    expect(improveBuildings(w,s,[builder])).toBe(true); // hamlet allows timber
    w.year++;
    expect(improveBuildings(w,s,[builder])).toBe(true); // next hut, not stone
    expect(s.infrastructure!.buildings[0].tier).toBe(1);
    expect(validConstruction(w)).toBe(true);
    expect(validConstruction({...w,settlements:w.settlements.map(t=>({...t,
      infrastructure:{...t.infrastructure!,buildings:t.infrastructure!.buildings
        .map(b=>({...b,tier:4 as 0}))}}))})).toBe(false);
  });

  it('retains legacy buildings and the isometric interaction surface',()=>{
    const {w,s}=readyTown();
    const old:Building={...s.infrastructure!.buildings[0],tier:undefined,
      upgraded:undefined};
    expect(buildingTier(old)).toBe(0);
    expect(buildingAppearance(old)).toBe('Stick hut');
    const html=renderToStaticMarkup(createElement(DepthCanvas,{
      world:w,brush:{kind:'inspect'},overlay:'terrain',selected:null,
      onSelect:()=>{},onEdit:()=>{},zoom:2,speed:4,
    }));
    expect(html).toContain('Isometric terrain depth view');
  });
});
