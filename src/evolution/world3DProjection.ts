import type {DepthCamera} from './depthProjection';

/** Screen coordinates for the exact orthographic camera used by the WebGL
 * renderer. Keeping this calculation independent of Three.js avoids loading
 * the GPU library into the main UI bundle merely for scroll positioning. */
export function project3DScreen(width:number,height:number,x:number,y:number,
  elevation:number,camera:DepthCamera,relief:number):{x:number;y:number}{
  const size=Math.max(width,height)*.78;
  const theta=camera.yaw*Math.PI/180;
  const pitch=Math.max(13,Math.min(75,camera.pitch))*Math.PI/180;
  const distance=Math.max(width,height)*2.5;
  const eye={x:Math.cos(theta)*Math.cos(pitch)*distance,
    y:Math.sin(pitch)*distance*relief*.6,
    z:Math.sin(theta)*Math.cos(pitch)*distance};
  const f={x:-eye.x,y:2-eye.y,z:-eye.z};
  const length=Math.hypot(f.x,f.y,f.z)||1;
  f.x/=length;f.y/=length;f.z/=length;
  const rightLength=Math.hypot(f.x,f.z)||1;
  const right={x:-f.z/rightLength,z:f.x/rightLength};
  const up={x:-f.y*right.z,y:f.x*right.z-f.z*right.x,
    z:f.y*right.x};
  const point={x:x-width/2+.5,y:(elevation-48)/22-2,z:y-height/2+.5};
  const horizontal=point.x*right.x+point.z*right.z;
  const vertical=point.x*up.x+point.y*up.y+point.z*up.z;
  return {x:(horizontal/(size*1200/760)+1)/2,
    y:(1-vertical/size)/2};
}
