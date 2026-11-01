import {useState} from 'react';
import type {CSSProperties,FormEvent} from 'react';
import {SPECIES,SPECIES_INFO,type MortalAppearance,type MortalOutfit,
  type Species,type World} from './engine';
import {PixelPortrait} from './PixelPortrait';
import {mortalColorOptions,type PixelPerson} from './pixelArt';
import {DESCENT_BACKGROUNDS,type DescentBackground,
  type MortalCreation} from './divineDescent';
import {personName} from './identity';

const HAIR_STYLES=['Classic','Cropped','Long'] as const;
const OUTFITS:readonly {id:MortalOutfit;label:string}[]=[
  {id:'wanderer',label:'Traveler'},
  {id:'forager',label:'Woodland'},
  {id:'artisan',label:'Craft'},
  {id:'scholar',label:'Scholar'},
];
const DEFAULT_LOOK:MortalAppearance={skin:0,hair:0,hairStyle:0,outfit:'wanderer'};

export function DivineDescentCreator({world,onCreate,onResume,onReturn,error}:{
  world:World;onCreate:(options:MortalCreation)=>void;
  onResume:()=>void;onReturn:()=>void;error?:string;
}){
  const [name,setName]=useState('');
  const [species,setSpecies]=useState<Species>('human');
  const [background,setBackground]=useState<DescentBackground>('scout');
  const [look,setLook]=useState<MortalAppearance>(DEFAULT_LOOK);
  const mortalId=world.descent?.agentId;
  const current=mortalId===undefined?undefined:
    world.agents.find(a=>a.id===mortalId);
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
    event.preventDefault();onCreate({name,species,background,appearance:look});
  };

  return <main className="evo-descent-page">
    <header className="evo-descent-heading">
      <span className="evo-overline">v2.5.1 · DIVINE DESCENT</span>
      <h1>A world to <em>live in.</em></h1>
      <p>Leave the heavens and begin a mortal story in the world you shaped.
        Your character joins the same living simulation as everyone else.</p>
    </header>
    <div className="evo-descent-layout">
      <section className="evo-descent-portrait" aria-label="Mortal appearance preview">
        <div className="evo-descent-art"><PixelPortrait person={preview}
          name={displayName}/></div>
        <h2>{displayName}</h2>
        <p>{SPECIES_INFO[preview.species].name}</p>
        <span className="evo-descent-eyebrow">A LIFE, NOT A DIVINE PUPPET</span>
        <p className="evo-descent-detail">You will have genuine abilities,
          needs, and a place in the world's history. Legendary talents are
          earned or rolled with the same rarity as everyone else's.</p>
        <p className="evo-descent-detail">Walk with WASD, speak with nearby
          inhabitants using E, and press P to pause the living world's clock.
          Right-drag rotates the 2.5D camera around your journey.</p>
      </section>
      {current?<section className="evo-descent-form">
        <span className="evo-descent-eyebrow">YOUR LIVING MORTAL</span>
        <h2>Your journey has begun.</h2>
        <p>Your character already exists in year {world.year} and is part of
          this world's families, professions, and history.</p>
        <button className="evo-descent-primary" onClick={onResume}>
          ◈ {world.descent?.mode==='mortal'?'VIEW YOUR MORTAL':'RESUME DESCENT'}</button>
        <button className="evo-descent-secondary" onClick={onReturn}>
          ← RETURN TO GOD MODE</button>
      </section>:<form className="evo-descent-form" onSubmit={submit}>
        <label className="evo-descent-label" htmlFor="mortal-name">Mortal name</label>
        <input id="mortal-name" value={name} onChange={event=>setName(event.target.value)}
          maxLength={64} placeholder="What shall they call you?" required/>

        <span className="evo-descent-label">Choose your people</span>
        <div className="evo-descent-species" role="group" aria-label="Mortal species">
          {SPECIES.map(s=><button type="button" key={s}
            className={species===s?'is-picked':''} aria-pressed={species===s}
            onClick={()=>setSpecies(s)}>
            <b style={{color:SPECIES_INFO[s].color}}>◆</b> {SPECIES_INFO[s].name}
          </button>)}
        </div>

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
        {error&&<p className="evo-descent-error" role="alert">{error}</p>}
        <div className="evo-descent-actions">
          <button className="evo-descent-primary" type="submit">✦ BEGIN MORTAL LIFE</button>
          <button className="evo-descent-secondary" type="button"
            onClick={onReturn}>← BACK TO WORLD</button>
        </div>
      </form>}
    </div>
  </main>;
}
