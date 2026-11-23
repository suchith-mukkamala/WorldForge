import type {Point} from './motion';
import type {RealmEffect} from './realmScenery';

export type RealmGlimmer=Point&Pick<RealmEffect,'kind'|'phase'>;
export const REALM_AMBIENT_STEP=65;
const rates={spore:.245,spark:.39,foam:.29,steam:.19,gleam:.21,bat:.155};
const lifts={spore:10,spark:0,foam:0,steam:4,gleam:20,bat:21};
export const realmEffectLift=(kind:RealmEffect['kind'])=>lifts[kind];

export function paintRealmAmbient(ctx:CanvasRenderingContext2D,points:readonly RealmGlimmer[],
  time:number,unit:number){
  const rect=(ink:string,x:number,y:number,w:number,h:number)=>{
    ctx.fillStyle=ink;
    ctx.fillRect(Math.round(x),Math.round(y),Math.max(1,Math.round(w*unit)),Math.max(1,Math.round(h*unit)));
  };
  for(const {kind,phase,x,y} of points){
    const cycle=(time*.001*rates[kind]+phase)%1;
    const drift=Math.sin((phase+cycle)*7.2)*cycle;
    if(kind==='bat'){
      const angle=cycle*Math.PI*2,wing=Math.floor(time*.012+phase*4)%2;
      const px=x+Math.cos(angle)*8*unit,py=y+Math.sin(angle)*4*unit;
      ctx.globalAlpha=.87;
      rect('#725d7b',px-3*unit,py-wing*unit,3,1);
      rect('#725d7b',px+unit,py-wing*unit,3,1);
      rect('#b49cac',px,py,1,2);
      continue;
    }
    if(kind==='foam'){
      if(cycle<.22||cycle>.82)continue;
      ctx.globalAlpha=.37*Math.sin((cycle-.22)/.60*Math.PI);
      rect('#a8e4d3',x+(cycle-.5)*7*unit,y,3,1);
      rect('#5ca6b0',x+(cycle-.1)*7*unit,y+2*unit,2,1);
      continue;
    }
    if(kind==='gleam'){
      if(cycle<.46||cycle>.64)continue;
      ctx.globalAlpha=.76*Math.sin((cycle-.46)/.18*Math.PI);
      rect('#fff2da',x,y-unit,1,3);
      rect('#e2def8',x-unit,y,3,1);
      continue;
    }
    const spark=kind==='spark',steam=kind==='steam';
    const height=steam?17:spark?14:9;
    const px=x+drift*(steam?6:9)*unit,py=y-cycle*height*unit;
    if(steam){
      ctx.globalAlpha=.27*Math.sin(cycle*Math.PI);
      rect('#97afa8',px-unit,py,5,2);
      rect('#d4ebe0',px,py-unit,3,2);
    }else{
      ctx.globalAlpha=.46*Math.sin(cycle*Math.PI);
      rect(spark?'#e65b37':'#56baa9',px-unit,py-unit,3,3);
      ctx.globalAlpha=.86*Math.sin(cycle*Math.PI);
      rect(spark?'#ffe196':phase>.5?'#c7f8ca':'#efcfed',px,py,1,1);
    }
  }
  ctx.globalAlpha=1;
}
