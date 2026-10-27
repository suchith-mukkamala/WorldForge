import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {WorldforgeApp} from './WorldforgeApp';

describe('v1.2.1: playback interface',()=>{
  it('offers a readable date and granular playback controls',()=>{
    const html=renderToStaticMarkup(<WorldforgeApp/>);
    expect(html).toContain('WORLD DATE');
    expect(html).toContain('January');
    expect(html).toContain('+DAY');
    expect(html).toContain('+WEEK');
    expect(html).toContain('+MONTH');
    expect(html).toContain('+YEAR');
    expect(html).toContain('+10Y');
    expect(html).toContain('1 day / sec');
    expect(html).toContain('1 week / sec');
    expect(html).toContain('1 month / sec');
    expect(html).toContain('1 season / sec');
    expect(html).toContain('1 year / sec');
  });
});
