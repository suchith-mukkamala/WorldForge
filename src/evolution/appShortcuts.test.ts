import {describe,expect,it} from 'vitest';
import {godModeShortcut} from './appShortcuts';

describe('god-mode keyboard shortcuts',()=>{
  it('toggles play with P and explains shortcuts with ?',()=>{
    expect(godModeShortcut({key:'p'})).toBe('toggle-play');
    expect(godModeShortcut({key:'P'})).toBe('toggle-play');
    expect(godModeShortcut({key:'?'})).toBe('shortcut-help');
  });

  it('ignores typing, repeats, and modifier chords',()=>{
    const field={tagName:'INPUT',isContentEditable:false};
    expect(godModeShortcut({key:'p',target:field})).toBeNull();
    expect(godModeShortcut({key:'?',target:{tagName:'TEXTAREA'}})).toBeNull();
    expect(godModeShortcut({key:'p',target:{tagName:'DIV',isContentEditable:true}})).toBeNull();
    expect(godModeShortcut({key:'p',repeat:true})).toBeNull();
    expect(godModeShortcut({key:'p',metaKey:true})).toBeNull();
    expect(godModeShortcut({key:'p',ctrlKey:true})).toBeNull();
    expect(godModeShortcut({key:'?',altKey:true})).toBeNull();
    expect(godModeShortcut({key:'e'})).toBeNull();
  });
});
