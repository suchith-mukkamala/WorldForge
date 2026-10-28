import {describe,expect,it} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createWorld} from './engine';
import {SettlementView} from './SettlementView';
import {elevationAt} from './topography';

describe('v1.9.2 terrain-aware settlement visuals',()=>{
  it('uses saved world elevations in local map without editing citizens',()=>{
    const w=createWorld({seed:414,size:'small'});
    w.settlements=[{id:1,name:'Ridge',species:'human',x:28,y:24,
      founded:0,population:3,stores:10,emptyYears:0}];
    const original=JSON.stringify(w);
    const html=renderToStaticMarkup(createElement(SettlementView,{
      world:w,selectedId:1,onFindOnMap:()=>{},playing:false,
      onTogglePlay:()=>{},onAdvance:()=>{},
    }));
    expect(html).toContain('Elevation ');
    expect(html).toContain('Living Settlements');
    expect(html).toContain('Ridge');
    expect(elevationAt(w,28,24)).not.toBeNull();
    expect(JSON.stringify(w)).toBe(original);
  });
});
