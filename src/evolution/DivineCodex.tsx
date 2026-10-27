import {useMemo,useState} from 'react';
import {SPECIES_INFO,type SettlementLegacy,type World} from './engine';
import {codexOf,knownSettlements,personName,cleanIdentityName} from './identity';
import {PopulationDiagnostics} from './PopulationDiagnostics';

type Props={world:World;onOpenPerson:(id:number)=>void;
  onFavoritePerson:(id:number)=>void;onFavoriteSettlement:(id:number)=>void;
  onRenameSettlement:(id:number,name:string)=>void;
  onFindSettlement:(id:number)=>void};
type Page='overview'|'settlements'|'chronicle';
export function DivineCodex({world,onOpenPerson,onFavoritePerson,
  onFavoriteSettlement,onRenameSettlement,onFindSettlement}:Props){
  const [page,setPage]=useState<Page>('overview');
  const [query,setQuery]=useState('');
  const [settlementId,setSettlementId]=useState<number|null>(null);
  const [newName,setNewName]=useState('');
  const [notice,setNotice]=useState('');
  const codex=codexOf(world);
  const places=useMemo(()=>knownSettlements(world).sort((a,b)=>b.founded-a.founded),
    [world]);
  const chosen=places.find(p=>p.id===settlementId)??null;
  const legacy=world.lineage;
  const featured=codex.favoritePeople.map(id=>legacy.find(r=>r.id===id))
    .filter((r):r is NonNullable<typeof r>=>!!r);
  const houses=useMemo(()=>{
    const tally=new Map<string,{name:string;members:number;living:number}>();
    const alive=new Set(world.agents.map(a=>a.id));
    for(const r of world.lineage){
      const house=r.house??personName(world,r).split(' ').at(-1)??'Unknown';
      const key=r.species+':'+house;
      const existing=tally.get(key)??{name:house,members:0,living:0};
      existing.members++;if(alive.has(r.id))existing.living++;
      tally.set(key,existing);
    }
    return [...tally.values()].sort((a,b)=>b.members-a.members).slice(0,12);
  },[world]);
  const shown=places.filter(s=>{
    const search=query.trim().toLocaleLowerCase();
    return !search||s.name.toLocaleLowerCase().includes(search)||
      SPECIES_INFO[s.species].name.toLocaleLowerCase().includes(search)||
      String(s.id).includes(search);
  });
  const select=(s:SettlementLegacy)=>{
    setSettlementId(s.id);setNewName(s.name);setNotice('');
  };
  const rename=()=>{
    if(!chosen||chosen.collapsed!==undefined)return;
    const validated=cleanIdentityName(newName);
    if(!validated){setNotice('Use a 2–64 character name (letters, spaces, numbers, hyphens).');return;}
    onRenameSettlement(chosen.id,validated);setNotice('Settlement renamed.');
  };
  return <main className="evo-codex-page">
    <header className="evo-section-header">
      <div><span className="evo-overline">WORLDFORGE / DIVINE RECORDS</span>
        <h2>The Divine Codex</h2>
        <p>A record of the living, the remembered, and the places they built.</p>
      </div>
      <div className="evo-family-summary">
        <span><b>{world.year}</b> world year</span>
        <span><b>{codex.favoritePeople.length}</b> followed people</span>
        <span><b>{places.length}</b> recorded settlements</span>
      </div>
    </header>
    <nav aria-label="Codex sections" className="evo-codex-nav">
      {(['overview','settlements','chronicle'] as Page[]).map(key=>
        <button key={key} className={page===key?'active':''}
          onClick={()=>setPage(key)} aria-pressed={page===key}>
          {key==='overview'?'◈ OVERVIEW':key==='settlements'?'⌂ SETTLEMENTS':'≋ CHRONICLE'}
        </button>)}
    </nav>
    {page==='overview'&&<div className="evo-codex-columns">
      <section className="evo-section-card">
        <div className="evo-card-heading"><strong>★ PEOPLE YOU FOLLOW</strong>
          <span>{featured.length} bookmarked</span></div>
        <div className="evo-codex-list">
          {featured.map(r=><div key={r.id} className="evo-codex-row">
            <span className="evo-dir-species"
              style={{background:SPECIES_INFO[r.species].color}}/>
            <button onClick={()=>onOpenPerson(r.id)}>
              <strong>{personName(world,r)}</strong>
              <small>{r.died===undefined?'In the living archive':'Remembered'} ·
                Gen {r.generation}</small>
            </button>
            <button className="evo-dir-star is-on" onClick={()=>onFavoritePerson(r.id)}
              title="Unfollow person" aria-label={'Unfollow '+personName(world,r)}>★</button>
          </div>)}
          {!featured.length&&<p className="evo-family-help">No favorites yet.
            Open People and star individuals to follow their stories, even after death.</p>}
        </div>
      </section>
      <section className="evo-section-card">
        <div className="evo-card-heading"><strong>⌂ PLACES OF THE WORLD</strong>
          <button className="evo-codex-text-button" onClick={()=>setPage('settlements')}>
            BROWSE ALL ↗</button></div>
        <div className="evo-codex-list">
          {places.filter(s=>codex.favoriteSettlements.includes(s.id))
            .concat(places.filter(s=>!codex.favoriteSettlements.includes(s.id)))
            .slice(0,9).map(s=><div className="evo-codex-row" key={s.id}>
              <span className="evo-dir-species"
                style={{background:SPECIES_INFO[s.species].color}}/>
              <button onClick={()=>{select(s);setPage('settlements');}}>
                <strong>{s.name}</strong>
                <small>{s.collapsed!==undefined?
                  'Ruins · Abandoned Y'+s.collapsed:'Active settlement'} ·
                  Founded Y{s.founded}</small>
              </button>
              <button className={'evo-dir-star'+
                (codex.favoriteSettlements.includes(s.id)?' is-on':'')}
                aria-label={'Follow settlement '+s.name}
                onClick={()=>onFavoriteSettlement(s.id)}>
                {codex.favoriteSettlements.includes(s.id)?'★':'☆'}
              </button>
            </div>)}
          {!places.length&&<p className="evo-family-help">
            Settlements appear when groups establish villages in suitable terrain.</p>}
        </div>
      </section>
      <section className="evo-section-card">
        <div className="evo-card-heading"><strong>◈ FAMILY HOUSES</strong>
          <span>By retained descendants</span></div>
        <div className="evo-codex-list">
          {houses.map((h,i)=><div className="evo-codex-house" key={i}>
            <strong>House {h.name}</strong>
            <span>{h.members} known · {h.living} living</span>
          </div>)}
        </div>
      </section>
      <section className="evo-section-card">
        <div className="evo-card-heading"><strong>≋ RECENT WORLD EVENTS</strong>
          <button className="evo-codex-text-button" onClick={()=>setPage('chronicle')}>
            VIEW ALL ↗</button></div>
        <div className="evo-codex-list">
          {world.events.slice(-8).reverse().map(e=><div key={e.id}
            className="evo-codex-event">
            <span>YEAR {e.year} · {e.type.toUpperCase()}</span><p>{e.message}</p>
          </div>)}
        </div>
      </section>
    </div>}
    {page==='settlements'&&<div className="evo-codex-place-layout">
      <section className="evo-section-card">
        <div className="evo-card-heading"><strong>SETTLEMENT REGISTER</strong>
          <span>{places.length} named places</span></div>
        <div className="evo-directory-filters">
          <label htmlFor="evo-codex-search">SEARCH PLACES</label>
          <input id="evo-codex-search" value={query}
            onChange={e=>setQuery(e.target.value)} placeholder="Search town, species or ID"/>
        </div>
        <div className="evo-directory-scroll">
          {shown.slice(0,150).map(s=><div key={s.id} className="evo-codex-row">
            <span className="evo-dir-species"
              style={{background:SPECIES_INFO[s.species].color}}/>
            <button onClick={()=>select(s)}>
              <strong>{s.name}</strong><small>{SPECIES_INFO[s.species].name} ·
                Y{s.founded} · {s.collapsed!==undefined?'Abandoned':'Active'}</small>
            </button>
            <button className={'evo-dir-star'+
              (codex.favoriteSettlements.includes(s.id)?' is-on':'')}
              aria-label={'Favorite '+s.name} onClick={()=>onFavoriteSettlement(s.id)}>
              {codex.favoriteSettlements.includes(s.id)?'★':'☆'}
            </button>
          </div>)}
          {!shown.length&&<p className="evo-family-help">No settlement matches.</p>}
        </div>
      </section>
      <section className="evo-section-card">
        <div className="evo-card-heading"><strong>SELECTED SETTLEMENT</strong></div>
        {chosen?<div className="evo-codex-place-detail">
          <span className="evo-overline">SETTLEMENT #{chosen.id} ·
            {SPECIES_INFO[chosen.species].name.toUpperCase()}</span>
          <h3>{chosen.name}</h3>
          <p>Founded in year {chosen.founded} · X{chosen.x} / Y{chosen.y}</p>
          <p>{chosen.collapsed!==undefined?'Abandoned in year '+chosen.collapsed+
            '. Its last known location remains in the Codex.':
            'Currently active, with inhabitants still shaping its future.'}</p>
          {chosen.founderId!==undefined&&<button className="evo-quiet-button"
            onClick={()=>onOpenPerson(chosen.founderId!)}>◉ VIEW THE FOUNDER ↗</button>}
          <button className="evo-quiet-button" onClick={()=>onFindSettlement(chosen.id)}>
            ⌖ FIND LOCATION ON MAP
          </button>
          <button className="evo-quiet-button"
            onClick={()=>onFavoriteSettlement(chosen.id)}>
            {codex.favoriteSettlements.includes(chosen.id)?'★ UNFOLLOW':'☆ FOLLOW PLACE'}
          </button>
          {chosen.collapsed===undefined&&<>
            <label htmlFor="evo-place-rename">RENAME THIS SETTLEMENT</label>
            <div className="evo-directory-rename-inline">
              <input id="evo-place-rename" value={newName} maxLength={64}
                onChange={e=>{setNewName(e.target.value);setNotice('');}}
                onKeyDown={e=>{if(e.key==='Enter')rename();}}/>
              <button onClick={rename}>SAVE</button>
            </div>
            {notice&&<p role="status">{notice}</p>}
          </>}
        </div>:<div className="evo-empty-panel">
          <strong>CHOOSE A SETTLEMENT</strong>
          <p>See its founding date, location and historical status.</p>
        </div>}
      </section>
    </div>}
    {page==='chronicle'&&<>
      <section className="evo-section-card">
        <div className="evo-card-heading"><strong>WORLD CHRONICLE</strong>
          <span>{world.events.length} recent recorded events</span></div>
        <div className="evo-codex-chronicle">
          {world.events.slice().reverse().map(e=><article key={e.id}
            className="evo-codex-event">
            <span>YEAR {e.year} · {e.type.toUpperCase()}</span><p>{e.message}</p>
          </article>)}
        </div>
        <p className="evo-diagnostic-note">The world chronicle retains the latest 90
          major events. Individual biographies and settlement archives keep
          their own long-term records.</p>
      </section>
      <PopulationDiagnostics world={world}/>
    </>}
  </main>;
}
