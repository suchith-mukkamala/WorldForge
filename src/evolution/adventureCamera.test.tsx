import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {ADVENTURE_MIN_ZOOM,ADVENTURE_PITCH,cameraVerticalAnchor,
  enterAdventureZoom,enterAtlasZoom} from './adventureCamera';
import {nearbyAdventureTrees} from './adventureScenery';
import {createWorld,isWorld} from './engine';
import {MortalHUD} from './MortalHUD';
import {createMortal} from './divineDescent';

describe('v2.5.2 — adventure perspective',()=>{
  it('uses a closer, lower-angle frame while preserving atlas behavior',()=>{
    expect(ADVENTURE_PITCH).toBeLessThan(30);
    expect(ADVENTURE_PITCH).toBeGreaterThanOrEqual(12);
    expect(cameraVerticalAnchor('adventure')).toBeGreaterThan(.5);
    expect(cameraVerticalAnchor('atlas')).toBe(.5);
    expect(enterAdventureZoom(1)).toBe(ADVENTURE_MIN_ZOOM);
    expect(enterAdventureZoom(6.5)).toBe(6.5);
    expect(enterAdventureZoom(20)).toBe(8);
    expect(enterAtlasZoom(6.5)).toBe(3.5);
    expect(enterAtlasZoom(2)).toBe(2);
  });

  it('keeps close-up canopy sorting local, deterministic and read-only',()=>{
    const world=createWorld({seed:8512,size:'small'});
    const original=world.tiles;
    const center=world.agents[0];
    const trees=nearbyAdventureTrees(world,center.x,center.y,12);
    expect(nearbyAdventureTrees(world,center.x,center.y,12)).toEqual(trees);
    expect(trees.length).toBeLessThanOrEqual(27*27);
    for(const tree of trees){
      expect(Math.abs(tree.x-center.x)).toBeLessThanOrEqual(13);
      expect(Math.abs(tree.y-center.y)).toBeLessThanOrEqual(13);
      expect(tree.variant).toBeGreaterThanOrEqual(0);
      expect(tree.variant).toBeLessThanOrEqual(2);
    }
    expect(world.tiles).toBe(original);
    expect(isWorld(world)).toBe(true);
  });

  it('offers a simple camera switch without hiding mortal interactions',()=>{
    const world=createMortal(createWorld({seed:93,size:'small'}),{
      name:'Mira',species:'human',background:'scout',
      appearance:{skin:1,hair:2,hairStyle:1,outfit:'wanderer'},
    }).world;
    const render=(mode:'atlas'|'adventure')=>renderToStaticMarkup(
      createElement(MortalHUD,{world,nearby:[],targetId:null,message:'',
        running:true,cameraMode:mode,onToggleCamera:()=>{},
        onTalk:()=>{},onSelect:()=>{},onClose:()=>{},
        onToggleTime:()=>{},onLeave:()=>{},}));
    expect(render('adventure')).toContain('ADVENTURE VIEW');
    expect(render('atlas')).toContain('ATLAS VIEW');
    expect(render('adventure')).not.toContain('GREET');
    expect(render('adventure')).toContain('INTERACT');
    expect(render('adventure')).toContain('Switch mortal camera perspective');
  });
});
