/**
 * Evolution Lab v0.3: durable identities, player favorites and explainable
 * personal chronicles. All generated names are based on seed + immutable ID;
 * naming consumes no simulation random numbers and cannot change outcomes.
 */
import type {
  Agent,LifeMoment,LineageRecord,Settlement,SettlementLegacy,Species,World,
} from './engine';
import {livingRecord} from './family';

const GIVEN:Record<Species,string[]>={
  human:['Elara','Aldric','Mira','Kael','Rowan','Talia','Edric','Lyra','Soren',
    'Anwen','Edrin','Isolde','Bren','Celia','Nolan','Seren','Orin','Faye'],
  elf:['Aelith','Thalan','Elyra','Caelion','Sylwen','Vaelis','Lirael','Elaris',
    'Thiriel','Nimora','Faelan','Elowen','Aerendil','Ilyra','Naeris','Sael'],
  dwarf:['Borin','Dagna','Thora','Bram','Kelda','Orik','Durin','Hilda','Brunna',
    'Garrik','Torek','Runa','Baldr','Brynja','Doran','Morga'],
  demon:['Nyxara','Veyron','Azira','Malvek','Kaedra','Zareth','Sythra','Morvax',
    'Astrax','Zephira','Varyn','Xalith','Raze','Khaelos','Neris','Vaex'],
};
const HOUSES:Record<Species,string[]>={
  human:['Ashford','Riverborne','Dawnmere','Vale','Westbrook','Mooncrest',
    'Brightwood','Stonebridge','Emberly','Thornfield','Greymark','Willow'],
  elf:['Starleaf','Moonwhisper','Silverbranch','Evershade','Dawnwillow',
    'Thornsong','Mistgrove','Lunaris','Greenbloom','Nightbriar'],
  dwarf:['Ironheart','Deepdelve','Stonehand','Anvilborn','Goldvein',
    'Forgehelm','Rockmantle','Ironhollow','Copperbeard','Hammerfell'],
  demon:['Ashveil','Nightspire','Cinderborn','Riftwalker','Duskbane',
    'Embermaw','Blackthorn','Voidcrest','Flameward','Nighthollow'],
};
function stableHash(seed:number,id:number,salt:number){
  let n=(seed^Math.imul(id,0x9e3779b1)^salt)>>>0;
  n=Math.imul(n^(n>>>16),0x7feb352d);
  n=Math.imul(n^(n>>>15),0x846ca68b);
  return (n^(n>>>16))>>>0;
}
export function generatedGivenName(seed:number,id:number,species:Species){
  const options=GIVEN[species];
  return options[stableHash(seed,id,0x52315)%options.length];
}
export function generatedHouse(seed:number,id:number,species:Species){
  const options=HOUSES[species];
  return options[stableHash(seed,id,0x8f512)%options.length];
}
export function personName(world:Pick<World,'settings'>,person:Pick<LineageRecord,
  'id'|'species'|'name'|'house'>):string{
  return (person.name?.trim()||
    generatedGivenName(world.settings.seed,person.id,person.species))+' '+
    (person.house?.trim()||
    generatedHouse(world.settings.seed,person.id,person.species));
}
export function briefName(world:Pick<World,'settings'>,person:Pick<LineageRecord,
  'id'|'species'|'name'|'house'>){return personName(world,person);}
export function cleanIdentityName(value:string):string|null{
  const cleaned=value.trim().replace(/\s+/g,' ');
  if(cleaned.length<2||cleaned.length>64)return null;
  return /^[\p{L}\p{M}\p{N} .'\-]+$/u.test(cleaned)?cleaned:null;
}
export function makeLifeRecord(world:World,agent:Agent):LineageRecord{
  const record=livingRecord(agent);
  // Children normally inherit a parent's house, regardless of their
  // dominant species. New arrivals found an independent lineage.
  const parent=agent.parents&&world.lineage.find(r=>r.id===agent.parents![0]);
  const house=parent?
    (parent.house??generatedHouse(world.settings.seed,parent.id,parent.species)):
    generatedHouse(world.settings.seed,agent.id,agent.species);
  return {...record,
    name:generatedGivenName(world.settings.seed,agent.id,agent.species),
    house,
    moments:[{year:world.year,kind:agent.parents?'birth':'arrival',
      text:agent.parents?'Born into the '+house+' family.':
        'Entered the world among the founding peoples.'}]};
}
export function appendLifeMoment(
  world:Pick<World,'lineage'>,id:number,moment:LifeMoment,
):void{
  const record=world.lineage.find(r=>r.id===id);
  if(!record)return;
  // Recent entries are retained. Favorites are about the person, not only
  // their most recent events; the core birth/arrival moment stays visible.
  const existing=record.moments??[];
  record.moments=existing.length>=40?[existing[0],...existing.slice(-38),moment]:
    [...existing,moment];
}
export function codexOf(world:World):NonNullable<World['codex']>{
  return world.codex??{favoritePeople:[],favoriteSettlements:[],settlements:[]};
}
function copyCodex(world:World):NonNullable<World['codex']>{
  const c=codexOf(world);
  return {favoritePeople:[...c.favoritePeople],
    favoriteSettlements:[...c.favoriteSettlements],
    settlements:c.settlements.map(r=>({...r}))};
}
export function renamePerson(world:World,id:number,newName:string):World{
  const name=cleanIdentityName(newName);
  if(!name||!world.lineage.some(r=>r.id===id))return world;
  const split=name.lastIndexOf(' ');
  // Rename the whole displayed name, keeping the existing house if only
  // one name is provided. Multi-part renames update the family name for this
  // one person; relatives retain their own names.
  const first=split<0?name:name.slice(0,split);
  const house=split<0?undefined:name.slice(split+1);
  const old=world.lineage.find(r=>r.id===id)!;
  const lineage=world.lineage.map(r=>r.id===id?{
    ...r,name:first,house:house??r.house,
    moments:[...(r.moments??[]),{year:world.year,kind:'renamed' as const,
      text:'Known as '+name+'.'}].slice(-40),
  }:r);
  if(first===old.name&&(!house||house===old.house))return world;
  return {...world,lineage};
}
export function togglePersonFavorite(world:World,id:number):World{
  if(!world.lineage.some(r=>r.id===id))return world;
  const codex=copyCodex(world),i=codex.favoritePeople.indexOf(id);
  if(i>=0)codex.favoritePeople.splice(i,1);
  else if(codex.favoritePeople.length<100)codex.favoritePeople.unshift(id);
  else return world;
  return {...world,codex};
}
export function isPersonFavorite(world:World,id:number):boolean{
  return codexOf(world).favoritePeople.includes(id);
}
export function registerSettlement(world:World,s:Settlement,founderId:number):void{
  const c=world.codex??(world.codex=copyCodex(world));
  if(!c.settlements.some(r=>r.id===s.id)){
    c.settlements.push({id:s.id,species:s.species,name:s.name,
      x:s.x,y:s.y,founded:s.founded,founderId});
  }
  appendLifeMoment(world,founderId,{year:world.year,kind:'founding',
    text:'Helped found '+s.name+'.'});
}
export function registerSettlementCollapse(world:World,s:Settlement):void{
  const c=world.codex??(world.codex=copyCodex(world));
  const record=c.settlements.find(r=>r.id===s.id);
  if(record)record.collapsed=world.year;
}
export function knownSettlements(world:World):SettlementLegacy[]{
  const existing=codexOf(world).settlements;
  const ids=new Set(existing.map(s=>s.id));
  return [...existing,...world.settlements.filter(s=>!ids.has(s.id))
    .map(s=>({id:s.id,species:s.species,name:s.name,x:s.x,y:s.y,
      founded:s.founded}))];
}
export function renameSettlement(world:World,id:number,text:string):World{
  const name=cleanIdentityName(text),active=world.settlements.find(s=>s.id===id);
  const archived=knownSettlements(world).find(s=>s.id===id);
  if(!name||!archived||archived.collapsed!==undefined)return world;
  if(name===archived.name)return world;
  const codex=copyCodex(world);
  if(!codex.settlements.some(s=>s.id===id))codex.settlements.push({...archived});
  codex.settlements=codex.settlements.map(s=>s.id===id?{...s,name}:s);
  return {...world,codex,
    settlements:world.settlements.map(s=>s.id===id?{...s,name}:s),
    events:[...world.events,{id:world.nextEventId,year:world.year,type:'world' as const,
      message:archived.name+' was renamed '+name+'.'}].slice(-90),
    nextEventId:world.nextEventId+1};
}
export function toggleSettlementFavorite(world:World,id:number):World{
  if(!knownSettlements(world).some(s=>s.id===id))return world;
  const codex=copyCodex(world),i=codex.favoriteSettlements.indexOf(id);
  if(i>=0)codex.favoriteSettlements.splice(i,1);
  else if(codex.favoriteSettlements.length<100)codex.favoriteSettlements.unshift(id);
  else return world;
  return {...world,codex};
}
