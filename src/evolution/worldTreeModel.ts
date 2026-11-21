import {terrainHash,terrainNoise} from './biomeGeneration';
import {BLOCK_FACES,type BlockModel} from './blockModels';
import type {WorldTree} from './worldTree';
import {WORLD_TREE_BLOCK,WORLD_TREE_CROWN_RADIUS,WORLD_TREE_HEIGHT,worldTreeRoots} from './worldTree';

export const TREE_SUBDIVISIONS=4;
export const TREE_BRANCH_COUNT=9;
export const TREE_MODEL_RADIUS=WORLD_TREE_CROWN_RADIUS/WORLD_TREE_BLOCK;
export type TreeFoliage='woodland'|'conifer'|'wetland'|'dry';
type Point3={x:number;y:number;z:number};
type GroundAt=(x:number,y:number)=>{level:number;clear:boolean};
const RAMP_STEPS=24;
const foliarColors:Record<TreeFoliage,readonly string[]>={
  woodland:['#273e30','#3e5d3c','#5b7949','#8a9f62'],
  conifer:['#243c3a','#36554b','#4e7361','#769584'],
  wetland:['#2b4132','#445e3e','#618052','#8ba366'],
  dry:['#383d2b','#515c38','#73814c','#9e9e61'],
};
const foliageIndex:Record<TreeFoliage,number>={woodland:2,conifer:3,wetland:4,dry:5};

function paletteRamp(stops:readonly string[]){
  const rgb=stops.map(hex=>parseInt(hex.slice(1),16));
  return Array.from({length:RAMP_STEPS},(_,i)=>{
    const t=i/(RAMP_STEPS-1)*(rgb.length-1);
    const j=Math.min(rgb.length-2,Math.floor(t));
    const left=rgb[j],right=rgb[j+1];
    const mix=(shift:number)=>Math.round((left>>shift&255)+
      ((right>>shift&255)-(left>>shift&255))*(t-j));
    return '#'+(mix(16)<<16|mix(8)<<8|mix(0)).toString(16).padStart(6,'0');
  });
}
const palettes=['',
  ...paletteRamp(['#382f29','#584537','#785e48','#a08566']),
  ...paletteRamp(['#354334','#4f5d3b','#66754a','#87905b']),
  ...Object.values(foliarColors).flatMap(paletteRamp),
];
const swatch=(ramp:number,tone:number)=>
  1+ramp*RAMP_STEPS+Math.max(0,Math.min(RAMP_STEPS-1,Math.round(tone*(RAMP_STEPS-1))));

export function treeBranchAngle(seed:number,index:number){
  return (seed%629)/100+index*2.39996+(terrainHash(index,39,seed)-.5)*.64;
}

export function sculptWorldTree(key:string,tree:WorldTree,seed:number,foliage:readonly TreeFoliage[],
  steps:number,groundAt:GroundAt):BlockModel{
  const half=TREE_MODEL_RADIUS*steps,stride=half*2,plane=stride*stride;
  const bottom=-9*steps,ceiling=WORLD_TREE_HEIGHT*steps;
  const cells=new Uint8Array(plane*(ceiling-bottom));
  const keyAt=(x:number,y:number,z:number)=>(z-bottom)*plane+(y+half)*stride+x+half;
  const lower=1/steps;
  const phase=seed%628/100;
  const roots=worldTreeRoots(tree);
  const wet=foliage[0]==='wetland';

  const trunkAt=(z:number)=>{
    const t=Math.max(0,z)/34;
    return {x:t*(1.4*Math.sin(phase+t*3.3)+1.1*Math.sin(t*4+1)),
      y:t*(1.55*Math.cos(phase+t*2.9)-1.05),z};
  };

  // Break up the bark with fluting that follows the trunk, long creases, and
  // irregular shoulders that flare outward in the directions of the roots.
  const baseWidth=7.2*steps;
  for(let y=-Math.floor(baseWidth);y<=baseWidth;y++){
    for(let x=-Math.floor(baseWidth);x<=baseWidth;x++){
      const X=(x+.5)*lower,Y=(y+.5)*lower;
      const floor=groundAt(X,Y);
      const baseAngle=Math.atan2(Y,X);
      const fissure=terrainNoise(X,Y,.48,seed+87)*.13;
      const mossPatch=terrainNoise(X,Y,1.6,seed+119)>(wet?-.08:.14);
      let buttress=0;
      for(const root of roots){
        const fan=Math.max(0,Math.cos(baseAngle-root.angle-.06));
        buttress=Math.max(buttress,fan**22);
      }
      for(let z=Math.max(bottom,Math.floor(floor.level*steps));z<36*steps;z++){
        const Z=(z+.5)*lower;
        if(floor.clear&&Z<Math.max(floor.level,0)+2.9)continue;
        const {x:cx,y:cy}=trunkAt(Z),dx=X-cx,dy=Y-cy;
        const angle=Math.atan2(dy,dx),height=Math.max(0,Z),aboveGround=Z-floor.level;
        const flutes=Math.sin(angle*12+height*.11+phase)*.06+
          Math.sin(angle*19-height*.08)*.042+fissure*.4;
        const radius=(2.92*Math.max(0,1-height/36)**.83+.16)+
          (1.12+2.63*buttress)*Math.exp(-Math.max(0,aboveGround)/1.95)+flutes;
        if(dx*dx+dy*dy>radius*radius)continue;
        const sun=-(Math.cos(angle)*.66+Math.sin(angle)*.74);
        const grain=Math.sin(angle*27+height*.19+fissure*8)*.065+
          Math.sin(angle*11-height*.12)*.062+fissure+
          terrainHash(x+z*43,y-z*71,seed)*.087-.04;
        const moss=mossPatch&&aboveGround<2.25+terrainNoise(X,Y,1,seed+551)*1.8;
        cells[keyAt(x,y,z)]=swatch(moss?1:0,.46+sun*.29+grain);
      }
    }
  }

  const wood=(from:Point3,to:Point3,radius:number,tip:number)=>{
    const vx=to.x-from.x,vy=to.y-from.y,vz=to.z-from.z;
    const length2=vx*vx+vy*vy+vz*vz;
    const lo=(a:number,b:number)=>Math.max(-half,Math.floor((Math.min(a,b)-radius)*steps));
    const hi=(a:number,b:number)=>Math.min(half-1,Math.ceil((Math.max(a,b)+radius)*steps));
    const lowZ=Math.max(bottom,Math.floor((Math.min(from.z,to.z)-radius)*steps));
    const highZ=Math.min(ceiling-1,Math.ceil((Math.max(from.z,to.z)+radius)*steps));
    for(let z=lowZ;z<=highZ;z++)for(let y=lo(from.y,to.y);y<=hi(from.y,to.y);y++){
      for(let x=lo(from.x,to.x);x<=hi(from.x,to.x);x++){
        const a=(x+.5)*lower-from.x,b=(y+.5)*lower-from.y,c=(z+.5)*lower-from.z;
        const t=Math.max(0,Math.min(1,(a*vx+b*vy+c*vz)/length2));
        const dx=a-vx*t,dy=b-vy*t,dz=c-vz*t;
        const r=radius+(tip-radius)*t;
        if(dx*dx+dy*dy+dz*dz>r*r)continue;
        const sun=(-dx*.39-dy*.44+dz*.47)/r;
        const grain=terrainHash(x+z*171,y,seed)*.055;
        cells[keyAt(x,y,z)]=swatch(0,.43+sun*.31+grain);
      }
    }
  };

  const leaves=(p:Point3,direction:number,width:number,depth:number,height:number,
    type:TreeFoliage,salt:number)=>{
    const reach=Math.max(width,depth)*1.15,c=Math.cos(direction),s=Math.sin(direction);
    const lowerZ=Math.max(bottom,Math.floor((p.z-height*1.13)*steps));
    const upperZ=Math.min(ceiling-1,Math.ceil((p.z+height*1.13)*steps));
    for(let y=Math.max(-half,Math.floor((p.y-reach)*steps));
      y<=Math.min(half-1,Math.ceil((p.y+reach)*steps));y++){
      for(let x=Math.max(-half,Math.floor((p.x-reach)*steps));
        x<=Math.min(half-1,Math.ceil((p.x+reach)*steps));x++){
        const dx=(x+.5)*lower-p.x,dy=(y+.5)*lower-p.y;
        const along=(dx*c+dy*s)/width,across=(dy*c-dx*s)/depth;
        const radial=along*along+across*across;
        if(radial>1.19)continue;
        for(let z=lowerZ;z<=upperZ;z++){
          const dz=((z+.5)*lower-p.z)/height;
          const d=radial+dz*dz;
          if(d>1.19)continue;
          const grain=terrainHash(x+z*97,y-z*47,seed+salt);
          const tuft=Math.sin(along*10+dz*6+salt)*Math.cos(across*11-dz*7);
          if(d>.91+tuft*.15+grain*.12)continue;
          const index=keyAt(x,y,z);
          // Small gaps at the tips show twigs and sky through the leaf sprays.
          if(cells[index]&&cells[index]<=RAMP_STEPS)continue;
          const sun=dz*.56-dx/reach*.29-dy/reach*.31;
          cells[index]=swatch(foliageIndex[type],.45+sun*.44+tuft*.079+grain*.14);
        }
      }
    }
  };

  for(let n=0;n<TREE_BRANCH_COUNT+3;n++){
    const leader=n>=TREE_BRANCH_COUNT;
    const direction=treeBranchAngle(seed,n),dx=Math.cos(direction),dy=Math.sin(direction);
    const type=leader?foliage[0]:foliage[n+1];
    const reach=leader?2.9+terrainHash(n,2,seed)*1.9:
      (9.4-n*.49+terrainHash(n,2,seed)*4)*(type==='conifer'?.76:1);
    const start=leader?30+(n-TREE_BRANCH_COUNT)*.9:
      11.7+n*1.82+terrainHash(n,5,seed)*3.4;
    const rise=leader?4.7+(n-TREE_BRANCH_COUNT)*.7:
      4+terrainHash(n,7,seed)*5+(type==='conifer'?1.6:0);
    const bend=(terrainHash(n,17,seed)-.5)*.33;
    const anchor=trunkAt(start);
    const branchAt=(t:number):Point3=>{
      const along=reach*t,side=along*bend*t;
      return {x:anchor.x+dx*along-dy*side,y:anchor.y+dy*along+dx*side,
        z:start+rise*t+.8*Math.sin(t*Math.PI)};
    };
    const thickness=(leader?.64:1.12)*(1-n/(TREE_BRANCH_COUNT+4)*.37);
    for(let segment=0;segment<4;segment++){
      const a=segment/4,b=(segment+1)/4;
      wood(branchAt(a),branchAt(b),thickness*(1-a*.86),thickness*(1-b*.86));
    }
    for(let fork=0;fork<4;fork++){
      const root=branchAt(.48+fork*.15);
      const side=fork%2?-1:1;
      const forkAngle=direction+side*(.67+terrainHash(n,fork+22,seed)*.67);
      const length=(leader?1.75:2.75)*(1-fork*.12)+terrainHash(fork,n+31,seed)*1.7;
      const end={x:root.x+Math.cos(forkAngle)*length,y:root.y+Math.sin(forkAngle)*length,
        z:root.z+1+terrainHash(fork,n+67,seed)*2.65};
      wood(root,end,Math.max(.27,thickness*(.39-fork*.031)),.12);
      for(let spray=0;spray<3;spray++){
        const stem={x:end.x+(root.x-end.x)*spray*.21,y:end.y+(root.y-end.y)*spray*.21,
          z:end.z+(root.z-end.z)*spray*.21};
        const sprayAngle=forkAngle+(spray===1?1.02:-.82);
        const length=1.08+terrainHash(n+spray,fork+50,seed)*.91;
        const p={x:stem.x+Math.cos(sprayAngle)*length,y:stem.y+Math.sin(sprayAngle)*length,
          z:stem.z+(type==='wetland'&&spray%2?-1.05:.66)};
        wood(stem,p,.13,.10);
        const s=1.26+terrainHash(n*4+fork,spray+90,seed)*.86;
        leaves(p,sprayAngle,s*(type==='conifer'?.9:1.2),s*.81,
          s*(type==='conifer'?1.12:type==='dry'?.59:.83),type,51+n*17+fork*3+spray);
      }
    }
  }

  const faces:BlockModel['faces'][number][]=[],feet:BlockModel['feet'][number][]=[];
  const neighbor=[plane,1,-1,stride,-stride];
  for(let z=bottom;z<ceiling;z++)for(let y=-half;y<half;y++)for(let x=-half;x<half;x++){
    const i=keyAt(x,y,z);
    if(!cells[i])continue;
    const color=palettes[cells[i]];
    if(z===0)feet.push({x,y});
    for(let direction=0;direction<BLOCK_FACES.length;direction++){
      const atBoundary=direction===1&&x===half-1||direction===2&&x===-half||
        direction===3&&y===half-1||direction===4&&y===-half;
      if(atBoundary||!cells[i+neighbor[direction]])faces.push({x,y,z,direction,color});
    }
  }
  return {key,faces,feet,footing:'timber',sculpted:true};
}
