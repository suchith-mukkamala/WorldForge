import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {WorldforgeApp,readSavedWorld} from './WorldforgeApp';
import {EvolutionHistory} from './EvolutionHistory';
import {WorldCreator} from './WorldCreator';
import {WorldCanvas} from './WorldCanvas';
import {WorldFamily} from './WorldFamily';
import {advanceWorld,createWorld,DEFAULT_SETTINGS} from './engine';

describe('Worldforge integration and first-time user experience',()=>{
  it('renders three separate tabs, controls, four species and a playable map',()=>{
    const markup=renderToStaticMarkup(<WorldforgeApp/>);
    expect(markup).toContain('WORLDFORGE');
    expect(markup).toContain('WORLD CREATOR');
    expect(markup).toContain('HISTORY');
    expect(markup).toContain('PLAY');
    expect(markup).toContain('YEAR');
    expect(markup).toContain('Humans');
    expect(markup).toContain('Elves');
    expect(markup).toContain('Dwarves');
    expect(markup).toContain('Demons');
    expect(markup).toContain('EXPORT WORLD JSON');
    expect(markup).toContain('evo-world-canvas');
    expect(markup).not.toContain('ASSEMBLE &');
  });
  it('has a world creator with population, seed, terrain and wander controls',()=>{
    const markup=renderToStaticMarkup(<WorldCreator current={DEFAULT_SETTINGS}
      onCreate={()=>{}} onReturn={()=>{}}/>);
    expect(markup).toContain('FOUR KINGDOMS');
    expect(markup).toContain('AGE OF HUMANS');
    expect(markup).toContain('ANCIENT WOODS');
    expect(markup).toContain('ASHEN FRONTIER');
    expect(markup).toContain('WORLD CONDITIONS');
    expect(markup).toContain('RANDOM SEED');
    expect(markup).toContain('WANDERING TENDENCY');
    expect(markup).toContain('GENERATE THIS WORLD');
  });
  it('renders population history from actual seeded-world history and settlements',()=>{
    const world=advanceWorld(createWorld({seed:115}),10);
    const markup=renderToStaticMarkup(<EvolutionHistory world={world}/>);
    expect(markup).toContain('History of a living world');
    expect(markup).toContain('POPULATION THROUGH TIME');
    expect(markup).toContain('WORLD CHRONICLE');
    expect(markup).toContain('SETTLEMENT REGISTER');
    expect(markup).toContain('TOTAL BIRTHS');
    expect(markup).toContain('Toggle species on the graph');
    expect(markup).toContain('POPULATION');
  });
  it('renders the interactive canvas with keyboard-accessible selection labels',()=>{
    const world=createWorld({seed:143});
    const markup=renderToStaticMarkup(<WorldCanvas world={world}
      brush={{kind:'inspect'}} overlay="terrain" selected={null} zoom={1}
      onSelect={()=>{}} onEdit={()=>{}}/>);
    expect(markup).toContain('role="grid"');
    expect(markup).toContain('tabindex="0"');
    expect(markup).toContain('Arrow keys');
    expect(markup).toContain('width="960"');
    expect(markup).toContain('height="624"');
  });
  it('accepts saved worlds but rejects malformed JSON and oversize inputs',()=>{
    const world=createWorld({seed:143});
    expect(readSavedWorld(JSON.stringify(world))).toEqual(world);
    expect(readSavedWorld('{')).toBeNull();
    expect(readSavedWorld(null)).toBeNull();
    expect(readSavedWorld(JSON.stringify({version:1}))).toBeNull();
    expect(readSavedWorld('x'.repeat(2500001))).toBeNull();
  });

  it('renders the separate family archives and ancestry navigation',()=>{
    const world=advanceWorld(createWorld({seed:270}),12);
    const person=world.lineage.find(r=>r.children.length>0)??world.lineage[0];
    const html=renderToStaticMarkup(<WorldFamily world={world} focusId={person.id}
      onChoose={()=>{}} onShowOnMap={()=>{}}
      onFavorite={()=>{}} onRename={()=>{}}/>);
    expect(html).toContain('Family Archives');
    expect(html).toContain('ANCESTRY');
    expect(html).toContain('PARTNERS');
    expect(html).toContain('evo-family-tree-level children');
    expect(html).toContain('FIND ON MAP');
    expect(html).toContain('GENERATION');
    expect(html).toContain('grandparents');
  });
});
