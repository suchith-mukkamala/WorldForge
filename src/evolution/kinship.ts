/** Kinship is derived from the lineage archive, bonds and living social
 * records. It is not a second family database, so old saves need no migration
 * and large populations only pay the cost for the person being inspected. */
export type KinRole='parent'|'child'|'sibling'|'half-sibling'|'grandparent'|
  'grandchild'|'partner'|'suitor'|'former-partner'|'parent-in-law'|
  'sibling-in-law'|'adoptive-parent'|'caregiver'|'mentor'|'friend';
export type KinTone='close'|'fond'|'familiar'|'strained'|'distant';
export type KinLink={id:number;role:KinRole;tone:KinTone;note:string};
export const KIN_ROLE_LABELS:Record<KinRole,string>={
  parent:'Parent',child:'Child',sibling:'Sibling','half-sibling':'Half-sibling',
  grandparent:'Grandparent',grandchild:'Grandchild',partner:'Partner',
  suitor:'Courting','former-partner':'Former partner',
  'parent-in-law':'Parent-in-law','sibling-in-law':'Sibling-in-law',
  'adoptive-parent':'Adoptive parent',caregiver:'Caregiver',mentor:'Mentor',
  friend:'Friend',
};
type KinRecord={id:number;parents?:[number,number];children:number[];
  partnerIds:number[]};
type KinAgent={id:number;partnerId?:number;development?:{
  householdId?:number;adoptedBy?:number;caregiverIds:number[];mentorId?:number;
  friends:number[];memories:{kind:string;otherId?:number}[]};
  dailyLife?:{acquaintances:{personId:number;regard?:number}[]}};
type KinBond={a:number;b:number;stage:'courting'|'partner'|'ended';strength:number};
export type KinSource={lineage:readonly KinRecord[];bonds:readonly KinBond[];
  agents:readonly KinAgent[]};

const DEFAULT_LIMIT=8;
function childrenOf(records:Map<number,KinRecord>,id:number):number[]{
  return records.get(id)?.children??[];
}
function fullSiblings(records:Map<number,KinRecord>,parents:readonly number[],
  self:number):{full:number[];half:number[]}{
  if(parents.length<2){
    const only=parents[0];
    return {full:only?childrenOf(records,only).filter(id=>id!==self):[],half:[]};
  }
  const first=new Set(childrenOf(records,parents[0]));
  const full=childrenOf(records,parents[1]).filter(id=>id!==self&&first.has(id));
  const half=new Set<number>();
  for(const parent of parents)for(const id of childrenOf(records,parent))
    if(id!==self&&!full.includes(id))half.add(id);
  return {full,half:[...half]};
}
function toneFor(self:KinAgent|undefined,other:KinAgent|undefined,
  role:KinRole,bond:KinBond|undefined):{tone:KinTone;note:string}{
  const memories=self?.development?.memories.filter(m=>m.otherId===other?.id)??[];
  const regard=self?.dailyLife?.acquaintances.find(c=>c.personId===other?.id)?.regard;
  const conflict=memories.some(m=>m.kind==='conflict')||
    (regard!==undefined&&regard<=-8);
  const warm=memories.some(m=>['friendship','support','care','collaboration',
    'reconciliation'].includes(m.kind))||(regard!==undefined&&regard>=8);
  const sameHome=!!self?.development?.householdId&&
    self.development.householdId===other?.development?.householdId;
  if(conflict)return {tone:'strained',note:regard!==undefined&&regard<=-8?
    'Recent meetings left trust strained.':'A remembered conflict still colors this tie.'};
  if(role==='partner'&&bond&&bond.stage!=='ended'&&bond.strength>=.75)
    return {tone:'close',note:'Living bond at '+Math.round(bond.strength*100)+'% affinity.'};
  if(sameHome&&['parent','child','sibling','partner','caregiver',
    'adoptive-parent'].includes(role))
    return {tone:'close',note:'Shares a household.'};
  if(warm)return {tone:'fond',note:'Warmth earned through real meetings or care.'};
  if(role==='former-partner')return {tone:'distant',note:'The partnership has ended.'};
  if(role==='suitor')return {tone:'familiar',note:'A courtship is still underway.'};
  if(bond&&bond.stage==='partner')
    return {tone:'fond',note:'Partners, affinity '+Math.round(bond.strength*100)+'%.'};
  return {tone:'familiar',note:'Recorded in the family archive.'};
}

export function kinshipOf(world:KinSource,focusId:number,
  limits?:Partial<Record<KinRole,number>>):KinLink[]{
  const records=new Map(world.lineage.map(r=>[r.id,r]));
  const focus=records.get(focusId);
  if(!focus)return [];
  const agents=new Map(world.agents.map(a=>[a.id,a]));
  const bondBetween=(a:number,b:number)=>world.bonds.find(bond=>
    (bond.a===a&&bond.b===b)||(bond.a===b&&bond.b===a));
  const links:KinLink[]=[];
  const used=new Set<number>();
  const add=(id:number,role:KinRole)=>{
    if(!id||id===focusId||used.has(id)||!records.has(id))return;
    const cap=limits?.[role]??DEFAULT_LIMIT;
    if(links.filter(link=>link.role===role).length>=cap)return;
    used.add(id);
    const bond=bondBetween(focusId,id);
    const described=toneFor(agents.get(focusId),agents.get(id),role,bond);
    links.push({id,role,...described});
  };
  const parents=focus.parents??[];
  for(const id of parents)add(id,'parent');
  const self=agents.get(focusId);
  if(self?.development?.adoptedBy)add(self.development.adoptedBy,'adoptive-parent');
  const partnerBond=world.bonds.find(b=>(b.a===focusId||b.b===focusId)&&
    b.stage==='partner');
  const partnerId=self?.partnerId??(partnerBond?
    (partnerBond.a===focusId?partnerBond.b:partnerBond.a):undefined);
  if(partnerId)add(partnerId,'partner');
  for(const id of focus.children)add(id,'child');
  const siblings=fullSiblings(records,parents,focusId);
  for(const id of siblings.full)add(id,'sibling');
  for(const id of siblings.half)add(id,'half-sibling');
  for(const parent of parents)for(const id of records.get(parent)?.parents??[])
    add(id,'grandparent');
  for(const child of focus.children)for(const id of childrenOf(records,child))
    add(id,'grandchild');
  if(partnerId){
    for(const id of records.get(partnerId)?.parents??[])add(id,'parent-in-law');
    const inLaws=fullSiblings(records,records.get(partnerId)?.parents??[],partnerId);
    for(const id of [...inLaws.full,...inLaws.half])add(id,'sibling-in-law');
  }
  for(const id of self?.development?.caregiverIds??[])add(id,'caregiver');
  if(self?.development?.mentorId)add(self.development.mentorId,'mentor');
  for(const id of self?.development?.friends??[])add(id,'friend');
  for(const bond of world.bonds){
    if(bond.stage!=='courting')continue;
    if(bond.a!==focusId&&bond.b!==focusId)continue;
    add(bond.a===focusId?bond.b:bond.a,'suitor');
  }
  const former=new Set(focus.partnerIds);
  for(const bond of world.bonds){
    if(bond.stage!=='ended')continue;
    if(bond.a===focusId)former.add(bond.b);
    if(bond.b===focusId)former.add(bond.a);
  }
  if(partnerId)former.delete(partnerId);
  for(const id of former)add(id,'former-partner');
  return links;
}
