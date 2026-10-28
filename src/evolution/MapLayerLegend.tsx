import type {MapOverlay} from './WorldCanvas';

/** Map colors are a reading aid, never additional terrain or simulation data. */
const KEYS:Record<MapOverlay,{title:string;items:readonly {
  label:string;color:string}[];hint:string}>={
  terrain:{title:'LIVING LANDSCAPE',items:[
    {label:'Forest',color:'#548d68'},
    {label:'Highlands',color:'#778899'},
    {label:'Surface water',color:'#4aadd0'},
  ],hint:'Decorative scenery is safe; steep slopes affect travel in v2.0 worlds.'},
  resources:{title:'FOOD AVAILABILITY',items:[
    {label:'Plentiful',color:'#75ffb0'},
    {label:'Moderate',color:'#e9ca63'},
    {label:'Scarce',color:'#ff587c'},
  ],hint:'Shows current tile food relative to its local capacity.'},
  deposits:{title:'HARVESTABLE DEPOSITS',items:[
    {label:'Trees',color:'#76b780'},
    {label:'Ore',color:'#a5aaa9'},
    {label:'Water',color:'#4aadd0'},
  ],hint:'Deposit sprites show real resources; decorative scenery does not.'},
  elevation:{title:'HEIGHTMAP · 30-UNIT CONTOURS',items:[
    {label:'Lowland',color:'#3b7182'},
    {label:'Upland',color:'#b19f7c'},
    {label:'High peaks',color:'#e8e7d9'},
  ],hint:'Elevation is relative (0–255); pale contour lines mark rises.'},
  watersheds:{title:'DRAINAGE & CATCHMENTS',items:[
    {label:'Catchment',color:'#465766'},
    {label:'Creek / river',color:'#a2e9ee'},
    {label:'Potential pool',color:'#4b8a98'},
  ],hint:'Creek tiles can benefit farms in v2.0 worlds; boats still use established water biomes.'},
};

export function MapLayerLegend({overlay}:{overlay:MapOverlay}){
  const key=KEYS[overlay];
  return <div className="evo-layer-legend" role="note"
    aria-label={key.title}>
    <strong>{key.title}</strong>
    <div className="evo-layer-swatches">{key.items.map(item=><span key={item.label}>
      <i aria-hidden="true" style={{background:item.color}}/>{item.label}
    </span>)}</div>
    <small>{key.hint}</small>
  </div>;
}
