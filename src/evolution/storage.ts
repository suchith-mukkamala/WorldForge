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
export const SAVE_FORMAT_VERSION=3;
export const WORLD_SCHEMA_VERSION=2;
/** Fast corruption detector, not a security signature. Full world validation
 * remains mandatory for every imported or restored snapshot. */
function checksum(input:string):string{
  let hash=2166136261;
  for(let i=0;i<input.length;i++)hash=Math.imul(hash^input.charCodeAt(i),16777619);
  return (hash>>>0).toString(16).padStart(8,'0');
}
/** Opening the database is not proportional to world size. A stuck open
 * must not leave the loading screen up forever. */
export const IDB_OPEN_TIMEOUT_MS=8_000;
/** Reading or writing a large snapshot can be slow. This only ends a
 * transaction that never settles, so later autosaves are not stuck behind it. */
export const IDB_IO_TIMEOUT_MS=60_000;
function database():Promise<IDBDatabase>{
  return new Promise((resolve,reject)=>{
    if(typeof indexedDB==='undefined'){
      reject(Error('IndexedDB unavailable'));
      return;
    }
    let settled=false;
    const timer=setTimeout(()=>fail(Error('IndexedDB timed out')),IDB_OPEN_TIMEOUT_MS);
    const fail=(error:unknown)=>{
      if(settled)return;
      settled=true;
      clearTimeout(timer);
      reject(error instanceof Error?error:Error('IndexedDB failed'));
    };
    const succeed=(db:IDBDatabase)=>{
      if(settled){try{db.close();}catch{/* The timed-out open finished late. */}return;}
      settled=true;
      clearTimeout(timer);
      // Let another tab upgrade or delete the database instead of blocking it.
      db.onversionchange=()=>{db.close();};
      resolve(db);
    };
    let request:IDBOpenDBRequest;
    try{request=indexedDB.open(WORLD_DATABASE,1);}
    catch(error){fail(error);return;}
    request.onupgradeneeded=()=>{
      try{
        if(!request.result.objectStoreNames.contains(WORLD_STORE))
          request.result.createObjectStore(WORLD_STORE);
      }catch(error){fail(error);}
    };
    request.onblocked=()=>fail(Error('IndexedDB blocked'));
    request.onerror=()=>fail(request.error??Error('IndexedDB failed'));
    request.onsuccess=()=>succeed(request.result);
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
      let settled=false;
      const timer=setTimeout(()=>fail(Error('IndexedDB timed out')),IDB_IO_TIMEOUT_MS);
      const fail=(error:unknown)=>{
        if(settled)return;
        settled=true;
        clearTimeout(timer);
        reject(error instanceof Error?error:Error('IndexedDB failed'));
      };
      request.onsuccess=()=>{
        if(settled)return;
        settled=true;
        clearTimeout(timer);
        resolve(request.result);
      };
      request.onerror=()=>fail(request.error??Error('IndexedDB failed'));
    });
    const records=await Promise.all([get(WORLD_RECORD),get(WORLD_PREVIOUS_RECORD)]);
    for(const entry of records){
      const payload=typeof entry==='string'?{raw:entry,savedAt:0}:
        entry&&typeof entry==='object'&&'raw' in entry&&'savedAt' in entry?
          entry as {raw:unknown;savedAt:unknown}:null;
      if(!payload||typeof payload.raw!=='string')continue;
      const world=readSavedWorld(payload.raw);
      if(world)return {world,savedAt:finiteTime(payload.savedAt)};
    }
    return null;
  }finally{db.close();}
}
let saveQueue=Promise.resolve();
// Only the app's canonical compactWorld() writer may mark its own recent
// successfully committed payload as trusted. Unrecognized/external data is
// fully validated before being promoted to a recoverable backup.
let lastCommittedCanonical:string|null=null;
export function saveDatabaseWorld(raw:string,savedAt=Date.now(),
  canonical=false):Promise<void>{
  const write=async()=>{
    const db=await database();
    try{
      await new Promise<void>((resolve,reject)=>{
        const transaction=db.transaction(WORLD_STORE,'readwrite');
        const store=transaction.objectStore(WORLD_STORE);
        let settled=false;
        const timer=setTimeout(()=>{
          fail(Error('IndexedDB timed out'));
          try{transaction.abort();}catch{/* The transaction already finished. */}
        },IDB_IO_TIMEOUT_MS);
        const fail=(error:unknown)=>{
          if(settled)return;
          settled=true;
          clearTimeout(timer);
          reject(error instanceof Error?error:Error('IndexedDB failed'));
        };
        const ok=()=>{
          if(settled)return;
          settled=true;
          clearTimeout(timer);
          resolve();
        };
        const previous=store.get(WORLD_RECORD);
        previous.onsuccess=()=>{
          try{
            const entry=previous.result;
            const old=typeof entry==='string'?entry:
              entry&&typeof entry==='object'&&'raw' in entry?
                (entry as {raw:unknown}).raw:null;
            // Preserve a backup only for a recognized checkpoint, avoiding
            // unnecessary writes of corrupt or non-world data.
            if(typeof old==='string'&&
              (old===lastCommittedCanonical||readSavedWorld(old)))
              store.put(entry,WORLD_PREVIOUS_RECORD);
            store.put({raw,savedAt},WORLD_RECORD);
          }catch(error){fail(error);}
        };
        previous.onerror=()=>fail(previous.error??Error('IndexedDB failed'));
        transaction.oncomplete=()=>ok();
        transaction.onerror=()=>fail(transaction.error??Error('IndexedDB failed'));
        transaction.onabort=()=>fail(transaction.error??Error('IndexedDB aborted'));
      });
      lastCommittedCanonical=canonical?raw:null;
    }finally{db.close();}
  };
  const result=saveQueue.then(write);
  saveQueue=result.catch(()=>{});
  return result;
}
const ALPHABET='PFMCVWRTBS';
const TILE_BIOMES:Biome[]=['plains','forest','mountain','cave','volcanic','wasteland','water',
  'taiga','wetland','savanna'];
/** localStorage ceiling for a full snapshot. Larger worlds stay in IndexedDB. */
export const LOCAL_SNAPSHOT_LIMIT=2_000_000;
/** Replaces an oversized local snapshot after IndexedDB has the real world. */
export const OMITTED_LOCAL_FORMAT='evo-local-omitted';
const packedBiome=(s:string)=>TILE_BIOMES[ALPHABET.indexOf(s)];
/** Exactly four characters, and the same food value after decoding.
 * Unknown biomes and finer food values must not be clipped into this alphabet. */
function packTile(tile:Tile):string|null{
  const index=TILE_BIOMES.indexOf(tile.biome);
  if(index<0||!Number.isFinite(tile.food)||tile.food<0||tile.food>20)return null;
  const cents=Math.round(tile.food*100);
  if(cents<0||cents>46655||cents/100!==tile.food)return null;
  return ALPHABET[index]+cents.toString(36).padStart(3,'0');
}
function encodeTiles(tiles:Tile[]):string|null{
  const chunks:string[]=[];
  // Chunk arrays to avoid quadratic string copies on very large worlds.
  for(let i=0;i<tiles.length;i+=1024){
    let chunk='';
    for(const tile of tiles.slice(i,i+1024)){
      const code=packTile(tile);
      if(!code)return null;
      chunk+=code;
    }
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
  const terrain=encodeTiles(tiles);
  // A packed save that cannot represent a tile exactly would come back
  // altered or unreadable. Ordinary JSON is larger and already accepted.
  if(terrain===null||!terrain)return JSON.stringify(world);
  const core={schemaVersion:WORLD_SCHEMA_VERSION,world:rest,terrain};
  // Build the large world JSON only once. The original save performed two
  // full JSON.stringify passes: first for checksum, then for final envelope.
  // The envelope retains exactly the same field order and checksum bytes.
  const encoded=JSON.stringify(core);
  return '{"format":"evo-packed-v3",'+encoded.slice(1,-1)+
    ',"checksum":"'+checksum(encoded)+'"}';
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
    if(parsed.format==='evo-packed-v3'||parsed.format==='evo-packed-v2'){
      if(parsed.format==='evo-packed-v3'){
        if(parsed.schemaVersion!==WORLD_SCHEMA_VERSION||
          typeof parsed.checksum!=='string'||
          parsed.checksum!==checksum(JSON.stringify({
            schemaVersion:parsed.schemaVersion,world:parsed.world,
            terrain:parsed.terrain
          })))return null;
      }
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
function finiteTime(raw:unknown):number{
  const savedAt=Number(raw);
  return Number.isFinite(savedAt)?savedAt:0;
}
export type LocalSaveRecord=
  |{kind:'empty'}
  |{kind:'world';world:World;savedAt:number}
  |{kind:'omitted';savedAt:number}
  |{kind:'corrupt'};
/** A present but unreadable v2 key must not fall through to a v1 world.
 * An omitted marker means IndexedDB holds the snapshot that no longer fit. */
export function inspectLocalRecord(raw:string|null,savedAtRaw:string|null):LocalSaveRecord{
  if(!raw)return {kind:'empty'};
  try{
    const parsed:unknown=JSON.parse(raw);
    if(isRecord(parsed)&&parsed.format===OMITTED_LOCAL_FORMAT)
      return {kind:'omitted',savedAt:finiteTime(parsed.savedAt??savedAtRaw)};
  }catch{/* Invalid JSON is corrupt, not a legacy world. */}
  const world=readSavedWorld(raw);
  if(!world)return {kind:'corrupt'};
  return {kind:'world',world,savedAt:finiteTime(savedAtRaw)};
}
export function readBrowserSaveKeys(storage:Pick<Storage,'getItem'>):{
  localRaw:string|null;localTimeRaw:string|null;legacyRaw:string|null;
}{
  return {
    localRaw:storage.getItem(WORLD_STORAGE_KEY),
    localTimeRaw:storage.getItem(WORLD_STORAGE_TIME_KEY),
    legacyRaw:storage.getItem(LEGACY_STORAGE_KEY),
  };
}
export const UNREADABLE_SAVE_NOTICE=
  'Saved world was not loaded. Autosave is paused so a new world is not written over the browser backup. Reload to try again, or import a JSON backup.';
export type StartupSave=
  |{kind:'restored';world:World;source:'local'|'legacy'|'database'}
  |{kind:'new'}
  |{kind:'unreadable';reason:string};
/** Pick the newest readable snapshot. Never promote a blank world over a
 * save that exists but could not be opened. */
export function resolveStartupSave(input:{
  localRaw:string|null;localTimeRaw:string|null;legacyRaw:string|null;
  database:{world:World;savedAt:number}|null;
  storageBlocked:boolean;
}):StartupSave{
  const local=inspectLocalRecord(input.localRaw,input.localTimeRaw);
  const legacy=local.kind==='empty'&&!input.storageBlocked?
    readSavedWorld(input.legacyRaw):null;
  const database=input.database;
  if(local.kind==='world'){
    if(database&&database.savedAt>local.savedAt)
      return {kind:'restored',world:database.world,source:'database'};
    return {kind:'restored',world:local.world,source:'local'};
  }
  if(legacy){
    // Legacy v1 has no timestamp. A database snapshot is the primary copy
    // even when its saved time was not recorded.
    if(database)return {kind:'restored',world:database.world,source:'database'};
    return {kind:'restored',world:legacy,source:'legacy'};
  }
  if(database)return {kind:'restored',world:database.world,source:'database'};
  if(local.kind==='omitted'||local.kind==='corrupt'||input.storageBlocked)
    return {kind:'unreadable',reason:UNREADABLE_SAVE_NOTICE};
  return {kind:'new'};
}
export type BrowserSnapshotWrite='stored'|'too-large'|'failed';
export function writeBrowserSnapshot(
  storage:Pick<Storage,'setItem'|'removeItem'>,raw:string,savedAt:number,
  force=false,
):BrowserSnapshotWrite{
  if(!force&&raw.length>=LOCAL_SNAPSHOT_LIMIT)return 'too-large';
  const write=()=>{
    storage.setItem(WORLD_STORAGE_KEY,raw);
    storage.setItem(WORLD_STORAGE_TIME_KEY,String(savedAt));
  };
  try{write();return 'stored';}
  catch{
    try{storage.removeItem(LEGACY_STORAGE_KEY);write();return 'stored';}
    catch{return 'failed';}
  }
}
export function writeOmittedLocalSnapshot(
  storage:Pick<Storage,'setItem'>,savedAt:number,
):boolean{
  try{
    storage.setItem(WORLD_STORAGE_KEY,JSON.stringify({
      format:OMITTED_LOCAL_FORMAT,savedAt,
    }));
    storage.setItem(WORLD_STORAGE_TIME_KEY,String(savedAt));
    return true;
  }catch{return false;}
}
/** Compare timestamps only for valid saves. Corrupt localStorage records
 * must not suppress an older working IndexedDB checkpoint at startup, and
 * must not be replaced by an older v1 save. */
export function loadBrowserWorldSnapshot(storage:Pick<Storage,'getItem'>):
    {world:World;savedAt:number}|null{
  try{
    const keys=readBrowserSaveKeys(storage);
    const local=inspectLocalRecord(keys.localRaw,keys.localTimeRaw);
    if(local.kind==='world')return {world:local.world,savedAt:local.savedAt};
    if(local.kind!=='empty')return null;
    const legacy=readSavedWorld(keys.legacyRaw);
    return legacy?{world:legacy,savedAt:0}:null;
  }catch{return null;}
}
export type StoredWorldRecovery=
  |{kind:'export';world:World}
  |{kind:'database-only'}
  |{kind:'unreadable'}
  |{kind:'none'};
/** Last local snapshot a crashed page can still offer for download. */
export function recoverStoredWorld(storage:Pick<Storage,'getItem'>|null):
    StoredWorldRecovery{
  if(!storage)return {kind:'none'};
  try{
    const keys=readBrowserSaveKeys(storage);
    const local=inspectLocalRecord(keys.localRaw,keys.localTimeRaw);
    if(local.kind==='world')return {kind:'export',world:local.world};
    if(local.kind==='omitted')return {kind:'database-only'};
    if(local.kind==='corrupt')return {kind:'unreadable'};
    const legacy=readSavedWorld(keys.legacyRaw);
    return legacy?{kind:'export',world:legacy}:{kind:'none'};
  }catch{return {kind:'none'};}
}
export async function commitBrowserSnapshot(
  raw:string,savedAt:number,storage:Pick<Storage,'setItem'|'removeItem'>,
  saveDatabase:(raw:string,savedAt:number,canonical:boolean)=>Promise<void>,
):Promise<void>{
  const local=writeBrowserSnapshot(storage,raw,savedAt);
  try{await saveDatabase(raw,savedAt,true);}
  catch(error){
    if(local==='stored')return;
    if(writeBrowserSnapshot(storage,raw,savedAt,true)==='stored')return;
    throw error;
  }
  // The database has this world. Drop a stale local copy that would
  // otherwise look current the next time IndexedDB does not open.
  if(local!=='stored')writeOmittedLocalSnapshot(storage,savedAt);
}
export function persistBrowserWorld(
  world:World,storage:Pick<Storage,'setItem'|'removeItem'>,
  saveDatabase:(raw:string,savedAt:number,canonical:boolean)=>Promise<void>,
  savedAt=Date.now(),
):Promise<void>{
  return commitBrowserSnapshot(compactWorld(world),savedAt,storage,saveDatabase);
}
export function loadBrowserWorld(storage:Pick<Storage,'getItem'>):World|null{
  return loadBrowserWorldSnapshot(storage)?.world??null;
}
