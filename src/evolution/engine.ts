/** Evolution Lab 0.1 — deterministic agent ecosystem. One tick = one year.
 *  Individuals forage, migrate, age, pair, produce mixed-ancestry offspring
 *  and form settlements. Wars, disasters and neural learning remain future work. */
import {occupancyCounts,residentsNear,neighborhoodMask,markNeighborhood} from './spatialIndex';
import {
  pureAncestry,traitProfile,
  finalizeDeaths,growBonds,offspringFromBonds,hybridFraction,
} from './family';
import {makeLifeRecord,appendLifeMoment,registerSettlement,
  registerSettlementCollapse} from './identity';
import {initialMind,planMind,movementIntent,rememberForage,foodAround,MIND_GOALS,
  type AgentMind} from './mind';
import {prepareDevelopment,cloneDevelopment,helpDependent,developSociety,
  lifeStage,initialDevelopment,SKILLS,VALUES,CAREERS,MEMORY_KINDS,
  type Development,type Household,type CareOutcome} from './development';
import {activeEffects,cloneDivine,divineFactor,divineState,inheritDivinity,
  validDivinity,type DivineEffect,type DivineWhisper,type DivineState} from './divine';
import {advanceConstruction,archiveRuins,cloneInfrastructure,
  validConstruction,type SettlementInfrastructure,type RuinSite,type Trail} from './construction';
import {createDeposits,editDeposit,regrowDeposits,validDeposits,
  type ResourceDeposit} from './resources';
import {advanceEconomy,cloneEconomy,reconcileTradeTerrain,validEconomy,
  type SettlementEconomy,type Shipment,type WorkAssignment,type TradeRelation} from './economy';
import {advanceTransport,bridgeTiles,cloneTransport,reconcileTransportTerrain,validTransport,
  type TransportNetwork} from './transport';
import {advanceInstitutions,cloneInstitutions,validInstitutions,
  type Institutions} from './institutions';
import {addResident,removeResident,residentIndex,settlementSafetyLimit,
  tileCapacity} from './density';
import {advanceKnowledge,generateAncientSites,knows,validKnowledge,
  type AncientSite,type Artifact,type ExpeditionRecord,type KnowledgeState,
  type LearnedTopic,type Topic} from './knowledge';
import {advanceCulture,cloneCulture,validCulture,
  type Belief,type CultureState} from './culture';
import {cloneDailyLife,validDailyLife,type DailyLife} from './dailyLife';
import {visibleCoastTile} from './worldOutline';
import {cloneCognition,validCognition,type Cognition} from './mindII';
import {generateTopography,validTopography,type Topography} from './topography';
import {terrainStepEffort,type TerrainPhysics} from './terrainPhysics';
import {birthPotentialRank,isTraitRank,potentialRank,type TraitRank} from './traitRanks';
import {birthInnateTrait,innateTrait,isInnateTrait,type InnateTraitId} from './innateTraits';
import {naturalAwakeningPlan,isAwakeningRecord,type AwakeningRecord} from './awakening';
import {isTraitHeritage,type TraitHeritage} from './traitHeritage';
import {activeTraitBonus} from './traitEffects';
export type Species='human'|'elf'|'dwarf'|'demon';
export type Biome='plains'|'forest'|'mountain'|'cave'|'wasteland'|'volcanic'|'water';
export type WorldSize='small'|'medium'|'large'|'vast';
export type WorldSettings={
  seed:number;size:WorldSize;starting:Record<Species,number>;
  resourceLevel:number;wandering:number;interbreeding:boolean;
};
export type Genes={vigor:number;curiosity:number;fertility:number;social:number};
export type Ancestry=Record<Species,number>;
export type Agent={id:number;species:Species;ancestry:Ancestry;generation:number;
  x:number;y:number;age:number;energy:number;health:number;genes:Genes;
  potentialRank?:TraitRank;
  innateTrait?:InnateTraitId;
  traitHeritage?:TraitHeritage;
  awakening?:AwakeningRecord;
  born:number;parents?:[number,number];partnerId?:number;mind?:AgentMind;
  development?:Development;blessings?:DivineEffect[];whispers?:DivineWhisper[];
  work?:WorkAssignment;knowledge?:LearnedTopic[];mortalWound?:boolean;
  visitedSites?:number[];artifacts?:Artifact[];belief?:Belief;dailyLife?:DailyLife;
  cognition?:Cognition};
export type Bond={id:number;a:number;b:number;since:number;
  stage:'courting'|'partner'|'ended';strength:number;ended?:number;
  lastBirthYear?:number;children:number[]};
export type LifeMoment={year:number;
  kind:'arrival'|'birth'|'courtship'|'partner'|'separation'|'parenthood'|
    'death'|'founding'|'renamed'|'adoption'|'mentorship'|'career'|
    'independence'|'divine'|'discovery'|'awakening';text:string;relatedIds?:number[]};
export type LineageRecord={id:number;species:Species;ancestry:Ancestry;
  genes:Genes;born:number;died?:number;generation:number;name?:string;house?:string;
  potentialRank?:TraitRank;
  innateTrait?:InnateTraitId;
  traitHeritage?:TraitHeritage;
  awakening?:AwakeningRecord;
  moments?:LifeMoment[];parents?:[number,number];children:number[];partnerIds:number[];
  divineOrigins?:number[];knownKnowledge?:LearnedTopic[]};
export type SettlementLegacy={id:number;species:Species;name:string;
  x:number;y:number;founded:number;collapsed?:number;founderId?:number};
export type WorldCodex={favoritePeople:number[];favoriteSettlements:number[];
  settlements:SettlementLegacy[]};
export type Tile={biome:Biome;food:number};
export type Settlement={id:number;species:Species;name:string;x:number;y:number;
  founded:number;population:number;stores:number;emptyYears:number;
  infrastructure?:SettlementInfrastructure;economy?:SettlementEconomy;
  archives?:Topic[]};
export type WorldEvent={id:number;year:number;
  type:'world'|'birth'|'death'|'settlement'|'collapse'|'milestone'|'bond'|'hybrid'|
    'trade'|'guild'|'diplomacy'|'knowledge'|'culture';
  message:string};
export type DeathCause='old_age'|'starvation'|'exposure'|'ill_health';
export const DEATH_CAUSES:DeathCause[]=['old_age','starvation','exposure','ill_health'];
export const DEATH_LABELS:Record<DeathCause,string>={
  old_age:'Old age',starvation:'Starvation',exposure:'Harsh terrain',
  ill_health:'Declining health',
};
export type SpeciesVital={births:number;deaths:number;juvenileDeaths:number;
  ageAtDeathSum:number;causes:Record<DeathCause,number>};
export type Demography={sinceYear:number;bySpecies:Record<Species,SpeciesVital>};
export type YearVital={births:Record<Species,number>;
  deaths:Record<Species,number>;juvenileDeaths:Record<Species,number>;
  causes:Record<DeathCause,number>};
export type Sample={year:number;total:number;human:number;elf:number;dwarf:number;
  demon:number;births:number;deaths:number;settlements:number;vitals?:YearVital};
export type World={version:2;settings:WorldSettings;width:number;height:number;
  year:number;dayOfYear?:number;nextAgentId:number;nextSettlementId:number;nextEventId:number;
  nextBondId:number;rngState:number;tiles:Tile[];topography?:Topography;
  terrainPhysics?:TerrainPhysics;agents:Agent[];
  settlements:Settlement[];bonds:Bond[];lineage:LineageRecord[];
  events:WorldEvent[];history:Sample[];totalBirths:number;totalDeaths:number;
  demography?:Demography;codex?:WorldCodex;
  households?:Household[];nextHouseholdId?:number;divine?:DivineState;
  ruins?:RuinSite[];trails?:Trail[];deposits?:ResourceDeposit[];
  shipments?:Shipment[];nextShipmentId?:number;
  transport?:TransportNetwork;tradeRelations?:TradeRelation[];
  institutions?:Institutions;knowledge?:KnowledgeState;ancientSites?:AncientSite[];
  expeditions?:ExpeditionRecord[];culture?:CultureState};
export const SPECIES:Species[]=['human','elf','dwarf','demon'];
export const BIOMES:Biome[]=['plains','forest','mountain','cave','wasteland','volcanic','water'];
export const SPECIES_INFO:Record<Species,{name:string;symbol:string;color:string;
  lifespan:number;maturity:number;fertility:number;wander:number;metabolism:number;
  strength:number;speed:number;
  preferred:Biome[];intro:string}>={
  human:{name:'Humans',symbol:'H',color:'#f2c38c',lifespan:79,maturity:16,
    fertility:.31,wander:.60,metabolism:9.5,strength:1,speed:1,
    preferred:['plains','forest'],
    intro:'Adaptable wanderers · fast generations'},
  elf:{name:'Elves',symbol:'E',color:'#83e7bc',lifespan:245,maturity:36,
    fertility:.072,wander:.18,metabolism:7.5,strength:.92,speed:1.12,
    preferred:['forest'],
    intro:'Forest guardians · slow generations'},
  dwarf:{name:'Dwarves',symbol:'D',color:'#aebdff',lifespan:166,maturity:27,
    fertility:.115,wander:.12,metabolism:8.5,strength:1.25,speed:.85,
    preferred:['mountain','cave'],
    intro:'Mountain dwellers · enduring strongholds'},
  demon:{name:'Demons',symbol:'Δ',color:'#e39afa',lifespan:146,maturity:23,
    fertility:.175,wander:.42,metabolism:9.1,strength:1.85,speed:1.75,
    preferred:['wasteland','volcanic'],
    intro:'Powerful, swift explorers · formidable physical endurance'},
};
export const BIOME_INFO:Record<Biome,{name:string;color:string;food:number;growth:number}>={
  plains:{name:'Plains',color:'#536c55',food:7.5,growth:1.8},
  forest:{name:'Forest',color:'#275c53',food:9.5,growth:2.2},
  mountain:{name:'Mountains',color:'#61657b',food:5,growth:1.15},
  cave:{name:'Caverns',color:'#35394f',food:4.5,growth:.95},
  // Ashland ecosystems recover a little more reliably: low-food homelands
  // previously gave demon families disproportionate starvation risk.
  wasteland:{name:'Wasteland',color:'#74546a',food:4.7,growth:1.05},
  volcanic:{name:'Volcanic',color:'#87475f',food:4.1,growth:.95},
  water:{name:'Water',color:'#1f4866',food:0,growth:0},
};
export const DEFAULT_SETTINGS:WorldSettings={
  seed:104729,size:'medium',starting:{human:26,elf:19,dwarf:16,demon:13},
  resourceLevel:1,wandering:1,interbreeding:true,
};
export const WORLD_SIZES:Record<WorldSize,[number,number]>={
  small:[96,64],medium:[160,104],large:[256,160],vast:[320,208],
};
export const LEGACY_SIZES:Record<'small'|'medium'|'large',[number,number]>={
  small:[44,30],medium:[64,42],large:[82,54],
};
const clamp=(x:number,a:number,b:number)=>Math.max(a,Math.min(b,x));
const round=(n:number)=>Math.round(n*100)/100;
const prngState=(n:number)=>(Math.trunc(n)>>>0)||0x6d2b79f5;
function random(state:{n:number}){
  let x=state.n>>>0;
  x^=x<<13;x^=x>>>17;x^=x<<5;
  state.n=x>>>0;
  return state.n/4294967296;
}
const offset=(width:number,x:number,y:number)=>width*y+x;
const within=(w:number,h:number,x:number,y:number)=>x>=0&&y>=0&&x<w&&y<h;
const distance=(a:{x:number;y:number},b:{x:number;y:number})=>
  Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
export function normalizeSettings(input:Partial<WorldSettings>={}):WorldSettings {
  return {seed:Number.isFinite(input.seed)?clamp(Math.trunc(input.seed!),1,2147483647):
    DEFAULT_SETTINGS.seed,
    size:input.size&&Object.hasOwn(WORLD_SIZES,input.size)?input.size:'medium',
    starting:Object.fromEntries(SPECIES.map(s=>[s,clamp(Math.trunc(
      Number.isFinite(input.starting?.[s])?input.starting![s]:DEFAULT_SETTINGS.starting[s]
    ),0,75)])) as Record<Species,number>,
    resourceLevel:clamp(Number.isFinite(input.resourceLevel)?input.resourceLevel!:1,.5,1.8),
    wandering:clamp(Number.isFinite(input.wandering)?input.wandering!:1,.5,1.8),
    interbreeding:input.interbreeding!==false};
}
export function population(world:Pick<World,'agents'>):Record<Species,number>{
  const counts={human:0,elf:0,dwarf:0,demon:0};
  for(const a of world.agents)counts[a.species]++;
  return counts;
}
export function emptyDemography(sinceYear:number):Demography{
  return {sinceYear,bySpecies:Object.fromEntries(SPECIES.map(species=>
    [species,{births:0,deaths:0,juvenileDeaths:0,ageAtDeathSum:0,
      causes:Object.fromEntries(DEATH_CAUSES.map(c=>[c,0]))}])) as Record<Species,SpeciesVital>};
}
function emptyVitalYear():YearVital{
  return {births:Object.fromEntries(SPECIES.map(s=>[s,0])) as Record<Species,number>,
    deaths:Object.fromEntries(SPECIES.map(s=>[s,0])) as Record<Species,number>,
    juvenileDeaths:Object.fromEntries(SPECIES.map(s=>[s,0])) as Record<Species,number>,
    causes:Object.fromEntries(DEATH_CAUSES.map(c=>[c,0])) as Record<DeathCause,number>};
}
function sample(world:World,births:number,deaths:number,vitals?:YearVital):Sample{
  return {year:world.year,total:world.agents.length,...population(world),
    births,deaths,settlements:world.settlements.length,
    ...(vitals?{vitals}: {})};
}
function log(world:World,type:WorldEvent['type'],message:string){
  world.events.push({id:world.nextEventId++,year:world.year,type,message});
  if(world.events.length>90)world.events=world.events.slice(-90);
}
function biomeAt(x:number,y:number,w:number,h:number,seed:number):Biome{
  const u=x/(w-1),v=y/(h-1);
  const noise=(n:number)=>Math.sin(n+seed*.000173);
  const river=.475+.04*noise(v*12)+.017*noise(v*35);
  if(Math.abs(u-river)<.012||Math.hypot((u-.62)*1.6,(v-.20)*1.2)<.05)
    return 'water';
  // Remote scorched corners are the demons' starting borderlands.
  if(u>.73&&(v<.40||v>.69)){
    // Volcanic corners lie inside the irregular playable coastline so demons
    // retain their home biome without requiring a rectangular land border.
    const edge=Math.min(Math.hypot(u-.81,v-.23),Math.hypot(u-.81,v-.77));
    return edge<.105?'volcanic':'wasteland';
  }
  const ridge=.66+.075*noise(v*9)+.025*noise(v*26);
  if(u>ridge&&v>.27&&v<.86)
    return (noise(x*.9+y*.51)*.5+.5)>.68?'cave':'mountain';
  const forest=.34+.065*noise(v*10)+.035*noise(v*31);
  if(u<forest||(u<.53&&Math.sin(x*.28+y*.21+seed*.008)>.72))
    return 'forest';
  if(u>.79&&v<.24)return 'wasteland';
  return 'plains';
}
function genes(state:{n:number},parents?:[Genes,Genes]):Genes{
  const inherit=(key:keyof Genes)=>{
    const value=parents?(parents[0][key]+parents[1][key])*.5+
      (random(state)-.5)*.16:.8+random(state)*.4;
    return round(clamp(value,.65,1.4));
  };
  return {vigor:inherit('vigor'),curiosity:inherit('curiosity'),
    fertility:inherit('fertility'),social:inherit('social')};
}
function freeNearby(world:World,origin:{x:number;y:number},radius:number,
  occupied:Set<number>,accept:(tile:Tile)=>boolean,state:{n:number}){
  const possible:{x:number;y:number;score:number}[]=[];
  for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){
    const x=origin.x+dx,y=origin.y+dy;
    if(!within(world.width,world.height,x,y)||occupied.has(offset(world.width,x,y)))continue;
    if(!accept(world.tiles[offset(world.width,x,y)]))continue;
    possible.push({x,y,score:Math.abs(dx)+Math.abs(dy)+random(state)*3});
  }
  possible.sort((a,b)=>a.score-b.score);
  return possible[0]??null;
}
const centers:Record<Species,[number,number]>={
  human:[.42,.66],elf:[.18,.45],dwarf:[.70,.58],demon:[.91,.15],
};
export function createWorld(input:Partial<WorldSettings>={}):World{
  const settings=normalizeSettings(input),[width,height]=WORLD_SIZES[settings.size];
  const state={n:prngState(settings.seed)};
  const tiles:Tile[]=Array.from({length:width*height},(_,index)=>{
    const x=index%width,y=Math.floor(index/width);
    // v2.3: new worlds are islands with seeded, irregular coasts. The same
    // rectangular index space remains authoritative for simulation and saves.
    // Existing worlds are not rewritten when loading older save data.
    const biome=visibleCoastTile(x,y,width,height,'water',settings.seed)?
      biomeAt(x,y,width,height,settings.seed):'water';
    const info=BIOME_INFO[biome];
    return {biome,food:round(info.food*settings.resourceLevel*(.75+.25*random(state)))};
  });
  const world:World={version:2,settings,width,height,year:0,dayOfYear:0,rngState:state.n,
    nextAgentId:1,nextSettlementId:1,nextEventId:1,nextBondId:1,
    tiles,topography:generateTopography(width,height,tiles,settings.seed),
    terrainPhysics:{version:1},
    agents:[],settlements:[],bonds:[],lineage:[],
    events:[],history:[],totalBirths:0,totalDeaths:0,demography:emptyDemography(0),
    codex:{favoritePeople:[],favoriteSettlements:[],settlements:[]},divine:divineState(),
    ruins:[],trails:[],deposits:[],shipments:[],nextShipmentId:1,
    transport:{roads:[],bridges:[]},tradeRelations:[],
    institutions:{guilds:[],nextGuildId:1,accords:[]},knowledge:{firsts:[]},
    ancientSites:[],culture:{faiths:[],nextFaithId:1,governments:[],history:[]}};
  world.deposits=createDeposits(world);
  world.ancientSites=generateAncientSites(world);
  const occupied=new Set<number>();
  for(const s of SPECIES){
    const info=SPECIES_INFO[s];
    const target={x:Math.round(centers[s][0]*(width-1)),
      y:Math.round(centers[s][1]*(height-1))};
    // Nearest favored starting biome in O(tiles) rather than sorting huge worlds.
    let closest=target,closestD=Infinity;
    for(let index=0;index<tiles.length;index++){
      if(!info.preferred.includes(tiles[index].biome))continue;
      const x=index%width,y=Math.floor(index/width);
      const d=(x-target.x)**2+(y-target.y)**2;
      if(d<closestD){closestD=d;closest={x,y};}
    }
    for(let i=0;i<settings.starting[s];i++){
      const point=freeNearby(world,closest,Math.max(8,Math.ceil(Math.sqrt(i+1)*2.1)),
        occupied,t=>info.preferred.includes(t.biome),state)??
        freeNearby(world,closest,15,occupied,t=>t.biome!=='water',state);
      if(!point)continue;
      occupied.add(offset(width,point.x,point.y));
      const age=i%5===0?Math.floor(random(state)*info.maturity):
        info.maturity+Math.floor(random(state)*info.lifespan*.28);
      const founder:Agent={id:world.nextAgentId++,species:s,
        ancestry:pureAncestry(s),generation:0,
        x:point.x,y:point.y,age,energy:round(78+random(state)*19),
        health:round(84+random(state)*16),genes:genes(state),born:age===0?0:-age,
        mind:initialMind(0)};
      founder.potentialRank=birthPotentialRank(settings.seed,founder.id,founder.genes);
      founder.innateTrait=birthInnateTrait(settings.seed,founder.id,founder.genes);
      world.agents.push(founder);
      world.lineage.push(makeLifeRecord(world,founder));
    }
  }
  world.rngState=state.n;
  prepareDevelopment(world);
  log(world,'world','A world awakens. Humans, elves, dwarves and demons explore their homelands.');
  world.history.push(sample(world,0,0));
  return world;
}
const adult=(a:Agent)=>{
  const profile=traitProfile(a.ancestry);
  return a.age>=profile.maturity&&a.age<profile.lifespan*.76;
};
const favorable=(s:Species,biome:Biome)=>{
  if(s==='human')return biome!=='volcanic'&&biome!=='water';
  if(s==='elf')return biome==='forest'||biome==='plains';
  if(s==='dwarf')return biome==='mountain'||biome==='cave';
  return biome==='wasteland'||biome==='volcanic'||biome==='mountain';
};
export const biomeSuitability=(ancestry:Ancestry,biome:Biome)=>
  SPECIES.reduce((score,s)=>score+ancestry[s]*(favorable(s,biome)?1:0),0);
const settlementNames:Record<Species,string[]>={
  human:['Riverwatch','Ashvale','Westmere','Brightford','Stonebridge','Dawnreach'],
  elf:['Silvanor','Moonbloom','Evershade','Lunaris','Glimmerwood','Thornsong'],
  dwarf:['Ironhollow','Deepdelve','Anvilfall','Goldvein','Underpeak','Stoneforge'],
  demon:['Cinderhold','Ashrift','Nightspire','Emberreach','Duskfort','Blackflame'],
};
export function stepWorld(previous:World):World{
  const world:World={...previous,year:previous.year+1,
    tiles:previous.tiles.map(t=>({...t})),
    agents:previous.agents.map(a=>({...a,
      potentialRank:potentialRank(previous.settings.seed,a),
      innateTrait:innateTrait(previous.settings.seed,a),
      ...(a.traitHeritage?{traitHeritage:{...a.traitHeritage,
        parentDomains:[...a.traitHeritage.parentDomains] as TraitHeritage['parentDomains']}}:{}),
      ...(a.awakening?{awakening:{...a.awakening}}:{}),
      knowledge:a.knowledge?.map(k=>({...k})),
      visitedSites:a.visitedSites?[...a.visitedSites]:undefined,
      artifacts:a.artifacts?.map(v=>({...v})),
      belief:a.belief?{...a.belief}:undefined,
      dailyLife:a.dailyLife?cloneDailyLife(a.dailyLife):undefined,
      cognition:a.cognition?cloneCognition(a.cognition):undefined,
      development:a.development?cloneDevelopment(a.development):undefined,
      work:a.work?{...a.work}:undefined,
      blessings:activeEffects(a,previous.year+1).map(e=>({...e})),
      whispers:a.whispers?.filter(q=>q.until>=previous.year+1).map(q=>({...q})),
      mind:a.mind?{
      ...a.mind,target:a.mind.target?{...a.mind.target}:undefined,
      lastScarcity:a.mind.lastScarcity?{...a.mind.lastScarcity}:undefined,
      lastGoodFood:a.mind.lastGoodFood?{...a.mind.lastGoodFood}:undefined,
      expedition:a.mind.expedition?{...a.mind.expedition,
        home:{...a.mind.expedition.home}}:undefined,
    }:undefined})),
    settlements:previous.settlements.map(s=>({...s,infrastructure:s.infrastructure?
      cloneInfrastructure(s.infrastructure):undefined,
      economy:s.economy?cloneEconomy(s.economy):undefined,
      archives:s.archives?[...s.archives]:undefined})),
    bonds:previous.bonds.map(b=>({...b,children:[...b.children]})),
    lineage:previous.lineage.map(r=>({...r,
      potentialRank:potentialRank(previous.settings.seed,r),
      innateTrait:innateTrait(previous.settings.seed,r),children:[...r.children],
      ...(r.traitHeritage?{traitHeritage:{...r.traitHeritage,
        parentDomains:[...r.traitHeritage.parentDomains] as TraitHeritage['parentDomains']}}:{}),
      ...(r.awakening?{awakening:{...r.awakening}}:{}),
      partnerIds:[...r.partnerIds],divineOrigins:r.divineOrigins?[...r.divineOrigins]:undefined,
      knownKnowledge:r.knownKnowledge?.map(k=>({...k}))})),
    events:[...previous.events],history:[...previous.history],
    codex:previous.codex?{
      favoritePeople:[...previous.codex.favoritePeople],
      favoriteSettlements:[...previous.codex.favoriteSettlements],
      settlements:previous.codex.settlements.map(s=>({...s})),
    }:{favoritePeople:[],favoriteSettlements:[],settlements:[]},
    demography:previous.demography?{
      sinceYear:previous.demography.sinceYear,
      bySpecies:Object.fromEntries(SPECIES.map(s=>[s,
        {...previous.demography!.bySpecies[s],
          causes:{...previous.demography!.bySpecies[s].causes}}])) as Record<Species,SpeciesVital>,
    }:emptyDemography(previous.year),
    households:previous.households?.map(h=>({...h,home:{...h.home},
      residence:h.residence?{...h.residence}:undefined,
      members:[...h.members],caregivers:[...h.caregivers]}))??[],
    nextHouseholdId:previous.nextHouseholdId??1,
    divine:cloneDivine(previous.divine??divineState()),
    ruins:previous.ruins?.map(s=>({...s,roads:[...s.roads],
      buildings:s.buildings.map(b=>({...b,spent:{...b.spent}}))}))??[],
    trails:previous.trails?.map(t=>({...t}))??[],
    deposits:previous.deposits?.map(d=>({...d})),
    shipments:previous.shipments?.map(t=>({...t,route:[...t.route]}))??[],
    nextShipmentId:previous.nextShipmentId??1,
    transport:previous.transport?cloneTransport(previous.transport):undefined,
    tradeRelations:previous.tradeRelations?.map(r=>({...r}))??[],
    institutions:previous.institutions?cloneInstitutions(previous.institutions):undefined,
    culture:previous.culture?cloneCulture(previous.culture):undefined,
    knowledge:previous.knowledge?{firsts:previous.knowledge.firsts.map(k=>({...k}))}:
      {firsts:[]},
    ancientSites:previous.ancientSites?.map(s=>({...s,visitors:[...s.visitors],
      lostTopics:s.lostTopics?[...s.lostTopics]:undefined})),
    expeditions:previous.expeditions?.map(e=>({...e}))??[]};
  prepareDevelopment(world);
  regrowDeposits(world);
  for(const s of world.settlements){
    if(!world.codex!.settlements.some(r=>r.id===s.id)){
      world.codex!.settlements.push({id:s.id,species:s.species,name:s.name,
        x:s.x,y:s.y,founded:s.founded});
    }
  }
  const state={n:prngState(previous.rngState)};
  const yearVitals=emptyVitalYear();
  const residents=residentIndex(world.agents,world.width);
  const capacity=tileCapacity(world);
  const movementSteps:number[]=[];
  const leave=(tile:number,id:number)=>{
    removeResident(residents,tile,id);
  };
  const enter=(tile:number,id:number)=>{
    addResident(residents,tile,id);
  };
  // Biome-dependent regrowth and resource limits.
  for(const tile of world.tiles){
    const cfg=BIOME_INFO[tile.biome],limit=cfg.food*world.settings.resourceLevel;
    tile.food=round(clamp(tile.food+
      cfg.growth*world.settings.resourceLevel*(.48+.52*random(state)),0,limit));
  }
  const partnerPositions=new Map(world.agents.map(a=>[a.id,a]));
  const lifeRecords=new Map(world.lineage.map(r=>[r.id,r]));
  const permanentHomes=new Map((world.households??[]).filter(h=>h.residence)
    .map(h=>[h.id,h.home]));
  const finishedWells=world.settlements.flatMap(s=>s.infrastructure?.buildings
    .filter(b=>b.type==='well'&&b.stage==='complete')??[]);
  // One indexed coverage calculation replaces a distance-to-every-well
  // scan for every individual, including large settled populations.
  const wellCoverage=neighborhoodMask(world.width,world.height,finishedWells,5);
  const closeContacts=new Map<number,number>();
  for(const b of world.bonds){
    if(b.stage==='ended')continue;
    closeContacts.set(b.a,b.b);
    closeContacts.set(b.b,b.a);
  }
  const shuffled=[...world.agents];
  for(let i=shuffled.length-1;i>0;i--){
    const j=Math.floor(random(state)*(i+1));
    [shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];
  }
  const survivors:Agent[]=[];
  const sailors=new Map((world.shipments??[]).filter(t=>t.mode==='sea')
    .map(t=>[t.carrierId,t]));
  const careOutcomes=new Map<number,CareOutcome>();
  let deaths=0;
  for(const a of shuffled){
    const info={...traitProfile(a.ancestry),
      lifespan:traitProfile(a.ancestry).lifespan*divineFactor(a,'lifespan',world.year)};
    const startTile=offset(world.width,a.x,a.y);
    const tile=world.tiles[startTile];
    a.age++;
    const mobility=activeTraitBonus(world.settings.seed,a,'movement');
    const forageGift=activeTraitBonus(world.settings.seed,a,'foraging');
    const recoveryGift=activeTraitBonus(world.settings.seed,a,'recovery');
    a.mind=planMind(world,a,residents,partnerPositions,closeContacts,
      biomeSuitability,traitProfile,permanentHomes);
    const travel=clamp(info.wander*info.speed*(knows(a,'navigation')?1.16:1)*
      a.genes.curiosity*(1+mobility*.45)*world.settings.wandering*
      divineFactor(a,'courage',world.year),0,.94);
    const destination=a.mind.target;
    const motivated=!!destination&&distance(a,destination)>1;
    // Merchant movement is handled on the caravan's physical route later in
    // the same world tick. A courier cannot wander off with communal cargo.
    if(!a.work?.tradeId&&
      (random(state)<travel||motivated||a.energy<48||tile.food<.75)){
      const choices:{x:number;y:number;score:number}[]=[];
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        const x=a.x+dx,y=a.y+dy;
        if(!within(world.width,world.height,x,y))continue;
        const index=offset(world.width,x,y),candidate=world.tiles[index];
        if(candidate.biome==='water'||
          (residents.get(index)?.filter(id=>id!==a.id).length??0)>=capacity[index])
          continue;
        const suitability=biomeSuitability(a.ancestry,candidate.biome);
        const preference=suitability*13;
        const suit=suitability*14+(1-suitability)*-17;
        const movement=dx||dy?Math.min(4,a.genes.curiosity*4):2;
        const mate=partnerPositions.get(closeContacts.get(a.id)??-1);
        const mateRange=mate?distance({x,y},mate):Infinity;
        // Courtship and partners intentionally remain near one another.
        // Nearby forage can still win when an individual is hungry.
        const toward=mate?
          Math.max(-20,Math.min(20,(distance(a,mate)-mateRange)*16))+
          (mateRange<=2?6:0):0;
        const slopeCost=terrainStepEffort(world,startTile,index);
        choices.push({x,y,score:candidate.food*3+preference+suit+toward+
          movementIntent(a,x,y,world.year)+
          (a.mind.goal==='forage'?foodAround(world,x,y)*.12:0)+
          random(state)*(3+info.wander*14*world.settings.wandering)+movement-
          (slopeCost-1)*10});
      }
      choices.sort((a,b)=>b.score-a.score);
      const chosen=choices[0];
      if(chosen&&(chosen.x!==a.x||chosen.y!==a.y)){
        leave(offset(world.width,a.x,a.y),a.id);
        a.x=chosen.x;a.y=chosen.y;
        enter(offset(world.width,a.x,a.y),a.id);
        movementSteps.push(offset(world.width,a.x,a.y));
        a.energy-=terrainStepEffort(world,startTile,
          offset(world.width,a.x,a.y))*1.5/info.speed*(1-mobility);
      }
    }
    const current=world.tiles[offset(world.width,a.x,a.y)];
    const suitability=biomeSuitability(a.ancestry,current.biome);
    const comfortable=suitability>.45;
    const juvenile=a.age<info.maturity;
    // An individual forages the immediate neighborhood, rather than relying
    // entirely on the resources of one tile. Each gathered unit is actually
    // withdrawn from terrain; dense populations deplete their local supply.
    const stage=lifeStage(a);
    const targetMeal=info.metabolism*(stage==='infant'?0:
      stage==='child'?.074:stage==='adolescent'?.095:.11);
    let gathered=0;
    const sites:{tile:Tile;score:number}[]=[];
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      const x=a.x+dx,y=a.y+dy;
      if(!within(world.width,world.height,x,y))continue;
      const source=world.tiles[offset(world.width,x,y)];
      if(source.biome==='water'||source.food<=0)continue;
      sites.push({tile:source,score:source.food+(dx===0&&dy===0?2:0)});
    }
    sites.sort((x,y)=>y.score-x.score);
    for(const site of sites){
      const take=Math.min(site.tile.food,targetMeal-gathered);
      site.tile.food=round(Math.max(0,site.tile.food-take));
      gathered+=take;
      if(gathered>=targetMeal-.001)break;
    }
    if(targetMeal>0)rememberForage(a,world.year,gathered,targetMeal);
    const home=permanentHomes.get(a.development?.householdId??-1);
    const atHome=home&&distance(a,home)<=2;
    const dailyCost=info.metabolism*(stage==='infant'?.50:
      stage==='child'?.62:stage==='adolescent'?.82:1)*
      (comfortable?.86:1.12)*(atHome?.94:1);
    const voyage=current.biome==='water'?sailors.get(a.id):undefined;
    const ration=voyage?Math.min(.8,voyage.provisions??0):0;
    if(voyage)voyage.provisions=round(Math.max(0,(voyage.provisions??0)-ration));
    const nourishment=gathered*(comfortable?13.4:10.5)*(1+forageGift)*
      (1+Math.max(0,info.strength-1)*.18)*
      (1+(divineFactor(a,'luck',world.year)-1)*.18);
    a.energy=round(clamp(a.energy+nourishment+ration*15-dailyCost-
      Math.max(0,a.age/info.lifespan-.7)*1.3,0,100));
    const care=helpDependent(world,a,residents,partnerPositions);
    if(juvenile)careOutcomes.set(a.id,care);
    if(a.energy<32)a.health-=2.5+(32-a.energy)*.21;
    else{
      const well=wellCoverage[offset(world.width,a.x,a.y)]===1;
      const remedies=(knows(a,'herbalism')?.25:0)+(knows(a,'medicine')?.55:0);
      a.health=Math.min(100,a.health+(1.45+(well?.27:0)+remedies)*
        (1+recoveryGift)*a.genes.vigor*
        Math.sqrt(info.strength)*divineFactor(a,'health',world.year));
    }
    if(stage==='infant'&&!care.providerId)a.health-=1.65;
    if(juvenile&&!care.shelter)a.health-=stage==='infant'?.45:.09;
    if(!comfortable)a.health-=.45*(1-suitability)*(care.protected?.45:1);
    // Very low senescence until old age, then sharply increasing mortality.
    const ageRatio=a.age/info.lifespan;
    const senescence=ageRatio>.84?
      Math.min(.9,Math.pow((ageRatio-.84)/.30,2)*.20):0;
    let cause:DeathCause|null=null;
    if(a.mortalWound){
      cause='ill_health';
    }else if(a.energy<=0||a.health<=0){
      cause=a.energy<30?'starvation':suitability<.45?'exposure':'ill_health';
    }else if(ageRatio>1.22||random(state)<senescence){
      cause='old_age';
    }
    if(cause){
      leave(offset(world.width,a.x,a.y),a.id);
      deaths++;
      yearVitals.deaths[a.species]++;
      yearVitals.causes[cause]++;
      if(juvenile)yearVitals.juvenileDeaths[a.species]++;
      const record=world.demography!.bySpecies[a.species];
      record.deaths++;record.causes[cause]++;
      record.ageAtDeathSum+=a.age;
      appendLifeMoment(world,a.id,{year:world.year,kind:'death',
        text:a.mortalWound?'Died from wounds sustained in an ancient ruin.':
          'Died at age '+a.age+' ('+DEATH_LABELS[cause].toLowerCase()+').'},
      lifeRecords);
      if(juvenile)record.juvenileDeaths++;
    }else{
      a.health=round(clamp(a.health,0,100));survivors.push(a);
    }
  }
  world.agents=survivors;
  finalizeDeaths(world,survivors,world.year);
  // A real lifetime event, assessed only for survivors after aging/death.
  // No world RNG calls, no implicit stat bonuses, and no assumed awakening for
  // people who died before the threshold or never awaken naturally.
  const awakeningRecords=new Map(world.lineage.map(r=>[r.id,r]));
  let awakenings=0;
  for(const a of survivors){
    if(a.awakening)continue;
    const planned=naturalAwakeningPlan(world.settings.seed,a.id,a.genes,a.ancestry);
    if(planned.age===null||a.age<planned.age)continue;
    const awakening:AwakeningRecord={kind:'natural',age:a.age,year:world.year};
    a.awakening=awakening;
    const archive=awakeningRecords.get(a.id);
    if(archive)archive.awakening={...awakening};
    appendLifeMoment(world,a.id,{year:world.year,kind:'awakening',
      text:'Their innate gift awakened naturally at age '+a.age+'.'},awakeningRecords);
    awakenings++;
  }
  if(awakenings)log(world,'milestone',awakenings+' natural awakening'+
    (awakenings===1?'':'s')+' occurred among the living.');
  const partnerships=growBonds(world,()=>random(state));
  if(partnerships)log(world,'bond',partnerships+' partnership'+
    (partnerships===1?'':'s')+' formed this year.');
  const newborns=offspringFromBonds(world,()=>random(state),(parent,ancestry)=>{
    const full=new Set<number>();
    for(const [index,ids] of residents)if(ids.length>=capacity[index])full.add(index);
    const point=freeNearby(world,parent,2,full,
      t=>t.biome!=='water'&&biomeSuitability(ancestry,t.biome)>.34,state);
    if(point)enter(offset(world.width,point.x,point.y),-1);
    return point;
  });
  world.agents=[...survivors,...newborns].sort((a,b)=>a.id-b.id);
  const parentMap=new Map(survivors.map(a=>[a.id,a]));
  for(const baby of newborns){
    if(!baby.parents)continue;
    const first=parentMap.get(baby.parents[0]),second=parentMap.get(baby.parents[1]);
    if(first&&second)inheritDivinity(world,baby,[first,second]);
  }
  developSociety(world,careOutcomes,()=>random(state));
  for(const baby of newborns){
    world.demography!.bySpecies[baby.species].births++;
    yearVitals.births[baby.species]++;
  }
  const hybrids=newborns.filter(a=>hybridFraction(a.ancestry)>.01).length;
  if(hybrids)log(world,'hybrid',hybrids+' mixed-ancestry child'+
    (hybrids===1?'':'ren')+' born this year.');
  // Founders inspect the people actually nearby. Scanning every person for
  // every candidate would become quadratic now that there is no 850 cap.
  const residentCounts=occupancyCounts(world.width,world.height,world.agents);
  // Expanded settlement radii are tiny fixed-grid masks, updated immediately
  // as new settlements are founded during this same yearly iteration.
  const settlementCoverage=neighborhoodMask(world.width,world.height,
    world.settlements,7);
  const communityPositions=new Map<number,Agent[]>();
  for(const a of world.agents){
    const index=offset(world.width,a.x,a.y);
    const group=communityPositions.get(index);
    if(group)group.push(a);else communityPositions.set(index,[a]);
  }
  for(const a of world.agents){
    if(!adult(a)||world.settlements.length>=settlementSafetyLimit(world))continue;
    const info=SPECIES_INFO[a.species];
    if(biomeSuitability(a.ancestry,world.tiles[offset(world.width,a.x,a.y)].biome)<.55)
      continue;
    if(settlementCoverage[offset(world.width,a.x,a.y)])continue;
    const nearby:Agent[]=[];
    for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){
      const x=a.x+dx,y=a.y+dy;
      if(!within(world.width,world.height,x,y))continue;
      for(const b of communityPositions.get(offset(world.width,x,y))??[])
        if(b.species===a.species&&adult(b))nearby.push(b);
    }
    if(nearby.length<4)continue;
    const id=world.nextSettlementId++;
    const names=settlementNames[a.species];
    const n=world.settlements.filter(s=>s.species===a.species).length;
    const name=names[n%names.length]+(n>=names.length?' '+(1+Math.floor(n/names.length)):'');
    const founded:Settlement={id,species:a.species,name,x:a.x,y:a.y,
      founded:world.year,population:nearby.length,stores:20,emptyYears:0};
    world.settlements.push(founded);
    markNeighborhood(settlementCoverage,world.width,world.height,founded,7);
    registerSettlement(world,founded,a.id);
    log(world,'settlement',info.name+' founded '+name+' in the '+
      BIOME_INFO[world.tiles[offset(world.width,a.x,a.y)].biome].name.toLowerCase()+'.');
  }
  world.settlements=world.settlements.filter(s=>{
    const residents=residentsNear(residentCounts,world.width,world.height,s,5);
    s.population=residents;
    const local=world.tiles[offset(world.width,s.x,s.y)];
    s.stores=round(clamp(s.stores+(residents>0?local.food*.35-residents*.13:-2),0,100));
    s.emptyYears=residents===0?s.emptyYears+1:0;
    if(s.emptyYears>=5){
      log(world,'collapse',s.name+' was abandoned after its population disappeared.');
      archiveRuins(world,s);
      registerSettlementCollapse(world,s);
      return false;
    }
    return true;
  });
  // Real discoveries, contact-based teaching, preserved writings and dangerous
  // site expeditions precede economic work for the year.
  advanceKnowledge(world,()=>random(state));
  // Labor competes across farming, extraction, crafts, trade and construction.
  advanceEconomy(world,movementSteps);
  advanceInstitutions(world);
  // Culture responds to lived memories, faith conversations and residents'
  // votes. Policies spend real stocks; nothing depends on camera distance.
  advanceCulture(world,()=>random(state));
  // Construction is a world-tick system. Map zoom and open UI tabs never enter it.
  advanceConstruction(world,movementSteps);
  for(const crossing of advanceTransport(world))
    reconcileTradeTerrain(world,crossing);
  const births=newborns.length;
  world.totalBirths+=births;world.totalDeaths+=deaths;
  if(births)log(world,'birth',births+' newborn'+(births===1?'':'s')+' entered the world.');
  if(deaths){
    const breakdown=DEATH_CAUSES.filter(c=>yearVitals.causes[c]>0)
      .map(c=>DEATH_LABELS[c].toLowerCase()+': '+yearVitals.causes[c]).join(', ');
    log(world,'death',deaths+' individual'+(deaths===1?'':'s')+
      ' died ('+breakdown+').');
  }
  if(world.year%25===0)log(world,'milestone','Year '+world.year+': '+
    world.agents.length+' people, '+world.settlements.length+' settlements.');
  world.rngState=state.n;
  world.history.push(sample(world,births,deaths,yearVitals));
  if(world.history.length>400)world.history=world.history.slice(-400);
  return world;
}
export function advanceWorld(world:World,years:number):World{
  let next=world;
  for(let i=0;i<clamp(Math.trunc(years),0,200);i++)next=stepWorld(next);
  return next;
}
export type Brush={kind:'inspect'}|{kind:'spawn';species:Species}|
  {kind:'food'}|{kind:'terrain';biome:Biome};
export function editWorld(previous:World,x:number,y:number,brush:Brush):World{
  if(!within(previous.width,previous.height,x,y)||brush.kind==='inspect')return previous;
  const index=offset(previous.width,x,y),tile=previous.tiles[index];
  if(brush.kind==='spawn'&&(tile.biome==='water'||
    previous.agents.filter(a=>a.x===x&&a.y===y).length>=tileCapacity(previous)[index]))
    return previous;
  if(brush.kind==='terrain'&&brush.biome==='water'&&
    previous.agents.some(a=>a.x===x&&a.y===y))return previous;
  const world:World={...previous,agents:[...previous.agents],
    tiles:[...previous.tiles],lineage:[...previous.lineage],
    events:[...previous.events],deposits:previous.deposits?.map(d=>({...d})),
    transport:previous.transport?cloneTransport(previous.transport):undefined,
    tradeRelations:previous.tradeRelations?.map(r=>({...r}))};
  if(brush.kind==='spawn'){
    const state={n:prngState(previous.rngState)},info=SPECIES_INFO[brush.species];
    const age=info.maturity+Math.floor(random(state)*info.lifespan*.16);
    const newcomer:Agent={id:world.nextAgentId++,species:brush.species,
      ancestry:pureAncestry(brush.species),generation:0,x,y,
      age,energy:88,health:95,genes:genes(state),born:world.year-age,
      mind:initialMind(world.year)};
    newcomer.potentialRank=birthPotentialRank(world.settings.seed,
      newcomer.id,newcomer.genes);
    newcomer.innateTrait=birthInnateTrait(world.settings.seed,
      newcomer.id,newcomer.genes);
    newcomer.development=initialDevelopment(newcomer,tile.biome);
    world.agents.push(newcomer);
    world.lineage.push(makeLifeRecord(world,newcomer));
    world.rngState=state.n;
    log(world,'world','A '+brush.species+' wanderer entered the world.');
  }else if(brush.kind==='food'){
    world.tiles[index]={...tile,food:round(
      BIOME_INFO[tile.biome].food*world.settings.resourceLevel)};
  }else{
    world.tiles[index]={biome:brush.biome,food:round(
      BIOME_INFO[brush.biome].food*world.settings.resourceLevel)};
    // Terrain edits also refresh elevation, without changing existing paths.
    world.topography=generateTopography(world.width,world.height,
      world.tiles,world.settings.seed);
    editDeposit(world,index);
    reconcileTradeTerrain(world,index);
    reconcileTransportTerrain(world,index);
  }
  const last=previous.history.at(-1);
  world.history=[...previous.history.slice(0,-1),
    {...(last??sample(previous,0,0)),total:world.agents.length,
      ...population(world)}];
  return world;
}
export function isWorld(value:unknown):value is World{
  if(!value||typeof value!=='object')return false;
  const w=value as Partial<World>,settings=w.settings;
  if(w.version!==2||!settings||!Object.hasOwn(WORLD_SIZES,settings.size)||
    !Number.isSafeInteger(settings.seed)||settings.seed<1||settings.seed>2147483647||
    !Number.isFinite(settings.resourceLevel)||settings.resourceLevel<.5||
    settings.resourceLevel>1.8||!Number.isFinite(settings.wandering)||
    settings.wandering<.5||settings.wandering>1.8||
    typeof settings.interbreeding!=='boolean'||
    !settings.starting||typeof settings.starting!=='object'||
    !SPECIES.every(s=>Number.isInteger(settings.starting[s])&&
      settings.starting[s]>=0&&settings.starting[s]<=75))return false;
  if(!Number.isInteger(w.width)||!Number.isInteger(w.height)||
    !w.width||!w.height||w.width>320||w.height>208||
    !([WORLD_SIZES[settings.size],
      ...(['small','medium','large'].includes(settings.size)?
        [LEGACY_SIZES[settings.size as keyof typeof LEGACY_SIZES]]:[])]
      .some(([width,height])=>w.width===width&&w.height===height))||
    !Number.isInteger(w.year)||w.year===undefined||w.year<0||w.year>9999||
    (w.dayOfYear!==undefined&&(!Number.isInteger(w.dayOfYear)||
      w.dayOfYear<0||w.dayOfYear>=365))||
    !Number.isInteger(w.rngState)||w.rngState===undefined||
    w.rngState<0||w.rngState>4294967295||
    !Number.isSafeInteger(w.nextAgentId)||(w.nextAgentId as number)<1||
    !Number.isSafeInteger(w.nextSettlementId)||(w.nextSettlementId as number)<1||
    !Number.isSafeInteger(w.nextEventId)||(w.nextEventId as number)<1||
    !Number.isSafeInteger(w.nextBondId)||(w.nextBondId as number)<1||
    !Number.isInteger(w.totalBirths)||(w.totalBirths as number)<0||
    !Number.isInteger(w.totalDeaths)||(w.totalDeaths as number)<0||
    !Array.isArray(w.tiles)||w.tiles.length!==w.width*w.height||
    !Array.isArray(w.agents)||
    !Array.isArray(w.settlements)||w.settlements.length>settlementSafetyLimit(w as World)||
    !Array.isArray(w.bonds)||w.bonds.length>6000||
    !Array.isArray(w.lineage)||w.lineage.length>
      Math.max(14000+w.tiles.length,(w.totalBirths??0)+w.tiles.length)||
    !Array.isArray(w.events)||w.events.length>90||
    !Array.isArray(w.history)||w.history.length>400||w.history.length===0)return false;
  const width=w.width,height=w.height,year=w.year as number;
  if(w.topography!==undefined&&!validTopography(w.topography,width,height))
    return false;
  if(w.terrainPhysics!==undefined&&(!w.terrainPhysics||
    w.terrainPhysics.version!==1))return false;
  if(!w.tiles.every(t=>t&&BIOMES.includes(t.biome)&&Number.isFinite(t.food)&&
    t.food>=0&&t.food<=20))return false;
  const ids=new Set<number>(),positions=new Map<number,number>();
  const traversableBridges=bridgeTiles(w as World);
  const captains=new Map((w.shipments??[]).filter(t=>t.mode==='sea')
    .map(t=>[t.carrierId,t]));
  const checkGenes=(g:Genes)=>!!g&&
    (['vigor','curiosity','fertility','social'] as const).every(k=>
      Number.isFinite(g[k])&&g[k]>=.5&&g[k]<=1.5);
  const checkAncestry=(a:Ancestry)=>!!a&&SPECIES.every(s=>
    Number.isFinite(a[s])&&a[s]>=0&&a[s]<=1)&&
    Math.abs(SPECIES.reduce((sum,s)=>sum+a[s],0)-1)<.0001;
  const checkPlace=(p:{x:number;y:number})=>!!p&&
    Number.isInteger(p.x)&&Number.isInteger(p.y)&&within(width,height,p.x,p.y);
  const checkMemory=(m:{x:number;y:number;year:number})=>
    checkPlace(m)&&Number.isInteger(m.year)&&m.year>=0&&m.year<=year;
  const validNumber=(v:number)=>Number.isFinite(v)&&v>=0&&v<=100;
  const validIds=(ids:number[],limit:number)=>Array.isArray(ids)&&
    ids.length<=limit&&new Set(ids).size===ids.length&&
    ids.every(id=>Number.isSafeInteger(id)&&id>0);
  const checkDevelopment=(d:Development)=>!!d&&
    (d.householdId===undefined||(Number.isSafeInteger(d.householdId)&&d.householdId>0))&&
    validIds(d.caregiverIds,4)&&validIds(d.friends,4)&&
    (d.adoptedBy===undefined||
      Number.isSafeInteger(d.adoptedBy)&&d.adoptedBy>0)&&
    (d.mentorId===undefined||Number.isSafeInteger(d.mentorId)&&d.mentorId>0)&&
    (d.career===undefined||CAREERS.includes(d.career))&&
    (d.leftHomeYear===undefined||Number.isInteger(d.leftHomeYear)&&
      d.leftHomeYear>=0&&d.leftHomeYear<=year)&&
    !!d.skills&&SKILLS.every(s=>validNumber(d.skills[s]))&&
    !!d.values&&VALUES.every(v=>validNumber(d.values[v]))&&
    validNumber(d.trust)&&validNumber(d.empathy)&&validNumber(d.resilience)&&
    !!d.languages&&SPECIES.every(s=>validNumber(d.languages[s]))&&
    Array.isArray(d.knownBiomes)&&d.knownBiomes.length<=BIOMES.length&&
    new Set(d.knownBiomes).size===d.knownBiomes.length&&
    d.knownBiomes.every(b=>BIOMES.includes(b))&&
    Array.isArray(d.memories)&&d.memories.length<=18&&
    d.memories.every(m=>m&&Number.isInteger(m.year)&&m.year>=0&&m.year<=year&&
      MEMORY_KINDS.includes(m.kind)&&typeof m.detail==='string'&&
      m.detail.length<=220&&(m.otherId===undefined||
        Number.isSafeInteger(m.otherId)&&m.otherId>0))&&
    [d.yearsCared,d.yearsWithoutCare,d.yearsTaught].every(n=>
      Number.isInteger(n)&&n>=0);
  for(const a of w.agents){
    if(!a||!SPECIES.includes(a.species)||!Number.isSafeInteger(a.id)||a.id<=0||
      ids.has(a.id)||!Number.isInteger(a.x)||!Number.isInteger(a.y)||
      !within(width,height,a.x,a.y)||!Number.isInteger(a.age)||a.age<0||
      !Number.isInteger(a.born)||!Number.isInteger(a.generation)||a.generation<0||
      !checkAncestry(a.ancestry)||!checkGenes(a.genes)||
      (a.potentialRank!==undefined&&!isTraitRank(a.potentialRank))||
      (a.innateTrait!==undefined&&!isInnateTrait(a.innateTrait))||
      (a.traitHeritage!==undefined&&!isTraitHeritage(a.traitHeritage))||
      (a.awakening!==undefined&&!isAwakeningRecord(a.awakening,a.born,w.year))||
      !Number.isFinite(a.energy)||a.energy<0||a.energy>100||
      !Number.isFinite(a.health)||a.health<=0||a.health>100||
      (a.partnerId!==undefined&&(!Number.isSafeInteger(a.partnerId)||a.partnerId<=0))||
      (a.parents!==undefined&&(!Array.isArray(a.parents)||a.parents.length!==2||
        !a.parents.every(p=>Number.isSafeInteger(p)&&p>0)))||
      (a.mind!==undefined&&(!a.mind||!MIND_GOALS.includes(a.mind.goal)||
        typeof a.mind.reason!=='string'||a.mind.reason.length>140||
        !Number.isInteger(a.mind.since)||a.mind.since<0||a.mind.since>year||
        (a.mind.targetPersonId!==undefined&&
          (!Number.isSafeInteger(a.mind.targetPersonId)||
            a.mind.targetPersonId<=0||a.mind.targetPersonId>=w.nextAgentId!))||
        (a.mind.target!==undefined&&!checkPlace(a.mind.target))||
        (a.mind.expedition!==undefined&&(!a.mind.expedition||
          !Number.isSafeInteger(a.mind.expedition.siteId)||a.mind.expedition.siteId<=0||
          !Number.isInteger(a.mind.expedition.started)||
          a.mind.expedition.started<0||a.mind.expedition.started>year||
          !['preparing','travel','returning'].includes(a.mind.expedition.stage)||
          !Number.isFinite(a.mind.expedition.preparedness)||
          a.mind.expedition.preparedness<0||a.mind.expedition.preparedness>100||
          !Number.isFinite(a.mind.expedition.supplies)||
          a.mind.expedition.supplies<0||a.mind.expedition.supplies>100||
          !checkPlace(a.mind.expedition.home)))||
        (a.mind.lastScarcity!==undefined&&!checkMemory(a.mind.lastScarcity))||
        (a.mind.lastGoodFood!==undefined&&!checkMemory(a.mind.lastGoodFood))))||
      (a.development!==undefined&&!checkDevelopment(a.development))||
      (a.dailyLife!==undefined&&!validDailyLife(a.dailyLife,year))||
      (a.cognition!==undefined&&!validCognition(a.cognition,w as World)))return false;
    if(a.mortalWound!==undefined&&typeof a.mortalWound!=='boolean')return false;
    const index=offset(width,a.x,a.y);
    const voyage=captains.get(a.id);
    const aboard=voyage&&voyage.route[voyage.progress]===index;
    if((w.tiles[index].biome==='water'&&
      !traversableBridges.has(index)&&!aboard))return false;
    ids.add(a.id);positions.set(index,(positions.get(index)??0)+1);
  }
  const settlementIds=new Set<number>();
  for(const v of w.settlements){
    if(!v||!SPECIES.includes(v.species)||!Number.isSafeInteger(v.id)||
      v.id<=0||settlementIds.has(v.id)||!Number.isInteger(v.x)||
      !Number.isInteger(v.y)||!within(width,height,v.x,v.y)||
      typeof v.name!=='string'||v.name.length>100||
      !Number.isInteger(v.founded)||!Number.isFinite(v.stores)||
      v.stores<0||v.stores>100||!Number.isFinite(v.population)||
      !Number.isInteger(v.emptyYears)||v.emptyYears<0)return false;
    settlementIds.add(v.id);
  }
  const capacities=tileCapacity(w as World);
  for(const [index,count] of positions)if(count>capacities[index])return false;
  const bondIds=new Set<number>(),activeBondIds=new Set<number>();
  for(const b of w.bonds){
    if(!b||!Number.isSafeInteger(b.id)||bondIds.has(b.id)||
      !Number.isSafeInteger(b.a)||!Number.isSafeInteger(b.b)||b.a===b.b||
      !Number.isInteger(b.since)||b.since>w.year||
      !['courting','partner','ended'].includes(b.stage)||
      !Number.isFinite(b.strength)||b.strength<0||b.strength>1||
      (b.lastBirthYear!==undefined&&
        (!Number.isInteger(b.lastBirthYear)||b.lastBirthYear>w.year||b.lastBirthYear<b.since))||
      !Array.isArray(b.children)||b.children.length>1000||
      !b.children.every(id=>Number.isSafeInteger(id)&&id>0)||
      (b.ended!==undefined&&!Number.isInteger(b.ended)))return false;
    bondIds.add(b.id);
    if(b.stage!=='ended'){
      if(activeBondIds.has(b.a)||activeBondIds.has(b.b)||!ids.has(b.a)||!ids.has(b.b))
        return false;
      activeBondIds.add(b.a);activeBondIds.add(b.b);
    }
  }
  const records=new Set<number>();
  for(const r of w.lineage){
    if(!r||!Number.isSafeInteger(r.id)||r.id<=0||records.has(r.id)||
      !SPECIES.includes(r.species)||!checkGenes(r.genes)||
      (r.potentialRank!==undefined&&!isTraitRank(r.potentialRank))||
      (r.innateTrait!==undefined&&!isInnateTrait(r.innateTrait))||
      (r.traitHeritage!==undefined&&!isTraitHeritage(r.traitHeritage))||
      (r.awakening!==undefined&&!isAwakeningRecord(r.awakening,r.born,w.year))||
      !checkAncestry(r.ancestry)||!Number.isInteger(r.generation)||r.generation<0||
      !Number.isInteger(r.born)||
      (r.died!==undefined&&(!Number.isInteger(r.died)||r.died<r.born))||
      (r.name!==undefined&&(typeof r.name!=='string'||r.name.length>64))||
      (r.house!==undefined&&(typeof r.house!=='string'||r.house.length>64))||
      (r.moments!==undefined&&(!Array.isArray(r.moments)||r.moments.length>40||
        !r.moments.every(m=>m&&Number.isInteger(m.year)&&m.year>=0&&
          m.year<=year&&
          ['arrival','birth','courtship','partner','separation','parenthood','death',
            'founding','renamed','adoption','mentorship','career',
            'independence','divine','discovery','awakening'].includes(m.kind)&&
          typeof m.text==='string'&&m.text.length<=220&&
          (m.relatedIds===undefined||(Array.isArray(m.relatedIds)&&
            m.relatedIds.length<=20&&m.relatedIds.every(id=>Number.isSafeInteger(id)&&id>0))))))||
      !Array.isArray(r.children)||!Array.isArray(r.partnerIds)||
      r.children.length>2000||r.partnerIds.length>200||
      ![...r.children,...r.partnerIds].every(id=>Number.isSafeInteger(id)&&id>0)||
      (r.parents!==undefined&&(!Array.isArray(r.parents)||r.parents.length!==2||
        !r.parents.every(id=>Number.isSafeInteger(id)&&id>0))))return false;
    records.add(r.id);
  }
  // Optional because v0.2 JSON saves had no diagnostics. New saves are
  // populated with statistics from the year they begin tracking.
  if(w.demography!==undefined){
    const d=w.demography;
    if(!d||!Number.isInteger(d.sinceYear)||d.sinceYear<0||
      d.sinceYear>w.year||!d.bySpecies||
      !SPECIES.every(species=>{
        const r=d.bySpecies[species];
        return !!r&&Number.isInteger(r.births)&&r.births>=0&&
          Number.isInteger(r.deaths)&&r.deaths>=0&&
          Number.isInteger(r.juvenileDeaths)&&r.juvenileDeaths>=0&&
          r.juvenileDeaths<=r.deaths&&Number.isFinite(r.ageAtDeathSum)&&
          r.ageAtDeathSum>=0&&r.causes&&
          DEATH_CAUSES.every(c=>Number.isInteger(r.causes[c])&&r.causes[c]>=0)&&
          DEATH_CAUSES.reduce((n,c)=>n+r.causes[c],0)===r.deaths;
      }))return false;
  }
  if(w.codex!==undefined){
    const c=w.codex;
    if(!c||!Array.isArray(c.favoritePeople)||c.favoritePeople.length>100||
      !Array.isArray(c.favoriteSettlements)||c.favoriteSettlements.length>100||
      !Array.isArray(c.settlements)||c.settlements.length>1000||
      !c.favoritePeople.every(id=>Number.isSafeInteger(id)&&records.has(id))||
      new Set(c.favoritePeople).size!==c.favoritePeople.length||
      !c.favoriteSettlements.every(id=>Number.isSafeInteger(id)&&id>0)||
      new Set(c.favoriteSettlements).size!==c.favoriteSettlements.length||
      !c.settlements.every(v=>v&&Number.isSafeInteger(v.id)&&v.id>0&&
        SPECIES.includes(v.species)&&typeof v.name==='string'&&v.name.length<=100&&
        Number.isInteger(v.x)&&Number.isInteger(v.y)&&
        within(width,height,v.x,v.y)&&Number.isInteger(v.founded)&&
        v.founded<=year&&
        (v.collapsed===undefined||(Number.isInteger(v.collapsed)&&
          v.collapsed>=v.founded&&v.collapsed<=year))&&
        (v.founderId===undefined||Number.isSafeInteger(v.founderId)))||
      new Set(c.settlements.map(v=>v.id)).size!==c.settlements.length)
      return false;
  }
  if(w.households!==undefined){
    if(!Array.isArray(w.households)||w.households.length>
      Math.max(w.tiles.length,w.agents.length)||
      !Number.isSafeInteger(w.nextHouseholdId)||w.nextHouseholdId!<1)return false;
    const householdIds=new Set<number>();
    for(const h of w.households){
      if(!h||!Number.isSafeInteger(h.id)||h.id<1||
        householdIds.has(h.id)||!Number.isInteger(h.formed)||
        h.formed<0||h.formed>year||!checkPlace(h.home)||
        !SPECIES.includes(h.culture)||
        !validIds(h.members,Math.max(w.tiles.length,w.agents.length))||
        !validIds(h.caregivers,Math.max(w.tiles.length,w.agents.length))||
        !h.caregivers.every(id=>h.members.includes(id)))return false;
      householdIds.add(h.id);
    }
    if(!w.agents.every(a=>a.development?.householdId===undefined||
      householdIds.has(a.development.householdId)))return false;
  }
  if(!w.agents.every(a=>records.has(a.id))||!validDivinity(w as World)||
    !validConstruction(w as World)||!validDeposits(w as World)||
    !validInstitutions(w as World)||!validKnowledge(w as World)||
    !validCulture(w as World))return false;
  if(!w.history.every(p=>{
    const valid=Number.isInteger(p.year)&&p.year>=0&&
      Number.isInteger(p.total)&&p.total>=0&&
      Number.isInteger(p.births)&&p.births>=0&&
      Number.isInteger(p.deaths)&&p.deaths>=0&&
      Number.isInteger(p.settlements)&&
      SPECIES.every(s=>Number.isInteger(p[s])&&p[s]>=0);
    if(!valid)return false;
    if(!p.vitals)return true; // Prior snapshots need no fabricated history.
    return SPECIES.every(s=>Number.isInteger(p.vitals!.births[s])&&
      p.vitals!.births[s]>=0&&Number.isInteger(p.vitals!.deaths[s])&&
      p.vitals!.deaths[s]>=0&&Number.isInteger(p.vitals!.juvenileDeaths[s])&&
      p.vitals!.juvenileDeaths[s]>=0)&&
      DEATH_CAUSES.every(c=>Number.isInteger(p.vitals!.causes[c])&&
        p.vitals!.causes[c]>=0)&&
      SPECIES.reduce((n,s)=>n+p.vitals!.births[s],0)===p.births&&
      SPECIES.reduce((n,s)=>n+p.vitals!.deaths[s],0)===p.deaths&&
      DEATH_CAUSES.reduce((n,c)=>n+p.vitals!.causes[c],0)===p.deaths;
  }))return false;
  if(w.history.at(-1)!.year!==w.year||
    w.history.at(-1)!.total!==w.agents.length)return false;
  if(!validEconomy(w as World)||!validTransport(w as World))return false;
  if(!w.events.every(e=>Number.isSafeInteger(e.id)&&
    Number.isInteger(e.year)&&e.year>=0&&
    ['world','birth','death','settlement','collapse','milestone','bond','hybrid',
      'trade','guild','diplomacy','knowledge','culture']
      .includes(e.type)&&typeof e.message==='string'&&e.message.length<500))
    return false;
  return true;
}
