import {describe,expect,it} from 'vitest';
import {kinshipOf,type KinSource} from './kinship';

function person(id:number,parents?:[number,number],children:number[]=[],
  partnerIds:number[]=[]):KinSource['lineage'][number]{
  return {id,parents,children,partnerIds};
}

describe('derived kinship',()=>{
  const world:KinSource={
    lineage:[
      person(1,undefined,[3,4],[2]),
      person(2,undefined,[3,4,5],[1]),
      person(3,[1,2],[6],[7]),
      person(4,[1,2],[]),
      person(5,[2,8],[]),
      person(6,[3,7],[]),
      person(7,[10,11],[6],[3]),
      person(8,undefined,[5]),
      person(9),
      person(10,undefined,[7]),
      person(11,undefined,[7,12]),
      person(12,[10,11],[]),
    ],
    bonds:[
      {a:3,b:7,stage:'partner',strength:.82},
      {a:1,b:2,stage:'ended',strength:.2},
      {a:3,b:9,stage:'courting',strength:.4},
    ],
    agents:[{
      id:3,partnerId:7,
      development:{householdId:1,caregiverIds:[1],mentorId:4,friends:[9],
        memories:[{kind:'conflict',otherId:4},{kind:'friendship',otherId:9}]},
      dailyLife:{acquaintances:[{personId:7,regard:20},{personId:5,regard:-12}]},
    },{
      id:7,development:{householdId:1,caregiverIds:[],friends:[],memories:[]},
    },{
      id:4,development:{householdId:2,caregiverIds:[],friends:[],memories:[]},
    },{
      id:5,
    }],
  };

  it('separates full siblings, half-siblings and in-laws',()=>{
    const kin=kinshipOf(world,3);
    const role=(id:number)=>kin.find(link=>link.id===id)?.role;
    expect(role(1)).toBe('parent');
    expect(role(2)).toBe('parent');
    expect(role(4)).toBe('sibling');
    expect(role(5)).toBe('half-sibling');
    expect(role(6)).toBe('child');
    expect(role(7)).toBe('partner');
    expect(kin.find(link=>link.id===7)?.tone).toBe('close');
    expect(role(10)).toBe('parent-in-law');
    expect(role(12)).toBe('sibling-in-law');
    expect(role(9)).toBe('friend');
    expect(kin.find(link=>link.role==='suitor')).toBeUndefined();
    expect(kin.find(link=>link.id===4)?.tone).toBe('strained');
    expect(kin.find(link=>link.id===5)?.tone).toBe('strained');
  });

  it('keeps a former partner when the living bond is gone',()=>{
    const kin=kinshipOf(world,1);
    expect(kin.find(link=>link.id===2)?.role).toBe('former-partner');
    expect(kin.find(link=>link.id===2)?.tone).toBe('distant');
    expect(kin.find(link=>link.id===3)?.role).toBe('child');
    expect(kin.some(link=>link.id===1)).toBe(false);
  });

  it('returns nothing for a person the archive does not know',()=>{
    expect(kinshipOf(world,99)).toEqual([]);
  });
});
