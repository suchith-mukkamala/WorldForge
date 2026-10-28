import {
  BIOMES,LEGACY_SIZES,SPECIES,createWorld,isWorld,normalizeSettings,
  type Agent,type Biome,type Tile,type World,type WorldSettings,
} from './engine';
import {livingRecord,pureAncestry} from './family';

/**
 * Browser saves use a compact four-character encoding per terrain tile,
 * reducing the storage footprint of 320×208 worlds. Exported JSON can remain
 * full and human-readable. Never trust imported or stored objects without
 * validating the reconstructed world.
 */
export const WORLD_STORAGE_KEY='worldforge:world:v2';
export const WORLD_STORAGE_TIME_KEY='worldforge:world:saved-at';
export const LEGACY_STORAGE_KEY='worldforge:world:v1';
export const MAX_WORLD_FILE_BYTES=64_000_000;
const WORLD_DATABASE='worldforge-worlds';
const WORLD_RECORD='current-world';
const WORLD_PREVIOUS_RECORD='previous-world';
const WORLD_STORE='snapshots';
function database():Promise<IDBDatabase>{
  return new Promise((resolve,reject)=>{
    if(typeof indexedDB==='undefined')return reject(Error('IndexedDB unavailable'));
    const request=indexedDB.open(WORLD_DATABASE,1);
    request.onupgradeneeded=()=>{
      if(!request.result.objectStoreNames.contains(WORLD_STORE))
        request.result.createObjectStore(WORLD_STORE);
    };
    request.onerror=()=>reject(request.error);
    request.onsuccess=()=>resolve(request.result);
  });
}
/** IndexedDB snapshots are atomically replaced. Keep the previously
 * committed checkpoint so a truncated or invalid latest value is recoverable.
 * Save order is serialized, and a failed transaction leaves the old version.
 */
export async function loadDatabaseSnapshot():Promise<{world:World;savedAt:number}|null>{
  const db=await database();
  try{
    const store=db.transaction(WORLD_STORE,'readonly').objectStore(WORLD_STORE);
    const get=(key:string)=>new Promise<unknown>((resolve,reject)=>{
      const request=store.get(key);
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
    });
    const records=await Promise.all([get(WORLD_RECORD),get(WORLD_PREVIOUS_RECORD)]);
    for(const entry of records){
      const payload=typeof entry==='string'?{raw:entry,savedAt:0}:
        entry&&typeof entry==='object'&&'raw' in entry&&'savedAt' in entry?
          entry as {raw:unknown;savedAt:unknown}:null;
      if(!payload||typeof payload.raw!=='string')continue;
      const world=readSavedWorld(payload.raw);
      if(world)return {world,savedAt:Number.isFinite(payload.savedAt)?
        Number(payload.savedAt):0};
    }
    return null;
  }finally{db.close();}
}
let saveQueue=Promise.resolve();
export function saveDatabaseWorld(raw:string,savedAt=Date.now()):Promise<void>{
  const write=async()=>{
    const db=await database();
    try{
      await new Promise<void>((resolve,reject)=>{
        const transaction=db.transaction(WORLD_STORE,'readwrite');
        const store=transaction.objectStore(WORLD_STORE);
        const previous=store.get(WORLD_RECORD);
        previous.onsuccess=()=>{
          const entry=previous.result;
          const old=typeof entry==='string'?entry:
            entry&&typeof entry==='object'&&'raw' in entry?
              (entry as {raw:unknown}).raw:null;
          // Preserve a backup only for a recognized checkpoint, avoiding
          // unnecessary writes of corrupt or non-world data.
          if(typeof old==='string'&&old.length<=MAX_WORLD_FILE_BYTES)
            store.put(entry,WORLD_PREVIOUS_RECORD);
          store.put({raw,savedAt},WORLD_RECORD);
        };
        previous.onerror=()=>reject(previous.error);
        transaction.oncomplete=()=>resolve();
        transaction.onerror=()=>reject(transaction.error);
        transaction.onabort=()=>reject(transaction.error);
      });
    }finally{db.close();}
  };
  const result=saveQueue.then(write);
  saveQueue=result.catch(()=>{});
  return result;
}
const ALPHABET='PFMCVWR'; // plains, forest, mountain, cave, volcanic, wasteland, water
const TILE_BIOMES:Biome[]=['plains','forest','mountain','cave','volcanic','wasteland','water'];
const packedBiome=(s:string)=>TILE_BIOMES[ALPHABET.indexOf(s)];
function encodeTiles(tiles:Tile[]):string{
  const chunks:string[]=[];
  // Chunk arrays to avoid quadratic string copies on very large worlds.
  for(let i=0;i<tiles.length;i+=1024){
    let chunk='';
    for(const t of tiles.slice(i,i+1024))
      chunk+=ALPHABET[TILE_BIOMES.indexOf(t.biome)]+
        Math.round(t.food*100).toString(36).padStart(3,'0');
    chunks.push(chunk);
  }
  return chunks.join('');
}
function decodeTiles(raw:string,count:number):Tile[]|null{
  if(raw.length!==count*4)return null;
  const tiles:Tile[]=[];
  for(let i=0;i<raw.length;i+=4){
    const biome=packedBiome(raw[i]),value=raw.slice(i+1,i+4);
    if(!biome||!/^[0-9a-z]{3}$/.test(value))return null;
    const food=parseInt(value,36)/100;
    if(food<0||food>20||!Number.isFinite(food))return null;
    tiles.push({biome,food});
  }
  return tiles;
}
export function compactWorld(world:World):string{
  const {tiles,...rest}=world;
  return JSON.stringify({format:'evo-packed-v2',world:rest,
    terrain:encodeTiles(tiles)});
}
function isRecord(input:unknown):input is Record<string,unknown>{
  return !!input&&typeof input==='object'&&!Array.isArray(input);
}
/** Safe conversion of v0.1 worlds. Original geography stays the same. */
export function migrateLegacyWorld(input:unknown):World|null{
  if(!isRecord(input)||input.version!==1||!isRecord(input.settings))return null;
  const old=input,settings=input.settings as Record<string,unknown>;
  const size=settings.size;
  if(size!=='small'&&size!=='medium'&&size!=='large')return null;
  const [width,height]=LEGACY_SIZES[size as keyof typeof LEGACY_SIZES];
  const starting=settings.starting as Record<string,unknown>;
  if(old.width!==width||old.height!==height||
    !Number.isSafeInteger(settings.seed)||Number(settings.seed)<1||
    !isRecord(settings.starting)||
    !SPECIES.every(s=>Number.isInteger(starting[s])&&
      Number(starting[s])>=0&&Number(starting[s])<=75)||
    !Number.isFinite(settings.resourceLevel)||Number(settings.resourceLevel)<.5||
    Number(settings.resourceLevel)>1.8||
    !Number.isFinite(settings.wandering)||Number(settings.wandering)<.5||
    Number(settings.wandering)>1.8||
    !Number.isInteger(old.year)||Number(old.year)<0||Number(old.year)>9999||
    !Number.isInteger(old.rngState)||Number(old.rngState)<0||
    !Array.isArray(old.tiles)||old.tiles.length!==width*height||
    !Array.isArray(old.agents)||old.agents.length>width*height||
    !Array.isArray(old.settlements)||old.settlements.length>54||
    !Array.isArray(old.history)||old.history.length<1||old.history.length>400||
    !Array.isArray(old.events)||old.events.length>90||
    !Number.isSafeInteger(old.nextAgentId)||!Number.isSafeInteger(old.nextSettlementId)||
    !Number.isSafeInteger(old.nextEventId)||
    !Number.isInteger(old.totalBirths)||!Number.isInteger(old.totalDeaths))
    return null;
  const tiles=old.tiles as unknown[];
  if(!tiles.every(t=>isRecord(t)&&BIOMES.includes(t.biome as Biome)&&
    Number.isFinite(t.food)&&Number(t.food)>=0&&Number(t.food)<=16))return null;
  const existing=new Set<number>(),occupied=new Set<number>();
  const agents:Agent[]=[];
  for(const raw of old.agents){
    if(!isRecord(raw)||!SPECIES.includes(raw.species as typeof SPECIES[number])||
      !Number.isSafeInteger(raw.id)||existing.has(raw.id as number)||
      !Number.isInteger(raw.x)||!Number.isInteger(raw.y)||
      Number(raw.x)<0||Number(raw.x)>=width||
      Number(raw.y)<0||Number(raw.y)>=height||
      !Number.isInteger(raw.age)||Number(raw.age)<0||
      !Number.isInteger(raw.born)||
      !Number.isFinite(raw.energy)||Number(raw.energy)<0||Number(raw.energy)>100||
      !Number.isFinite(raw.health)||Number(raw.health)<=0||Number(raw.health)>100||
      !isRecord(raw.genes)||
      !(['vigor','curiosity','fertility'] as const).every(k=>
        Number.isFinite((raw.genes as Record<string,unknown>)[k])&&
        Number((raw.genes as Record<string,unknown>)[k])>=.5&&
        Number((raw.genes as Record<string,unknown>)[k])<=1.5))return null;
    const index=Number(raw.y)*width+Number(raw.x);
    if(occupied.has(index)||isRecord(tiles[index])&&tiles[index].biome==='water')return null;
    occupied.add(index);existing.add(raw.id as number);
    const sp=raw.species as typeof SPECIES[number],g=raw.genes as Record<string,number>;
    const parents=Array.isArray(raw.parents)&&raw.parents.length===2&&
      raw.parents.every((v:unknown)=>Number.isSafeInteger(v)&&Number(v)>0)
      ?raw.parents as [number,number]:undefined;
    agents.push({id:raw.id as number,species:sp,x:raw.x as number,y:raw.y as number,
      age:raw.age as number,born:raw.born as number,
      energy:raw.energy as number,health:raw.health as number,
      genes:{vigor:g.vigor,curiosity:g.curiosity,fertility:g.fertility,social:1},
      ancestry:pureAncestry(sp),generation:parents?1:0,parents});
  }
  const lineage=agents.map(livingRecord);
  for(const child of lineage)for(const parent of child.parents??[]){
    const ancestor=lineage.find(r=>r.id===parent);
    if(ancestor)ancestor.children.push(child.id);
  }
  const world:World={version:2,settings:normalizeSettings({
    ...(settings as Partial<WorldSettings>),interbreeding:true,
  }),width,height,year:old.year as number,
    nextAgentId:old.nextAgentId as number,
    nextSettlementId:old.nextSettlementId as number,
    nextEventId:old.nextEventId as number,nextBondId:1,
    rngState:old.rngState as number,
    tiles:old.tiles as Tile[],agents,
    settlements:old.settlements as World['settlements'],
    bonds:[],lineage,events:old.events as World['events'],
    history:old.history as World['history'],
    totalBirths:old.totalBirths as number,totalDeaths:old.totalDeaths as number,
  };
  return isWorld(world)?world:null;
}
export function readSavedWorld(raw:string|null):World|null{
  if(!raw||raw.length>MAX_WORLD_FILE_BYTES)return null;
  try{
    const parsed:unknown=JSON.parse(raw);
    if(!isRecord(parsed))return null;
    if(parsed.format==='evo-packed-v2'){
      if(!isRecord(parsed.world)||typeof parsed.terrain!=='string')return null;
      const inner=parsed.world;
      const width=inner.width,height=inner.height;
      if(!Number.isInteger(width)||!Number.isInteger(height)||
        Number(width)<1||Number(height)<1||Number(width)>320||Number(height)>208)
        return null;
      const tiles=decodeTiles(parsed.terrain,Number(width)*Number(height));
      if(!tiles)return null;
      const candidate={...inner,tiles};
      return isWorld(candidate)?candidate:null;
    }
    if(parsed.version===1)return migrateLegacyWorld(parsed);
    return isWorld(parsed)?parsed:null;
  }catch{return null;}
}
export function loadBrowserWorld(storage:Pick<Storage,'getItem'>):World|null{
  try{
    const current=readSavedWorld(storage.getItem(WORLD_STORAGE_KEY));
    if(current)return current;
    return readSavedWorld(storage.getItem(LEGACY_STORAGE_KEY));
  }catch{return null;}
}
