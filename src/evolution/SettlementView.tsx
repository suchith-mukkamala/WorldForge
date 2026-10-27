import {useEffect,useMemo,useState} from 'react';
import {BIOME_INFO,SPECIES_INFO,type Settlement,type World} from './engine';
import {ARCHITECTURE,BUILDING_LABELS,BUILDING_TYPES,COSTS,ORES,
  settlementStage,type Building,type RuinSite} from './construction';
import {RESOURCE_COLORS,RESOURCE_LABELS} from './resources';

type Props={world:World;selectedId:number|null;onFindOnMap:(id:number)=>void;
  playing:boolean;onTogglePlay:()=>void;onAdvance:(years:number)=>void};
const CELL=26,VIEW=19,HALF=Math.floor(VIEW/2);
const STAGE_LABELS={encampment:'Encampment',hamlet:'Hamlet',village:'Village',
  town:'Town',city:'City'};
const num=(n:number)=>n.toLocaleString('en-US');

function Structure({b,x,y,selected,onSelect}:{b:Building;x:number;y:number;
  selected:boolean;onSelect:()=>void}){
  const style=ARCHITECTURE[b.culture],abandoned=b.stage==='abandoned';
  const ruin=b.stage==='ruin',unfinished=['foundation','frame','finishing']
    .includes(b.stage);
  return <g role="button" tabIndex={0} aria-label={BUILDING_LABELS[b.type]+' '+b.stage}
    onClick={onSelect} onKeyDown={e=>{if(e.key==='Enter')onSelect();}}
    style={{cursor:'pointer'}}>
    {selected&&<rect x={x-3} y={y-3} width={CELL+6} height={CELL+6}
      fill="none" stroke="#ffe7a7" strokeWidth={2}/>}
    {ruin?<>
      <path d={`M${x+3} ${y+19} L${x+8} ${y+8} L${x+13} ${y+19}Z`}
        fill={style.wall} stroke="#293044" strokeWidth={1}/>
      <path d={`M${x+14} ${y+20} L${x+20} ${y+12} L${x+23} ${y+21}Z`}
        fill={style.roof}/>
    </>:<>
      {b.stage!=='foundation'&&<rect x={x+4} y={y+9} width={18} height={13}
        fill={abandoned?'#696976':style.wall} stroke="#172338" strokeWidth={1.3}/>}
      {b.stage==='foundation'&&<rect x={x+4} y={y+16} width={18} height={6}
        fill={style.wall} stroke={style.trim} strokeWidth={1.5}/>}
      {b.stage==='frame'&&<>
        <path d={`M${x+4} ${y+8}V${y+22}M${x+22} ${y+8}V${y+22}M${x+4} ${y+8}L${x+22} ${y+22}`}
          fill="none" stroke={style.trim} strokeWidth={2}/>
      </>}
      {['finishing','complete','abandoned'].includes(b.stage)&&<>
        <path d={`M${x+2} ${y+10}L${x+13} ${y+3}L${x+24} ${y+10}Z`}
          fill={abandoned?'#494a5d':style.roof} stroke={style.trim} strokeWidth={1}/>
        {b.type==='well'?<circle cx={x+13} cy={y+16} r={5} fill="#4689bd"/>
          :b.type==='farm'?<>
            {[8,13,18].map(px=><path key={px}
              d={`M${x+px} ${y+21}v-9m-3 3l3 2l3-2`}
              stroke="#a8d780" strokeWidth={2} fill="none"/>)}</>
            :b.type==='communal'?<path d={`M${x+13} ${y+4}V${y-1}l7 3l-7 2`}
              stroke={style.trim} fill={style.roof} strokeWidth={1}/>
              :b.type==='workshop'?<>
                <rect x={x+17} y={y+1} width={3} height={8} fill="#626879"/>
                <rect x={x+11} y={y+13} width={4} height={6} fill="#edc07d"/>
              </>:<rect x={x+10} y={y+13} width={6} height={8}
                fill={style.trim}/>} </>}
      {unfinished&&<>
        <path d={`M${x+3} ${y+2}V${y+23}M${x+23} ${y+2}V${y+23}M${x+3} ${y+5}H${x+23}`}
          fill="none" stroke="#f3d4a5" strokeWidth={1} strokeDasharray="3 2"/>
        <rect x={x+3} y={y+24} width={20} height={3} fill="#3e445c"/>
        <rect x={x+3} y={y+24} width={b.progress*.20} height={3} fill="#e7bc76"/>
      </>}
      {abandoned&&<path d={`M${x+3} ${y+8}l8 5l4-6`} fill="none"
        stroke="#372e44" strokeWidth={2}/>}
    </>}
  </g>;
}

function LocalMap({world,settlement,ruin,onChoose,chosen,zoom}:{world:World;
  settlement:undefined|Settlement;ruin:undefined|RuinSite;
  onChoose:(id:number)=>void;chosen:number|null;zoom:number}){
  const place=settlement??ruin!;
  const buildings=settlement?.infrastructure?.buildings??ruin?.buildings??[];
  const roads=new Set(settlement?.infrastructure?.roads??ruin?.roads??[]);
  const land=new Set(settlement?.infrastructure?.land??[]);
  const deposits=new Map((world.deposits??[]).map(d=>[d.index,d]));
  const originX=place.x-HALF,originY=place.y-HALF;
  const allTiles=[];
  for(let dy=0;dy<VIEW;dy++)for(let dx=0;dx<VIEW;dx++){
    const x=originX+dx,y=originY+dy;
    const tile=x>=0&&y>=0&&x<world.width&&y<world.height?
      world.tiles[y*world.width+x]:null;
    allTiles.push({id:dy*VIEW+dx,x:dx*CELL,y:dy*CELL,tile,
      owner:tile&&land.has(y*world.width+x),route:tile&&roads.has(y*world.width+x),
      deposit:tile?deposits.get(y*world.width+x):undefined});
  }
  return <div className="evo-city-map-scroll">
    <svg role="img" aria-label={'Local buildings and roads of '+place.name}
      viewBox={`0 0 ${VIEW*CELL} ${VIEW*CELL}`}
      style={{width:(zoom*100)+'%',minWidth:'430px'}}>
      {allTiles.map(p=><g key={p.id}>
        <rect x={p.x} y={p.y} width={CELL} height={CELL}
          fill={p.tile?BIOME_INFO[p.tile.biome].color:'#11192a'}
          stroke="#182539" strokeWidth={.65}/>
        {p.owner&&<rect x={p.x+1} y={p.y+1} width={CELL-2} height={CELL-2}
          fill="#ffe4aa" fillOpacity={.10} stroke="#e0b976" strokeOpacity={.30}
          strokeDasharray="3 3"/>}
        {p.route&&<>
          <rect x={p.x} y={p.y+10} width={CELL} height={6}
            fill="#af9d82" opacity={.8}/>
          <rect x={p.x+10} y={p.y} width={6} height={CELL}
            fill="#af9d82" opacity={.64}/>
        </>}
        {p.deposit&&p.deposit.amount>.1&&<circle cx={p.x+5} cy={p.y+5}
          r={3.2} fill={RESOURCE_COLORS[p.deposit.kind]}/>} 
      </g>)}
      <rect x={HALF*CELL+5} y={HALF*CELL+5} width={CELL-10} height={CELL-10}
        fill="none" stroke="#ffe7ae" strokeWidth={1.5} strokeDasharray="3 2"/>
      {buildings.filter(b=>Math.abs(b.x-place.x)<=HALF&&
        Math.abs(b.y-place.y)<=HALF).map(b=><Structure key={b.id} b={b}
        x={(b.x-originX)*CELL} y={(b.y-originY)*CELL}
        selected={chosen===b.id} onSelect={()=>onChoose(b.id)}/>)}
    </svg>
  </div>;
}

export function SettlementView({world,selectedId,onFindOnMap,playing,
  onTogglePlay,onAdvance}:Props){
  const [focusedId,setFocusedId]=useState<number|null>(selectedId);
  const [chosenBuilding,setChosenBuilding]=useState<number|null>(null);
  const [zoom,setZoom]=useState(1);
  useEffect(()=>{if(selectedId!==null)setFocusedId(selectedId);},[selectedId]);
  const all=[...world.settlements.map(s=>({id:s.id,name:s.name,active:true})),
    ...(world.ruins??[]).map(s=>({id:s.id,name:s.name,active:false}))];
  const place=world.settlements.find(s=>s.id===focusedId)??
    (focusedId===null?world.settlements[0]:undefined);
  const ruin=place?undefined:(world.ruins??[]).find(s=>s.id===focusedId)??
    world.ruins?.[0];
  const selected=place??ruin;
  const structures=place?.infrastructure?.buildings??ruin?.buildings??[];
  const building=structures.find(b=>b.id===chosenBuilding);
  const counts=useMemo(()=>Object.fromEntries(BUILDING_TYPES.map(t=>[t,
    structures.filter(b=>b.type===t&&b.stage==='complete').length])),[structures]);
  const active=structures.filter(b=>['foundation','frame','finishing'].includes(b.stage));
  const completed=structures.filter(b=>b.stage==='complete').length;
  const residents=place?world.agents.filter(a=>Math.max(Math.abs(a.x-place.x),
    Math.abs(a.y-place.y))<=7):[];
  const homes=world.households?.filter(h=>h.residence?.settlementId===place?.id).length??0;
  return <main className="evo-settlement-page">
    <header className="evo-section-header">
      <div><span className="evo-overline">WORLDFORGE / BUILT BY THE PEOPLE</span>
        <h2>Living Settlements</h2>
        <p>Watch inhabitants gather materials, choose sites, build homes, and
          leave roads or ruins behind. Every year advances off-screen.</p></div>
      <div className="evo-city-header-actions">
        <div className="evo-city-header-stat"><b>{world.settlements.length}</b>
          <span>living settlements</span></div>
        <button disabled={!world.agents.length||world.year>=9999}
          onClick={onTogglePlay}>{playing?'■ PAUSE':'▶ PLAY WORLD'}</button>
        <button onClick={()=>onAdvance(1)}>+1 YEAR</button>
        <button onClick={()=>onAdvance(10)}>+10 YEARS</button>
      </div>
    </header>
    <div className="evo-city-layout">
      <aside className="evo-section-card evo-city-list">
        <div className="evo-card-heading"><strong>SETTLEMENTS & RUINS</strong>
          <span>{all.length} sites</span></div>
        <div className="evo-city-list-scroll">
          {all.map(s=><button key={s.id} className={selected?.id===s.id?'selected':''}
            onClick={()=>{setFocusedId(s.id);setChosenBuilding(null);}}>
            <span>{s.active?'⌂':'◌'}</span><strong>{s.name}</strong>
            <small>{s.active?'LIVING':'RUINS'} · #{s.id}</small>
          </button>)}
          {!all.length&&<p className="evo-family-help">No settlements have formed.
            Advance time until local groups found a community.</p>}
        </div>
      </aside>
      <section className="evo-section-card evo-city-detail">
        {!selected?<div className="evo-inspector-empty"><strong>NOTHING BUILT YET</strong>
          <p>Settlements form when enough nearby adults establish a community.</p>
        </div>:<>
          <div className="evo-card-heading"><strong>{selected.name}</strong>
            <span>{place?STAGE_LABELS[settlementStage(place)]:'ABANDONED SITE'}</span></div>
          <div className="evo-city-intro">
            <span className="evo-city-culture" style={{
              background:ARCHITECTURE[selected.species].roof}}>
              {SPECIES_INFO[selected.species].symbol}</span>
            <div><h3>{place?STAGE_LABELS[settlementStage(place)]:'Ruined settlement'}
              {' · '+SPECIES_INFO[selected.species].name}</h3>
              <p>{ARCHITECTURE[selected.species].name} architecture ·
                {place?' Founded Y'+place.founded:' Collapsed Y'+ruin?.collapsed}</p>
            </div>
            <button onClick={()=>onFindOnMap(selected.id)}>⌖ FIND ON MAP ↗</button>
          </div>
          <div className="evo-city-metrics">
            <div><small>LOCAL RESIDENTS</small><strong>{num(residents.length)}</strong></div>
            <div><small>COMPLETE BUILDINGS</small><strong>{completed}</strong></div>
            <div><small>UNDER CONSTRUCTION</small><strong>{active.length}</strong></div>
            <div><small>HOUSED FAMILIES</small><strong>{homes}</strong></div>
            <div><small>ROADS / PATH TILES</small><strong>{place?.infrastructure?.roads.length??
              ruin?.roads.length??0}</strong></div>
            <div><small>OWNED LAND TILES</small><strong>{place?.infrastructure?.land.length??0}</strong></div>
          </div>
          <div className="evo-city-map-top"><strong>LOCAL VIEW · REAL BUILDING LOCATIONS</strong>
            <label htmlFor="evo-city-zoom">MAP ZOOM <input id="evo-city-zoom"
              type="range" min={1} max={2.5} step={.25} value={zoom}
              onChange={e=>setZoom(Number(e.target.value))}/></label></div>
          <LocalMap world={world} settlement={place} ruin={ruin}
            chosen={chosenBuilding} onChoose={setChosenBuilding} zoom={zoom}/>
          <div className="evo-city-legend"><span>▧ Owned land</span>
            <span>━ Worn paths</span><span>▤ Buildings</span>
            <span>⚒ Scaffolding / progress</span><span>● Trees & minerals</span></div>
          {place?.infrastructure&&<div className="evo-city-stock">
            <strong>COLLECTED MATERIALS & ORES</strong>
            {(['wood','stone','clay'] as const).map(m=><span key={m}>
              {m.toUpperCase()} <b>{place.infrastructure!.stock[m].toFixed(1)}</b>
            </span>)}
            {ORES.map(m=><span key={m}>
              {RESOURCE_LABELS[m].toUpperCase()} <b>
                {(place.infrastructure!.oreStock?.[m]??0).toFixed(1)}</b>
            </span>)}
          </div>}
          <section className="evo-city-buildings">
            <h3>THE BUILT ENVIRONMENT</h3>
            <div className="evo-city-type-counts">
              {BUILDING_TYPES.map(t=><span key={t}>
                {BUILDING_LABELS[t]} <b>{counts[t]}</b></span>)}
            </div>
            {building&&<div className="evo-city-building-detail">
              <strong>{BUILDING_LABELS[building.type]} #{building.id}</strong>
              <p>{building.stage} · Y{building.started} ·
                {building.progress}% built · {Math.round(building.condition)}% condition</p>
              <p>Materials delivered: {(['wood','stone','clay'] as const).map(m=>
                m+' '+building.spent[m]+'/'+COSTS[building.type].materials[m]).join(' · ')}</p>
              <p>Labor contributed: {building.labor.toFixed(1)} / {COSTS[building.type].labor}</p>
              {building.householdId&&<p>Residence of household #{building.householdId}</p>}
            </div>}
            <div className="evo-city-building-list">
              {structures.slice(-36).reverse().map(b=><button key={b.id}
                onClick={()=>setChosenBuilding(b.id)}>
                <span>{BUILDING_LABELS[b.type]} #{b.id}</span>
                <small>{b.stage} · Y{b.started}</small>
                <progress value={b.progress} max="100"/>
              </button>)}
            </div>
          </section>
          <p className="evo-city-disclaimer">Buildings are chosen and constructed
            by inhabitants, never drawn into existence by opening this screen.
            Zoom changes only the view. Simulated labor, stocks and roads advance
            each world year, even for unseen settlements.</p>
        </>}
      </section>
    </div>
  </main>;
}
