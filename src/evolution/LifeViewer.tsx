import {PURPOSE_LABELS,STEP_LABELS,type Cognition} from './mindII';
import {calendarDate} from './calendar';
import type {Agent,World} from './engine';
import {learnedDisposition} from './experienceLearning';

/** Close-up into a mortal's actual state, never an invented narrative.
 * Every motive and choice comes from a persisted planning decision.
 */
export function LifeViewer({world,person}:{world:World;person:Agent}){
  const c=person.cognition;
  const age=person.age;
  const date=calendarDate(world);
  const disposition=learnedDisposition(c,world.year);
  return <section className="evo-section-card evo-life-viewer">
    <div className="evo-card-heading"><strong>◈ LIFE VIEWER / MIND ENGINE III</strong>
      <span>V2.2 · Y{date.year} · {date.month+1}/{date.day}</span></div>
    <div className="evo-life-viewer-body">
      <p className="evo-life-viewer-intro">A person's plans are provisional.
        Needs, memories, relationships and new events may change what they do next.</p>
      {!c?<p>No long-term intentions recorded yet. This person can begin planning
        on a future day, or choose to live without a fixed agenda.</p>:<>
        <div className="evo-life-current">
          <span className="evo-overline">TODAY'S CHOSEN ACTION</span>
          <h3>{c.today?.action==='idle'?'Living in the moment':
            c.today?STEP_LABELS[c.today.action]:'Considering what comes next'}</h3>
          <p>{c.today?.explanation??'No particular action has been chosen today.'}</p>
        </div>
        <div className="evo-life-emotions">
          {([['Stress',c.emotions.stress],['Hope',c.emotions.hope],
            ['Loneliness',c.emotions.loneliness]] as const).map(([label,value])=>
            <label key={label}><span>{label}</span><progress max={100} value={value}/>
              <b>{Math.round(value)}</b></label>)}
        </div>
        {(disposition.habit||disposition.caution)&&<div className="evo-life-history">
          <h4>HABITS & LEARNED CAUTION</h4>
          {disposition.habit&&<p><b>Practiced habit:</b> {
            STEP_LABELS[disposition.habit]} — repeated successful experiences.</p>}
          {disposition.caution&&<p><b>Learned caution:</b> {
            STEP_LABELS[disposition.caution]} — repeated blocked attempts.</p>}
          <small>These tendencies can change with new experiences.</small>
        </div>}
        <div className="evo-life-plans">
          <div className="evo-life-subhead"><h4>INTENTIONS & NEXT STEPS</h4>
            <small>{c.agenda.length} active or future · Age {age}</small></div>
          {!c.agenda.length&&<p>No fixed plan right now. Living without a plan
            is one possible choice—not a simulation failure.</p>}
          {c.agenda.map(plan=><div className="evo-life-plan" key={plan.id}>
            <div className="evo-life-plan-head"><strong>{PURPOSE_LABELS[plan.purpose]}</strong>
              <span className={'evo-plan-status is-'+plan.status}>{plan.status}</span>
            </div>
            <p><b>Why:</b> {plan.motives.join(' · ')}</p>
            {plan.pausedBecause&&<p className="evo-plan-interruption">
              Interrupted: {plan.pausedBecause}</p>}
            <ol className="evo-plan-steps">
              {plan.steps.map((s,i)=><li key={i} className={
                i<plan.cursor?'is-done':i===plan.cursor?'is-current':'is-ahead'}>
                <span>{i<plan.cursor?'✓':i===plan.cursor?'◉':'○'}</span>
                <div><b>{STEP_LABELS[s.kind]}</b>
                  <small>{s.reason}</small>
                  {i===plan.cursor&&<progress max={s.needed} value={s.done}/>}
                </div>
                <em>{i<plan.cursor?'done':i===plan.cursor?
                  s.done+'/'+s.needed:'up next'}</em>
              </li>)}
            </ol>
          </div>)}
        </div>
        <div className="evo-life-history">
          <h4>HOW DECISIONS WERE MADE</h4>
          {[...c.decisions].reverse().slice(0,9).map((decision,i)=><div key={i}>
            <small>Y{decision.year} · Day {decision.day} · {decision.decision}</small>
            <p>{decision.explanation}</p>
            {!!decision.alternatives.length&&<span>Other possibilities: {
              decision.alternatives.join(' · ')}</span>}
          </div>)}
          {!c.decisions.length&&<p>Nothing has been reconsidered yet.</p>}
        </div>
        {!!c.history.length&&<div className="evo-life-history">
          <h4>FINISHED & INTERRUPTED PLANS</h4>
          {[...c.history].reverse().slice(0,6).map((h,i)=><div key={i}>
            <small>Y{h.year} · Day {h.day} · {PURPOSE_LABELS[h.purpose]} · {h.outcome}</small>
            <p>{h.reason}</p>
          </div>)}
        </div>}
        {!!c.trail.length&&<p className="evo-life-trail">
          <strong>Actual traveled route:</strong> {c.trail.slice(-8).map(index=>
            'X'+index%world.width+', Y'+Math.floor(index/world.width)).join(' → ')}
        </p>}
      </>}
      <small>These are explainable, deterministic decisions with bounded memory—not
        claims of consciousness or free-form generated thought.</small>
    </div>
  </section>;
}
