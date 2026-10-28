/**
 * Evolution Lab v0.2 relationship and ancestry model.
 *
 * A bond is a mutual, voluntary (in simulation terms) adult pairing that grows
 * through proximity and compatibility. Partners can be of different species.
 * Children inherit an ancestry mixture, two parent IDs and heritable genes.
 * This is a stochastic agent model, not actual neural learning.
 */
import {
  BIOME_INFO,SPECIES,SPECIES_INFO,type Agent,type Ancestry,type Bond,type Genes,
  type LineageRecord,type Species,type World,
} from './engine';
import {appendLifeMoment,makeLifeRecord,personName} from './identity';
import {birthPotentialRank} from './traitRanks';
import {initialMind} from './mind';
import {divineFactor} from './divine';
import {residentIndex} from './density';

const clamp=(n:number,a:number,b:number)=>Math.min(b,Math.max(a,n));
const round=(n:number)=>Math.round(n*1000)/1000;
export const pureAncestry=(species:Species):Ancestry=>({
  human:species==='human'?1:0,
  elf:species==='elf'?1:0,
  dwarf:species==='dwarf'?1:0,
  demon:species==='demon'?1:0,
});
/** Each parent contributes half of the inherited ancestry. */
export function mixAncestry(a:Ancestry,b:Ancestry):Ancestry{
  return {
    human:(a.human+b.human)/2,
    elf:(a.elf+b.elf)/2,
    dwarf:(a.dwarf+b.dwarf)/2,
    demon:(a.demon+b.demon)/2,
  };
}
export function dominantSpecies(a:Ancestry,roll=.5):Species{
  const highest=Math.max(...SPECIES.map(s=>a[s]));
  const tied=SPECIES.filter(s=>Math.abs(a[s]-highest)<1e-10);
  // A 50/50 child is not automatically human (or whichever species happens
  // to appear first in an enum). The tie is resolved by the seeded world RNG.
  return tied[Math.min(tied.length-1,Math.floor(Math.max(0,roll)*tied.length))];
}
export const hybridFraction=(a:Ancestry)=>1-Math.max(...SPECIES.map(s=>a[s]));
export function ancestryLabel(a:Ancestry):string{
  const parts=SPECIES.filter(s=>a[s]>.001).sort((x,y)=>a[y]-a[x]);
  if(parts.length===1)return SPECIES_INFO[parts[0]].name.slice(0,-1);
  return 'Mixed '+parts.slice(0,3).map(s=>SPECIES_INFO[s].name.slice(0,-1)).join(' / ');
}
export function traitProfile(a:Ancestry){
  const blend=(key:'lifespan'|'maturity'|'fertility'|'wander'|'metabolism'|
    'strength'|'speed')=>
    SPECIES.reduce((sum,s)=>sum+SPECIES_INFO[s][key]*a[s],0);
  return {lifespan:blend('lifespan'),maturity:blend('maturity'),
    fertility:blend('fertility'),wander:blend('wander'),
    metabolism:blend('metabolism'),strength:blend('strength'),speed:blend('speed')};
}
const SPECIES_COMPATIBILITY:Record<Species,Record<Species,number>>={
  human:{human:1,elf:.82,dwarf:.78,demon:.57},
  elf:{human:.82,elf:1,dwarf:.64,demon:.46},
  dwarf:{human:.78,elf:.64,dwarf:1,demon:.53},
  demon:{human:.57,elf:.46,dwarf:.53,demon:1},
};
export function compatibility(a:Agent,b:Agent,allowHybrids=true):number{
  if(a.id===b.id||(!allowHybrids&&a.species!==b.species))return 0;
  let hereditary=0;
  for(const x of SPECIES)for(const y of SPECIES){
    hereditary+=a.ancestry[x]*b.ancestry[y]*SPECIES_COMPATIBILITY[x][y];
  }
  const temperament=1-
    Math.abs(a.genes.curiosity-b.genes.curiosity)*.27-
    Math.abs(a.genes.social-b.genes.social)*.32;
  const vitality=Math.min(a.health,b.health)/100;
  return round(clamp(hereditary*temperament*(.74+.26*vitality),0,1));
}
export function inheritedGenes(a:Genes,b:Genes,rand:()=>number):Genes{
  const inherit=(key:keyof Genes)=>round(clamp(
    (a[key]+b[key])/2+(rand()-.5)*.20,.65,1.4));
  return {vigor:inherit('vigor'),curiosity:inherit('curiosity'),
    fertility:inherit('fertility'),social:inherit('social')};
}
export function livingRecord(a:Agent):LineageRecord{
  return {id:a.id,species:a.species,ancestry:{...a.ancestry},
    genes:{...a.genes},born:a.born,generation:a.generation,
    potentialRank:a.potentialRank,
    parents:a.parents?[...a.parents]:undefined,
    children:[],partnerIds:[]};
}
const cheby=(a:{x:number;y:number},b:{x:number;y:number})=>
  Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
/** Food-regrowth surplus per nearby household determines reproductive support.
 * Unlike a headcount ceiling, this varies with the landscape and population.
 */
export function ecologicalBirthSupport(world:World,a:Agent,
  residents:Map<number,number[]>):number{
  let annualGrowth=0,neighbors=0;
  for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
    const x=a.x+dx,y=a.y+dy;
    if(x<0||y<0||x>=world.width||y>=world.height)continue;
    const index=y*world.width+x,biome=world.tiles[index].biome;
    if(biome==='water')continue;
    annualGrowth+=BIOME_INFO[biome].growth*world.settings.resourceLevel;
    neighbors+=residents.get(index)?.length??0;
  }
  return clamp(annualGrowth/(Math.max(1,neighbors)*2.3),.14,1);
}
export function isCloseFamily(world:Pick<World,'lineage'>,a:number,b:number,
  known?:Map<number,LineageRecord>):boolean{
  if(a===b)return true;
  const records=known??new Map(world.lineage.map(r=>[r.id,r]));
  const near=(id:number)=>{
    const ids=new Set<number>([id]),first=records.get(id)?.parents??[];
    for(const p of first){
      ids.add(p);
      for(const grand of records.get(p)?.parents??[])ids.add(grand);
    }
    return ids;
  };
  const first=near(a),second=near(b);
  for(const id of first)if(second.has(id))return true;
  return false;
}
/** Mark deaths in ancestry history, and release surviving partners. */
export function finalizeDeaths(world:World,survivors:Agent[],year:number):void{
  const alive=new Set(survivors.map(a=>a.id));
  const records=new Map(world.lineage.map(r=>[r.id,r]));
  for(const item of world.lineage){
    if(item.died===undefined&&!alive.has(item.id))item.died=year;
  }
  for(const bond of world.bonds){
    if(bond.stage==='ended')continue;
    if(!alive.has(bond.a)||!alive.has(bond.b)){
      bond.stage='ended';bond.ended=year;
      for(const id of [bond.a,bond.b]){
      appendLifeMoment(world,id,{year,kind:'separation',
          text:'Lost a partner after their death.',
        relatedIds:[id===bond.a?bond.b:bond.a]},records);
        const rec=records.get(id);
        if(rec&&!rec.partnerIds.includes(id===bond.a?bond.b:bond.a))
          rec.partnerIds.push(id===bond.a?bond.b:bond.a);
      }
    }
  }
  for(const agent of survivors){
    if(agent.partnerId!==undefined&&!alive.has(agent.partnerId))
      agent.partnerId=undefined;
  }
}
/** Gradual bonds and partnerships; no close relatives or minors. */
export function growBonds(world:World,rand:()=>number):number{
  const byId=new Map(world.agents.map(a=>[a.id,a]));
  const lineageIndex=new Map(world.lineage.map(r=>[r.id,r]));
  const bonded=new Set<number>();
  let partnerships=0;
  for(const bond of world.bonds){
    if(bond.stage==='ended')continue;
    const a=byId.get(bond.a),b=byId.get(bond.b);
    if(!a||!b){bond.stage='ended';bond.ended=world.year;continue;}
    const together=cheby(a,b)<=4;
    bond.strength=round(clamp(bond.strength+
      (together?.12:-.018)*(a.genes.social*divineFactor(a,'social',world.year)+
      b.genes.social*divineFactor(b,'social',world.year))/2,0,1));
    if(bond.stage==='courting'&&bond.strength>=.68){
      bond.stage='partner';a.partnerId=b.id;b.partnerId=a.id;partnerships++;
      appendLifeMoment(world,a.id,{year:world.year,kind:'partner',
        text:'Became partners with '+personName(world,
          lineageIndex.get(b.id)??b)+'.',relatedIds:[b.id]},lineageIndex);
      appendLifeMoment(world,b.id,{year:world.year,kind:'partner',
        text:'Became partners with '+personName(world,
          lineageIndex.get(a.id)??a)+'.',relatedIds:[a.id]},lineageIndex);
    }else if(bond.strength<=.20){
      bond.stage='ended';bond.ended=world.year;
      if(a.partnerId===b.id)a.partnerId=undefined;
      if(b.partnerId===a.id)b.partnerId=undefined;
    }else if(bond.stage==='partner'){
      a.partnerId=b.id;b.partnerId=a.id;
    }
    if(bond.stage!=='ended'){bonded.add(a.id);bonded.add(b.id);}
  }
  // Deterministic order by agent ID; movement itself is randomized each tick.
  const available=world.agents.filter(a=>!bonded.has(a.id)&&
    a.age>=traitProfile(a.ancestry).maturity&&
    a.age<traitProfile(a.ancestry).lifespan*
      divineFactor(a,'lifespan',world.year)*.76&&a.health>55&&a.energy>45)
    .sort((a,b)=>a.id-b.id);
  const pos=new Map<number,Agent[]>();
  for(const a of available){
    const index=a.y*world.width+a.x,group=pos.get(index);
    if(group)group.push(a);else pos.set(index,[a]);
  }
  for(const a of available){
    if(bonded.has(a.id))continue;
    if(rand()>.42*a.genes.social*divineFactor(a,'social',world.year))continue;
    const candidates:Agent[]=[];
    for(let y=a.y-2;y<=a.y+2;y++)for(let x=a.x-2;x<=a.x+2;x++){
      if(x<0||y<0||x>=world.width||y>=world.height)continue;
      for(const b of pos.get(y*world.width+x)??[]){
        if(b.id===a.id||bonded.has(b.id)||isCloseFamily(world,a.id,b.id,lineageIndex))
          continue;
        const comp=compatibility(a,b,world.settings.interbreeding);
        if(comp<.34||rand()>comp*.9)continue;
        candidates.push(b);
      }
    }
    if(!candidates.length)continue;
    candidates.sort((x,y)=>compatibility(a,y,world.settings.interbreeding)-
      compatibility(a,x,world.settings.interbreeding)||x.id-y.id);
    const b=candidates[0],score=compatibility(a,b,world.settings.interbreeding);
    const bond:Bond={id:world.nextBondId++,a:a.id,b:b.id,since:world.year,
      stage:'courting',strength:round(.41+score*.19),children:[]};
    world.bonds.push(bond);
    appendLifeMoment(world,a.id,{year:world.year,kind:'courtship',
      text:'Met '+personName(world,lineageIndex.get(b.id)??b)+
        ' and began courting.',relatedIds:[b.id]},lineageIndex);
    appendLifeMoment(world,b.id,{year:world.year,kind:'courtship',
      text:'Met '+personName(world,lineageIndex.get(a.id)??a)+
        ' and began courting.',relatedIds:[a.id]},lineageIndex);
    bonded.add(a.id);bonded.add(b.id);
  }
  if(world.bonds.length>6000){
    // Retain active bonds and the most recent ended ones.
    const active=world.bonds.filter(b=>b.stage!=='ended');
    world.bonds=[...world.bonds.filter(b=>b.stage==='ended').slice(
      -Math.max(0,6000-active.length)),...active];
  }
  return partnerships;
}
/** Reproduction requires actual paired adults who are near each other. */
export function offspringFromBonds(
  world:World,rand:()=>number,
  findSpace:(parent:Agent,ancestry:Ancestry)=>{x:number;y:number}|null,
):Agent[]{
  const byId=new Map(world.agents.map(a=>[a.id,a]));
  const lineageIndex=new Map(world.lineage.map(r=>[r.id,r]));
  const residents=residentIndex(world.agents,world.width);
  const supportCache=new Map<number,number>();
  const localSupport=(a:Agent)=>{
    const position=a.y*world.width+a.x,cached=supportCache.get(position);
    if(cached!==undefined)return cached;
    // Families need a local food surplus, not merely enough food to avoid
    // starvation. This is ecological feedback, not a fixed population cap.
    const support=ecologicalBirthSupport(world,a,residents);
    supportCache.set(position,support);
    return support;
  };
  const populations={human:0,elf:0,dwarf:0,demon:0};
  for(const a of world.agents)populations[a.species]++;
  const newborns:Agent[]=[];
  // Even without a numerical cap, fertile space can be scarce. A reproducibly
  // shuffled queue prevents older families from monopolizing open birth sites.
  const candidates=world.bonds.filter(b=>b.stage==='partner');
  for(let i=candidates.length-1;i>0;i--){
    const j=Math.floor(rand()*(i+1));
    [candidates[i],candidates[j]]=[candidates[j],candidates[i]];
  }
  for(const bond of candidates){
    if(bond.stage!=='partner')continue;
    const a=byId.get(bond.a),b=byId.get(bond.b);
    if(!a||!b||cheby(a,b)>3)continue;
    const p=traitProfile(a.ancestry),q=traitProfile(b.ancestry);
    if(a.age<p.maturity||b.age<q.maturity||
      a.age>=p.lifespan*divineFactor(a,'lifespan',world.year)*.76||
      b.age>=q.lifespan*divineFactor(b,'lifespan',world.year)*.76||
      a.health<52||b.health<52||a.energy<57||b.energy<57)continue;
    const comp=compatibility(a,b,world.settings.interbreeding);
    // Healthy families have recovery time between births. This is shorter
    // for humans and longer for slower-maturing peoples and mixed families.
    const spacing=Math.max(3,Math.min(10,
      Math.round((p.maturity+q.maturity)*.075)));
    if(bond.lastBirthYear!==undefined&&
      world.year-bond.lastBirthYear<spacing)continue;
    const fertility=(p.fertility+q.fertility)/2;
    // A modest, census-responsive recovery bonus offsets the shorter
    // generations of humans and the low food of demon homelands.
    const minorityBoost=(a.species==='human'||a.species==='demon'||
      b.species==='human'||b.species==='demon')&&
      Math.min(populations[a.species],populations[b.species])<65?1.25:1;
    const chance=clamp(fertility*1.65*comp*minorityBoost*
      Math.min(localSupport(a),localSupport(b))*
      Math.min(a.genes.fertility,b.genes.fertility)*
      (divineFactor(a,'fertility',world.year)+
        divineFactor(b,'fertility',world.year))/2*
      (divineFactor(a,'luck',world.year)+divineFactor(b,'luck',world.year))/2*
      Math.min(a.energy,b.energy)/100*world.settings.resourceLevel,0,.78);
    if(rand()>=chance)continue;
    const ancestry=mixAncestry(a.ancestry,b.ancestry);
    const site=findSpace(a,ancestry);
    if(!site)continue;
    const baby:Agent={id:world.nextAgentId++,species:dominantSpecies(ancestry,rand()),
      ancestry,x:site.x,y:site.y,age:0,born:world.year,
      energy:77,health:94,genes:inheritedGenes(a.genes,b.genes,rand),
      generation:Math.max(a.generation,b.generation)+1,parents:[a.id,b.id],
      mind:initialMind(world.year)};
    baby.potentialRank=birthPotentialRank(world.settings.seed,baby.id,baby.genes);
    newborns.push(baby);bond.children.push(baby.id);
    bond.lastBirthYear=world.year;
    a.energy=Math.max(1,Math.round((a.energy-9)*100)/100);
    b.energy=Math.max(1,Math.round((b.energy-9)*100)/100);
    const record=makeLifeRecord(world,baby,lineageIndex);
    world.lineage.push(record);lineageIndex.set(record.id,record);
    for(const parent of [a,b]){
      const parentRecord=lineageIndex.get(parent.id);
      if(parentRecord)parentRecord.children.push(baby.id);
      appendLifeMoment(world,parent.id,{year:world.year,kind:'parenthood',
        text:'Welcomed '+personName(world,record)+' into the family.',
        relatedIds:[baby.id]},lineageIndex);
    }
  }
  // Leave references intact when trimming; the UI gracefully shows "unknown"
  // if an ancestor is older than the retained archive window.
  const archiveLimit=14000+world.agents.length+newborns.length;
  if(world.lineage.length>archiveLimit){
    const live=new Set([...world.agents,...newborns].map(a=>a.id));
    const recentDead=world.lineage.filter(r=>!live.has(r.id));
    const pinned=new Set(world.codex?.favoritePeople??[]);
    // Protect bookmarked people and immediate ancestors so a favorite's
    // family tree doesn't vanish when the archive reaches its retention cap.
    for(const id of [...pinned]){
      const record=lineageIndex.get(id);
      for(const p of record?.parents??[])pinned.add(p);
    }
    const keep=new Set([...live,...pinned]);
    const capacity=Math.max(0,archiveLimit-keep.size);
    for(const dead of (capacity?recentDead.filter(r=>!keep.has(r.id)).slice(-capacity):[]))
      keep.add(dead.id);
    world.lineage=world.lineage.filter(r=>keep.has(r.id));
  }
  return newborns;
}
