import {useEffect,useId,useLayoutEffect,useRef,useState} from 'react';
import type {FocusEvent,KeyboardEvent} from 'react';
import {SPECIES_INFO,type Settlement,type World} from './engine';
import {settlementStage} from './construction';
import {ancientSiteName,type AncientSite} from './knowledge';
import type {Point} from './motion';
import {atlasLabelSides} from './atlasMap';
import {visibleAtlasSite} from './riverDiscoveries';
import {skylandName} from './skylands';
import {chartedTidalCaves} from './tidalCaves';
import {ventHasGround,volcanicIslandName,volcanoName} from './volcanicGeography';

export function AtlasPlacePicker({world,onTown,onSite,onSkyland,onCave,onVent,onUnderworld}:{
  world:World;onTown:(id:number)=>void;onSite:(x:number,y:number)=>void;
  onSkyland?:(id:number)=>void;onCave:(mouth:number)=>void;onVent?:(index:number)=>void;onUnderworld?:()=>void;
}){
  const [open,setOpen]=useState(false);
  const [query,setQuery]=useState('');
  const picker=useRef<HTMLDivElement>(null);
  const trigger=useRef<HTMLButtonElement>(null);
  const search=useRef<HTMLInputElement>(null);
  const panelId=useId();
  useLayoutEffect(()=>{if(open)search.current?.focus({preventScroll:true});},[open]);
  const close=()=>{setOpen(false);setQuery('');};
  useEffect(()=>{
    if(!open)return;
    const dismiss=(event:PointerEvent)=>{
      if(event.target instanceof Node&&!picker.current?.contains(event.target))close();
    };
    document.addEventListener('pointerdown',dismiss);
    return ()=>document.removeEventListener('pointerdown',dismiss);
  },[open]);
  const blur=(event:FocusEvent<HTMLDivElement>)=>{
    if(event.relatedTarget&&!event.currentTarget.contains(event.relatedTarget))close();
  };
  const keyDown=(event:KeyboardEvent<HTMLDivElement>)=>{
    if(event.key!=='Escape'||!open)return;
    event.preventDefault();
    close();trigger.current?.focus();
  };
  const filter=query.trim().toLocaleLowerCase();
  const matches=(text:string)=>text.toLocaleLowerCase().includes(filter);
  const towns=open?world.settlements.filter(town=>matches(town.name))
    .sort((a,b)=>a.name.localeCompare(b.name)): [];
  const sites=open?(world.ancientSites??[]).filter(site=>visibleAtlasSite(world,site)&&matches(ancientSiteName(site))): [];
  const skylands=open&&onSkyland?(world.skylands??[]).filter(site=>
    matches(skylandName(site)+' floating islands')):[];
  const caves=open?chartedTidalCaves(world).filter(({cave})=>matches(cave.name+' sea caves'))
    .sort((a,b)=>a.cave.name.localeCompare(b.cave.name)):[];
  const vents=open&&onVent?(world.volcanicLayout?.vents??[])
    .filter(vent=>ventHasGround(world,vent)&&matches(volcanoName(vent,world)+' volcano crater')):[];
  const islands=open&&onVent?(world.volcanicLayout?.islands??[])
    .filter(island=>island.age!=='young'&&matches(volcanicIslandName(island))):[];
  const underworld=open&&onUnderworld&&!!world.descent?.realm?.chart.length&&matches('Underworld map');
  const tree=open&&matches('World Tree root grove')?world.worldTree:undefined;
  const chooseTree=()=>{if(tree){close();onSite(tree.x,tree.y);}};
  const surveyed=new Set(world.descent?.surveys?.map(entry=>entry.siteId));
  const chooseTown=(id:number)=>{close();onTown(id);};
  const chooseSite=(site:AncientSite)=>{close();onSite(site.x,site.y);};
  const chooseSkyland=(id:number)=>{close();onSkyland?.(id);};
  const chooseVent=(index:number)=>{close();onVent?.(index);};
  const chooseUnderworld=()=>{close();onUnderworld?.();};
  const chooseCave=(mouth:number)=>{close();onCave(mouth);};
  return <div ref={picker} className="atlas-place-picker" onBlur={blur} onKeyDown={keyDown}>
    <button ref={trigger} type="button" className="atlas-places-toggle"
      aria-expanded={open} aria-controls={open?panelId:undefined}
      onClick={()=>open?close():setOpen(true)}>Places</button>
    {open&&<div id={panelId} className="atlas-places-panel">
      <input ref={search} type="search" aria-label="Search places" value={query}
        placeholder="Find a place…" onChange={event=>setQuery(event.target.value)}
        onKeyDown={event=>{
          if(event.key!=='Enter')return;
          if(towns.length)chooseTown(towns[0].id);
          else if(skylands.length)chooseSkyland(skylands[0].id);
          else if(tree)chooseTree();
          else if(sites.length)chooseSite(sites[0]);
          else if(caves.length)chooseCave(caves[0].cave.mouth);
          else if(vents.length)chooseVent(vents[0].index);
          else if(islands.length)chooseVent(islands[0].index);
          else if(underworld)chooseUnderworld();
        }}/>
      <div className="atlas-places-results">
        {towns.length>0&&<><h3>Settlements</h3><ul>
          {towns.map(town=><li key={town.id}>
            <button type="button" onClick={()=>chooseTown(town.id)}>
              <i style={{background:SPECIES_INFO[town.species].color}} aria-hidden="true"/>
              <span>{town.name}<small>{SPECIES_INFO[town.species].name} · {settlementStage(town)}</small></span>
            </button>
          </li>)}
        </ul></>}
        {underworld&&<button className="underworld-atlas-link" type="button"
          onClick={chooseUnderworld}>Underworld map</button>}
        {(vents.length>0||islands.length>0)&&<><h3>Volcanic country</h3><ul>
          {vents.map(vent=><li key={vent.index}><button type="button" onClick={()=>chooseVent(vent.index)}>
            <span aria-hidden="true">▴</span>
            <span>{volcanoName(vent,world)}<small>Volcano</small></span>
          </button></li>)}
          {islands.map(island=><li key={island.index}><button type="button" onClick={()=>chooseVent(island.index)}>
            <span aria-hidden="true">◇</span><span>{volcanicIslandName(island)}</span>
          </button></li>)}
        </ul></>}
        {caves.length>0&&<><h3>Sea caves</h3><ul>
          {caves.map(({cave,find})=><li key={cave.mouth}>
            <button type="button" onClick={()=>chooseCave(cave.mouth)}>
              <span aria-hidden="true">≈</span><span>{cave.name}
                <small>{find?'Explored':'Charted'}</small></span>
            </button>
          </li>)}
        </ul></>}
        {!world.settlements.length&&!filter&&<p>Settlements appear as the world grows.</p>}
        {skylands.length>0&&<><h3>Floating islands</h3><ul>
          {skylands.map(site=><li key={site.id}>
            <button type="button" onClick={()=>chooseSkyland(site.id)}>
              <span aria-hidden="true">◇</span>
              <span>{skylandName(site)}<small>{site.islands.length} islands</small></span>
            </button>
          </li>)}
        </ul></>}
        {(tree||sites.length>0)&&<><h3>Landmarks</h3><ul>
          {tree&&<li><button type="button" onClick={chooseTree}><span aria-hidden="true">✦</span>
            <span>World Tree<small>Root grove</small></span></button></li>}
          {sites.map(site=><li key={site.id}>
            <button type="button" onClick={()=>chooseSite(site)}>
              <span aria-hidden="true">✧</span>
              <span>{ancientSiteName(site)}{surveyed.has(site.id)&&<small>Surveyed</small>}</span>
            </button>
          </li>)}
        </ul></>}
        {!towns.length&&!sites.length&&!skylands.length&&!caves.length&&!vents.length&&!islands.length&&!underworld&&!tree&&filter&&<p>No places match your search.</p>}
      </div>
    </div>}
  </div>;
}

export function AtlasSettlementMarkers({towns,position,selected,onChoose,interactive}:{
  towns:readonly Settlement[];position:(town:Settlement)=>Point;
  selected:number|undefined;onChoose:(id:number)=>void;interactive:boolean;
}){
  const layer=useRef<HTMLDivElement>(null);
  const [size,setSize]=useState<Point>({x:0,y:0});
  useLayoutEffect(()=>{
    const element=layer.current;
    if(!element)return;
    const measure=()=>setSize({x:element.clientWidth,y:element.clientHeight});
    measure();
    const observer=new ResizeObserver(measure);
    observer.observe(element);
    return ()=>observer.disconnect();
  },[]);
  const pins=towns.map(town=>({town,point:position(town)})).sort((a,b)=>
    Number(b.town.id===selected)-Number(a.town.id===selected)||a.town.id-b.town.id);
  const labels=atlasLabelSides(pins.map(({town,point})=>({id:town.id,name:town.name,
    x:point.x*size.x,y:point.y*size.y})),size);
  return <div ref={layer} className="atlas-settlement-markers"
    role={interactive?'group':undefined} aria-label={interactive?'Settlements on the map':undefined}
    aria-hidden={!interactive||undefined}>
    {pins.map(({town,point})=>{
      const side=labels.get(town.id),color=SPECIES_INFO[town.species].color;
      return <button key={town.id} type="button" className="atlas-town-pin"
        disabled={!interactive} aria-label={'Zoom to '+town.name} title={town.name}
        data-selected={town.id===selected||undefined}
        style={{left:point.x*100+'%',top:point.y*100+'%'}}
        onClick={()=>onChoose(town.id)}>
        <span className="atlas-town-dot" style={{background:color}} aria-hidden="true"/>
        {side&&<span className="atlas-town-label" data-side={side} aria-hidden="true">{town.name}</span>}
      </button>;
    })}
  </div>;
}
