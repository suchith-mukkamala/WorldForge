import {afterEach,describe,expect,it,vi} from 'vitest';
import {advanceWorldDays} from './calendar';
import {BIOMES,createWorld,type Biome} from './engine';
import {commitBrowserSnapshot,compactWorld,inspectLocalRecord,LEGACY_STORAGE_KEY,
  loadBrowserWorldSnapshot,loadDatabaseSnapshot,LOCAL_SNAPSHOT_LIMIT,
  OMITTED_LOCAL_FORMAT,readSavedWorld,recoverStoredWorld,resolveStartupSave,
  saveDatabaseWorld,SAVE_FORMAT_VERSION,UNREADABLE_SAVE_NOTICE,WORLD_SCHEMA_VERSION,
  WORLD_STORAGE_KEY,WORLD_STORAGE_TIME_KEY,writeBrowserSnapshot,
  writeOmittedLocalSnapshot} from './storage';

afterEach(()=>vi.unstubAllGlobals());

describe('v1.2.1: autosave and older-save compatibility',()=>{
  it('keeps a midyear calendar date through compact browser saves',()=>{
    const world=advanceWorldDays(createWorld({seed:701,size:'small'}),179);
    expect(readSavedWorld(compactWorld(world))).toEqual(world);
    const {dayOfYear:_,...annualLegacy}=world;
    expect(readSavedWorld(JSON.stringify(annualLegacy))).toEqual(annualLegacy);
  });

  it('verifies v3 checksum, rejects unknown schema and supports packed v2',()=>{
    const world=createWorld({seed:408,size:'small'});
    const packed=JSON.parse(compactWorld(world));
    expect(SAVE_FORMAT_VERSION).toBe(3);
    expect(packed.format).toBe('evo-packed-v3');
    expect(packed.schemaVersion).toBe(WORLD_SCHEMA_VERSION);
    expect(readSavedWorld(JSON.stringify(packed))).toEqual(world);
    const legacyV2={format:'evo-packed-v2',world:packed.world,
      terrain:packed.terrain};
    expect(readSavedWorld(JSON.stringify(legacyV2))).toEqual(world);
    packed.world.year=99;
    expect(readSavedWorld(JSON.stringify(packed))).toBeNull();
    packed.schemaVersion=77;
    expect(readSavedWorld(JSON.stringify(packed))).toBeNull();
  });
  it('retains the exact v3 envelope, canonical checksum and compatibility',()=>{
    const w=createWorld({seed:215202,size:'small'});
    const encoded=compactWorld(w),payload=JSON.parse(encoded);
    const core={schemaVersion:payload.schemaVersion,world:payload.world,
      terrain:payload.terrain};
    const raw=JSON.stringify(core);
    let hash=2166136261;
    for(let i=0;i<raw.length;i++)
      hash=Math.imul(hash^raw.charCodeAt(i),16777619);
    const expected=(hash>>>0).toString(16).padStart(8,'0');
    expect(encoded).toBe(JSON.stringify({format:'evo-packed-v3',
      ...core,checksum:expected}));
    expect(readSavedWorld(encoded)).toEqual(w);
  });

  it('only trusts timestamps on valid browser snapshots',()=>{
    const world=createWorld({seed:409,size:'small'});
    const data=new Map([[WORLD_STORAGE_KEY,compactWorld(world)],
      [WORLD_STORAGE_TIME_KEY,'1000']]);
    const storage={getItem:(key:string)=>data.get(key)??null};
    expect(loadBrowserWorldSnapshot(storage)).toEqual({world,savedAt:1000});
    data.set(WORLD_STORAGE_KEY,'{broken');
    expect(loadBrowserWorldSnapshot(storage)).toBeNull();
    data.set(WORLD_STORAGE_KEY,compactWorld(world));
    data.set(WORLD_STORAGE_TIME_KEY,'not-a-time');
    expect(loadBrowserWorldSnapshot(storage)).toEqual({world,savedAt:0});
  });

  it('serializes IndexedDB checkpoints and restores the latest complete write',async()=>{
    const records=new Map<string,unknown>();
    const db={
      objectStoreNames:{contains:()=>true},close:()=>{},
      transaction:(_name:string,mode:string)=>{
        const transaction:{oncomplete?:()=>void;onerror?:()=>void;onabort?:()=>void;
          objectStore:()=>{put:(value:unknown,key:string)=>void;
            get:(key:string)=>{result?:unknown;onsuccess?:()=>void;onerror?:()=>void}}}={
          objectStore:()=>({
            put:(value,key)=>{
              if(mode!=='readwrite')throw Error('Not a writable transaction');
              queueMicrotask(()=>{records.set(key,value);transaction.oncomplete?.();});
            },
            get:(key)=>{
              const request:{result?:unknown;onsuccess?:()=>void;onerror?:()=>void}={};
              queueMicrotask(()=>{request.result=records.get(key);request.onsuccess?.();});
              return request;
            },
          }),
        };
        return transaction;
      },
    };
    vi.stubGlobal('indexedDB',{open:()=>{
      const request:{result:typeof db;onsuccess?:()=>void;
        onerror?:()=>void;onupgradeneeded?:()=>void}={result:db};
      queueMicrotask(()=>request.onsuccess?.());
      return request;
    }});
    const start=createWorld({seed:707,size:'small'});
    const later=advanceWorldDays(start,42);
    await Promise.all([
      saveDatabaseWorld(compactWorld(start),100),
      saveDatabaseWorld(compactWorld(later),200),
    ]);
    expect(await loadDatabaseSnapshot()).toEqual({world:later,savedAt:200});
    // If a newer checkpoint is truncated, restore the previous complete one.
    expect(records.has('previous-world')).toBe(true);
    records.set('current-world',{raw:'{not valid json',savedAt:300});
    expect(await loadDatabaseSnapshot()).toEqual({world:start,savedAt:100});
  });
});

describe('save snapshots stay lossless and do not revive stale copies',()=>{
  function memory(){
    const data=new Map<string,string>();
    return {
      data,
      getItem:(key:string)=>data.get(key)??null,
      setItem:(key:string,value:string)=>{data.set(key,value);},
      removeItem:(key:string)=>{data.delete(key);},
    };
  }

  it('packs every known biome and keeps unusual food in full JSON',()=>{
    const packed=createWorld({seed:12,size:'small'});
    for(const biome of BIOMES){
      packed.tiles[0]={biome,food:1.25};
      const raw=compactWorld(packed);
      expect(raw.startsWith('{"format":"evo-packed-v3"'),biome).toBe(true);
      expect(readSavedWorld(raw)?.tiles[0]).toEqual({biome,food:1.25});
    }
    const precise=createWorld({seed:13,size:'small'});
    precise.tiles[0]={...precise.tiles[0],food:1.234};
    const raw=compactWorld(precise);
    expect(raw.includes('evo-packed-v3')).toBe(false);
    expect(readSavedWorld(raw)?.tiles[0].food).toBe(1.234);
    const unknown=createWorld({seed:14,size:'small'});
    unknown.tiles[0]={...unknown.tiles[0],biome:'marsh' as Biome};
    const fallback=compactWorld(unknown);
    expect(fallback.includes('evo-packed-v3')).toBe(false);
    expect(fallback).toContain('marsh');
  });

  it('does not load a v1 world when the current key is corrupt or omitted',()=>{
    const legacy=createWorld({seed:15,size:'small'});
    const storage=memory();
    storage.setItem(LEGACY_STORAGE_KEY,JSON.stringify(legacy));
    storage.setItem(WORLD_STORAGE_KEY,'{broken');
    expect(loadBrowserWorldSnapshot(storage)).toBeNull();
    expect(inspectLocalRecord('{broken',null).kind).toBe('corrupt');
    writeOmittedLocalSnapshot(storage,400);
    expect(loadBrowserWorldSnapshot(storage)).toBeNull();
    expect(inspectLocalRecord(storage.getItem(WORLD_STORAGE_KEY),'400'))
      .toEqual({kind:'omitted',savedAt:400});
  });

  it('keeps the newest readable world and pauses when a save cannot be opened',()=>{
    const local=createWorld({seed:16,size:'small'});
    const newer=advanceWorldDays(local,10);
    const keys={
      localRaw:compactWorld(local),localTimeRaw:'100',legacyRaw:null,
      storageBlocked:false,
    };
    expect(resolveStartupSave({...keys,database:{world:newer,savedAt:200}}))
      .toEqual({kind:'restored',world:newer,source:'database'});
    expect(resolveStartupSave({...keys,database:{world:newer,savedAt:100}}))
      .toEqual({kind:'restored',world:local,source:'local'});
    expect(resolveStartupSave({
      localRaw:null,localTimeRaw:null,legacyRaw:JSON.stringify(local),
      database:{world:newer,savedAt:0},storageBlocked:false,
    })).toEqual({kind:'restored',world:newer,source:'database'});
    expect(resolveStartupSave({
      localRaw:null,localTimeRaw:null,legacyRaw:JSON.stringify(local),
      database:null,storageBlocked:false,
    })).toEqual({kind:'restored',world:local,source:'legacy'});
    const blocked=resolveStartupSave({
      localRaw:'{"format":"'+OMITTED_LOCAL_FORMAT+'","savedAt":50}',
      localTimeRaw:'50',legacyRaw:JSON.stringify(local),database:null,
      storageBlocked:false,
    });
    expect(blocked).toEqual({kind:'unreadable',reason:UNREADABLE_SAVE_NOTICE});
    expect(resolveStartupSave({
      localRaw:null,localTimeRaw:null,legacyRaw:null,database:null,
      storageBlocked:false,
    })).toEqual({kind:'new'});
  });

  it('writes a small marker only after a large snapshot commits',async()=>{
    const storage=memory();
    storage.setItem(WORLD_STORAGE_KEY,'stale-world');
    const raw='x'.repeat(LOCAL_SNAPSHOT_LIMIT);
    let committed='';
    await commitBrowserSnapshot(raw,80,storage,async(value,savedAt,canonical)=>{
      committed=value+':'+savedAt+':'+canonical;
    });
    expect(committed.startsWith('x'.repeat(20))).toBe(true);
    expect(storage.getItem(WORLD_STORAGE_KEY)).toContain(OMITTED_LOCAL_FORMAT);
    expect(storage.getItem(WORLD_STORAGE_KEY)).not.toContain('stale-world');
    const failed=memory();
    failed.setItem(WORLD_STORAGE_KEY,compactWorld(createWorld({seed:17,size:'small'})));
    await expect(commitBrowserSnapshot('small-save',90,failed,async()=>{
      throw Error('database down');
    })).resolves.toBeUndefined();
    expect(readSavedWorld(failed.getItem(WORLD_STORAGE_KEY))?.settings.seed)
      .not.toBe(17);
    expect(failed.getItem(WORLD_STORAGE_KEY)).toBe('small-save');
  });

  it('retries a local snapshot once after dropping the legacy key',()=>{
    const storage=memory();
    storage.setItem(LEGACY_STORAGE_KEY,'legacy');
    let attempts=0;
    const flaky={
      getItem:storage.getItem,
      removeItem:storage.removeItem,
      setItem:(key:string,value:string)=>{
        attempts+=1;
        if(attempts===1)throw Error('quota');
        storage.setItem(key,value);
      },
    };
    expect(writeBrowserSnapshot(flaky,'world',5)).toBe('stored');
    expect(storage.getItem(LEGACY_STORAGE_KEY)).toBeNull();
    expect(storage.getItem(WORLD_STORAGE_KEY)).toBe('world');
    expect(storage.getItem(WORLD_STORAGE_TIME_KEY)).toBe('5');
  });

  it('describes the snapshot a crashed page can still download',()=>{
    const world=createWorld({seed:18,size:'small'});
    const storage=memory();
    expect(recoverStoredWorld(null)).toEqual({kind:'none'});
    expect(recoverStoredWorld(storage)).toEqual({kind:'none'});
    storage.setItem(WORLD_STORAGE_KEY,compactWorld(world));
    storage.setItem(WORLD_STORAGE_TIME_KEY,'12');
    expect(recoverStoredWorld(storage)).toEqual({kind:'export',world});
    writeOmittedLocalSnapshot(storage,12);
    expect(recoverStoredWorld(storage)).toEqual({kind:'database-only'});
    storage.setItem(WORLD_STORAGE_KEY,'{nope');
    expect(recoverStoredWorld(storage)).toEqual({kind:'unreadable'});
  });
});
