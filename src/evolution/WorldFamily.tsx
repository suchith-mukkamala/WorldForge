import {useEffect,useMemo,useState} from 'react';
import {
  SPECIES,SPECIES_INFO,type LineageRecord,type World,
} from './engine';
import {
  ancestryLabel,hybridFraction,traitProfile,
} from './family';
import {personName,isPersonFavorite,cleanIdentityName} from './identity';
import {PixelPortrait} from './PixelPortrait';
import {RankProfile} from './RankProfile';

type Props={world:World;focusId:number|null;onChoose:(id:number)=>void;
  onShowOnMap:(id:number)=>void;onFavorite:(id:number)=>void;
  onRename:(id:number,name:string)=>void};
const percent=(n:number)=>Math.round(n*100)+'%';
function LifeCard({world,record,active,onSelect,compact=false}:{
  world:World;record:LineageRecord|undefined;active?:boolean;compact?:boolean;
  onSelect:(id:number)=>void;
}){
  if(!record)return <div className="evo-family-person missing">
    <span>?</span><small>Unknown / not retained</small>
  </div>;
  return <button type="button"
    className={'evo-family-person'+(active?' selected':'')+(compact?' compact':'')}
    onClick={()=>onSelect(record.id)}>
    <span className="evo-family-avatar"
      style={{background:SPECIES_INFO[record.species].color}}/>
    <span className="evo-family-person-text">
      <strong>{personName(world,record)}</strong>
      <small>#{record.id} · Gen {record.generation} · Born Y{record.born}
        {record.died!==undefined?' · Died Y'+record.died:' · Alive'}</small>
      {record.awakening&&<small className="evo-family-awakened">
        ✦ Awakened Y{record.awakening.year} · age {record.awakening.age}</small>}
    </span>
  </button>;
}
export function WorldFamily({world,focusId,onChoose,onShowOnMap,
  onFavorite,onRename}:Props){
  const [query,setQuery]=useState('');
  const [showAllChildren,setShowAllChildren]=useState(false);
  const [draft,setDraft]=useState('');
  const [editing,setEditing]=useState(false);
  const [notice,setNotice]=useState('');
  const map=useMemo(()=>new Map(world.lineage.map(r=>[r.id,r])),[world.lineage]);
  const living=useMemo(()=>new Map(world.agents.map(a=>[a.id,a])),[world.agents]);
  const recommended=world.lineage.find(r=>r.children.length&&
    r.died===undefined)?.id??world.agents[0]?.id??null;
  const current=map.get(focusId??-1)??map.get(recommended??-1);
  useEffect(()=>{if(current){
    setDraft(personName(world,current));setEditing(false);setNotice('');
  }},[current?.id,current?.name,current?.house,world.settings.seed]);
  const partners=current?world.bonds.filter(b=>b.a===current.id||b.b===current.id)
    .slice().sort((a,b)=>b.since-a.since):[];
  const ancestors=(id:number)=>map.get(id);
  const matches=world.lineage.filter(r=>query.trim()&&(
    String(r.id).includes(query.trim())||
    personName(world,r).toLocaleLowerCase().includes(query.toLocaleLowerCase())||
    ancestryLabel(r.ancestry).toLocaleLowerCase().includes(query.toLocaleLowerCase())))
    .slice(-25).reverse();
  const children=current?.children.map(ancestors).filter(
    (r):r is LineageRecord=>!!r)??[];
  const siblings=current?.parents?.flatMap(id=>map.get(id)?.children??[])
    .filter((id,i,ids)=>id!==current.id&&ids.indexOf(id)===i)
    .map(ancestors).filter((r):r is LineageRecord=>!!r)??[];
  const isLiving=current?living.has(current.id):false;
  const person=isLiving&&current?living.get(current.id):undefined;
  const traits=current?traitProfile(current.ancestry):null;
  const hybridCount=world.agents.filter(a=>hybridFraction(a.ancestry)>.01).length;
  const saveName=()=>{
    if(!current)return;
    const name=cleanIdentityName(draft);
    if(!name){setNotice('Please enter a valid 2–64 character fantasy name.');return;}
    onRename(current.id,name);
    setEditing(false);setNotice('');
  };
  return <main className="evo-family-page">
    <header className="evo-section-header">
      <div><span className="evo-overline">WORLDFORGE / RELATIONSHIPS & HERITAGE</span>
        <h2>Family Archives</h2>
        <p>Explore bonds, ancestry, parents, children and descendants across generations.</p>
      </div>
      <div className="evo-family-summary">
        <span><b>{world.bonds.filter(b=>b.stage==='partner').length}</b> partnerships</span>
        <span><b>{hybridCount}</b> living hybrids</span>
        <span><b>{world.lineage.length}</b> lineage records</span>
      </div>
    </header>
    <div className="evo-family-layout">
      <section className="evo-section-card evo-family-chooser">
        <div className="evo-card-heading"><strong>FIND AN INDIVIDUAL</strong><span>Living + recorded dead</span></div>
        <div className="evo-family-search">
          <label htmlFor="evo-family-search">SEARCH NAME, FAMILY, ID OR ANCESTRY</label>
          <input id="evo-family-search" type="search" placeholder="Try 42, Elf, Human…"
            value={query} onChange={event=>setQuery(event.target.value)}/>
        </div>
        {query.trim()?<div className="evo-family-results">
          {matches.length?matches.map(r=><LifeCard world={world} key={r.id} record={r}
            onSelect={id=>{onChoose(id);setQuery('');}} compact/>):
            <p className="evo-family-help">No retained ancestry records match your search.</p>}
        </div>:<div className="evo-family-results">
          <p className="evo-family-help">Choose someone on the World map and press
            VIEW FAMILY, or choose a name below.</p>
          {world.lineage.filter(r=>r.children.length>0||r.generation>0)
            .slice(-12).reverse().map(r=><LifeCard world={world} key={r.id} record={r}
              active={current?.id===r.id} compact onSelect={onChoose}/>)}
          {!world.lineage.some(r=>r.children.length||r.generation>0)&&
            world.lineage.slice(0,8).map(r=><LifeCard world={world} key={r.id}
              record={r} active={current?.id===r.id} compact onSelect={onChoose}/>)}
        </div>}
        <div className="evo-family-note">Archives retain up to 14,000 birth records.
          Very old ancestors may eventually be pruned for browser performance.
          Original v0.1 imports cannot recover people who died before migration.</div>
      </section>
      <div className="evo-family-detail">
        {!current?<section className="evo-section-card evo-empty-panel">
          <strong>NO ONE TO DISPLAY YET</strong>
          <p>Create a world with founding populations, or place individuals
            on the map to begin their lineage.</p>
        </section>:<>
          <section className="evo-section-card evo-family-highlight">
            <div className="evo-card-heading"><strong>SELECTED LINEAGE</strong>
              <span>{isLiving?'● ALIVE':'◌ DECEASED / ARCHIVED'}</span></div>
            <div className="evo-family-headline">
              <PixelPortrait person={person??{...current,
                age:current.died!==undefined?current.died-current.born:undefined}}
                name={personName(world,current)} compact/>
              <div>
                <span className="evo-overline">GENERATION {current.generation} / ID #{current.id}</span>
                <h3>{personName(world,current)}</h3>
                <p>{ancestryLabel(current.ancestry)} · Born Y{current.born}
                  {current.died!==undefined?' · Died Y'+current.died:''}
                  {person?' · Age '+person.age+' years':''}</p>
              </div>
              <div className="evo-identity-buttons">
                <button onClick={()=>onFavorite(current.id)}
                  aria-pressed={isPersonFavorite(world,current.id)}>
                  {isPersonFavorite(world,current.id)?'★ FOLLOWING':'☆ FAVORITE'}
                </button>
                <button onClick={()=>setEditing(v=>!v)}>✎ RENAME</button>
                {isLiving&&<button className="evo-family-map-link"
                  onClick={()=>onShowOnMap(current.id)}>⌖ FIND ON MAP ↗</button>}
              </div>
            </div>
            {editing&&<div className="evo-family-rename-inline">
              <label htmlFor="evo-family-rename">NEW NAME</label>
              <input id="evo-family-rename" maxLength={64} value={draft}
                onChange={e=>setDraft(e.target.value)}
                onKeyDown={e=>{if(e.key==='Enter')saveName();}}/>
              <button onClick={saveName}>SAVE</button>
              {notice&&<span role="status">{notice}</span>}
            </div>}
            <div className="evo-family-traits">
              <div><small>EXPECTED LIFESPAN</small><strong>{Math.round(traits?.lifespan??0)}</strong></div>
              <div><small>MATURITY AGE</small><strong>{Math.round(traits?.maturity??0)}</strong></div>
              <div><small>VIGOR GENE</small><strong>{current.genes.vigor.toFixed(2)}×</strong></div>
              <div><small>SOCIAL GENE</small><strong>{current.genes.social.toFixed(2)}×</strong></div>
            </div>
            <RankProfile seed={world.settings.seed} person={person??current}/>
            <div className="evo-ancestry-heading"><strong>ANCESTRY</strong>
              <span>{hybridFraction(current.ancestry)>.01?'✧ MIXED HERITAGE':'PURE-LINE FOUNDER'}</span></div>
            <div className="evo-ancestry-bar" role="img"
              aria-label={'Ancestry: '+SPECIES.map(s=>
                SPECIES_INFO[s].name+' '+percent(current.ancestry[s])).join(', ')}>
              {SPECIES.map(s=><div key={s}
                style={{width:percent(current.ancestry[s]),
                  background:SPECIES_INFO[s].color}}/>)}
            </div>
            <div className="evo-ancestry-legend">
              {SPECIES.filter(s=>current.ancestry[s]>.00001).map(s=><span key={s}>
                <i style={{background:SPECIES_INFO[s].color}}/>
                {SPECIES_INFO[s].name} <b>{percent(current.ancestry[s])}</b>
              </span>)}
            </div>
          </section>
          <section className="evo-section-card evo-family-life">
            <div className="evo-card-heading"><strong>◈ PERSONAL HISTORY</strong>
              <span>{current.moments?.length??0} recorded moments</span></div>
            <div className="evo-life-timeline">
              {(current.moments??[]).slice().reverse().map((m,i)=>
                <div className="evo-life-entry" key={i}>
                  <span>Y{m.year}</span>
                  <div><b>{m.kind.toUpperCase()}</b><p>{m.text}</p>
                    {m.relatedIds?.filter(id=>map.has(id)).map(id=>
                      <button key={id} onClick={()=>onChoose(id)}>
                        ↗ {personName(world,map.get(id)!)}
                      </button>)}
                  </div>
                </div>)}
              {!current.moments?.length&&<p className="evo-family-help">
                This person was saved before the personal-history system existed.
                Their next milestones will be recorded here.</p>}
            </div>
          </section>
          <section className="evo-section-card evo-family-tree-card">
            <div className="evo-card-heading"><strong>ANCESTORS · 2 GENERATIONS</strong>
              <span>Click a relative to explore</span></div>
            <div className="evo-family-tree">
              <div className="evo-family-tree-level grandparents">
                {[0,1,2,3].map(i=>{
                  const parent=current.parents?.[Math.floor(i/2)];
                  const grand=parent?map.get(parent)?.parents?.[i%2]:undefined;
                  return <LifeCard world={world} key={i} record={grand?ancestors(grand):undefined}
                    onSelect={onChoose} compact/>;
                })}
              </div>
              <span className="evo-family-tree-line" aria-hidden="true">↓</span>
              <div className="evo-family-tree-level parents">
                {[0,1].map(i=><LifeCard world={world} key={i}
                  record={current.parents?ancestors(current.parents[i]):undefined}
                  onSelect={onChoose}/>)}
              </div>
              <span className="evo-family-tree-line" aria-hidden="true">↓</span>
              <div className="evo-family-tree-level center">
                <LifeCard world={world} record={current} active onSelect={onChoose}/>
              </div>
              {!!children.length&&<>
                <span className="evo-family-tree-line" aria-hidden="true">↓</span>
                <div className="evo-family-tree-level children">
                  {(showAllChildren?children:children.slice(0,12)).map(r=>
                    <LifeCard world={world} record={r} onSelect={onChoose} key={r.id} compact/>)}
                </div>
                {children.length>12&&<button className="evo-family-more"
                  onClick={()=>setShowAllChildren(v=>!v)}>
                  {showAllChildren?'SHOW FEWER':'SHOW ALL '+children.length+' CHILDREN'}
                </button>}
              </>}
            </div>
          </section>
          <div className="evo-family-secondary">
            <section className="evo-section-card">
              <div className="evo-card-heading"><strong>♥ PARTNERS & BONDS</strong></div>
              {partners.length?partners.map(b=><div key={b.id} className="evo-family-bond">
                <span>{b.stage==='partner'?'♥':b.stage==='courting'?'♡':'◌'}</span>
                <div><LifeCard world={world} record={ancestors(b.a===current.id?b.b:b.a)}
                  onSelect={onChoose} compact/>
                  <small>{b.stage.toUpperCase()} · Since Y{b.since} ·
                    {b.children.length} children ·
                    Affinity {Math.round(b.strength*100)}%</small></div>
              </div>):<p className="evo-family-help">No recorded bonds yet.
                Mature adults may gradually form bonds after repeated encounters.</p>}
            </section>
            <section className="evo-section-card">
              <div className="evo-card-heading"><strong>◈ SIBLINGS</strong>
                <span>{siblings.length} recorded</span></div>
              {siblings.length?siblings.slice(0,16).map(r=>
                <LifeCard world={world} key={r.id} record={r} onSelect={onChoose} compact/>):
                <p className="evo-family-help">No recorded siblings for this individual.</p>}
            </section>
          </div>
        </>}
      </div>
    </div>
  </main>;
}
