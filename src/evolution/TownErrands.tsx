import {useEffect,useRef} from 'react';
import type {World} from './engine';
import {coinLabel,errandKey,errandReward,type Errand,type MortalJournal} from './errandRecords';
import {errandCargo,errandTitle,MEAL_ENERGY,MEAL_PRICE,type ErrandObjective} from './mortalErrands';

export function TownNoticeBoard({world,journal,offers,objective,canDeliver,message,
  onAccept,onDeliver,onMeal,onClose}:{
  world:World;journal:MortalJournal;offers:Errand[];objective?:ErrandObjective;
  canDeliver:boolean;message:string;
  onAccept:(errand:Errand)=>void;onDeliver:()=>void;onMeal:()=>void;onClose:()=>void;
}){
  const active=journal.active;
  const close=useRef<HTMLButtonElement>(null);
  useEffect(()=>{close.current?.focus({preventScroll:true});},[]);
  return <section className="adventure-errand-board" aria-label="Town notice board">
    <header>
      <h2>Town notice board</h2>
      <button ref={close} className="adventure-close" onClick={onClose}
        aria-label="Close town board">×</button>
    </header>
    {active?<div className="adventure-errand-slip">
      <strong>{errandTitle(world,active.errand)}</strong>
      <p>{objective?.text}</p>
      {canDeliver&&<button className="adventure-primary" onClick={onDeliver}>Deliver supplies</button>}
    </div>:offers.length?<ul className="adventure-errand-offers">
      {offers.map(errand=><li key={errandKey(errand)} className="adventure-errand-slip">
        <span className="adventure-errand-icon" data-kind={errand.kind} aria-hidden="true"/>
        <div>
          <strong>{errandTitle(world,errand)}</strong>
          <p>{errand.kind==='forage'?'Gather '+errandCargo(errand)+' nearby.':
            'Carry '+errandCargo(errand)+' to the next town.'}</p>
          <small>Up to {coinLabel(errandReward(errand))}</small>
        </div>
        <button className="adventure-primary" onClick={()=>onAccept(errand)}
          aria-label={'Accept '+errandTitle(world,errand)}>
          Accept
        </button>
      </li>)}
    </ul>:<p className="adventure-errand-empty">No errands are posted today.</p>}
    <footer>
      <span>{coinLabel(journal.coins)}</span>
      <button onClick={onMeal} disabled={journal.coins<MEAL_PRICE}>
        Buy a meal · {coinLabel(MEAL_PRICE)}
      </button>
      <small>Restores up to {MEAL_ENERGY} energy</small>
    </footer>
    {message&&<p className="adventure-errand-feedback" role="status">{message}</p>}
  </section>;
}

export function ErrandTracker({world,journal,objective,directions,boardLabel,
  abandonLabel,onBoard,onAbandon}:{
  world:World;journal:MortalJournal;objective?:ErrandObjective;
  directions?:string;boardLabel?:string;abandonLabel?:string;
  onBoard:()=>void;onAbandon:()=>void;
}){
  const active=journal.active;
  if(!active&&!boardLabel&&!journal.history.length)return null;
  return <section className="adventure-errand-tracker" aria-label="Errands">
    <h2>{active?'Current errand':'Town errands'}</h2>
    {active&&<>
      <strong>{errandTitle(world,active.errand)}</strong>
      <p>{objective?.text}</p>
      {directions&&<span className="adventure-errand-direction">{directions}</span>}
      {active.carrying&&<small>Carrying {errandCargo(active.errand)}</small>}
    </>}
    {!active&&boardLabel&&<button className="adventure-board-link" onClick={onBoard}>
      {boardLabel}
    </button>}
    {(journal.history.length>0||abandonLabel)&&
      <details className="adventure-errand-history">
        <summary>{journal.history.length?'Errand log':'Errand options'}</summary>
        {journal.history.length>0&&<ul>{[...journal.history].reverse().map((item,i)=>
          <li key={item.at+':'+i}>
            <span>{errandTitle(world,item.errand)}</span>
            <small>{item.coins?'+ '+coinLabel(item.coins):'Delivered'}</small>
          </li>)}</ul>}
        {abandonLabel&&<button className="adventure-abandon" onClick={onAbandon}>
          {abandonLabel}
        </button>}
      </details>}
  </section>;
}
