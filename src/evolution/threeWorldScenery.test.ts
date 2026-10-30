import {describe,expect,it} from 'vitest';
import * as THREE from 'three';
import {createWorld} from './engine';
import {buildScenery3D} from './threeWorldScenery';

describe('WebGL diorama scenery',()=>{
  it('draws instanced 3D trees, buildings and close-up detail without mutating the world',()=>{
    const world=createWorld({size:'small',seed:231});
    const person=world.agents[0];
    world.settlements.push({id:1,species:'human',name:'Test village',
      x:person.x,y:person.y,founded:0,population:1,stores:0,emptyYears:0,
      infrastructure:{land:[],roads:[],stock:{wood:0,stone:0,clay:0},
        nextBuildingId:2,foundedWithResidents:1,buildings:[{
          id:1,type:'house',culture:'human',x:person.x,y:person.y,
          stage:'complete',progress:100,condition:100,started:0,
          spent:{wood:0,stone:0,clay:0},labor:0,
        }]},
    });
    const before=JSON.stringify(world);
    const far=new THREE.Group(),near=new THREE.Group();
    buildScenery3D(world,far,0);
    buildScenery3D(world,near,2);
    expect(far.children.length).toBeGreaterThanOrEqual(4);
    expect(far.children.every(mesh=>mesh instanceof THREE.InstancedMesh)).toBe(true);
    expect(near.children.every(mesh=>mesh instanceof THREE.InstancedMesh)).toBe(true);
    const instances=(group:THREE.Group)=>group.children.reduce((sum,mesh)=>
      sum+(mesh as THREE.InstancedMesh).count,0);
    expect(instances(near)).toBeGreaterThan(instances(far));
    expect(near.children.length).toBeLessThanOrEqual(8);
    expect(JSON.stringify(world)).toBe(before);
  });
});
