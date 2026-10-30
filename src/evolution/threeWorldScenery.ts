/** Deterministic, instanced low-poly scenery for the real WebGL view.
 * It is deliberately separate from the simulation: no ticks, RNG consumption,
 * movement decisions, or stored world data depend on the camera's detail tier. */
import * as THREE from 'three';
import type {World} from './engine';
import {ARCHITECTURE} from './construction';
import {SEA_LEVEL,topographyForWorld} from './topography';
import {sceneryVariation,type SceneryDetail} from './threeWorldDetail';
import {visibleCoastTile} from './worldOutline';

type Shape='box'|'trunk'|'broadleaf'|'pine'|'stone'|'roof'|'gable'|'well';
type Instance={matrix:THREE.Matrix4;color:THREE.Color};

function gableGeometry():THREE.BufferGeometry{
  // A real pitched roof: two long slopes and triangular gable ends.
  const l=-.5,r=.5,front=-.5,back=.5,ridge=.46;
  const positions=[
    l,0,front,r,0,front,0,ridge,front,
    r,0,back,l,0,back,0,ridge,back,
    l,0,back,l,0,front,0,ridge,front,
    l,0,back,0,ridge,front,0,ridge,back,
    r,0,front,r,0,back,0,ridge,back,
    r,0,front,0,ridge,back,0,ridge,front,
  ];
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.computeVertexNormals();
  return geometry;
}

function geometryFor(shape:Shape):THREE.BufferGeometry{
  switch(shape){
    case 'box':return new THREE.BoxGeometry(1,1,1);
    case 'trunk':return new THREE.CylinderGeometry(.5,.7,1,6);
    case 'broadleaf':return new THREE.IcosahedronGeometry(.55,0);
    case 'pine':return new THREE.ConeGeometry(.55,1,6);
    case 'stone':return new THREE.DodecahedronGeometry(.5,0);
    case 'roof':return new THREE.ConeGeometry(.7,1,4);
    case 'gable':return gableGeometry();
    case 'well':return new THREE.TorusGeometry(.5,.13,5,10);
  }
}

/** A handful of instanced draw calls, rather than thousands of Mesh objects. */
class SceneryBatch{
  private instances=new Map<Shape,Instance[]>();
  private dummy=new THREE.Object3D();
  constructor(private group:THREE.Group){}
  add(shape:Shape,color:string,x:number,y:number,z:number,
    sx=1,sy=1,sz=1,ry=0,rx=0){
    const object=this.dummy;
    object.position.set(x,y,z);
    object.rotation.set(rx,ry,0);
    object.scale.set(sx,sy,sz);
    object.updateMatrix();
    const entries=this.instances.get(shape)??[];
    if(!this.instances.has(shape))this.instances.set(shape,entries);
    entries.push({matrix:object.matrix.clone(),color:new THREE.Color(color)});
  }
  flush(){
    for(const [shape,entries] of this.instances){
      if(!entries.length)continue;
      const material=new THREE.MeshLambertMaterial({color:'#ffffff',
        flatShading:true,side:shape==='gable'?THREE.DoubleSide:THREE.FrontSide});
      const mesh=new THREE.InstancedMesh(geometryFor(shape),material,entries.length);
      for(let i=0;i<entries.length;i++){
        mesh.setMatrixAt(i,entries[i].matrix);
        mesh.setColorAt(i,entries[i].color);
      }
      mesh.instanceMatrix.needsUpdate=true;
      if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
      // A batch spans multiple biomes; a single broad bounding sphere is
      // simpler and more reliable than accidentally culling local clusters.
      mesh.frustumCulled=false;
      this.group.add(mesh);
    }
  }
}

const LEAVES=['#568f69','#6eaa75','#377c65','#85ad76','#4b927f'];
const PINES=['#367968','#4a8275','#376d66','#558874'];
const STONE=['#9c9c9d','#829497','#aa9c91','#777e8c'];
const tint=(color:string,factor:number)=>'#'+new THREE.Color(color)
  .multiplyScalar(factor).getHexString();

export function buildScenery3D(world:World,group:THREE.Group,
  detail:SceneryDetail):void{
  const batch=new SceneryBatch(group);
  const W=world.width,H=world.height;
  const heights=topographyForWorld(world).heights;
  const ground=(x:number,y:number)=>Math.max(-.8,
    (heights[Math.max(0,Math.min(H-1,y))*W+
      Math.max(0,Math.min(W-1,x))]-SEA_LEVEL)/22);
  const occupied=new Set<number>();
  // Trees never grow through buildings. Suppressing near-building trees also
  // makes small 2D inhabitants easier to see among the structures.
  for(const s of world.settlements)for(const b of s.infrastructure?.buildings??[])
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)
      occupied.add((b.y+dy)*W+b.x+dx);

  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const biome=world.tiles[y*W+x].biome;
    if(!visibleCoastTile(x,y,W,H,biome,world.settings.seed))continue;
    const v=sceneryVariation(world.settings.seed,x,y);
    const forest=biome==='forest',plains=biome==='plains';
    const mountain=biome==='mountain'||biome==='cave';
    const x3=x-W/2+.5,z3=y-H/2+.5,h=ground(x,y);
    if((forest||plains||mountain)&&!occupied.has(y*W+x)&&
      v%(forest?7:plains?48:95)===0){
      const pine=mountain||v%4===0;
      const height=1.85+(v%7)*.16;
      const width=.85+(v%5)*.09;
      batch.add('trunk',pine?'#6b5944':'#795b44',x3,h+height*.32,z3,
        .30,height*.64,.3);
      if(pine){
        batch.add('pine',PINES[v%PINES.length],x3,h+height*.8,z3,
          width*1.5,height*.85,width*1.5,v%7*.15);
        if(detail>=1)batch.add('pine',PINES[(v+1)%PINES.length],
          x3,h+height*1.18,z3,width*1.04,height*.62,width*1.04);
      }else{
        batch.add('broadleaf',LEAVES[v%LEAVES.length],x3,h+height,z3,
          width*2,height*.75,width*1.75,v%7*.12);
        if(detail>=1){
          batch.add('broadleaf',LEAVES[(v+2)%LEAVES.length],
            x3-.44,h+height*.8,z3+.19,width*1.2,.95,width*1.2);
          batch.add('broadleaf',LEAVES[(v+3)%LEAVES.length],
            x3+.4,h+height*.95,z3-.29,width*1.2,1.02,width*1.1);
        }
      }
    }else if(detail>=2&&(forest||plains)&&v%37===0&&
      !occupied.has(y*W+x)){
      batch.add('broadleaf',LEAVES[(v+1)%LEAVES.length],
        x3,h+.17,z3,.63,.36,.56);
    }else if((mountain||biome==='wasteland')&&v%29===0){
      batch.add('stone',STONE[v%STONE.length],x3,h+.23,z3,.9,.48,.76,v%6);
    }
  }

  // Natural resource deposits continue to exist independently of decoration.
  let stones=0;
  for(const d of world.deposits??[]){
    if(stones>=900)break;
    if(d.kind==='tree'||d.amount<=0)continue;
    const x=d.index%W,y=Math.floor(d.index/W);
    const v=sceneryVariation(world.settings.seed,x,y);
    batch.add('stone',STONE[v%STONE.length],x-W/2+.5,ground(x,y)+.23,
      y-H/2+.5,.72,.55,.65);
    stones++;
  }

  let roads=0;
  for(const settlement of world.settlements){
    const a=ARCHITECTURE[settlement.species];
    if(detail>=1)for(const index of settlement.infrastructure?.roads??[]){
      if(roads++>=4500)break;
      const x=index%W,y=Math.floor(index/W);
      batch.add('box','#a3987e',x-W/2+.5,ground(x,y)+.025,
        y-H/2+.5,.76,.05,.74);
    }
    for(const b of settlement.infrastructure?.buildings??[]){
      const x=b.x-W/2+.5,z=b.y-H/2+.5,h=ground(b.x,b.y);
      const v=sceneryVariation(world.settings.seed,b.x,b.y);
      const complete=b.stage==='complete',ruin=b.stage==='ruin'||
        b.stage==='abandoned';
      const progress=complete||ruin?1:Math.max(.2,(b.progress??0)/100);
      const tier=b.tier??0;
      const size=b.type==='communal'?1.35:b.type==='workshop'||
        b.type==='market'?1.13:b.type==='shelter'?.78:1;
      const height=(b.type==='communal'?1.35:.95)*(tier>=2?1.19:1)*progress;
      const wall=tint(a.wall,ruin?.65:Math.min(1.16,.93+(v%5)*.035));
      const roof=tint(a.roof,ruin?.55:1+(v%3)*.04);
      // Progress is visible: a foundation and incomplete walls appear before
      // the completed roof; ruined buildings lose roof and trim details.
      batch.add('box','#786b61',x,h+.08,z,size*1.04,.17,size*.91);
      if(b.type==='well'){
        batch.add('well',a.trim,x,h+.43,z,.8,.8,.8,0,Math.PI/2);
        batch.add('box','#284e59',x,h+.27,z,.49,.08,.49);
        if(detail>=1)for(const dx of [-.38,.38])batch.add('box',a.trim,
          x+dx,h+.9,z,.12,.96,.12);
        continue;
      }
      if(b.type==='dock'){
        batch.add('box','#916e50',x,h+.2,z,1.2,.17,1.3);
        if(detail>=1)for(const dx of [-.5,.5])for(const dz of [-.48,.48])
          batch.add('box','#695039',x+dx,h+.16,z+dz,.13,.66,.13);
        continue;
      }
      if(b.type==='farm'&&detail>=1)for(const dx of [-.38,0,.38]){
        batch.add('box','#735f42',x+dx,h+.11,z+.44,.2,.12,.68);
        batch.add('broadleaf','#89b46a',x+dx,h+.26,z+.44,.26,.34,.48);
      }
      batch.add('box',wall,x,h+.17+height*.43,z,size*.88,height*.86,size*.78);
      if(!complete&&!ruin&&progress<.67)continue;
      if(!ruin){
        if(settlement.species==='elf'||settlement.species==='demon')
          batch.add('roof',roof,x,h+height+.27,z,size*1.07,.64,size*1.02,
            Math.PI/4);
        else batch.add('gable',roof,x,h+height+.28,z,
          size*1.28,.96,size*1.15,v%2?0:Math.PI/2);
      }
      if(detail===0||ruin)continue;
      // Recessed dark doors and bright species-specific trim make each house
      // clearly legible at close range, independent of camera orbit.
      batch.add('box','#3c3437',x,h+.3,z+size*.399,size*.25,.55,.055);
      batch.add('box',a.trim,x,h+.63,z+size*.425,size*.3,.075,.065);
      for(const dx of [-.32,.32]){
        batch.add('box',a.trim,x+dx,h+height*.57,z+size*.395,
          .155,.17,.055);
        batch.add('box',a.trim,x+dx,h+height*.57,z-size*.395,
          .155,.17,.055);
      }
      if(detail>=2){
        for(const dx of [-size*.37,size*.37])
          batch.add('box',a.trim,x+dx,h+height*.45,z,.08,height*.87,
            size*.83);
        if(b.type==='workshop'||tier>=3){
          batch.add('box','#665961',x+size*.25,h+height+.43,z-.12,
            .19,.79,.2);
          batch.add('box','#b3a59a',x+size*.25,h+height+.84,z-.12,
            .28,.11,.29);
        }
        if(b.type==='market')for(const dx of [-.5,.5])
          batch.add('box',a.trim,x+dx,h+.32,z+.55,.12,.7,.12);
      }
    }
  }
  batch.flush();
}
