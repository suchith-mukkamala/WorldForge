import {buildingAppearance,BUILDING_LABELS,settlementStage,type Building} from './construction';
import {SPECIES_INFO,type Settlement} from './engine';

function buildingStatus(building:Building){
  if(building.stage==='complete')return Math.round(building.condition)+'% condition';
  if(building.stage==='ruin')return 'Ruins';
  if(building.stage==='abandoned')return 'Abandoned';
  return Math.round(building.progress)+'% built';
}

export function AtlasTownCard({town,building,onOpen,onBuilding}:{
  town:Settlement;building?:Building;onOpen:()=>void;onBuilding:(building:Building)=>void;
}){
  const buildings=town.infrastructure?.buildings??[];
  const complete=buildings.filter(b=>b.stage==='complete').length;
  return <div className="evo-selected-settlement atlas-town-card">
    {building?<div className="atlas-building-readout">
      <strong>{BUILDING_LABELS[building.type]}</strong>
      <span>{buildingAppearance(building)!==BUILDING_LABELS[building.type]?
        buildingAppearance(building)+' · ':''}{buildingStatus(building)}</span>
    </div>:null}
    <strong>{town.name}</strong>
    <span>{SPECIES_INFO[town.species].name} · {settlementStage(town)} ·
      {' '}{town.population} residents</span>
    <button type="button" onClick={onOpen}>Town profile ↗</button>
    {buildings.length>0?<details className="atlas-building-list">
      <summary>Buildings · {complete} complete</summary>
      <ul>{buildings.map(b=><li key={b.id}>
        <button type="button" aria-current={b.id===building?.id?'location':undefined}
          aria-label={BUILDING_LABELS[b.type]+' at '+b.x+', '+b.y}
          onClick={()=>onBuilding(b)}>
          <span>{BUILDING_LABELS[b.type]}</span><small>{buildingStatus(b)}</small>
        </button>
      </li>)}</ul>
    </details>:<small>No buildings yet.</small>}
  </div>;
}
