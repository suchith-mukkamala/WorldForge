import {terrainHash} from './biomeGeneration';
import {realmCaverns} from './realmCaverns';
import {realmScenery} from './realmScenery';
import {seaNeighbors} from './shipSave';
import {RealmBiome,realmWalkable,type RealmMap} from './underworld';

type Species='fish'|'glowfly'|'bat';
export type RealmWildlife={kind:Species;cells:number[];phase:number};
const wildlife=new WeakMap<RealmMap,RealmWildlife[]>();
const {sea,glowroot,steam}=RealmBiome;

/** Small back-and-forth paths through contiguous habitat. This is visual
 * wildlife, so its position never changes a save or blocks a mortal. */
export function realmWildlife(map:RealmMap):RealmWildlife[]{
  const cached=wildlife.get(map);
  if(cached)return cached;
  const {width,seed,biomes}=map;
  const {coast,docks}=realmScenery(map);
  const tracks:RealmWildlife[]=[];
  const water=(i:number)=>biomes[i]===sea&&!docks.has(i);
  const grove=(i:number)=>!map.houses.has(i)&&(biomes[i]===glowroot||biomes[i]===steam);
  const floor=(i:number)=>!map.fords.has(i)&&realmWalkable(map,i,0);
  const habitats=[
    {kind:'fish',start:(i:number)=>water(i)&&coast[i]<=2,walk:water,salt:1217,count:9,length:8,spacing:4},
    {kind:'glowfly',start:grove,walk:grove,salt:531,count:9,length:6,spacing:5},
    {kind:'bat',start:floor,walk:floor,salt:281,count:5,length:9,spacing:7},
  ] as const;
  for(const {kind,start,walk,salt,count,length,spacing} of habitats){
    const candidates:{cell:number;score:number}[]=[];
    for(let cell=0;cell<biomes.length;cell++){
      if(!start(cell))continue;
      candidates.push({cell,score:terrainHash(cell,salt,seed)});
    }
    candidates.sort((a,b)=>b.score-a.score);
    if(kind==='bat')candidates.unshift(...map.links.map(link=>({cell:link.cell,score:1})));
    const starts:number[]=[];
    for(const {cell,score} of candidates){
      if(starts.some(i=>Math.hypot(i%width-cell%width,Math.floor(i/width)-Math.floor(cell/width))<spacing))continue;
      const cells=[cell],seen=new Set(cells);
      while(cells.length<length){
        const next=seaNeighbors(cells[cells.length-1],width,biomes.length)
          .filter(i=>i>=0&&!seen.has(i)&&walk(i))
          .sort((a,b)=>terrainHash(a,cells.length+salt,seed)-terrainHash(b,cells.length+salt,seed))[0];
        if(next===undefined)break;
        seen.add(next);cells.push(next);
      }
      if(cells.length<4)continue;
      starts.push(cell);tracks.push({kind,cells,phase:score%1});
      if(starts.length>=count)break;
    }
  }
  // A bat flight follows the largest available gallery out of the sea vault.
  const gallery=realmCaverns(map).galleries.reduce<number[]>((a,b)=>a.length>=b.length?a:b,[]);
  if(gallery.length>=6)tracks.push({kind:'bat',cells:gallery.slice(-12),phase:terrainHash(15,525,seed)});
  wildlife.set(map,tracks);
  return tracks;
}
