/** Catch render/lifecycle failures and keep recovery controls accessible.
 * This cannot catch missing JS assets or errors in event handlers/workers,
 * but it prevents a React render crash from leaving an empty viewport.
 */
import {Component,type ErrorInfo,type ReactNode} from 'react';

type Props={children:ReactNode};
type State={failed:boolean};
export class WorldforgeErrorBoundary extends Component<Props,State>{
  state:State={failed:false};
  static getDerivedStateFromError():State{return {failed:true};}
  componentDidCatch(error:Error,info:ErrorInfo):void{
    console.error('WorldForge renderer failed',error,info.componentStack);
  }
  render(){
    if(!this.state.failed)return this.props.children;
    return <main role="alert" style={{minHeight:'100vh',background:'#101b30',
      color:'#f4e7d0',padding:'clamp(24px,6vw,80px)',
      fontFamily:'system-ui, sans-serif'}}>
      <div style={{maxWidth:650,margin:'10vh auto'}}>
        <h1>WorldForge encountered an error</h1>
        <p>The interface failed to render. Your browser save has not been
          intentionally cleared. Refresh to try loading the world again.</p>
        <button style={{padding:'12px 18px',cursor:'pointer',
          background:'#a0d8d0',color:'#101b30',border:0,borderRadius:6}}
          onClick={()=>window.location.reload()}>Reload WorldForge</button>
        <p style={{opacity:.75,fontSize:14,marginTop:24}}>
          If this keeps happening, open the browser Console and share its error.
          Do not clear site data before exporting or recovering your world.</p>
      </div>
    </main>;
  }
}
