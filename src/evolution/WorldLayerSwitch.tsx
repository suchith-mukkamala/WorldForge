export type AtlasView='stacked'|'surface'|'underworld';

export function WorldLayerSwitch({view,onChange}:{
  view:AtlasView;onChange:(view:AtlasView)=>void;
}){
  return <div className="world-layer-switch" role="group" aria-label="World layers">
    <button type="button" aria-pressed={view==='stacked'} onClick={()=>onChange('stacked')}>Stacked 3D</button>
    <button type="button" aria-pressed={view==='surface'} onClick={()=>onChange('surface')}>Surface</button>
    <button type="button" aria-pressed={view==='underworld'} onClick={()=>onChange('underworld')}>Underworld</button>
  </div>;
}
