/** Local settlement queries without rescanning every mortal for each town.
 * The original simulation processes residents in agent-array order. Keep that
 * order even when people share a tile, since it affects work and supplies.
 * This index is transient: it is rebuilt for each simulation phase, never
 * stored in a save or used to discard off-camera inhabitants.
 */
export type PositionedAgent={x:number;y:number};
type Entry<T>={agent:T;order:number};
export type AgentTileIndex<T>=Map<number,Entry<T>[]>;

export function indexAgentsByTile<T extends PositionedAgent>(
  agents:readonly T[],width:number):AgentTileIndex<T>{
  const index:AgentTileIndex<T>=new Map();
  agents.forEach((agent,order)=>{
    const tile=agent.y*width+agent.x;
    let entries=index.get(tile);
    if(!entries){entries=[];index.set(tile,entries);}
    entries.push({agent,order});
  });
  return index;
}

/** Chebyshev-radius neighborhood; matches distance(a,center)<=radius. */
export function nearbyAgents<T extends PositionedAgent>(
  index:AgentTileIndex<T>,width:number,center:PositionedAgent,
  radius:number):T[]{
  const found:Entry<T>[]=[];
  for(let y=Math.max(0,center.y-radius);y<=center.y+radius;y++)
    for(let x=Math.max(0,center.x-radius);
      x<=Math.min(width-1,center.x+radius);x++){
      const agents=index.get(y*width+x);
      if(agents)found.push(...agents);
    }
  found.sort((a,b)=>a.order-b.order);
  return found.map(entry=>entry.agent);
}
