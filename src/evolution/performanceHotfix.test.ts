import {describe,expect,it} from 'vitest';
import {createWorld} from './engine';
import {advanceMindDay,createDayContext} from './mindII';
import {advanceWorldDays,TIME_RATES} from './calendar';
import {sceneAtmosphere,updateAtmosphereLayer} from './sceneAtmosphere';

describe('v2.1.5.1 — low-lag rendering and daily simulation',()=>{
  it('preserves idle agent snapshots without per-day deep cognition copies',()=>{
    const world=createWorld({seed:215101,size:'small'});
    const before=world.agents[0],initialCognition=before.cognition;
    const dayTwo=advanceMindDay(world,2,createDayContext(world));
    expect(dayTwo).not.toBe(world);
    expect(dayTwo.agents).not.toBe(world.agents);
    expect(dayTwo.agents[0]).toBe(before);
    expect(dayTwo.agents[0].cognition).toBe(initialCognition);
    const firstReview=advanceMindDay(world,1,createDayContext(world));
    expect(firstReview.agents[0]).not.toBe(before);
    expect(world.agents[0]).toBe(before);
    expect(world.agents[0].cognition).toBe(initialCognition);
  });
  it('keeps the same exact world across one batch and small calendar chunks',()=>{
    const start=createWorld({seed:215102,size:'small'});
    const whole=advanceWorldDays(start,21);
    let chunk=start;
    for(const days of [1,6,7,7])chunk=advanceWorldDays(chunk,days);
    expect(chunk).toEqual(whole);
  });
  it('batches highest playback into four-year steps without changing target speed',()=>{
    const high=TIME_RATES.find(rate=>rate.id==='sixteen')!;
    expect(high.days/high.interval*1000/365).toBe(16);
    expect(high.interval).toBeGreaterThanOrEqual(250);
    expect(high.days).toBe(1460);
  });
  it('reuses the same seasonal raster until day, year, seed or size changes',()=>{
    let paints=0,clears=0;
    const gradient={addColorStop(){}};
    const ctx={canvas:{width:96,height:60},fillStyle:'',globalAlpha:1,
      save(){},restore(){},
      clearRect(){clears++;},fillRect(){paints++;},
      createLinearGradient(){return gradient;},
    } as unknown as CanvasRenderingContext2D;
    const layer={width:96,height:60,
      getContext(){return ctx;}} as unknown as HTMLCanvasElement;
    expect(updateAtmosphereLayer(layer,12,3,84,'overhead')).toBe(true);
    const total=paints;
    expect(total).toBeGreaterThan(25);
    expect(updateAtmosphereLayer(layer,12,3,84,'overhead')).toBe(false);
    expect(paints).toBe(total);
    expect(clears).toBe(1);
    expect(updateAtmosphereLayer(layer,12,3,85,'overhead')).toBe(true);
    expect(updateAtmosphereLayer(layer,12,4,85,'overhead')).toBe(true);
    layer.width=100;
    expect(updateAtmosphereLayer(layer,12,4,85,'overhead')).toBe(true);
    expect(clears).toBe(4);
  });
  it('blends season lighting gradually without changing the calendar season',()=>{
    const before=sceneAtmosphere(91);
    const boundary=sceneAtmosphere(92);
    const middle=sceneAtmosphere(122);
    const finished=sceneAtmosphere(152);
    expect(before.season).toBe('Bloom');
    expect(boundary.season).toBe('Highsun');
    expect(boundary.wash).toBe(before.wash);
    expect(middle.wash).not.toBe(boundary.wash);
    expect(middle.wash).not.toBe(finished.wash);
    expect(finished.wash).toBe(sceneAtmosphere(170).wash);
    // New-year lighting crosses from frost to bloom without a hard flash.
    expect(sceneAtmosphere(0).wash).toBe(sceneAtmosphere(364).wash);
    expect(sceneAtmosphere(7)).toEqual(sceneAtmosphere(7));
  });
});
