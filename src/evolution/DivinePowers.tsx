import {useEffect,useState} from 'react';
import {BIOMES,BIOME_INFO,SPECIES,SPECIES_INFO,type Biome,type Species,
  type World} from './engine';
import {personName} from './identity';
import {DIVINE_ASPECTS,INFLUENCES,DIVINE_VOICES,type DivineAction,type DivineAspect,
  type DivineDuration,type DivineVoice,type Influence} from './divine';

type Props={world:World;selectedId:number|null;selectedTile:{x:number;y:number}|null;
  onApply:(action:DivineAction)=>void;onOpenPerson:(id:number)=>void;
  onFindOnMap:(id:number)=>void};

export function DivinePowers({world,selectedId,selectedTile,onApply,
  onOpenPerson,onFindOnMap}:Props){
  const [personId,setPersonId]=useState<number|null>(selectedId);
  const [theme,setTheme]=useState<Influence>('exploration');
  const [voice,setVoice]=useState<DivineVoice>('whisper');
  const [words,setWords]=useState('Explore what lies beyond the familiar.');
  const [whisperYears,setWhisperYears]=useState(12);
  const [aspect,setAspect]=useState<DivineAspect>('fertility');
  const [strength,setStrength]=useState(.5);
  const [duration,setDuration]=useState<DivineDuration>('hereditary');
  const [years,setYears]=useState(30);
  const [direct,setDirect]=useState<'heal'|'punish'|'resurrect'|'summon'|'terrain'>('heal');
  const [severity,setSeverity]=useState(40);
  const [deadId,setDeadId]=useState<number|null>(null);
  const [species,setSpecies]=useState<Species>('human');
  const [biome,setBiome]=useState<Biome>('forest');
  const [x,setX]=useState(selectedTile?.x??Math.floor(world.width/2));
  const [y,setY]=useState(selectedTile?.y??Math.floor(world.height/2));
  const [opened,setOpened]=useState<number|null>(null);
  useEffect(()=>{
    if(selectedId===null)return;
    if(world.agents.some(a=>a.id===selectedId))setPersonId(selectedId);
    else if(world.lineage.some(r=>r.id===selectedId&&r.died!==undefined)){
      setPersonId(null);setDeadId(selectedId);setDirect('resurrect');
    }
  },[selectedId,world.settings.seed]);
  useEffect(()=>{if(selectedTile){setX(selectedTile.x);setY(selectedTile.y);}},
    [selectedTile?.x,selectedTile?.y]);
  const people=[...world.agents].sort((a,b)=>a.id-b.id);
  const dead=world.lineage.filter(r=>r.died!==undefined).slice(-300).reverse();
  const chosen=world.agents.find(a=>a.id===personId);
  const records=world.divine?.history??[];
  const currentRecord=records.find(r=>r.id===opened);
  return <main className="evo-divine-page">
    <header className="evo-section-header">
      <div><span className="evo-overline">WORLDFORGE / THE HAND OF THE CREATOR</span>
        <h2>Divine Powers & Mortal Agency</h2>
        <p>You may intervene freely. Mortals can refuse your whispers, but direct
          changes to their world take effect.</p></div>
      <div className="evo-divine-mode"><strong>✦ UNRESTRICTED SANDBOX</strong>
        <span>No costs · No cooldowns · No forced obedience</span></div>
    </header>
    <section className="evo-section-card evo-divine-target">
      <div className="evo-card-heading"><strong>◉ CHOOSE A MORTAL</strong>
        <span>{world.agents.length} living</span></div>
      <label htmlFor="divine-person">TARGET INDIVIDUAL</label>
      <div className="evo-divine-inline"><select id="divine-person" value={chosen?.id??''}
        onChange={e=>setPersonId(Number(e.target.value))}>
        <option value="">Select a living person</option>
        {people.map(a=><option key={a.id} value={a.id}>
          #{a.id} — {personName(world,world.lineage.find(r=>r.id===a.id)??a)}
          {' · '+SPECIES_INFO[a.species].name}
        </option>)}
      </select><button disabled={!chosen} onClick={()=>chosen&&onOpenPerson(chosen.id)}>
        VIEW LIFE</button><button disabled={!chosen} onClick={()=>chosen&&onFindOnMap(chosen.id)}>
        FIND ON MAP</button></div>
      {chosen&&<p className="evo-divine-caption">Y{world.year} · Age {chosen.age} ·
        Health {Math.round(chosen.health)} · Energy {Math.round(chosen.energy)} ·
        {chosen.development?.career??'finding a path'}</p>}
    </section>
    <div className="evo-divine-grid">
      <section className="evo-section-card evo-divine-panel">
        <div className="evo-card-heading"><strong>✧ INFLUENCE</strong><span>MORTALS CHOOSE</span></div>
        <p>Speak through a dream, whisper, or prophecy. An individual may accept,
          resist, or reinterpret your message.</p>
        <label htmlFor="divine-theme">INSPIRE</label>
        <select id="divine-theme" value={theme}
          onChange={e=>setTheme(e.target.value as Influence)}>
          {INFLUENCES.map(v=><option key={v} value={v}>{v.replace('_',' ')}</option>)}
        </select>
        <label htmlFor="divine-voice">REVEAL AS</label>
        <select id="divine-voice" value={voice}
          onChange={e=>setVoice(e.target.value as DivineVoice)}>
          {DIVINE_VOICES.map(v=><option key={v} value={v}>{v}</option>)}
        </select>
        <label htmlFor="divine-words">YOUR WORDS</label>
        <textarea id="divine-words" maxLength={100} rows={3} value={words}
          onChange={e=>setWords(e.target.value)}/>
        <label htmlFor="divine-whisper-years">ECHOES FOR (YEARS)</label>
        <input id="divine-whisper-years" type="number" min={1} max={100}
          value={whisperYears} onChange={e=>setWhisperYears(Number(e.target.value))}/>
        <button className="evo-divine-submit" disabled={!chosen}
          onClick={()=>chosen&&onApply({kind:'whisper',personId:chosen.id,
            theme,voice,words,years:whisperYears})}>✧ SEND DIVINE MESSAGE</button>
      </section>
      <section className="evo-section-card evo-divine-panel">
        <div className="evo-card-heading"><strong>✦ BLESSINGS & CURSES</strong>
          <span>REAL SIMULATION EFFECTS</span></div>
        <p>Give a blessing or debuff affecting health, aging, fertility,
          decisions or skill development. Hereditary effects pass to children.</p>
        <label htmlFor="divine-stat">ATTRIBUTE</label>
        <select id="divine-stat" value={aspect}
          onChange={e=>setAspect(e.target.value as DivineAspect)}>
          {DIVINE_ASPECTS.map(v=><option key={v} value={v}>{v.replace('_',' ')}</option>)}
        </select>
        <label htmlFor="divine-strength">MODIFIER</label>
        <select id="divine-strength" value={strength}
          onChange={e=>setStrength(Number(e.target.value))}>
          {[-.75,-.5,-.25,.25,.5,1,1.5].map(v=><option key={v} value={v}>
            {v>0?'+':''}{Math.round(v*100)}% {v<0?'debuff':'blessing'}</option>)}
        </select>
        <label htmlFor="divine-duration">DURATION</label>
        <select id="divine-duration" value={duration}
          onChange={e=>setDuration(e.target.value as DivineDuration)}>
          <option value="temporary">Temporary</option>
          <option value="permanent">Permanent for this person</option>
          <option value="hereditary">Hereditary · descendants inherit</option>
        </select>
        {duration==='temporary'&&<><label htmlFor="divine-years">YEARS</label>
          <input id="divine-years" type="number" min={1} max={500} value={years}
            onChange={e=>setYears(Number(e.target.value))}/></>}
        <button className="evo-divine-submit" disabled={!chosen}
          onClick={()=>chosen&&onApply({kind:'blessing',personId:chosen.id,
            stat:aspect,strength,duration,years})}>✦ APPLY POWER</button>
      </section>
      <section className="evo-section-card evo-divine-panel">
        <div className="evo-card-heading"><strong>⚡ DIRECT INTERVENTION</strong>
          <span>IMMEDIATE</span></div>
        <p>Heal, punish, resurrect, summon, or remake terrain. These are world
          changes, not requests for permission.</p>
        <label htmlFor="divine-direct">POWER</label>
        <select id="divine-direct" value={direct}
          onChange={e=>setDirect(e.target.value as typeof direct)}>
          <option value="heal">Heal completely</option>
          <option value="punish">Divine punishment</option>
          <option value="resurrect">Resurrect an ancestor</option>
          <option value="summon">Summon a new individual</option>
          <option value="terrain">Transform terrain</option>
        </select>
        {direct==='punish'&&<><label htmlFor="divine-severity">SEVERITY</label>
          <input id="divine-severity" type="number" min={1} max={99}
            value={severity} onChange={e=>setSeverity(Number(e.target.value))}/></>}
        {direct==='resurrect'&&<><label htmlFor="divine-dead">DECEASED PERSON</label>
          <select id="divine-dead" value={deadId??''}
            onChange={e=>setDeadId(Number(e.target.value))}>
            <option value="">Choose from recent ancestors</option>
            {dead.map(r=><option key={r.id} value={r.id}>
              #{r.id} {personName(world,r)} · Died Y{r.died}</option>)}
          </select>
          <label htmlFor="divine-dead-id">OR ENTER ANY ARCHIVED ID</label>
          <input id="divine-dead-id" type="number" min={1} value={deadId??''}
            placeholder="Person ID" onChange={e=>setDeadId(Number(e.target.value)||null)}/></>}
        {direct==='summon'&&<><label htmlFor="divine-species">PEOPLE</label>
          <select id="divine-species" value={species}
            onChange={e=>setSpecies(e.target.value as Species)}>
            {SPECIES.map(s=><option key={s} value={s}>{SPECIES_INFO[s].name}</option>)}
          </select></>}
        {direct==='terrain'&&<><label htmlFor="divine-biome">NEW TERRAIN</label>
          <select id="divine-biome" value={biome}
            onChange={e=>setBiome(e.target.value as Biome)}>
            {BIOMES.map(b=><option key={b} value={b}>{BIOME_INFO[b].name}</option>)}
          </select></>}
        {['summon','resurrect','terrain'].includes(direct)&&<>
          <label>WORLD COORDINATES · CLICK A TILE IN WORLD TO PREFILL</label>
          <div className="evo-divine-coordinates">
            <label>X <input type="number" min={0} max={world.width-1} value={x}
              onChange={e=>setX(Number(e.target.value))}/></label>
            <label>Y <input type="number" min={0} max={world.height-1} value={y}
              onChange={e=>setY(Number(e.target.value))}/></label>
          </div></>}
        <button className="evo-divine-submit" disabled={
          (direct==='heal'||direct==='punish')&&!chosen||
          direct==='resurrect'&&!deadId}
          onClick={()=>{
            const action:DivineAction=direct==='heal'?{kind:'heal',personId:chosen!.id}:
              direct==='punish'?{kind:'punish',personId:chosen!.id,severity}:
              direct==='resurrect'?{kind:'resurrect',personId:deadId!,x,y}:
              direct==='summon'?{kind:'summon',species,x,y}:
              {kind:'terrain',biome,x,y};
            onApply(action);
          }}>⚡ INTERVENE</button>
      </section>
    </div>
    <section className="evo-section-card evo-divine-chronicle">
      <div className="evo-card-heading"><strong>✦ DIVINE INTERVENTION HISTORY</strong>
        <span>{records.length} recorded events</span></div>
      <p>Every power is traceable by year, target and outcome. Different peoples
        interpret the same event through their own cultural traditions.</p>
      {!records.length&&<p className="evo-family-help">No divine acts yet. Try blessing
        someone, then advance years to see the consequences.</p>}
      <div className="evo-divine-chronicle-list">
        {records.slice(-70).reverse().map(r=><div key={r.id} className="evo-divine-entry">
          <button onClick={()=>setOpened(opened===r.id?null:r.id)}>
            <span><b>Y{r.year}</b> · {r.kind.toUpperCase()} · #{r.id}</span>
            <strong>{r.description}</strong>
            <small>{r.targetId?'Person #'+r.targetId+' · ':''}
              {r.response?'Mortal '+r.response+' · ':''}VIEW INTERPRETATIONS</small>
          </button>
          {opened===r.id&&<div className="evo-divine-cultures">
            {SPECIES.map(s=><p key={s}><b>{SPECIES_INFO[s].name}</b> —
              {currentRecord?.interpretations[s]??r.interpretations[s]}</p>)}
            {r.targetId&&<button onClick={()=>onOpenPerson(r.targetId!)}>
              TRACE PERSON #{r.targetId} ↗</button>}
          </div>}
        </div>)}
      </div>
    </section>
  </main>;
}
