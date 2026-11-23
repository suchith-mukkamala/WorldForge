import {blockRealmDock,blockRealmDwelling,blockRealmFormation,blockRealmGate} from './blockModels';
import {terrainHash} from './biomeGeneration';
import {realmFormationUnit,type RealmScenery} from './realmScenery';
import type {RealmMap} from './underworld';

export function realmPropAt(map:RealmMap,scene:RealmScenery,cell:number){
  const formation=scene.formations.get(cell);
  if(formation){
    const landmark=scene.naturalSites.some(site=>site.cell===cell);
    return {model:blockRealmFormation(formation.kind,formation.variant,landmark),
      dx:formation.dx,dy:formation.dy,unit:realmFormationUnit(formation.size)};
  }
  const house=map.houses.get(cell),gate=scene.gates.get(cell),dock=scene.docks.get(cell);
  if(house){
    const hall=scene.landmarks.has(cell),variant=Math.floor(terrainHash(cell,77,map.seed)*3);
    return {model:blockRealmDwelling(house.id,variant,hall),dx:0,dy:0,unit:hall?.68:.60};
  }
  if(gate)return {model:blockRealmGate(gate),dx:0,dy:0,unit:.65};
  if(dock)return {model:blockRealmDock(dock),dx:0,dy:0,unit:.72};
}
