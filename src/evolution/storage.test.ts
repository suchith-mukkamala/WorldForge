import {afterEach,describe,expect,it,vi} from 'vitest';
import {advanceWorldDays} from './calendar';
import {createWorld} from './engine';
import {compactWorld,loadDatabaseSnapshot,readSavedWorld,saveDatabaseWorld} from './storage';

afterEach(()=>vi.unstubAllGlobals());

describe('v1.2.1: autosave and older-save compatibility',()=>{
  it('keeps a midyear calendar date through compact browser saves',()=>{
    const world=advanceWorldDays(createWorld({seed:701,size:'small'}),179);
    expect(readSavedWorld(compactWorld(world))).toEqual(world);
    const {dayOfYear:_,...annualLegacy}=world;
    expect(readSavedWorld(JSON.stringify(annualLegacy))).toEqual(annualLegacy);
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
  });
});
