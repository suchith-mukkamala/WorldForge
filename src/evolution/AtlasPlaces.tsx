import {useEffect,useId,useLayoutEffect,useRef,useState} from 'react';
import type {FocusEvent,KeyboardEvent} from 'react';
import {SPECIES_INFO,type Settlement,type World} from './engine';
import {settlementStage} from './construction';
import type {AncientSite} from './knowledge';
import type {Point} from './motion';
import {atlasLabelSides} from './atlasMap';

export function atlasSiteName(site:AncientSite){
  return site.name??'Ancient '+site.kind+' #'+site.id;
}

export function AtlasPlacePicker({world,onTown,onSite}:{
  world:World;onTown:(id:number)=>void;onSite:(x:number,y:number)=>void;
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
  const sites=open?(world.ancientSites??[]).filter(site=>matches(atlasSiteName(site))): [];
  const chooseTown=(id:number)=>{close();onTown(id);};
  const chooseSite=(site:AncientSite)=>{close();onSite(site.x,site.y);};
  return <div ref={picker} className="atlas-place-picker" onBlur={blur} onKeyDown={keyDown}>
    <button ref={trigger} type="button" className="atlas-places-toggle"
      aria-expanded={open} aria-controls={open?panelId:undefined}
      onClick={()=>open?close():setOpen(true)}>Places</button>
    {open&&<div id={panelId} className="atlas-places-panel">
      <input ref={search} type="search" aria-label="Search places" value={query}
        placeholder="Find a place…" onChange={event=>setQuery(event.target.value)}
        onKeyDown={event=>{
          if(event.key!=='Enter')return;
          if(towns.length)chooseTown(towns[0].id);else if(sites.length)chooseSite(sites[0]);
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
        {!world.settlements.length&&!filter&&<p>Settlements appear as the world grows.</p>}
        {sites.length>0&&<><h3>Ancient sites</h3><ul>
          {sites.map(site=><li key={site.id}>
            <button type="button" onClick={()=>chooseSite(site)}>
              <span aria-hidden="true">✧</span><span>{atlasSiteName(site)}</span>
            </button>
          </li>)}
        </ul></>}
        {!towns.length&&!sites.length&&filter&&<p>No places match your search.</p>}
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
