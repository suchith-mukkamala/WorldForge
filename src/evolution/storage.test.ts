import {afterEach,describe,expect,it,vi} from 'vitest';
import {advanceWorldDays} from './calendar';
import {createWorld} from './engine';
import {compactWorld,loadBrowserWorldSnapshot,loadDatabaseSnapshot,readSavedWorld,
  saveDatabaseWorld,SAVE_FORMAT_VERSION,WORLD_SCHEMA_VERSION,WORLD_STORAGE_KEY,
  WORLD_STORAGE_TIME_KEY} from './storage';

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
