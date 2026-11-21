import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {createWorld} from './engine';
import {WorldforgeCrashScreen} from './WorldforgeErrorBoundary';

describe('WorldForge crash recovery',()=>{
  it('offers the last local snapshot without clearing site data',()=>{
    const world=createWorld({seed:21,size:'small'});
    const markup=renderToStaticMarkup(<WorldforgeCrashScreen
      recovery={{kind:'export',world}} onReload={()=>{}} onDownload={()=>{}}/>);
    expect(markup).toContain('WorldForge encountered an error');
    expect(markup).toContain('Download last browser save');
    expect(markup).toContain('Do not clear site data');
    const databaseOnly=renderToStaticMarkup(<WorldforgeCrashScreen
      recovery={{kind:'database-only'}} onReload={()=>{}}/>);
    expect(databaseOnly).toContain('browser database');
    expect(databaseOnly).not.toContain('Download last browser save');
    const unreadable=renderToStaticMarkup(<WorldforgeCrashScreen
      recovery={{kind:'unreadable'}} onReload={()=>{}}/>);
    expect(unreadable).toContain('could not be read');
  });
});