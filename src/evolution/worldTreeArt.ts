import {blockWorldTree} from './blockModels';
import type {WorldTree} from './worldTree';

const overhead=new Map<number,HTMLCanvasElement>();
export function paintOverheadWorldTree(ctx:CanvasRenderingContext2D,tree:WorldTree,cell:number){
  let stamp=overhead.get(tree.variant);
  if(!stamp){
    stamp=document.createElement('canvas');stamp.width=32;stamp.height=32;
    const paint=stamp.getContext('2d');
    if(!paint)return;
    const tops=blockWorldTree(tree.variant).faces.filter(face=>face.direction===0)
      .sort((a,b)=>a.z-b.z);
    for(const face of tops){
      paint.fillStyle=face.color;
      paint.fillRect(face.x+16,face.y+16,1,1);
    }
    overhead.set(tree.variant,stamp);
  }
  ctx.drawImage(stamp,(tree.x-1.5)*cell,(tree.y-1.5)*cell,cell*4,cell*4);
}
