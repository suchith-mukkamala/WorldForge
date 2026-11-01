/** Every NEW world gets a fresh seed. Replay remains explicitly deterministic.
 * The random source is injectable so the no-repeat rule is easy to test.
 */
const MAX_SEED=2147483647;
function randomFraction():number{
  if(typeof globalThis.crypto?.getRandomValues==='function'){
    const value=new Uint32Array(1);
    globalThis.crypto.getRandomValues(value);
    return value[0]/4294967296;
  }
  return Math.random();
}
export function freshWorldSeed(previous=0,random:()=>number=randomFraction):number{
  const sampled=random();
  const unit=Number.isFinite(sampled)?Math.max(0,Math.min(1-Number.EPSILON,sampled)):0;
  const seed=Math.floor(unit*MAX_SEED)+1;
  return seed===previous?seed%MAX_SEED+1:seed;
}
