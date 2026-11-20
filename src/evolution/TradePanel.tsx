import type {Settlement,World} from './engine';
import {SPECIALTY_LABELS,stockOf} from './economy';

const units=(amount:number)=>amount.toLocaleString('en-US',{maximumFractionDigits:1});

export function TradePanel({world,town,onLocate}:{
  world:World;town:Settlement|null;onLocate:(index:number)=>void;
}){
  const shipments=world.shipments??[];
  const names=new Map(world.settlements.map(s=>[s.id,s.name]));
  const market=town?.economy;
  return <section className="evo-section-card atlas-trade-card" aria-label="Trade">
    <div className="evo-card-heading">
      <strong>Trade</strong>
      <span>{shipments.length} in transit</span>
    </div>
    <div className="atlas-trade-content">
      {shipments.length?<ul className="atlas-shipment-list" aria-label="Active shipments">
        {shipments.map(shipment=>{
          const origin=names.get(shipment.originId)??'Unknown town';
          const destination=names.get(shipment.destinationId)??'Unknown town';
          const percent=Math.round(shipment.progress/Math.max(1,shipment.route.length-1)*100);
          const mode=shipment.mode==='sea'?'Ship':'Caravan';
          return <li key={shipment.id}>
            <button type="button" className={shipment.mode==='sea'?'is-sea':''}
              onClick={()=>onLocate(shipment.route[shipment.progress])}>
              <strong>{origin} → {destination}</strong>
              <span>{units(shipment.quantity)} {shipment.good} · {mode} · {percent}% of route</span>
            </button>
          </li>;
        })}
      </ul>:<p>No shipments are on the move this year.</p>}
      {town?<div className="atlas-town-market">
        <h3>{town.name}</h3>
        {market?<>
          <p>{market.specialty?SPECIALTY_LABELS[market.specialty]:'Developing market'}
            {' · '+units(market.produced)+' food grown this year'}</p>
          {market.shortages.length?<ul aria-label="Market shortages">
            {market.shortages.map(good=><li key={good}>
              {good} <small>{units(stockOf(town,good))} stored</small>
            </li>)}
          </ul>:<p>No current shortages.</p>}
        </>:<p>Local trade records are still developing.</p>}
      </div>:<p>Select a settlement to see its market and shortages.</p>}
    </div>
  </section>;
}
