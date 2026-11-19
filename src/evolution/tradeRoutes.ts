import type {Shipment} from './economy';
import type {Point} from './motion';

export const CARAVAN_ROUTE_COLOR='#f1c77b';
export const SHIP_ROUTE_COLOR='#93dff2';

export function paintTradeRoutes(ctx:CanvasRenderingContext2D,shipments:readonly Shipment[],
  project:(index:number)=>Point,pixelScale:number):void{
  if(!shipments.length)return;
  ctx.save();
  ctx.lineJoin='round';
  ctx.lineCap='round';
  for(const shipment of shipments){
    const sea=shipment.mode==='sea';
    const start=project(shipment.route[0]);
    ctx.beginPath();
    ctx.moveTo(start.x,start.y);
    for(let i=1;i<shipment.route.length;i++){
      const point=project(shipment.route[i]);
      ctx.lineTo(point.x,point.y);
    }
    ctx.setLineDash([]);
    ctx.lineWidth=4*pixelScale;
    ctx.strokeStyle='#13262b';
    ctx.stroke();
    ctx.setLineDash((sea?[2,3]:[6,3]).map(length=>length*pixelScale));
    ctx.lineWidth=2*pixelScale;
    ctx.strokeStyle=sea?SHIP_ROUTE_COLOR:CARAVAN_ROUTE_COLOR;
    ctx.stroke();
  }
  // Markers sit above the entire route network where two lanes cross.
  for(const shipment of shipments){
    const p=project(shipment.route[shipment.progress]);
    ctx.beginPath();
    ctx.arc(p.x,p.y,3.5*pixelScale,0,Math.PI*2);
    ctx.fillStyle='#13262b';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(p.x,p.y,2.3*pixelScale,0,Math.PI*2);
    ctx.fillStyle=shipment.mode==='sea'?SHIP_ROUTE_COLOR:CARAVAN_ROUTE_COLOR;
    ctx.fill();
  }
  ctx.restore();
}
