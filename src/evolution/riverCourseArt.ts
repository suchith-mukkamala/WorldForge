import type {Point} from './motion';
import type {RiverCourse} from './riverCourses';

export function paintRiverCourse(ctx:CanvasRenderingContext2D,river:RiverCourse,
  locate:(i:number)=>Point,unit:number):void{
  ctx.save();
  ctx.lineJoin='round';ctx.lineCap='round';
  ctx.beginPath();
  for(const [i,index] of [...river.path,river.outlet].entries()){
    const p=locate(index);
    if(i===0)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);
  }
  const width=unit*(river.discharge??1);
  ctx.strokeStyle='#123e50';ctx.lineWidth=3.6*width;ctx.stroke();
  ctx.strokeStyle='#a1e0e0';ctx.lineWidth=1.65*width;ctx.stroke();
  for(const stop of river.stops){
    const p=locate(stop.index),radius=2.4*unit;
    ctx.fillStyle='#284a4c';ctx.fillRect(p.x-radius,p.y-radius,radius*2,radius*2);
    ctx.fillStyle=stop.kind==='barrier'?'#f29b63':stop.kind==='falls'?'#eff6e8':'#f2d89b';
    ctx.fillRect(p.x-radius*.55,p.y-radius*.55,radius*1.1,radius*1.1);
  }
  ctx.restore();
}
