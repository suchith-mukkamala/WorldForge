import type {Point} from './motion';
import type {RealmEffect} from './realmScenery';
import type {RealmWildlife} from './realmWildlife';

export type RealmGlimmer=Point&(Pick<RealmEffect,'kind'|'phase'>|
  {kind:'cascade';phase:number;dx:number;dy:number;flow:1|2});
export type RealmTrack=Pick<RealmWildlife,'kind'|'phase'>&{points:(Point|null)[]};
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
  for(const point of points){
    const {kind,phase,x,y}=point;
    if(kind==='cascade'){
      for(let n=0;n<point.flow*3;n++){
        const t=(time*(point.flow===2?.0015:.001)+phase+n/(point.flow*3))%1;
        ctx.globalAlpha=.63-t*.35;
        rect(n%2?'#c8ede0':'#85c5cc',x+point.dx*t+(n%3-1)*unit,y+point.dy*t,1,2);
      }
      continue;
    }
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

export function paintRealmWildlife(ctx:CanvasRenderingContext2D,tracks:readonly RealmTrack[],time:number,unit:number){
  for(const {kind,phase,points} of tracks){
    const fish=kind==='fish',fly=kind==='glowfly',last=points.length-1;
    const period=last*(fish?2300:fly?3200:1550)*2;
    const count=fish||fly?3:2;
    for(let n=0;n<count;n++){
      const cycle=(time/period+phase+n/(last*6))%1,reverse=cycle>=.5;
      const along=(reverse?1-cycle:cycle)*2*last,from=Math.min(last-1,Math.floor(along));
      const a=points[from],b=points[from+1];
      if(!a||!b)continue;
      const t=along-from,flutter=Math.sin(time*.004+n*1.7+phase*9);
      const side=(a.x<=b.x?1:-1)*(reverse?-1:1);
      const x=a.x+(b.x-a.x)*t+Math.sin(time*.002+n*3)*unit*(fly?4:1.4);
      const y=a.y+(b.y-a.y)*t+(flutter*(fly?3.5:fish?.65:2.1)-(fish?0:fly?7:12)+n*.6)*unit;
      const dot=(ink:string,dx:number,dy:number,w=1,h=1)=>{
        ctx.fillStyle=ink;
        ctx.fillRect(Math.round(x+dx*unit),Math.round(y+dy*unit),
          Math.max(1,Math.round(w*unit)),Math.max(1,Math.round(h*unit)));
      };
      if(fish){
        ctx.globalAlpha=.72;
        dot('#274f63',-2,0,5,2);dot(phase<.47?'#83c9a4':'#90bada',-1,0,3,1);
        dot('#c7e7be',side,0);dot('#6190a4',-side*3,flutter>0?1:-1);
        if(n===0&&flutter>.82){ctx.globalAlpha=.3;dot('#b6e6d4',-3,3,6,1);}
      }else if(fly){
        ctx.globalAlpha=.25+flutter*.14;
        dot('#74c18b',-1,-1,3,3);
        ctx.globalAlpha=.76+flutter*.2;
        dot(n===2?'#9ce7c0':'#e4f5aa',0,0);
      }else{
        const wing=flutter>0?-1:1;
        ctx.globalAlpha=.94;
        dot('#584461',-4,wing,3,1);dot('#584461',2,wing,3,1);
        dot('#826a8c',-3,0,7,1);dot('#c8a6b9',0,0,1,2);
      }
    }
  }
  ctx.globalAlpha=1;
}
