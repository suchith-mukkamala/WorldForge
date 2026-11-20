export type TownStop={kind:'town';id:number};
export type WildStop={kind:'wild';x:number;y:number};
export type AdventureStop=TownStop|WildStop;
export type AdventureRoute={kind:'route';from:AdventureStop;to:TownStop};
export type AdventurePlace=AdventureStop|AdventureRoute;

export function adventurePlaceKey(place:AdventurePlace):string{
  if(place.kind==='town')return 'town:'+place.id;
  if(place.kind==='wild')return 'wild:'+place.x+':'+place.y;
  return adventurePlaceKey(place.from)+'>'+adventurePlaceKey(place.to);
}

/** Geography and route tiles are derived. A save carries only the scene's
 * identity, and can still load after a settlement or bridge disappears. */
export function validAdventurePlace(value:unknown,width:number,height:number):boolean{
  const town=(p:unknown):p is TownStop=>!!p&&typeof p==='object'&&
    'kind' in p&&p.kind==='town'&&'id' in p&&typeof p.id==='number'&&
    Number.isSafeInteger(p.id)&&p.id>0;
  const wild=(p:unknown):p is WildStop=>!!p&&typeof p==='object'&&
    'kind' in p&&p.kind==='wild'&&'x' in p&&'y' in p&&
    typeof p.x==='number'&&typeof p.y==='number'&&Number.isInteger(p.x)&&
    Number.isInteger(p.y)&&p.x>=0&&p.x<width&&p.y>=0&&p.y<height;
  if(town(value)||wild(value))return true;
  return !!value&&typeof value==='object'&&'kind' in value&&value.kind==='route'&&
    'from' in value&&'to' in value&&town(value.to)&&
    (wild(value.from)||town(value.from)&&value.from.id<value.to.id);
}
