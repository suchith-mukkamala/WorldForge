/** God-mode atlas shortcuts. Mortal controls stay in the adventure view. */
const TEXT_FIELD=/^(INPUT|TEXTAREA|SELECT)$/;
export type GodModeShortcut='toggle-play'|'shortcut-help';
export function godModeShortcut(event:{
  key:string;repeat?:boolean;metaKey?:boolean;ctrlKey?:boolean;altKey?:boolean;
  target?:EventTarget|{tagName?:string;isContentEditable?:boolean}|null;
}):GodModeShortcut|null{
  if(event.repeat||event.metaKey||event.ctrlKey||event.altKey)return null;
  const target=event.target as {tagName?:string;isContentEditable?:boolean}|null;
  if(target&&(TEXT_FIELD.test(target.tagName??'')||target.isContentEditable))
    return null;
  if(event.key==='p'||event.key==='P')return 'toggle-play';
  if(event.key==='?')return 'shortcut-help';
  return null;
}
