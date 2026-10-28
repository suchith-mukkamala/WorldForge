import {lazy,Suspense,useEffect,useMemo,useState} from 'react';
import {SPECIES,SPECIES_INFO,type LineageRecord,type Species,type World} from './engine';
import {ancestryLabel,traitProfile} from './family';
import {TOPIC_INFO} from './knowledge';
import {faithOf} from './culture';
import {GOAL_LABELS} from './mind';
import {JOB_LABELS} from './economy';
import {guildOf} from './institutions';
import {PixelPortrait} from './PixelPortrait';
import {CAREER_LABELS,SKILLS,VALUES,lifeStage,guidingBelief} from './development';
import {cleanIdentityName,isPersonFavorite,personName} from './identity';
import {activeEffects} from './divine';
import {ACTIVITY_LABELS} from './dailyLife';
const LifeViewer=lazy(()=>import('./LifeViewer').then(m=>({default:m.LifeViewer})));

type Props={world:World;selectedId:number|null;onOpen:(id:number)=>void;
  onFavorite:(id:number)=>void;onRename:(id:number,name:string)=>void;
  onFindOnMap:(id:number)=>void;onInvoke?:(id:number)=>void};
type Filter='all'|'living'|'deceased'|'favorites';

function LifeChip({world,record,focused,onPick,onFavorite}:{
  world:World;record:LineageRecord;focused:boolean;
  onPick:(id:number)=>void;onFavorite:(id:number)=>void;
}){
  const alive=record.died===undefined&&world.agents.some(a=>a.id===record.id);
  const favorite=isPersonFavorite(world,record.id);
  return <div className={'evo-directory-person'+(focused?' is-selected':'')}>
    <button type="button" className="evo-directory-person-open"
      onClick={()=>onPick(record.id)}>
      <span className="evo-dir-species" style={{
        background:SPECIES_INFO[record.species].color}}/>
      <span><strong>{personName(world,record)}</strong>
        <small>#{record.id} · Gen {record.generation} · {ancestryLabel(record.ancestry)}
          · {alive?'Age '+world.agents.find(a=>a.id===record.id)?.age:'Archive'}</small>
      </span>
    </button>
    <button type="button" className={'evo-dir-star'+(favorite?' is-on':'')}
      aria-label={(favorite?'Unfollow ':'Follow ')+personName(world,record)}
      aria-pressed={favorite} title={favorite?'Remove favorite':'Follow this individual'}
      onClick={()=>onFavorite(record.id)}>{favorite?'★':'☆'}</button>
  </div>;
}
export function PeopleDirectory({world,selectedId,onOpen,onFavorite,
  onRename,onFindOnMap,onInvoke}:Props){
  const [query,setQuery]=useState('');
  const [filter,setFilter]=useState<Filter>('all');
  const [species,setSpecies]=useState<'all'|Species>('all');
  const [activeId,setActiveId]=useState<number|null>(null);
  const [draft,setDraft]=useState('');
  const [editNotice,setEditNotice]=useState('');
  const living=useMemo(()=>new Map(world.agents.map(a=>[a.id,a])),[world.agents]);
  const recordMap=useMemo(()=>new Map(world.lineage.map(r=>[r.id,r])),[world.lineage]);
  const favoriteIds=world.codex?.favoritePeople??[];
  const focused=recordMap.get(activeId??selectedId??-1)??world.lineage.at(-1);
  useEffect(()=>{if(!focused)return;
    setDraft(personName(world,focused));setEditNotice('');
  },[focused?.id,focused?.name,focused?.house,world.settings.seed]);
  const results=useMemo(()=>{
    const needle=query.toLocaleLowerCase().trim();
    const favorites=new Set(favoriteIds);
    const list=world.lineage.filter(r=>{
      if(species!=='all'&&r.species!==species)return false;
      if(filter==='living'&&!living.has(r.id))return false;
      if(filter==='deceased'&&living.has(r.id))return false;
      if(filter==='favorites'&&!favorites.has(r.id))return false;
      if(needle&&!([
        personName(world,r),r.house??'',String(r.id),ancestryLabel(r.ancestry),
      ].some(value=>value.toLocaleLowerCase().includes(needle))))return false;
      return true;
    });
    return list.sort((a,b)=>Number(favorites.has(b.id))-Number(favorites.has(a.id))||
      b.id-a.id);
  },[world,query,filter,species,living,favoriteIds]);
  const alive=focused&&living.get(focused.id);
  const development=alive?.development;
  const guild=alive?guildOf(world,alive.id):undefined;
  const blessings=alive?activeEffects(alive,world.year):[];
  const divineRecords=(world.divine?.history??[]).filter(r=>r.targetId===focused?.id||
    focused?.divineOrigins?.includes(r.id)).slice(-12).reverse();
  const household=world.households?.find(h=>h.id===development?.householdId);
  const nameFor=(id:number)=>recordMap.has(id)?
    personName(world,recordMap.get(id)!):'Person #'+id;
  const saveRename=()=>{
    if(!focused)return;
    const name=cleanIdentityName(draft);
    if(!name){setEditNotice('Use 2–64 letters, numbers, spaces, apostrophes or hyphens.');return;}
    onRename(focused.id,name);setEditNotice('Name updated in the world archive.');
  };
  return <main className="evo-directory-page">
    <header className="evo-section-header">
      <div><span className="evo-overline">WORLDFORGE / THE DIVINE ROSTER</span>
        <h2>People of the World</h2>
        <p>Find an individual, grant them a name, follow their life, or revisit their legacy.</p>
      </div>
      <div className="evo-family-summary">
        <span><b>{world.agents.length}</b> living</span>
        <span><b>{world.lineage.length}</b> in archive</span>
        <span><b>{favoriteIds.length}</b> favorites</span>
      </div>
    </header>
    <div className="evo-directory-layout">
      <section className="evo-section-card evo-directory-list">
        <div className="evo-card-heading">
          <strong>THE PEOPLE DIRECTORY</strong><span>{results.length} matching</span>
        </div>
        <div className="evo-directory-filters">
          <label htmlFor="evo-people-search">SEARCH PEOPLE / FAMILY / ID</label>
          <input id="evo-people-search" type="search"
            placeholder="Search a name, lineage, species or ID"
            value={query} onChange={e=>setQuery(e.target.value)}/>
          <div className="evo-directory-filter-row">
            <label htmlFor="evo-people-status">STATUS
              <select id="evo-people-status" value={filter}
                onChange={e=>setFilter(e.target.value as Filter)}>
                <option value="all">Everyone</option>
                <option value="living">Living</option>
                <option value="deceased">Deceased</option>
                <option value="favorites">★ Favorites</option>
              </select>
            </label>
            <label htmlFor="evo-people-species">SPECIES
              <select id="evo-people-species" value={species}
                onChange={e=>setSpecies(e.target.value as typeof species)}>
                <option value="all">All peoples</option>
                {SPECIES.map(s=><option key={s} value={s}>{SPECIES_INFO[s].name}</option>)}
              </select>
            </label>
          </div>
        </div>
        <div className="evo-directory-scroll">
          {results.slice(0,120).map(r=><LifeChip key={r.id} record={r}
            world={world} focused={focused?.id===r.id}
            onPick={setActiveId} onFavorite={onFavorite}/>)}
          {!results.length&&<p className="evo-family-help">
            No people match the selected filters.</p>}
          {results.length>120&&<p className="evo-family-help">
            Displaying 120 of {results.length} records. Use search or filters to narrow the list.</p>}
        </div>
      </section>
      <div className="evo-directory-detail">
        {!focused?<section className="evo-section-card evo-empty-panel">
          <strong>NO PEOPLE RECORDED</strong>
          <p>Generate a populated world or add individuals to begin tracking lives.</p>
        </section>:<>
          <section className="evo-section-card">
            <div className="evo-card-heading"><strong>◈ INDIVIDUAL PROFILE</strong>
              <span>{alive?'● LIVING':'◌ ARCHIVED'}</span></div>
            <div className="evo-directory-identity">
              <PixelPortrait person={alive??{...focused,
                age:focused.died!==undefined?focused.died-focused.born:undefined}}
                name={personName(world,focused)}/>
              <div><span className="evo-overline">INDIVIDUAL #{focused.id}</span>
                <h3>{personName(world,focused)}</h3>
                <p>{ancestryLabel(focused.ancestry)} · Gen {focused.generation}</p>
                <p>Born Y{focused.born}{focused.died!==undefined?
                  ' · Died Y'+focused.died:alive?' · Age '+alive.age:''}</p>
                {alive&&<p>Life stage: {lifeStage(alive)}</p>}
              </div>
            </div>
            <div className="evo-directory-actions">
              <button onClick={()=>onFavorite(focused.id)}
                aria-pressed={isPersonFavorite(world,focused.id)}>
                {isPersonFavorite(world,focused.id)?'★ FOLLOWING':'☆ ADD TO FAVORITES'}
              </button>
              <button onClick={()=>onOpen(focused.id)}>♧ VIEW FAMILY TREE ↗</button>
              <button disabled={!alive} onClick={()=>onFindOnMap(focused.id)}>
                ⌖ {alive?'FIND ON MAP':'DECEASED'}
              </button>
              {onInvoke&&<button onClick={()=>onInvoke(focused.id)}>
                ⚡ {alive?'DIVINE POWERS':'RESURRECT / INTERVENE'}</button>}
            </div>
            <div className="evo-directory-rename">
              <label htmlFor="evo-rename-person">RENAME THIS INDIVIDUAL</label>
              <div><input id="evo-rename-person" value={draft} maxLength={64}
                onChange={e=>{setDraft(e.target.value);setEditNotice('');}}
                onKeyDown={e=>{if(e.key==='Enter')saveRename();}}/>
                <button onClick={saveRename}>SAVE NAME</button></div>
              {editNotice&&<p role="status">{editNotice}</p>}
              <small>The individual keeps this name in their descendants' family trees
                and in their historical record after death.</small>
            </div>
          </section>
          {alive&&<section className="evo-section-card evo-mind-profile">
            <div className="evo-card-heading"><strong>◈ ANNUAL INTENTION</strong>
              <span>BASE MIND ENGINE</span></div>
            <div className="evo-mind-profile-body">
              <span className="evo-overline">CURRENT GOAL</span>
              <h3>{alive.mind?GOAL_LABELS[alive.mind.goal]:'Awakening'}</h3>
              <p>{alive.mind?.reason??'This person will choose their first goal next year.'}</p>
              {alive.mind?.target&&<small>Travel target: X {alive.mind.target.x},
                Y {alive.mind.target.y}</small>}
              {alive.mind?.lastScarcity&&<small>
                Remembers poor forage near X {alive.mind.lastScarcity.x},
                Y {alive.mind.lastScarcity.y} (Y{alive.mind.lastScarcity.year})
              </small>}
              <small>Decisions follow needs, relationships, terrain and experience.
                These are simulated rules, not generated dialogue.</small>
            </div>
          </section>}
          {alive&&<Suspense fallback={<section className="evo-section-card">
            <p>Reading this person's intentions…</p></section>}>
            <LifeViewer world={world} person={alive}/>
          </Suspense>}
          {alive?.dailyLife&&<section className="evo-section-card evo-daily-profile">
            <div className="evo-card-heading"><strong>◈ A LIFE IN PROGRESS</strong>
              <span>WEEKLY ROUTINES · V1.6+</span></div>
            <div className="evo-daily-body">
              <span className="evo-overline">THIS WEEK · Y{alive.dailyLife.year}
                {' '}DAY {alive.dailyLife.day}</span>
              <h3>{ACTIVITY_LABELS[alive.dailyLife.activity]}</h3>
              <p>{alive.dailyLife.reason}</p>
              <div className="evo-daily-measures">
                {([['Morale',alive.dailyLife.morale],
                  ['Fatigue',alive.dailyLife.fatigue],
                  ['Need for company',alive.dailyLife.socialNeed]] as const)
                  .map(([label,value])=><label key={label}>
                    <span>{label}</span><progress max={100} value={value}/>
                    <b>{Math.round(value)}</b>
                  </label>)}
              </div>
              <h4>RECENT ENCOUNTERS</h4>
              {alive.dailyLife.encounters.length?
                [...alive.dailyLife.encounters].reverse().map((entry,i)=><p key={i}
                  className="evo-daily-encounter">
                  <small>Y{entry.year} · DAY {entry.day} · {entry.kind}</small>
                  {' '}{entry.detail} With{' '}
                  <button type="button" onClick={()=>setActiveId(entry.withId)}>
                    {nameFor(entry.withId)}</button>
                </p>):<small>They have not yet recorded a conversation. Neighbors
                  must actually meet and be willing to talk.</small>}
              <small>Weekly choices draw on energy, fatigue, relationships,
                vocation and personal values. Annual economic production remains
                separate; everyday encounters can change skills and trust.</small>
            </div>
          </section>}
          {(blessings.length>0||(alive?.whispers?.length??0)>0||
            (focused.divineOrigins?.length??0)>0||divineRecords.length>0)&&
            <section className="evo-section-card">
              <div className="evo-card-heading"><strong>✦ DIVINE INFLUENCE & LINEAGE</strong>
                <span>V0.6 · TRACEABLE POWERS</span></div>
              <div className="evo-divine-profile">
                {blessings.map(b=><span key={b.id}>
                  {b.strength<0?'CURSE':'BLESSING'} · {b.stat.replace('_',' ')}
                  {' '}{b.strength>=0?'+':''}{Math.round(b.strength*100)}%
                  {b.hereditary?' · HEREDITARY':''}
                  {b.inheritedFrom?' · from #'+b.inheritedFrom:''}
                  {b.expires!==undefined?' · until Y'+b.expires:''}
                  {' · source #'+b.sourceId}
                </span>)}
                {alive?.whispers?.map(q=><span key={'w'+q.id}>
                  {q.voice.toUpperCase()} · {q.theme} · {q.response}
                  {q.response==='reinterpreted'?' as '+q.interpretedAs:''}
                  {' · until Y'+q.until}
                </span>)}
                {focused.divineOrigins?.map(id=><span key={'o'+id}>
                  INHERITED DIVINE SOURCE #{id}</span>)}
              </div>
              <div className="evo-divine-profile-history">
                {divineRecords.map(r=><p key={r.id}>Y{r.year} · #{r.id} ·
                  {r.description}</p>)}
                <small>Inherited source IDs connect descendants to the original
                  blessing or curse. Memories record family consequences.</small>
              </div>
            </section>}
          {alive&&development&&<section className="evo-section-card evo-development-profile">
            <div className="evo-card-heading"><strong>◈ UPBRINGING & SOCIAL WORLD</strong>
              <span>WORLDFORGE / LIFE STORIES</span></div>
            <div className="evo-development-body">
              <div className="evo-development-highlights">
                <span><small>LIFE STAGE</small><strong>{lifeStage(alive)}</strong></span>
                <span><small>PATH</small><strong>{development.career?
                  CAREER_LABELS[development.career]:'Still discovering'}</strong></span>
                <span><small>CURRENT WORK</small><strong>{alive.work?
                  JOB_LABELS[alive.work.job]+' · #'+alive.work.settlementId:
                  'Choosing freely'}</strong></span>
                <span><small>GUILD MEMBERSHIP</small><strong>{guild?
                  JOB_LABELS[guild.job]+' · '+Math.round(guild.expertise)+' expertise':
                  'Independent worker'}</strong></span>
                <span><small>HOUSEHOLD</small><strong>{household?
                  '#'+household.id+' · '+household.members.length+' residents':'Unassigned'}</strong></span>
              </div>
              {household?.residence&&<p className="evo-family-help">
                Permanent residence: settlement #{household.residence.settlementId},
                building #{household.residence.buildingId} · X {household.home.x},
                Y {household.home.y}. Family members can return here for shelter.
              </p>}
              <div className="evo-development-relationships">
                <p><b>Care</b> {development.yearsCared} supported years ·
                  {development.yearsWithoutCare} years without nearby care ·
                  {development.yearsTaught} years of instruction</p>
                {development.adoptedBy&&<p><b>Adopted by</b>
                  <button onClick={()=>setActiveId(development.adoptedBy!)}>
                    {nameFor(development.adoptedBy)}</button></p>}
                {development.caregiverIds.length>0&&<p><b>Caregivers</b>
                  {development.caregiverIds.map(id=><button key={id}
                    onClick={()=>setActiveId(id)}>{nameFor(id)}</button>)}</p>}
                {development.mentorId&&<p><b>Mentor</b>
                  <button onClick={()=>setActiveId(development.mentorId!)}>
                    {nameFor(development.mentorId)}</button></p>}
                {development.friends.length>0&&<p><b>Friends</b>
                  {development.friends.map(id=><button key={id}
                    onClick={()=>setActiveId(id)}>{nameFor(id)}</button>)}</p>}
              </div>
              <div className="evo-development-pairs">
                <div><h4>LEARNED SKILLS</h4>{SKILLS.map(skill=><label key={skill}>
                  <span>{skill}</span><progress max="100" value={development.skills[skill]}/>
                  <b>{Math.round(development.skills[skill])}</b></label>)}</div>
                <div><h4>PERSONAL VALUES</h4>{VALUES.map(value=><label key={value}>
                  <span>{value}</span><progress max="100" value={development.values[value]}/>
                  <b>{Math.round(development.values[value])}</b></label>)}
                  <h4>EMOTIONAL DEVELOPMENT</h4>
                  <small>Trust {Math.round(development.trust)} ·
                    Empathy {Math.round(development.empathy)} ·
                    Resilience {Math.round(development.resilience)}</small>
                </div>
              </div>
              <div className="evo-development-culture">
                <h4>PHYSICAL PROFILE & INHERITED APTITUDES</h4>
                <p>Strength {traitProfile(alive.ancestry).strength.toFixed(2)}× ·
                  travel speed {traitProfile(alive.ancestry).speed.toFixed(2)}×.
                  These advantages blend with ancestry; learned knowledge does not.</p>
                <h4>DISCOVERIES PERSONALLY LEARNED</h4>
                {alive.knowledge?.length?<p>{alive.knowledge.map(k=>
                  TOPIC_INFO[k.topic].name+' (Y'+k.year+', '+k.source+
                  (k.teacherId?' from #'+k.teacherId:'')+')').join(' · ')}</p>:
                  <small>No specialized knowledge yet. Experience and teaching
                    can change this person's future.</small>}
              </div>
              <div className="evo-development-culture">
                <h4>EVOLVING GUIDING BELIEF</h4>
                <p>{guidingBelief(development)}</p>
                <h4>PERSONAL FAITH & CONVICTION</h4>
                {alive.belief?<p>{faithOf(world,alive)?.name??'Unknown tradition'}
                  {' · conviction '+Math.round(alive.belief.conviction)+'/100'+
                    ' · chosen in year '+alive.belief.since}
                  {alive.belief.teacherId&&' · heard from #'+alive.belief.teacherId}
                </p>:<small>No formal faith chosen. Individuals can remain
                  independent, learn from others, or question a tradition.</small>}
                <h4>LANGUAGES & EXPOSURE</h4>
                <p>{SPECIES.filter(s=>development.languages[s]>0).map(s=>
                  SPECIES_INFO[s].name+': '+Math.round(development.languages[s])+'%'
                ).join(' · ')}</p>
                <small>Visited biomes: {development.knownBiomes.join(', ')}.
                  Language familiarity and values grow through lived contact, not ancestry alone.</small>
              </div>
              <div className="evo-development-memories">
                <h4>FORMATIVE MEMORIES</h4>
                {development.memories.slice().reverse().map((memory,i)=><p key={i}>
                  <span>Y{memory.year} · {memory.kind.toUpperCase()}</span>
                  {memory.detail}{memory.otherId&&' · '+nameFor(memory.otherId)}
                </p>)}
                {!development.memories.length&&<small>
                  No formative events have been observed since tracking began.</small>}
              </div>
            </div>
          </section>}
          <section className="evo-section-card evo-knowledge-profile">
            <div className="evo-card-heading"><strong>✧ KNOWLEDGE ACQUIRED IN LIFE</strong>
              <span>{focused.knownKnowledge?.length??alive?.knowledge?.length??0} SUBJECTS</span>
            </div>
            {alive?.mind?.expedition&&<div className="evo-expedition-summary">
              <span>⌖ Expedition: {alive.mind.expedition.stage}</span>
              <span>Site #{alive.mind.expedition.siteId}</span>
              <span>Preparedness {alive.mind.expedition.preparedness}/100</span>
            </div>}
            {!!alive?.artifacts?.length&&<div className="evo-knowledge-town">
              <strong>RECOVERED ARTIFACTS</strong>
              {alive.artifacts.map((v,i)=><p key={i}>✦ {v.name} ·
                {' '}found at site #{v.siteId} in Y{v.year}</p>)}
            </div>}
            <div className="evo-knowledge-list">
              {(focused.knownKnowledge??alive?.knowledge??[]).map(k=><p key={k.topic}>
                <b>{TOPIC_INFO[k.topic].name}</b> · Learned in year {k.year}
                {' '}through {k.source}
                {k.teacherId&&<> · taught by <button onClick={()=>setActiveId(k.teacherId!)}>
                  {nameFor(k.teacherId)}</button></>}
                {k.siteId&&' · ancient site #'+k.siteId}
              </p>)}
              {!focused.knownKnowledge?.length&&!alive?.knowledge?.length&&
                <p>No specialized knowledge was recorded for this individual.</p>}
            </div>
          </section>
          <section className="evo-section-card">
            <div className="evo-card-heading"><strong>◈ PERSONAL CHRONICLE</strong>
              <span>{focused.moments?.length??0} remembered milestones</span></div>
            <div className="evo-directory-moments">
              {(focused.moments??[]).slice().reverse().map((m,i)=>
                <div key={i} className="evo-directory-moment">
                  <span>Y{m.year}</span><p>{m.text}</p>
                </div>)}
              {!focused.moments?.length&&<p className="evo-family-help">
                This individual comes from an earlier world version.
                Their previous private experiences weren't recorded. Future milestones
                will appear here as they happen.</p>}
            </div>
          </section>
        </>}
      </div>
    </div>
  </main>;
}
