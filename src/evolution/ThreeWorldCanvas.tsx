/** WorldForge v2.3 — an actual WebGL scene. All geometry is presentation-only.
 * The simulation still owns one authoritative square grid and the old depth
 * canvas remains a fallback for devices without WebGL. */
import {useEffect,useMemo,useRef,useState} from 'react';
import type {KeyboardEvent,MouseEvent} from 'react';
import * as THREE from 'three';
import {DepthCanvas} from './DepthCanvas';
import {SPECIES_INFO,type Biome,type Brush,type World} from './engine';
import type {MapOverlay} from './WorldCanvas';
import {SEA_LEVEL,topographyForWorld} from './topography';
import {visibleCoastTile} from './worldOutline';
import {paintPerson,PERSON_SPRITE_WIDTH,PERSON_SPRITE_HEIGHT,spriteKey} from './pixelArt';
import {renderedPopulation,populationScene} from './populationVisibility';
import {mortalWorldPoint} from './spatialDetails';
import {actionPose} from './motion';
import {type DepthCamera,DEFAULT_DEPTH_CAMERA} from './depthProjection';

const COLORS:Record<Biome,string>={
  water:'#3b809c',plains:'#81a176',forest:'#417d63',mountain:'#929da5',
  cave:'#69738a',wasteland:'#a17c80',volcanic:'#9b6869',
};
const WIDTH=1200,HEIGHT=760;
type SceneState={renderer:THREE.WebGLRenderer;scene:THREE.Scene;
  camera:THREE.OrthographicCamera;terrain:THREE.Group;
  structures:THREE.Group;people:THREE.Group;
  surface:THREE.Mesh<THREE.BufferGeometry,THREE.Material> | null;
  tileIds:number[];textures:Map<string,THREE.CanvasTexture>};

function disposeObject(object:THREE.Object3D){
  object.traverse(child=>{
    if(!(child instanceof THREE.Mesh))return;
    child.geometry.dispose();
    const materials=Array.isArray(child.material)?child.material:[child.material];
    for(const material of materials)material.dispose();
  });
}
function replaceGroup(group:THREE.Group){
  for(const object of [...group.children]){
    group.remove(object);disposeObject(object);
  }
}
/** One indexed-free, vertex-colored batch, including vertical cliff faces. */
function buildTerrain(world:World,overlay:MapOverlay,scene:SceneState){
  replaceGroup(scene.terrain);
  const elevations=topographyForWorld(world).heights;
  const vertices:number[]=[],colors:number[]=[],ids:number[]=[];
  const W=world.width,H=world.height;
  const visible=(x:number,y:number)=>x>=0&&y>=0&&x<W&&y<H&&
    visibleCoastTile(x,y,W,H,world.tiles[y*W+x].biome,world.settings.seed);
  const surface=(index:number)=>Math.max(-.8,(elevations[index]-SEA_LEVEL)/22);
  const add=(corners:number[][],color:THREE.Color,index:number)=>{
    for(const tri of [[0,1,2],[0,2,3]]){
      for(const corner of tri){
        vertices.push(...corners[corner]);
        colors.push(color.r,color.g,color.b);
      }
      ids.push(index);
    }
  };
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    if(!visible(x,y))continue;
    const i=y*W+x,tile=world.tiles[i],h=surface(i);
    const base=new THREE.Color(COLORS[tile.biome]);
    if(overlay==='elevation')base.setHSL(.59, .28,Math.min(.8,.2+h*.05));
    if(overlay==='resources'&&tile.biome!=='water')
      base.set(tile.food>5?'#77a66e':'#9b7772');
    const x0=x-W/2,x1=x0+1,z0=y-H/2,z1=z0+1;
    add([[x0,h,z0],[x1,h,z0],[x1,h,z1],[x0,h,z1]],base,i);
    // Exposed slopes provide true depth and contour, not a painted shadow.
    for(const [nx,ny,a,b] of [
      [x+1,y,[x1,z0],[x1,z1]],
      [x,y+1,[x1,z1],[x0,z1]],
      [x-1,y,[x0,z1],[x0,z0]],
      [x,y-1,[x0,z0],[x1,z0]],
    ] as const){
      const other=nx>=0&&ny>=0&&nx<W&&ny<H&&visible(nx,ny)?
        surface(ny*W+nx):-1.1;
      if(h<=other+.08)continue;
      const shade=base.clone().multiplyScalar(.62);
      add([[a[0],h,a[1]],[b[0],h,b[1]],
        [b[0],other,b[1]],[a[0],other,a[1]]],shade,i);
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.computeVertexNormals();
  const material=new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide});
  const mesh=new THREE.Mesh(geometry,material);
  scene.surface=mesh;scene.tileIds=ids;scene.terrain.add(mesh);
}
function buildStructures(world:World,scene:SceneState){
  replaceGroup(scene.structures);
  const heights=topographyForWorld(world).heights;
  const W=world.width,H=world.height;
  const ground=(x:number,y:number)=>Math.max(-.8,
    (heights[Math.max(0,Math.min(H-1,y))*W+
      Math.max(0,Math.min(W-1,x))]-SEA_LEVEL)/22);
  const positions:{x:number;y:number;pine:boolean}[]=[];
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const biome=world.tiles[y*W+x].biome;
    if(biome!=='forest'&&biome!=='plains')continue;
    const v=(Math.imul(x+world.settings.seed,73856093)^
      Math.imul(y+world.settings.seed,19349663))>>>0;
    if(v%(biome==='forest'?7:43)!==0)continue;
    positions.push({x,y,pine:v%3===0});
  }
  // One draw call per trunk/canopy material, regardless of forest size.
  const trunk=new THREE.InstancedMesh(new THREE.CylinderGeometry(.1,.14,.75,5),
    new THREE.MeshLambertMaterial({color:'#765740'}),positions.length);
  const canopy=new THREE.InstancedMesh(new THREE.ConeGeometry(.62,1.8,6),
    new THREE.MeshLambertMaterial({color:'#438467'}),positions.length);
  const placeholder=new THREE.Object3D();
  positions.forEach((p,i)=>{
    const x=p.x-W/2+.5,z=p.y-H/2+.5,h=ground(p.x,p.y);
    placeholder.position.set(x,h+.38,z);placeholder.scale.setScalar(1);
    placeholder.updateMatrix();trunk.setMatrixAt(i,placeholder.matrix);
    placeholder.position.y=h+1.42;
    placeholder.scale.set(p.pine?.8:1,p.pine?1.4:1,p.pine?.8:1);
    placeholder.updateMatrix();canopy.setMatrixAt(i,placeholder.matrix);
  });
  scene.structures.add(trunk,canopy);
  const stone=new THREE.InstancedMesh(new THREE.DodecahedronGeometry(.4,0),
    new THREE.MeshLambertMaterial({color:'#88959b'}),
    Math.min(900,world.deposits?.length??0));
  let stoneCount=0;
  for(const d of world.deposits??[]){
    if(stoneCount>=900)break;
    if(d.kind==='tree'||d.amount<=0)continue;
    const x=d.index%W,y=Math.floor(d.index/W);
    placeholder.position.set(x-W/2+.5,ground(x,y)+.3,y-H/2+.5);
    placeholder.scale.setScalar(.8);placeholder.updateMatrix();
    stone.setMatrixAt(stoneCount++,placeholder.matrix);
  }
  stone.count=stoneCount;scene.structures.add(stone);
  for(const settlement of world.settlements){
    for(const b of settlement.infrastructure?.buildings??[]){
      const x=b.x-W/2+.5,z=b.y-H/2+.5,h=ground(b.x,b.y);
      const scale=b.stage==='complete'?1:Math.max(.3,(b.progress??0)/100);
      const walls=new THREE.Mesh(new THREE.BoxGeometry(.83,1.2*scale,.83),
        new THREE.MeshLambertMaterial({color:SPECIES_INFO[settlement.species].color}));
      walls.position.set(x,h+.6*scale,z);
      const roof=new THREE.Mesh(new THREE.ConeGeometry(.72,.72,4),
        new THREE.MeshLambertMaterial({color:'#725563'}));
      roof.position.set(x,h+1.55*scale,z);roof.rotation.y=Math.PI/4;
      scene.structures.add(walls,roof);
    }
  }
}
function buildPeople(world:World,scene:SceneState,zoom:number,
  selected:{x:number;y:number}|null,followId:number|null){
  for(const object of [...scene.people.children]){
    scene.people.remove(object);
    // Sprites share a cached texture. Only their per-instance material dies.
    if(object instanceof THREE.Sprite)object.material.dispose();
  }
  if(scene.textures.size>1300){
    for(const texture of scene.textures.values())texture.dispose();
    scene.textures.clear();
  }
  const heights=topographyForWorld(world).heights,W=world.width,H=world.height;
  const agents=renderedPopulation(world.agents,populationScene(world),{
    bounds:{minX:0,minY:0,maxX:W-1,maxY:H-1},zoom,
    selected,focusId:followId,maxVisible:300});
  for(const person of agents){
    const action=actionPose(person.cognition?.today?.action??
      person.dailyLife?.activity);
    const walking=person.dailyLife?.activity==='travel';
    const stride=walking?(Math.floor((world.dayOfYear??0)/7)%4) as 0|1|2|3:0;
    const key=spriteKey(person)+':'+action+':'+stride;
    let texture=scene.textures.get(key);
    if(!texture){
      const image=document.createElement('canvas');
      image.width=PERSON_SPRITE_WIDTH;image.height=PERSON_SPRITE_HEIGHT;
      const ctx=image.getContext('2d');
      if(!ctx)continue;
      paintPerson(ctx,person,0,0,'south',stride,action);
      texture=new THREE.CanvasTexture(image);texture.magFilter=THREE.NearestFilter;
      texture.minFilter=THREE.NearestFilter;
      texture.colorSpace=THREE.SRGBColorSpace;
      scene.textures.set(key,texture);
    }
    const material=new THREE.SpriteMaterial({map:texture,transparent:true,
      depthWrite:false,alphaTest:.1});
    const sprite=new THREE.Sprite(material);
    const point=mortalWorldPoint(person,world);
    sprite.position.set(point.x-W/2+.5,
      Math.max(-.8,(heights[person.y*W+person.x]-SEA_LEVEL)/22)+.76,
      point.y-H/2+.5);
    const focus=followId===person.id||selected?.x===person.x&&
      selected?.y===person.y;
    const size=focus?1.9:1.45;
    sprite.scale.set(size*.72,size,1);
    scene.people.add(sprite);
  }
}
export function ThreeWorldCanvas({world,brush,overlay,selected,onSelect,onEdit,
  zoom=1,speed=4,relief=2.5,camera=DEFAULT_DEPTH_CAMERA,followId=null,
  onFollowPosition}: {
  world:World;brush:Brush;overlay:MapOverlay;
  selected:{x:number;y:number}|null;
  onSelect:(x:number,y:number)=>void;onEdit:(x:number,y:number)=>void;
  zoom?:number;speed?:number;relief?:number;camera?:DepthCamera;
  followId?:number|null;onFollowPosition?:(x:number,y:number)=>void;
}){
  const canvas=useRef<HTMLCanvasElement>(null);
  const state=useRef<SceneState|null>(null);
  const [unavailable,setUnavailable]=useState(false);
  const render=()=>{
    const current=state.current;
    if(!current)return;
    try{current.renderer.render(current.scene,current.camera);}
    catch{setUnavailable(true);}
  };
  // Food stocks and settlement bookkeeping change on many simulation ticks.
  // They must not rebuild a massive GPU mesh unless visible geometry changed.
  const terrainKey=useMemo(()=>overlay==='resources'?world.tiles:
    world.tiles.map(t=>t.biome).join(','),[world.tiles,overlay]);
  const structuresKey=useMemo(()=>world.settlements.map(s=>
    [s.x,s.y,s.species,(s.infrastructure?.buildings??[]).map(b=>
      [b.x,b.y,b.type,b.stage,Math.floor(b.progress??0)/10|0].join(':'))
      .join(',')].join('/')).join('|'),[world.settlements]);
  useEffect(()=>{
    if(!canvas.current)return;
    const surface=canvas.current;
    const lost=(event:Event)=>{event.preventDefault();setUnavailable(true);};
    surface.addEventListener('webglcontextlost',lost);
    let renderer:THREE.WebGLRenderer;
    try{renderer=new THREE.WebGLRenderer({canvas:canvas.current,antialias:false,
      powerPreference:'high-performance'});}catch{
      surface.removeEventListener('webglcontextlost',lost);
      setUnavailable(true);return;
    }
    renderer.setPixelRatio(Math.min(1.5,window.devicePixelRatio||1));
    renderer.setSize(WIDTH,HEIGHT,false);
    renderer.setClearColor('#102738');
    const scene=new THREE.Scene();scene.background=new THREE.Color('#102738');
    scene.fog=new THREE.FogExp2('#102738',.008);
    scene.add(new THREE.AmbientLight('#d8e7ed',1.25));
    const sun=new THREE.DirectionalLight('#ffe4b1',2.1);
    sun.position.set(-30,90,45);scene.add(sun);
    const orthographic=new THREE.OrthographicCamera(-1,1,1,-1,.1,900);
    const terrain=new THREE.Group(),structures=new THREE.Group(),
      people=new THREE.Group();scene.add(terrain,structures,people);
    state.current={renderer,scene,camera:orthographic,terrain,structures,people,
      surface:null,tileIds:[],textures:new Map()};
    return ()=>{
      replaceGroup(terrain);replaceGroup(structures);
      for(const object of people.children)
        if(object instanceof THREE.Sprite)object.material.dispose();
      for(const texture of state.current?.textures.values()??[])texture.dispose();
      renderer.dispose();state.current=null;
      surface.removeEventListener('webglcontextlost',lost);
    };
  },[]);
  useEffect(()=>{
    const s=state.current;if(!s)return;
    try{buildTerrain(world,overlay,s);render();}
    catch{setUnavailable(true);}
  },[terrainKey,world.topography,world.width,world.height,world.settings.seed,
    overlay]);
  useEffect(()=>{
    const s=state.current;if(!s)return;
    try{buildStructures(world,s);render();}
    catch{setUnavailable(true);}
  },[structuresKey,world.deposits?.length,world.topography,
    world.settings.seed]);
  useEffect(()=>{
    const s=state.current;if(!s)return;
    try{buildPeople(world,s,zoom,selected,followId);render();}
    catch{setUnavailable(true);return;}
    const tracked=followId!==null?world.agents.find(a=>a.id===followId):null;
    if(tracked&&canvas.current?.parentElement){
      // Use the actual 3D camera projection for tracking. The 2.5D camera's
      // projected coordinates are intentionally different.
      const at=mortalWorldPoint(tracked,world),heights=topographyForWorld(world).heights;
      const elevation=heights[tracked.y*world.width+tracked.x];
      const target=new THREE.Vector3(at.x-world.width/2+.5,
        (elevation-SEA_LEVEL)/22+.9,at.y-world.height/2+.5).project(s.camera);
      const scroll=canvas.current.parentElement;
      scroll.scrollLeft=(target.x+1)/2*canvas.current.clientWidth-
        scroll.clientWidth/2;
      scroll.scrollTop=(1-target.y)/2*canvas.current.clientHeight-
        scroll.clientHeight/2;
    }
  },[world.agents,world.topography,zoom>=3,selected,followId,
    onFollowPosition]);
  useEffect(()=>{
    const s=state.current;if(!s)return;
    const size=Math.max(world.width,world.height)*.78;
    const aspect=WIDTH/HEIGHT;
    s.camera.left=-size*aspect;s.camera.right=size*aspect;
    s.camera.top=size;s.camera.bottom=-size;
    const radians=camera.yaw*Math.PI/180;
    const pitch=Math.max(13,Math.min(75,camera.pitch))*Math.PI/180;
    const distance=Math.max(world.width,world.height)*2.5;
    s.camera.position.set(Math.cos(radians)*Math.cos(pitch)*distance,
      Math.sin(pitch)*distance*relief*.6,
      Math.sin(radians)*Math.cos(pitch)*distance);
    s.camera.lookAt(0,2,0);s.camera.updateProjectionMatrix();
    render();
    // A successfully created WebGL context can still render an empty scene
    // (for example after a driver/context problem). Never leave a blank map.
    if(s.surface&&s.renderer.info.render.triangles===0)setUnavailable(true);
  },[world.width,world.height,camera.yaw,camera.pitch,relief]);
  const click=(event:MouseEvent<HTMLCanvasElement>)=>{
    const s=state.current;if(!s||!s.surface)return;
    const rect=event.currentTarget.getBoundingClientRect();
    const pointer=new THREE.Vector2(
      (event.clientX-rect.left)/rect.width*2-1,
      1-(event.clientY-rect.top)/rect.height*2);
    const raycaster=new THREE.Raycaster();
    raycaster.setFromCamera(pointer,s.camera);
    const hit=raycaster.intersectObject(s.surface,false)[0];
    if(!hit||hit.faceIndex===undefined||hit.faceIndex===null)return;
    const tile=s.tileIds[hit.faceIndex];
    if(tile===undefined)return;
    const x=tile%world.width,y=Math.floor(tile/world.width);
    if(brush.kind==='inspect')onSelect(x,y);else onEdit(x,y);
  };
  const keyboard=(event:KeyboardEvent<HTMLCanvasElement>)=>{
    if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter',' ']
      .includes(event.key))return;
    event.preventDefault();
    const x=Math.max(0,Math.min(world.width-1,Math.floor(selected?.x??world.width/2)+
      (event.key==='ArrowRight'?1:event.key==='ArrowLeft'?-1:0)));
    const y=Math.max(0,Math.min(world.height-1,Math.floor(selected?.y??world.height/2)+
      (event.key==='ArrowDown'?1:event.key==='ArrowUp'?-1:0)));
    if(event.key==='Enter'||event.key===' '){
      if(brush.kind!=='inspect')onEdit(x,y);
    }else onSelect(x,y);
  };
  if(unavailable)return <div className="evo-3d-fallback" role="status">
    <p>3D is unavailable on this device or graphics session. Showing the
      working 2.5D view instead.</p>
    <DepthCanvas world={world} brush={brush} overlay={overlay}
      selected={selected} onSelect={onSelect} onEdit={onEdit}
      zoom={zoom} speed={speed} relief={relief} camera={camera}
      followId={followId} onFollowPosition={onFollowPosition}/>
  </div>;
  return <canvas ref={canvas} className="evo-world-canvas evo-true-3d-canvas"
    width={WIDTH} height={HEIGHT} style={{width:(zoom*100)+'%'}}
    role="grid" tabIndex={0} onClick={click} onKeyDown={keyboard}
    aria-label="3D terrain, forests and settlements with 2D pixel inhabitants. Click to inspect a tile."/>;
}
