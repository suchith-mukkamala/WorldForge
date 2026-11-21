/** Catch render/lifecycle failures and keep recovery controls accessible.
 * This cannot catch missing JS assets or errors in event handlers/workers,
 * but it prevents a React render crash from leaving an empty viewport.
 */
import {Component,type ErrorInfo,type ReactNode} from 'react';
import {recoverStoredWorld,type StoredWorldRecovery} from './storage';
import type {World} from './engine';

type Props={children:ReactNode};
type State={failed:boolean};
const buttonStyle={padding:'12px 18px',cursor:'pointer',background:'#a0d8d0',
  color:'#101b30',border:0,borderRadius:6,marginRight:12};
function downloadWorld(world:World):void{
  const blob=new Blob([JSON.stringify(world)],{type:'application/json'});
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;
  link.download='worldforge-'+world.settings.seed+'-year-'+world.year+'.json';
  document.body.appendChild(link);link.click();link.remove();
  URL.revokeObjectURL(url);
}
export function WorldforgeCrashScreen({recovery,onReload,onDownload}:{
  recovery:StoredWorldRecovery;onReload:()=>void;
  onDownload?:(world:World)=>void;
}){
  return <main role="alert" style={{minHeight:'100vh',background:'#101b30',
    color:'#f4e7d0',padding:'clamp(24px,6vw,80px)',
    fontFamily:'system-ui, sans-serif'}}>
    <div style={{maxWidth:650,margin:'10vh auto'}}>
      <h1>WorldForge encountered an error</h1>
      <p>The interface failed to render. Your browser save has not been
        intentionally cleared. Refresh to try loading the world again.</p>
      <p>{recovery.kind==='export'?
        'A browser snapshot is still available to download before you reload.':
        recovery.kind==='database-only'?
          'The latest world is in the browser database because it no longer fit in the local snapshot. Reload to restore it.':
          recovery.kind==='unreadable'?
            'The local snapshot could not be read. Reload to try the database backup.':
            'No local snapshot was found. A database backup may still load when you reload.'}</p>
      <button type="button" style={buttonStyle} onClick={onReload}>Reload WorldForge</button>
      {recovery.kind==='export'&&<button type="button" style={buttonStyle}
        onClick={()=>onDownload?.(recovery.world)}>Download last browser save</button>}
      <p style={{opacity:.75,fontSize:14,marginTop:24}}>
        If this keeps happening, open the browser Console and share its error.
        Do not clear site data before exporting or recovering your world.</p>
    </div>
  </main>;
}
export class WorldforgeErrorBoundary extends Component<Props,State>{
  state:State={failed:false};
  static getDerivedStateFromError():State{return {failed:true};}
  componentDidCatch(error:Error,info:ErrorInfo):void{
    console.error('WorldForge renderer failed',error,info.componentStack);
  }
  render(){
    if(!this.state.failed)return this.props.children;
    const recovery=recoverStoredWorld(
      typeof window==='undefined'?null:window.localStorage);
    return <WorldforgeCrashScreen recovery={recovery}
      onReload={()=>window.location.reload()} onDownload={downloadWorld}/>;
  }
}
