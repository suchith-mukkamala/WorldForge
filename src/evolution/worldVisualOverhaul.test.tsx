import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {WorldforgeApp} from './WorldforgeApp';
import {createWorld} from './engine';
import {pixelTerrainHash,paintDepthRoads,paintDepthSurfaceDetail,
  depthRoadSignature,
  surfaceColor} from './depthWorldArt';
import {DEFAULT_WORLD_VIEW,readWorldPerspective,writeWorldPerspective,
  WORLD_VIEW_KEY} from './worldViewPreferences';

describe('v2.1.6 — default depth perspective and world artwork',()=>{
  it('defaults to raised 2.5D, remembers deliberate overhead choice',()=>{
    expect(DEFAULT_WORLD_VIEW).toBe('depth');
    expect(readWorldPerspective(null)).toBe('depth');
    const records=new Map<string,string>();
    const storage={
      getItem:(key:string)=>records.get(key)??null,
      setItem:(key:string,value:string)=>{records.set(key,value);},
    };
    expect(readWorldPerspective(storage)).toBe('depth');
    writeWorldPerspective(storage,'overhead');
    expect(records.get(WORLD_VIEW_KEY)).toBe('overhead');
    expect(readWorldPerspective(storage)).toBe('overhead');
    writeWorldPerspective(storage,'depth');
    expect(readWorldPerspective(storage)).toBe('depth');
    records.set(WORLD_VIEW_KEY,'corrupted');
    expect(readWorldPerspective(storage)).toBe('depth');
    expect(readWorldPerspective({getItem:()=>{throw Error('private');}}))
      .toBe('depth');
    expect(()=>writeWorldPerspective({
      setItem:()=>{throw Error('private');}},'depth')).not.toThrow();
  });
  it('renders a depth map with buttons rather than view and camera dropdowns',()=>{
    const html=renderToStaticMarkup(<WorldforgeApp/>);
    expect(html).toContain('◈ 2.5D WORLD');
    expect(html).toContain('aria-pressed="true">◈ 2.5D WORLD</button>');
    expect(html).toContain('aria-pressed="false">◈ 3D PREVIEW</button>');
    expect(html).toContain('PINCH TO ZOOM');
    expect(html).toContain('TWO-FINGER SCROLL TO PAN');
    expect(html).toContain('aria-label="Isometric terrain depth view');
    expect(html).toContain('aria-label="Map layers"');
    expect(html).toContain('aria-label="Playback pace"');
    expect(html).toContain('✧ WORLD TOOLS');
    expect(html).toContain('✧ ARCHIVES');
    expect(html).not.toContain('id="evo-map-view"');
    expect(html).not.toContain('id="evo-play-speed"');
    expect(html).not.toContain('id="evo-brush"');
  });
  it('colors seed-based terrain deterministically with real biome diversity',()=>{
    const colors=new Set<string>();
    for(const biome of ['plains','forest','mountain','cave',
      'volcanic','wasteland','water'] as const){
      const seen=new Set<string>();
      for(let x=0;x<12;x++)for(let y=0;y<12;y++){
        seen.add(surfaceColor(biome,x,y,2156));
        expect(surfaceColor(biome,x,y,2156)).toBe(surfaceColor(biome,x,y,2156));
      }
      expect(seen.size).toBeGreaterThan(1);
      colors.add(surfaceColor(biome,3,5,2156));
    }
    expect(colors.size).toBeGreaterThan(3);
    expect(pixelTerrainHash(4,7,2156)).toBe(pixelTerrainHash(4,7,2156));
  });
  it('draws detail and real roads without mutating geography or RNG',()=>{
    const world=createWorld({seed:2156,size:'small'});
    world.trails=[{index:world.width*5+9,wear:4}];
    const heights=new Array(world.width*world.height).fill(90);
    const operations:string[]=[];
    const ctx={
      fillStyle:'',strokeStyle:'',lineWidth:1,
      fillRect:()=>{operations.push('rect');},
      beginPath:()=>{operations.push('begin');},
      moveTo:()=>{},lineTo:()=>{},stroke:()=>{operations.push('line');},
    } as unknown as CanvasRenderingContext2D;
    const projector={project:(x:number,y:number,h:number)=>({
      x:x*12-y*6,y:(x+y)*3-h/12,
    })};
    const before=JSON.stringify(world);
    const roadKey=depthRoadSignature(world);
    expect(depthRoadSignature(world)).toBe(roadKey);
    expect(paintDepthRoads(ctx,world,heights,projector)).toBe(1);
    world.trails=[...world.trails,{index:world.width*6+10,wear:1}];
    expect(depthRoadSignature(world)).not.toBe(roadKey);
    world.trails.pop();
    for(let x=0;x<15;x++)
      paintDepthSurfaceDetail(ctx,'forest',{x:20,y:15},x,3,world.settings.seed);
    expect(operations).toContain('rect');
    expect(JSON.stringify(world)).toBe(before);
  });
});
