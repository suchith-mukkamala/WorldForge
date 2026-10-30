/** Right-drag orbit controls are display-only. They never alter world state. */
export const ORBIT_STEP_DEGREES=15;
export const ORBIT_STEP_PIXELS=24;

/** Mouse motion is quantized to the existing 15° orbit increments. This avoids
 * rebuilding the large illustrated world on every individual pointer pixel. */
export function yawForRightDrag(startYaw:number,deltaX:number):number{
  const origin=Math.round(startYaw/ORBIT_STEP_DEGREES);
  const steps=Math.round(deltaX/ORBIT_STEP_PIXELS);
  const yaw=(origin+steps)*ORBIT_STEP_DEGREES;
  return ((yaw%360)+360)%360;
}
