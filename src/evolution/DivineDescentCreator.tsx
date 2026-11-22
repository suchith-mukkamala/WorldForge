import {useState} from 'react';
import type {CSSProperties,FormEvent} from 'react';
import {SPECIES,SPECIES_INFO,type MortalAppearance,type MortalOutfit,
  type Species,type World} from './engine';
import {PixelPortrait} from './PixelPortrait';
import {mortalColorOptions,type PixelPerson} from './pixelArt';
import {DESCENT_BACKGROUNDS,type DescentBackground,
  type MortalCreation} from './divineDescent';
import {personName} from './identity';
import {adventureMapFor} from './adventureMap';

const HAIR_STYLES=['Classic','Cropped','Long'] as const;
const OUTFITS:readonly {id:MortalOutfit;label:string}[]=[
  {id:'wanderer',label:'Traveler'},
  {id:'forager',label:'Woodland'},
  {id:'artisan',label:'Craft'},
  {id:'scholar',label:'Scholar'},
];
const DEFAULT_LOOK:MortalAppearance={skin:0,hair:0,hairStyle:0,outfit:'wanderer'};

export function DivineDescentCreator({world,onCreate,onResume,onReturn,error,starting=false,arrivalName,atWorldTree=false,craterName}:{
  world:World;onCreate:(options:MortalCreation,settledStart:boolean,shipyard?:number)=>void;
  onResume:()=>void;onReturn:()=>void;error?:string;starting?:boolean;arrivalName?:string;atWorldTree?:boolean;craterName?:string;
}){
  const [name,setName]=useState('');
  const [species,setSpecies]=useState<Species>('human');
  const [background,setBackground]=useState<DescentBackground>('scout');
  const [look,setLook]=useState<MortalAppearance>(DEFAULT_LOOK);
  const [settledStart,setSettledStart]=useState(world.year===0);
  const [shipyard,setShipyard]=useState<number|undefined>();
  const canGrow=!arrivalName&&!atWorldTree&&!craterName&&!world.settlements.length&&world.agents.length>0&&world.year<9999;
  const mortalId=world.descent?.agentId;
  const current=mortalId===undefined?undefined:
    world.agents.find(a=>a.id===mortalId);
  const yards=!arrivalName&&!atWorldTree&&!craterName&&!current&&world.settlements.length?adventureMapFor(world).shipyards:undefined;
  const ports=yards?world.settlements.filter(town=>yards.has(town.id)):[];
  const lineage=current?world.lineage.find(r=>r.id===current.id):undefined;
  const displayName=current?(lineage?personName(world,lineage):'Your mortal'):name||'Unnamed';
  const preview:PixelPerson=current??{
    id:world.nextAgentId,species,age:SPECIES_INFO[species].maturity+2,
    genes:{vigor:1,curiosity:1,fertility:1,social:1},
    ancestry:{human:species==='human'?1:0,elf:species==='elf'?1:0,
      dwarf:species==='dwarf'?1:0,demon:species==='demon'?1:0},
    appearance:look,
  };
  const colors=mortalColorOptions(species);
  const update=<K extends keyof MortalAppearance>(key:K,value:MortalAppearance[K])=>
    setLook(old=>({...old,[key]:value}));
  const submit=(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    if(!starting)onCreate({name,species,background,appearance:look},canGrow&&settledStart,
      yards?.has(shipyard??-1)?shipyard:undefined);
  };

  return <main className="evo-descent-page">
    <header className="evo-descent-heading">
      <h1>{current?'Your adventure':'Begin an adventure'}</h1>
      <p>{craterName?'Start at the crater rim of '+craterName+'.':atWorldTree?'Start on the root trail near the World Tree.':arrivalName?'Start on the banks of the '+arrivalName+'.':
        'Explore settlements, follow trails, and sail from coastal shipyards.'}</p>
    </header>
    <div className="evo-descent-layout">
      <section className="evo-descent-portrait" aria-label="Mortal appearance preview">
        <div className="evo-descent-art"><PixelPortrait person={preview}
          name={displayName}/></div>
        <h2>{displayName}</h2>
        <p>{SPECIES_INFO[preview.species].name}</p>
      </section>
      {current?<section className="evo-descent-form">
        <h2>Continue as {displayName}</h2>
        <p>Year {world.year}</p>
        <button className="evo-descent-primary" onClick={onResume}>
          ◈ {world.descent?.mode==='mortal'?'VIEW YOUR MORTAL':'RESUME DESCENT'}</button>
        <button className="evo-descent-secondary" onClick={onReturn}>
          ← RETURN TO GOD MODE</button>
      </section>:<form className="evo-descent-form" onSubmit={submit} aria-busy={starting}>
        <label className="evo-descent-label" htmlFor="mortal-name">Mortal name</label>
        <input id="mortal-name" value={name} onChange={event=>setName(event.target.value)}
          maxLength={64} autoComplete="off" required/>

        <span className="evo-descent-label">Choose your people</span>
        <div className="evo-descent-species" role="group" aria-label="Mortal species">
          {SPECIES.map(s=><button type="button" key={s}
            className={species===s?'is-picked':''} aria-pressed={species===s}
            onClick={()=>setSpecies(s)}>
            <b style={{color:SPECIES_INFO[s].color}}>◆</b> {SPECIES_INFO[s].name}
          </button>)}
        </div>

        {ports.length>0&&<>
          <label className="evo-descent-label" htmlFor="mortal-arrival">Starting location</label>
          <select id="mortal-arrival" value={shipyard??''}
            onChange={event=>setShipyard(event.target.value?Number(event.target.value):undefined)}>
            <option value="">Suggested settlement</option>
            {ports.map(town=><option key={town.id} value={town.id}>{town.name} shipyard</option>)}
          </select>
        </>}

        <details className="evo-descent-customize">
          <summary>Customize appearance and background</summary>
          <span className="evo-descent-label">Background</span>
        <div className="evo-descent-backgrounds" role="group"
          aria-label="Mortal background">
          {DESCENT_BACKGROUNDS.map(choice=><button type="button" key={choice.id}
            className={background===choice.id?'is-picked':''}
            aria-pressed={background===choice.id}
            onClick={()=>setBackground(choice.id)}>
            <strong>{choice.name}</strong><small>{choice.description}</small>
          </button>)}
        </div>

        <span className="evo-descent-label">Skin tone</span>
        <div className="evo-descent-swatches" role="group" aria-label="Skin tone">
          {colors.skin.map((color,index)=><button type="button" key={index}
            aria-label={'Skin tone '+(index+1)} aria-pressed={look.skin===index}
            className={look.skin===index?'is-picked':''}
            style={{'--swatch-color':color} as CSSProperties}
            onClick={()=>update('skin',index)}/>)}
        </div>

        <span className="evo-descent-label">Hair color</span>
        <div className="evo-descent-swatches" role="group" aria-label="Hair color">
          {colors.hair.map((color,index)=><button type="button" key={index}
            aria-label={'Hair color '+(index+1)} aria-pressed={look.hair===index}
            className={look.hair===index?'is-picked':''}
            style={{'--swatch-color':color} as CSSProperties}
            onClick={()=>update('hair',index)}/>)}
        </div>

        <span className="evo-descent-label">Hair style</span>
        <div className="evo-descent-options" role="group" aria-label="Hair style">
          {HAIR_STYLES.map((style,index)=><button type="button" key={style}
            aria-pressed={look.hairStyle===index}
            className={look.hairStyle===index?'is-picked':''}
            onClick={()=>update('hairStyle',index)}>{style}</button>)}
        </div>

        <span className="evo-descent-label">Traveling clothes</span>
        <div className="evo-descent-options" role="group" aria-label="Outfit">
          {OUTFITS.map(outfit=><button type="button" key={outfit.id}
            aria-pressed={look.outfit===outfit.id}
            className={look.outfit===outfit.id?'is-picked':''}
            onClick={()=>update('outfit',outfit.id)}>{outfit.label}</button>)}
        </div>
        </details>
        {canGrow&&<label className="evo-descent-arrival">
          <input type="checkbox" checked={settledStart}
            onChange={event=>setSettledStart(event.target.checked)}/>
          <span>Let settlements grow before I arrive
            <small>Advance the world by six simulated years.</small></span>
        </label>}
        {error&&<p className="evo-descent-error" role="alert">{error}</p>}
        <div className="evo-descent-actions">
          <button className="evo-descent-primary" type="submit" disabled={starting}>
            {starting?'Growing the world…':'Begin mortal life'}</button>
          <button className="evo-descent-secondary" type="button"
            onClick={onReturn}>← BACK TO WORLD</button>
        </div>
      </form>}
    </div>
  </main>;
}
