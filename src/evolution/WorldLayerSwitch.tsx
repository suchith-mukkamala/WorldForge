export function WorldLayerSwitch({underground,onChange}:{
  underground:boolean;onChange:(underground:boolean)=>void;
}){
  return <div className="world-layer-switch" role="group" aria-label="World layers">
    <button type="button" aria-pressed={!underground} onClick={()=>onChange(false)}>Surface</button>
    <button type="button" aria-pressed={underground} onClick={()=>onChange(true)}>Underworld</button>
  </div>;
}
