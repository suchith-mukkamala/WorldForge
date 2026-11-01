/** v2.5.2 — Presentation-only mortal perspective. No simulation, movement,
 * terrain or save data depends on which camera the player chooses. */
export type MortalCameraMode='adventure'|'atlas';

export const ADVENTURE_PITCH=20;
export const ADVENTURE_MIN_ZOOM=5.5;
export const ATLAS_MAX_ZOOM=3.5;

/** Adventure frames the sprite below center so more of the route ahead stays
 * visible. The atlas remains the established top-down follow view. */
export function cameraVerticalAnchor(mode:MortalCameraMode):number{
  return mode==='adventure'?.67:.5;
}

/** Keep a comfortable close-up without changing character world footprints. */
export function enterAdventureZoom(current:number):number{
  return Math.max(ADVENTURE_MIN_ZOOM,Math.min(8,current));
}
export function enterAtlasZoom(current:number):number{
  return Math.min(ATLAS_MAX_ZOOM,Math.max(1,current));
}
