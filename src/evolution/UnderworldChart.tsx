import {useEffect,useRef} from 'react';
import type {World} from './engine';
import {UNDERWORLD_BIOMES} from './underworldArt';
import {realmLinkName,underworldMap,type RealmLink,type RealmMap} from './underworld';

function ChartCanvas({map,known,at,marked}:{map:RealmMap;known:readonly number[];at?:number;marked?:number}){
  const ref=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{
    const ctx=ref.current?.getContext('2d');if(!ctx)return;
    const {width,biomes}=map;
    const point=(i:number)=>[i%width,Math.floor(i/width)] as const;
    for(let i=0;i<biomes.length;i++){
      ctx.fillStyle=UNDERWORLD_BIOMES[biomes[i]].color;ctx.fillRect(...point(i),1,1);
    }
    ctx.fillStyle='#b6a28d';
    for(const i of map.roads)ctx.fillRect(...point(i),1,1);
    const mark=(i:number,ink:string)=>{
      const [x,y]=point(i);
      ctx.fillStyle='#272330';ctx.fillRect(x-1,y-1,3,3);
      ctx.fillStyle=ink;ctx.fillRect(x,y,1,1);
    };
    for(const town of map.towns)mark(town.index,'#e4baa0');
    for(const link of map.links)if(known.includes(link.surface))
      mark(link.cell,link.surface===marked?'#ffcf80':'#a6d7b3');
    if(at!==undefined)mark(at,'#fff2d1');
  },[map,known,at,marked]);
  return <canvas ref={ref} width={map.width} height={map.height} role="img"
    aria-label="Underworld map showing Ember Rivers, Glowroot Forests and the Buried Sea"/>;
}

export function UnderworldChart({world,map,at,marked,onMark}:{world:World;map:RealmMap;
  at?:number;marked?:number;onMark?:(link:RealmLink)=>void}){
  const known=world.descent?.realm?.chart??[],population=world.underworld!.population;
  const demons=population.reduce((total,town)=>total+town.demons,0);
  const ash=population.reduce((total,town)=>total+town.ashBorne,0);
  return <div className="underworld-chart">
    <ChartCanvas map={map} known={known} at={at} marked={marked}/>
    <ul className="underworld-legend" aria-label="Underworld biomes">
      {[2,4,7].map(i=><li key={i}><i style={{background:UNDERWORLD_BIOMES[i].color}}/>
        {i===2?'Ember Rivers':UNDERWORLD_BIOMES[i].name}</li>)}
    </ul>
    <p className="underworld-census">{demons} demons · {ash} Ash Borne</p>
    {!!world.underworld?.terraces?.length&&<p className="underworld-census">
      Ashgate causeways raised · {world.underworld.terraces.length}</p>}
    <details className="underworld-town-list">
      <summary>Settlements</summary>
      <ul>{map.towns.map(town=><li key={town.id}>
        <strong>{town.name}</strong><small>{population[town.id].demons} demons · {population[town.id].ashBorne} Ash Borne</small>
      </li>)}</ul>
    </details>
    {known.length>0&&<ul aria-label="Charted surface passages" className="underworld-passages">
      {map.links.filter(link=>known.includes(link.surface)).map(link=><li key={link.surface}>
        {onMark?<button onClick={()=>onMark(link)} aria-pressed={link.surface===marked}>
          {realmLinkName(world,link)}</button>:<span>{realmLinkName(world,link)}</span>}
      </li>)}
    </ul>}
  </div>;
}

export function UnderworldAtlas({world,onReturn}:{world:World;onReturn:()=>void}){
  const map=underworldMap(world);
  return <main className="evo-creator world-generator">
    <header className="evo-section-header">
      <div><h2>Underworld map</h2></div>
      <button className="evo-quiet-button" onClick={onReturn}>← RETURN TO WORLD</button>
    </header>
    {map&&<section className="evo-section-card underworld-atlas"><UnderworldChart world={world} map={map}/></section>}
  </main>;
}
