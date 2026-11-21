import {WALK_DIRECTIONS,type useAdventureControls} from './useAdventureControls';

export function AdventureDirections({controls,action='Move'}:{
  controls:ReturnType<typeof useAdventureControls>;action?:'Move'|'Sail';
}){
  return <div className="adventure-dpad" role="group"
    aria-label={action==='Sail'?'Steer with touch controls':'Walk with touch controls'}>
    {WALK_DIRECTIONS.map(direction=><button key={direction.id} className={'walk-'+direction.id}
      aria-label={action+' '+direction.id}
      onPointerDown={event=>controls.start(event,direction.id)}
      onPointerUp={controls.stop} onPointerCancel={controls.stop} onLostPointerCapture={controls.stop}
      onClick={event=>{if(event.detail===0)controls.tap(direction);}}>{direction.icon}</button>)}
  </div>;
}
