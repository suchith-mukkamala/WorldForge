import {useState} from 'react';
import {TERRAIN_CELL_SIDE,type TerrainCell} from './terrainCells';
import {terrainCellColor} from './terrainCellArt';

const label=(value:string)=>value[0].toUpperCase()+value.slice(1);
const units=(amount:number)=>amount.toLocaleString('en-US',{maximumFractionDigits:2});

export function TerrainCellPanel({cells,onZoom}:{cells:readonly TerrainCell[];onZoom?:()=>void}){
  const [selected,setSelected]=useState(()=>Math.max(0,cells.findIndex(cell=>cell.waterDepth>0)));
  const cell=cells[selected];
  return <section className="atlas-terrain-cells" aria-label="Terrain cells">
    <div className="atlas-terrain-cells-heading">
      <strong>Terrain cells</strong><span>{TERRAIN_CELL_SIDE} × {TERRAIN_CELL_SIDE}</span>
    </div>
    <div className="atlas-terrain-cell-grid" role="group" aria-label="Select a terrain cell"
      style={{gridTemplateColumns:`repeat(${TERRAIN_CELL_SIDE}, minmax(0, 1fr))`}}>
      {cells.map((c,i)=>{
        const position='Row '+(Math.floor(i/TERRAIN_CELL_SIDE)+1)+', column '+(i%TERRAIN_CELL_SIDE+1);
        const description=position+' · '+label(c.material)+(c.waterDepth>0?' · Water':'');
        return <button key={i} type="button" aria-pressed={i===selected}
          aria-label={description} title={description} style={{backgroundColor:terrainCellColor(c)}}
          onClick={()=>setSelected(i)}/>;
      })}
    </div>
    <dl aria-live="polite">
      <div><dt>Ground</dt><dd>{label(cell.material)}</dd></div>
      <div><dt>Elevation</dt><dd>{units(cell.height)}</dd></div>
      <div><dt>Water depth</dt><dd>{units(cell.waterDepth)}</dd></div>
      {cell.coverDepth>0&&<div><dt>Cover over stone</dt><dd>{units(cell.coverDepth)}</dd></div>}
      {cell.eroded>0&&<div><dt>Ground washed away</dt><dd>{units(cell.eroded)}</dd></div>}
    </dl>
    {onZoom&&<button type="button" className="atlas-terrain-cell-zoom" onClick={onZoom}>Zoom to terrain cells</button>}
  </section>;
}
