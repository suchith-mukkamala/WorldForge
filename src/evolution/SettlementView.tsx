import {useEffect,useMemo,useState} from 'react';
import {BIOME_INFO,SPECIES_INFO,type Settlement,type World} from './engine';
import {ARCHITECTURE,BUILDING_LABELS,BUILDING_TYPES,COSTS,ORES,
  settlementStage,type Building,type RuinSite} from './construction';
import {RESOURCE_COLORS,RESOURCE_LABELS} from './resources';
import {GOODS,JOBS,JOB_LABELS,SPECIALTY_LABELS,activePartnership,stockOf} from './economy';
import {TOPIC_INFO} from './knowledge';
import {bridgeTiles,roadTiles} from './transport';
import {accordBetween} from './institutions';
import {governmentOf,GOVERNMENT_LABELS,POLICY_LABELS} from './culture';
import {pixelRectsFor} from './pixelArt';
import {personName} from './identity';
import {topographyForWorld} from './topography';
import {hydrologyForWorld} from './hydrology';
import {terrainDetailAt,type TerrainDetail} from './terrainDetails';
import {populationScene,renderedPopulation} from './populationVisibility';

type Props={world:World;selectedId:number|null;onFindOnMap:(id:number)=>void;
  playing:boolean;onTogglePlay:()=>void;onAdvance:(years:number)=>void};
const CELL=26,VIEW=19,HALF=Math.floor(VIEW/2);
const STAGE_LABELS={encampment:'Encampment',hamlet:'Hamlet',village:'Village',
  town:'Town',city:'City'};
const num=(n:number)=>n.toLocaleString('en-US');

/** Larger hand-pixelled versions of the same seeded overworld motifs.
 * Decorations stay behind real trees, ore, roads, structures and people.
 */
function TerrainScenery({detail,x,y}:{detail:TerrainDetail;x:number;y:number}){
  const v=detail.variant,kind=detail.motif;
  if(kind==='none')return null;
  return <g data-terrain-motif={kind}>
    {kind==='oak'&&<>
      <rect x={x+4} y={y+21} width={20} height={3} fill="#243f3b"/>
      <rect x={x+12} y={y+12} width={4} height={12} fill="#715a46"/>
      <rect x={x+3} y={y+8} width={20} height={12} fill="#275e4c"/>
      <rect x={x+6} y={y+4} width={14} height={12} fill="#4c926b"/>
      <rect x={x+9+v%2} y={y+2} width={9} height={6} fill="#86be88"/>
      <rect x={x+5} y={y+13} width={5} height={3} fill="#6baa74"/>
    </>}
    {kind==='pine'&&<>
      <rect x={x+11} y={y+15} width={4} height={10} fill="#6c5144"/>
      <path d={`M${x+13} ${y+1}l-8 11h4l-6 8h20l-6-8h4z`}
        fill="#205746" stroke="#183b3b" strokeWidth={1}/>
      <path d={`M${x+13} ${y+3}l-5 8h5l-6 7h6`}
        fill="#559e75"/>
      <rect x={x+11} y={y+5+v} width={3} height={3} fill="#8bc5a0"/>
    </>}
    {kind==='fern'&&<>
      <path d={`M${x+12} ${y+23}V${y+9}M${x+12} ${y+15}l-7-5m7 8l8-7m-8 10l-6-4m6 0l6-4`}
        stroke="#77b583" strokeWidth={2.5} fill="none"/>
      <rect x={x+7} y={y+20} width={11} height={3} fill="#2e6e54"/>
    </>}
    {kind==='grass'&&<>
      <path d={`M${x+6} ${y+23}l-3-7m3 7l4-12m-4 12l7-8M${x+20} ${y+24}l-3-10m3 10l3-6`}
        stroke="#9abf80" strokeWidth={2} fill="none"/>
    </>}
    {kind==='flowers'&&<>
      <path d={`M${x+11} ${y+23}V${y+10}M${x+11} ${y+19}l-5-3m5 1l5-4`}
        stroke="#588d65" strokeWidth={2.5} fill="none"/>
      <rect x={x+7} y={y+5} width={9} height={8}
        fill={v%2?'#db9ac2':'#f0c28b'}/>
      <rect x={x+10} y={y+8} width={3} height={3} fill="#f8ecba"/>
    </>}
    {kind==='pebbles'&&<>
      <rect x={x+3} y={y+19} width={19} height={4} fill="#363e4d"/>
      <rect x={x+5} y={y+15} width={10} height={7} fill="#7d8790"/>
      <rect x={x+7} y={y+14} width={5} height={2} fill="#bbc0bb"/>
      <rect x={x+17} y={y+17} width={5} height={4} fill="#9ba09b"/>
    </>}
    {kind==='reeds'&&<>
      <path d={`M${x+6} ${y+24}l1-18m6 18l-2-14m7 14l2-16`}
        stroke="#a0ba7b" strokeWidth={2.3} fill="none"/>
      <rect x={x+6} y={y+3} width={3} height={7} fill="#cdbb79"/>
      <rect x={x+17} y={y+5} width={3} height={6} fill="#d3c58b"/>
    </>}
    {(kind==='boulder'||kind==='snowstone'||kind==='scree')&&<>
      <rect x={x+3} y={y+21} width={21} height={4} fill="#344052"/>
      <path d={`M${x+4} ${y+21}l4-12 10-4 6 11-3 6z`}
        fill={kind==='scree'?'#647185':'#6c8292'}/>
      <path d={`M${x+8} ${y+9}l10-4 3 6-8 3-6 7z`}
        fill={kind==='snowstone'?'#e2e9e6':'#aab8bd'}/>
      <path d={`M${x+12} ${y+13}l-3 7m9-10l2 7`}
        stroke="#45556c" strokeWidth={1.5}/>
      {kind==='scree'&&<>
        <rect x={x+1} y={y+20} width={6} height={4} fill="#a4a6ae"/>
        <rect x={x+20} y={y+19} width={5} height={4} fill="#8994a4"/>
      </>}
      {kind==='snowstone'&&<path d={`M${x+7} ${y+12}l2-6 9-3 5 10-8-3-4 5z`}
        fill="#f2f1e8"/>}
    </>}
    {kind==='crystal'&&<>
      <path d={`M${x+5} ${y+21}l5-15 5-4 5 19z`} fill="#4a889f"/>
      <path d={`M${x+10} ${y+6}l5-4v17l-7 3z`} fill="#9ad5d6"/>
      <rect x={x+13} y={y+6} width={2} height={8} fill="#d6eff0"/>
    </>}
    {kind==='stalagmite'&&<>
      <path d={`M${x+3} ${y+23}l6-14 3 7 4-11 7 18z`}
        fill="#5c637b" stroke="#33394e" strokeWidth={1}/>
      <path d={`M${x+8} ${y+11}l2 8m6-12l3 13`}
        stroke="#aab0bc" strokeWidth={2}/>
    </>}
    {kind==='scrub'&&<>
      <path d={`M${x+13} ${y+24}V${y+10}m0 6l-8-6m8 10l7-8M${x+7} ${y+12}l-1-5`}
        stroke="#b59683" strokeWidth={2.5} fill="none"/>
    </>}
    {(kind==='basalt'||kind==='embers')&&<>
      <path d={`M${x+3} ${y+23}l5-12 7 3 4-9 5 18z`}
        fill="#3e374a" stroke="#241e35" strokeWidth={1}/>
      <path d={`M${x+9} ${y+12}l6 2 4-9v12`} fill="#826271"/>
      <rect x={x+15} y={y+16} width={4} height={2} fill="#ce7766"/>
      {kind==='embers'&&<>
        <rect x={x+6} y={y+21} width={4} height={2} fill="#f0a36d"/>
        <rect x={x+21} y={y+19} width={2} height={3} fill="#f1c387"/>
      </>}
    </>}
    {(kind==='ripples'||kind==='shorefoam')&&<>
      <path d={`M${x+3+v} ${y+9}h10m-4 4h12m-17 6h9`}
        stroke={kind==='shorefoam'?'#b5dad4':'#6cabc1'}
        strokeWidth={2.3} fill="none"/>
    </>}
  </g>;
}

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
            :b.type==='dock'?<>
              <path d={`M${x+5} ${y+12}H${x+21}M${x+8} ${y+12}v9m10-9v9`}
                stroke="#806344" strokeWidth={3} fill="none"/>
              <path d={`M${x+10} ${y+20}q4-5 8 0`} stroke="#65b8cf"
                strokeWidth={1.5} fill="none"/>
            </>:b.type==='market'?<>
              <path d={`M${x+4} ${y+12}h18l-3 5h-12Z`} fill="#f5c96d"/>
              <path d={`M${x+9} ${y+12}l-1 5m8-5l1 5`} stroke="#a95e54"
                strokeWidth={2}/>
            </>:b.type==='communal'?<path d={`M${x+13} ${y+4}V${y-1}l7 3l-7 2`}
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
  const paved=roadTiles(world),bridges=bridgeTiles(world);
  const land=new Set(settlement?.infrastructure?.land??[]);
  const peopleById=new Map(world.agents.map(a=>[a.id,a]));
  const caravans=(world.shipments??[]).flatMap(t=>{
    const driver=peopleById.get(t.carrierId);
    return driver&&Math.abs(driver.x-place.x)<=HALF&&
      Math.abs(driver.y-place.y)<=HALF?[{shipment:t,driver}]:[];
  });
  // The town continues simulating every inhabitant. Only a small, stable
  // sample of outdoor pedestrians is drawn in this high-detail SVG.
  const residents=renderedPopulation(world.agents,populationScene(world),{
    bounds:{minX:place.x-HALF,minY:place.y-HALF,
      maxX:place.x+HALF,maxY:place.y+HALF},
    zoom:4,maxVisible:48});
  const names=new Map(world.lineage.map(r=>[r.id,r]));
  const deposits=new Map((world.deposits??[]).map(d=>[d.index,d]));
  const heights=topographyForWorld(world).heights;
  const hydrology=hydrologyForWorld(world);
  const altitudeAt=(x:number,y:number)=>x>=0&&y>=0&&
    x<world.width&&y<world.height?heights[y*world.width+x]:null;
  const biomeAt=(x:number,y:number)=>x>=0&&y>=0&&
    x<world.width&&y<world.height?
      world.tiles[y*world.width+x].biome:undefined;
  const originX=place.x-HALF,originY=place.y-HALF;
  const allTiles=[];
  for(let dy=0;dy<VIEW;dy++)for(let dx=0;dx<VIEW;dx++){
    const x=originX+dx,y=originY+dy;
    const tile=x>=0&&y>=0&&x<world.width&&y<world.height?
      world.tiles[y*world.width+x]:null;
    const elevation=altitudeAt(x,y);
    const difference=(nx:number,ny:number)=>elevation===null?0:
      elevation-(altitudeAt(nx,ny)??elevation);
    const shore=tile?[biomeAt(x-1,y),biomeAt(x+1,y),
      biomeAt(x,y-1),biomeAt(x,y+1)].some(b=>b!==undefined&&
        (b==='water')!==(tile.biome==='water')):false;
    allTiles.push({id:dy*VIEW+dx,x:dx*CELL,y:dy*CELL,tile,
      elevation,dropN:difference(x,y-1),dropE:difference(x+1,y),
      dropS:difference(x,y+1),dropW:difference(x-1,y),
      detail:tile?terrainDetailAt(tile.biome,x,y,
        world.settings.seed,elevation??0,shore):null,
      stream:tile?hydrology.channel[y*world.width+x]:0,
      flowTo:tile?hydrology.flowTo[y*world.width+x]:-1,
      owner:tile&&land.has(y*world.width+x),route:tile&&roads.has(y*world.width+x),
      paved:tile&&paved.has(y*world.width+x),bridge:tile&&bridges.has(y*world.width+x),
      deposit:tile?deposits.get(y*world.width+x):undefined});
  }
  return <div className="evo-city-map-scroll">
    <svg role="img" aria-label={'Local buildings, roads and residents of '+place.name}
      viewBox={`0 0 ${VIEW*CELL} ${VIEW*CELL}`}
      shapeRendering="crispEdges"
      style={{width:(zoom*100)+'%',minWidth:'430px',imageRendering:'pixelated'}}>
      {allTiles.map(p=><g key={p.id}>
        <rect x={p.x} y={p.y} width={CELL} height={CELL}
          fill={p.tile?BIOME_INFO[p.tile.biome].color:'#11192a'}
          stroke="#182539" strokeWidth={.65}/>
        {p.elevation!==null&&<>
          <title>{'Elevation '+p.elevation+'/255'}</title>
          {p.dropN>9&&<rect x={p.x} y={p.y} width={CELL} height={3}
            fill="#f3ecc7" opacity={Math.min(.7,p.dropN/75)}/>}
          {p.dropW>10&&<rect x={p.x} y={p.y} width={3} height={CELL}
            fill="#f6e6b6" opacity={Math.min(.55,p.dropW/85)}/>}
          {p.dropS>9&&<rect x={p.x} y={p.y+CELL-5}
            width={CELL} height={5} fill="#18263a"
            opacity={Math.min(.72,p.dropS/75)}/>}
          {p.dropE>9&&<rect x={p.x+CELL-4} y={p.y}
            width={4} height={CELL} fill="#1c2d3e"
            opacity={Math.min(.58,p.dropE/90)}/>}
          {(p.dropN>30||p.dropW>30)&&
            <path d={`M${p.x+2} ${p.y+5}l7 2m6 4l5 2`}
              stroke="#e0d5ae" strokeWidth={1.5} fill="none"
              opacity={.65}/>}
        </>}
      </g>)}
      {allTiles.filter(p=>p.stream>0&&p.flowTo>=0).map(p=>{
        const fromX=originX+p.x/CELL,fromY=originY+p.y/CELL;
        const nextX=p.flowTo%world.width;
        const nextY=Math.floor(p.flowTo/world.width);
        return <g key={'stream-'+p.id}>
          <title>{'Surface drainage · '+(p.stream===3?'river':
            p.stream===2?'stream':'creek')}</title>
          <path d={`M${p.x+13} ${p.y+13}L${p.x+13+(nextX-fromX)*CELL} ${p.y+13+(nextY-fromY)*CELL}`}
            stroke="#2d536a" strokeWidth={p.stream+3} fill="none"/>
          <path d={`M${p.x+13} ${p.y+13}L${p.x+13+(nextX-fromX)*CELL} ${p.y+13+(nextY-fromY)*CELL}`}
            stroke="#55b4d3" strokeWidth={p.stream+1} fill="none"/>
        </g>;
      })}
      {allTiles.map(p=><g key={'scenery-'+p.id}>
        {p.detail&&<TerrainScenery detail={p.detail} x={p.x} y={p.y}/>}
        {p.owner&&<rect x={p.x+1} y={p.y+1} width={CELL-2} height={CELL-2}
          fill="#ffe4aa" fillOpacity={.10} stroke="#e0b976" strokeOpacity={.30}
          strokeDasharray="3 3"/>}
        {p.route&&<>
          <rect x={p.x} y={p.y+10} width={CELL} height={6}
            fill="#af9d82" opacity={.8}/>
          <rect x={p.x+10} y={p.y} width={6} height={CELL}
            fill="#af9d82" opacity={.64}/>
        </>}
        {p.paved&&<>
          <rect x={p.x} y={p.y+9} width={CELL} height={8} fill="#e0bd81"/>
          <path d={`M${p.x} ${p.y+13}h${CELL}`} stroke="#8d755a"
            strokeDasharray="4 3" strokeWidth={1}/>
        </>}
        {p.bridge&&<>
          <rect x={p.x+2} y={p.y+7} width={CELL-4} height={12}
            rx={2} fill="#ba9972" stroke="#ecd9b0" strokeWidth={1.4}/>
          <path d={`M${p.x+4} ${p.y+13}h${CELL-8}`} stroke="#554b4a"
            strokeDasharray="4 3" strokeWidth={1.2}/>
        </>}
        {p.deposit&&p.deposit.amount>.1&&(p.deposit.kind==='tree'?<>
          <rect x={p.x+12} y={p.y+11} width={3} height={12} fill="#56493e"/>
          <rect x={p.x+5} y={p.y+7} width={17} height={10}
            fill={RESOURCE_COLORS.tree}/>
          <rect x={p.x+9} y={p.y+3} width={9} height={10} fill="#76b780"/>
        </>:<>
          <rect x={p.x+5} y={p.y+12} width={17} height={10} fill="#373c4b"/>
          <rect x={p.x+8} y={p.y+8} width={12} height={11}
            fill={RESOURCE_COLORS[p.deposit.kind]}/>
          <rect x={p.x+11} y={p.y+10} width={3} height={3} fill="#d9d6be"/>
        </>)}
      </g>)}
      <rect x={HALF*CELL+5} y={HALF*CELL+5} width={CELL-10} height={CELL-10}
        fill="none" stroke="#ffe7ae" strokeWidth={1.5} strokeDasharray="3 2"/>
      {buildings.filter(b=>Math.abs(b.x-place.x)<=HALF&&
        Math.abs(b.y-place.y)<=HALF).map(b=><Structure key={b.id} b={b}
        x={(b.x-originX)*CELL} y={(b.y-originY)*CELL}
        selected={chosen===b.id} onSelect={()=>onChoose(b.id)}/>)}
      {residents.map(a=><g key={'resident-'+a.id}
        transform={`translate(${(a.x-originX)*CELL+5} ${(a.y-originY)*CELL+2})`}>
        <title>{personName(world,names.get(a.id)??a)+' · '+a.species+
          ' · age '+a.age}</title>
        {pixelRectsFor(a).map((r,i)=><rect key={i} x={r.x} y={r.y}
          width={r.width} height={r.height} fill={r.color}/>)}
      </g>)}
      {caravans.map(({shipment,driver})=><g key={'caravan-'+shipment.id}
        transform={`translate(${(driver.x-originX)*CELL+13} ${(driver.y-originY)*CELL+13})`}>
        <title>{(shipment.mode==='sea'?'Ship':'Caravan')+' #'+shipment.id+
          ' carrying '+shipment.quantity+' '+
          shipment.good}</title>
        {shipment.mode==='sea'?<>
          <path d="M-10 3H10L5 9H-5Z" fill="#a57950" stroke="#413944"
            strokeWidth={1.4}/>
          <path d="M0 -12V4L8 1Z" fill="#f2ebda" stroke="#6c8191"
            strokeWidth={1}/>
        </>:<>
          <rect x={-8} y={-6} width={16} height={12} rx={2}
            fill="#d9b57d" stroke="#352f3a" strokeWidth={1.7}/>
          <circle cx={-5} cy={7} r={2.7} fill="#414253"/>
          <circle cx={5} cy={7} r={2.7} fill="#414253"/>
          <path d="M-4 -3h8" stroke="#fff1ba" strokeWidth={2}/>
        </>}
      </g>)}
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
  const government=place?governmentOf(world,place.id):undefined;
  const faithCounts=new Map<number,number>();
  for(const a of residents)if(a.belief)
    faithCounts.set(a.belief.faithId,(faithCounts.get(a.belief.faithId)??0)+1);
  const localFaiths=[...faithCounts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,4);
  const homes=world.households?.filter(h=>h.residence?.settlementId===place?.id).length??0;
  const localShipments=(world.shipments??[]).filter(t=>
    t.originId===place?.id||t.destinationId===place?.id);
  const relationships=(world.tradeRelations??[]).filter(r=>
    r.a===place?.id||r.b===place?.id).sort((a,b)=>b.trust-a.trust||a.a-b.a);
  const guilds=(world.institutions?.guilds??[]).filter(g=>g.settlementId===place?.id);
  const localTransport=[...(world.transport?.roads??[]),
    ...(world.transport?.bridges??[])].filter(t=>place&&
    Math.max(Math.abs(t.index%world.width-place.x),
      Math.abs(Math.floor(t.index/world.width)-place.y))<=HALF);
  return <main className="evo-settlement-page">
    <header className="evo-section-header">
      <div><span className="evo-overline">WORLDFORGE / BUILT BY THE PEOPLE</span>
        <h2>Living Settlements</h2>
        <p>Watch people choose work, grow food, trade scarce goods, build homes,
          and leave roads or ruins behind. Every year advances off-screen.</p></div>
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
          {place&&<section className="evo-settlement-culture" aria-label="Local beliefs and government">
            <h3>⚖ BELIEFS & LOCAL GOVERNMENT</h3>
            {government?<>
              <p><strong>{GOVERNMENT_LABELS[government.kind]}</strong>
                {' · led by citizen #'+government.leaderId+
                  ' · elected Y'+government.elected}</p>
              <p>Current policy: <strong>{POLICY_LABELS[government.policy]}</strong>
                {' · legitimacy '+Math.round(government.legitimacy)+'/100'+
                  ' · unrest '+Math.round(government.unrest)+'/100'}</p>
            </>:<p>Residents have not yet established a formal government.</p>}
            {localFaiths.length?<p>Living traditions: {localFaiths.map(([id,count])=>
              (world.culture?.faiths.find(f=>f.id===id)?.name??'Unknown')+
              ' ('+count+')').join(' · ')}.</p>:
              <p>No locally practicing faiths have been recorded.</p>}
            <small>Institutions emerge from people's choices and evolve over time.</small>
          </section>}
          <div className="evo-city-metrics">
            <div><small>LOCAL RESIDENTS</small><strong>{num(residents.length)}</strong></div>
            <div><small>COMPLETE BUILDINGS</small><strong>{completed}</strong></div>
            <div><small>UNDER CONSTRUCTION</small><strong>{active.length}</strong></div>
            <div><small>HOUSED FAMILIES</small><strong>{homes}</strong></div>
            <div><small>ROADS / PATH TILES</small><strong>{place?.infrastructure?.roads.length??
              ruin?.roads.length??0}</strong></div>
            <div><small>PAVED ROADS / BRIDGES</small><strong>{localTransport.filter(t=>
              world.tiles[t.index].biome!=='water').length} / {localTransport.filter(t=>
              world.tiles[t.index].biome==='water').length}</strong></div>
            <div><small>OWNED LAND TILES</small><strong>{place?.infrastructure?.land.length??0}</strong></div>
          </div>
          {place?.economy&&<section className="evo-economy-panel" aria-label="Settlement economy">
            <div className="evo-economy-heading"><h3>WORK, PROVISIONS & TRADE</h3>
              <span>Economy advances with the world, even off-screen.</span></div>
            <div className="evo-economy-metrics">
              <div><small>ECONOMIC SPECIALTY</small><strong>{place.economy.specialty?
                SPECIALTY_LABELS[place.economy.specialty]:'Emerging'}</strong></div>
              <div><small>STORED FOOD</small><strong>{place.economy.food.toFixed(1)}</strong></div>
              <div><small>TOOLS</small><strong>{place.economy.tools.toFixed(1)}</strong></div>
              <div><small>COMMUNITY COINS</small><strong>{place.economy.coins.toFixed(1)}</strong></div>
              <div><small>GROWN / EATEN</small><strong>{place.economy.produced.toFixed(1)} /
                {place.economy.consumed.toFixed(1)}</strong></div>
              <div><small>IMPORTS / EXPORTS</small><strong>{place.economy.imports} /
                {place.economy.exports}</strong></div>
              <div><small>SEA DELIVERIES</small><strong>{place.economy.seaExports??0}</strong></div>
            </div>
            <div className="evo-economy-workers"><strong>WORKFORCE</strong>
              {JOBS.map(job=><span key={job}>{JOB_LABELS[job]} <b>
                {place.economy!.jobs[job]}</b></span>)}
            </div>
            <div className="evo-economy-scarcity"><strong>MARKET & SHORTAGES</strong>
              {place.economy.shortages.length?<p>Scarce:
                {' '+place.economy.shortages.join(', ')}</p>:
                <p>No acute shortages reported.</p>}
              <div>{GOODS.map(g=><span key={g} className={place.economy!.shortages.includes(g)?
                'scarce':''}>{g.toUpperCase()} <b>{stockOf(place,g).toFixed(1)}</b>
                <small> · {place.economy!.prices[g].toFixed(2)} coins</small></span>)}</div>
            </div>
            <div className="evo-economy-caravans"><strong>MERCHANTS IN TRANSIT</strong>
              {localShipments.length?localShipments.map(t=><p key={t.id}>
                {t.mode==='sea'?'⛵ SHIP':'▣ CARAVAN'} #{t.id} · {t.quantity} {t.good} ·
                {world.settlements.find(s=>s.id===t.originId)?.name??'Lost settlement'} →
                {world.settlements.find(s=>s.id===t.destinationId)?.name??'Lost settlement'}
                {' · '+Math.round(t.progress/Math.max(1,t.route.length-1)*100)+'% of route'}
              </p>):<p>No active caravans.</p>}
            </div>
            <div className="evo-economy-relations"><strong>TRADE RELATIONSHIPS</strong>
              {relationships.length?relationships.slice(0,8).map(r=>{
                const other=world.settlements.find(s=>s.id===
                  (r.a===place.id?r.b:r.a));
                const status=(r.disputeUntil??0)>world.year?'Dispute until Y'+r.disputeUntil:
                  activePartnership(r,world.year)?'Trusted partner':'Developing ties';
                const accord=accordBetween(world,r.a,r.b);
                return <p key={r.a+'-'+r.b}><b>{other?.name??'Lost settlement'}</b>
                  {' · '+status+' · trust '+Math.round(r.trust)+'/100 · '+
                    r.completed+' deliveries'}
                  {accord&&<span className="evo-institution-chip">
                    {' · '+accord.kind.toUpperCase()+' ACCORD'}</span>}</p>;
              }):<p>No established trade ties yet.</p>}
            </div>
            <div className="evo-guild-panel"><strong>WORKER GUILDS & APPRENTICESHIPS</strong>
              {guilds.length?guilds.map(g=><p key={g.id}>
                <b>{JOB_LABELS[g.job]} Guild</b> · {g.members.length} members ·
                expertise {Math.round(g.expertise)}/100 · leader #{g.leaderId} ·
                treasury {g.treasury.toFixed(1)} coins
              </p>):<p>Local workers have not yet formed a guild.</p>}
            </div>
          </section>}
          {place&&<section className="evo-knowledge-town" aria-label="Settlement knowledge">
            <strong>✧ COMMUNITY MEMORY & WRITTEN ARCHIVES</strong>
            {place.archives?.length?<p>{place.archives.map(topic=>
              TOPIC_INFO[topic].name).join(' · ')}</p>:
              <p>No written knowledge preserved yet. Communities need literate
                residents and a completed communal hall to keep lasting records.</p>}
          </section>}
          <div className="evo-city-map-top"><strong>LOCAL VIEW · REAL BUILDING LOCATIONS</strong>
            <label htmlFor="evo-city-zoom">MAP ZOOM <input id="evo-city-zoom"
              type="range" min={1} max={2.5} step={.25} value={zoom}
              onChange={e=>setZoom(Number(e.target.value))}/></label></div>
          <LocalMap world={world} settlement={place} ruin={ruin}
            chosen={chosenBuilding} onChoose={setChosenBuilding} zoom={zoom}/>
          <div className="evo-city-legend"><span>▧ Owned land</span>
            <span>━ Worn paths</span><span>▤ Buildings</span>
            <span>⚒ Scaffolding / progress</span><span>● Trees & minerals</span>
            <span>▣ Caravans / ⛵ Ships</span><span>═ Paved roads</span>
            <span>▰ Bridges</span></div>
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
