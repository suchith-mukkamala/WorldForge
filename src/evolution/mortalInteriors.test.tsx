import {describe,expect,it} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createWorld,type Settlement,type World} from './engine';
import {createMortal} from './divineDescent';
import {BUILDING_TYPES,type Building} from './construction';
import {MortalInterior} from './MortalInterior';
import {canEnterMortalBuilding,findInteriorBuilding,atInteriorDoor,
  INTERIOR_DOOR,INTERIOR_TEMPLATES,moveInside,ROOM_WIDTH,ROOM_HEIGHT}
  from './mortalInteriors';
import type {MortalBuilding} from './mortalGameplay';

const create=()=>createMortal(createWorld({seed:4017,size:'small'}),{
  name:'Nessa',species:'human',background:'scout',
  appearance:{skin:2,hair:0,hairStyle:1,outfit:'wanderer'},
}).world;
function place(world:World,type:Building['type']='house',
  stage:Building['stage']='complete'){
  const actor=world.agents.find(a=>a.id===world.descent?.agentId)!;
  const building:Building={id:777,type,x:actor.x+1,y:actor.y,
    culture:'human',stage,progress:100,condition:95,started:world.year,
    spent:{wood:5,stone:5,clay:5},labor:10};
  const settlement:Settlement={id:777,name:'Westridge',species:'human',
    x:actor.x,y:actor.y,founded:world.year,stores:50,population:12,
    emptyYears:0,infrastructure:{land:[],roads:[],buildings:[building],
      stock:{wood:5,stone:5,clay:5},nextBuildingId:778,
      foundedWithResidents:12}};
  const site:MortalBuilding={building,settlementId:777,
    settlementName:'Westridge',entrance:{x:actor.x,y:actor.y},distance:0};
  return {world:{...world,settlements:[settlement,...world.settlements]},
    site};
}

describe('v2.6.0 — reusable interior spaces',()=>{
  it('includes a stable independent layout for all nine building categories',()=>{
    expect(BUILDING_TYPES).toHaveLength(9);
    for(const type of BUILDING_TYPES){
      const template=INTERIOR_TEMPLATES[type];
      expect(template.name.length).toBeGreaterThan(0);
      expect(template.props.length).toBeGreaterThanOrEqual(4);
      for(const p of template.props){
        expect(p.x).toBeGreaterThanOrEqual(1);
        expect(p.x).toBeLessThan(ROOM_WIDTH-1);
        expect(p.y).toBeGreaterThanOrEqual(1);
        expect(p.y).toBeLessThan(ROOM_HEIGHT-1);
      }
    }
    expect(INTERIOR_TEMPLATES.house.props).not.toEqual(INTERIOR_TEMPLATES.workshop.props);
  });

  it('moves around actual template obstacles and stays within walkable floor',()=>{
    expect(atInteriorDoor(INTERIOR_DOOR)).toBe(true);
    expect(moveInside('house',INTERIOR_DOOR,0,1)).toEqual(INTERIOR_DOOR);
    expect(moveInside('house',INTERIOR_DOOR,0,-1)).toEqual({x:6,y:7});
    expect(atInteriorDoor({x:6,y:4})).toBe(false);
    expect(moveInside('house',{x:6,y:3},0,1)).toEqual({x:6,y:3});
    expect(moveInside('house',{x:6,y:5},0,0)).toEqual({x:6,y:5});
    expect(moveInside('house',{x:1,y:1},-1,0)).toEqual({x:1,y:1});
    for(const type of BUILDING_TYPES){
      const seen=new Set<string>(),queue=[INTERIOR_DOOR];
      for(let index=0;index<queue.length;index++){
        const point=queue[index],key=`${point.x}:${point.y}`;
        if(seen.has(key))continue;
        seen.add(key);
        for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
          const next=moveInside(type,point,dx,dy);
          if(!seen.has(`${next.x}:${next.y}`))queue.push(next);
        }
      }
      // A room should be explorable, never a closet with a blocked door.
      expect(seen.size,`${type} has inaccessible floor`).toBeGreaterThan(42);
    }
  });

  it('enters only the real finished structure while the mortal is nearby',()=>{
    const base=create(),{world,site}=place(base);
    expect(canEnterMortalBuilding(world,site)).toBe(true);
    expect(findInteriorBuilding(world,{settlementId:777,buildingId:777})?.building)
      .toEqual(site.building);
    expect(canEnterMortalBuilding(world,{...site,distance:3})).toBe(false);
    const building=place(base,'house','frame');
    expect(canEnterMortalBuilding(building.world,building.site)).toBe(false);
    expect(findInteriorBuilding(building.world,{settlementId:777,buildingId:777}))
      .toBeNull();
    const divine={...world,descent:{...world.descent!,mode:'divine' as const}};
    expect(findInteriorBuilding(divine,{settlementId:777,buildingId:777}))
      .toBeNull();
  });

  it('renders a real named interior and its same living mortal without editing world',()=>{
    const {world,site}=place(create(),'workshop');
    const markup=renderToStaticMarkup(createElement(MortalInterior,{
      world,site,position:INTERIOR_DOOR,running:true,message:'',
      onExit:()=>{},onToggleTime:()=>{},onAscend:()=>{},
    }));
    expect(markup).toContain('Enterable building interior');
    expect(markup).toContain('WESTRIDGE');
    expect(markup).toContain('Workshop');
    expect(markup).toContain('EXIT BUILDING');
    expect(world.agents.find(a=>a.id===world.descent?.agentId)).toBeDefined();
  });
});
