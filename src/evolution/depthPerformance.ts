/** Render signatures are presentation-only. World time, AI, and save state
 * must never depend on whether scenery is cached or refreshed. */
import type {Settlement} from './engine';
import {buildingTier} from './construction';

/** Excludes changing stores and resident counts; only visible silhouettes
 * should invalidate the projected structure layer. */
export function depthStructureSignature(settlements:readonly Settlement[]):string{
  return settlements.map(s=>[
    s.id,s.species,s.x,s.y,
    (s.infrastructure?.buildings??[]).map(b=>[
      b.id,b.x,b.y,b.type,b.culture,b.stage,buildingTier(b),
    ].join(':')).join(','),
  ].join('|')).join(';');
}
