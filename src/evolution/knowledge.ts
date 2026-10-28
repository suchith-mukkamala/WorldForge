/** WorldForge v1.3: knowledge belongs to mortals, not to a global tech tree.
 * Discovery needs experience or an explored site. Teaching needs contact;
 * durable written archives require an actual literate community and hall.
 */
import type {Agent,LineageRecord,Settlement,Species,World} from './engine';
import {traitProfile} from './family';
import {divineFactor} from './divine';
import {appendLifeMoment} from './identity';
import {lifeStage} from './development';
import {residentIndex} from './density';

export const TOPICS=[
  'agriculture','herbalism','stonecraft','navigation','irrigation',
  'metallurgy','engineering','medicine','writing',
] as const;
export type Topic=typeof TOPICS[number];
export type KnowledgeSource='discovery'|'teaching'|'ruin'|'archive';
export type LearnedTopic={topic:Topic;year:number;source:KnowledgeSource;
  teacherId?:number;siteId?:number};
export type KnowledgeDiscovery={topic:Topic;year:number;personId:number;
  source:KnowledgeSource;siteId?:number};
export type KnowledgeState={firsts:KnowledgeDiscovery[]};
// Archive and vault remain valid so worlds saved before v1.4 still load.
export const ANCIENT_KINDS=['temple','library','crypt','ruin','archive','vault'] as const;
export type AncientKind=typeof ANCIENT_KINDS[number];
export type AncientSite={id:number;kind:AncientKind;x:number;y:number;
  topic:Topic;danger:number;visitors:number[];visits?:number;
  origin?:'ancient'|'collapsed';name?:string;culture?:Species;
  collapsed?:number;lostTopics?:Topic[];recovered?:number};
export type Artifact={siteId:number;name:string;kind:'relic'|'tome'|'tool'|'charm';
  topic:Topic;year:number};
export type ExpeditionRecord={year:number;personId:number;siteId:number;
  outcome:'injury'|'fatal'|'insight'|'artifact'|'empty';description:string};
export const TOPIC_INFO:Record<Topic,{name:string;description:string;benefit:string}>= {
  agriculture:{name:'Cultivation',description:'Experiment with seeds, soil and organized crops.',
    benefit:'Knowledgeable farmers produce sustainable harvests.'},
  herbalism:{name:'Herbalism',description:'Identify useful wild plants through experience.',
    benefit:'Practitioners recover health more readily.'},
  stonecraft:{name:'Stonecraft',description:'Shape stone and plan efficient mining.',
    benefit:'More effective extraction and durable construction.'},
  navigation:{name:'Navigation',description:'Learn routes by exploring unfamiliar terrain.',
    benefit:'Travelers venture farther and move more confidently.'},
  irrigation:{name:'Irrigation',description:'Apply cultivated farming knowledge to water management.',
    benefit:'Farms yield more food from the same work.'},
  metallurgy:{name:'Metallurgy',description:'Learn to refine ores into useful materials.',
    benefit:'Artisans craft more tools per work shift.'},
  engineering:{name:'Engineering',description:'Develop structure and construction techniques.',
    benefit:'Builders complete projects more efficiently.'},
  medicine:{name:'Medicine',description:'Combine herbal understanding with caregiving.',
    benefit:'Healers improve recovery and resilience.'},
  writing:{name:'Writing',description:'Preserve complicated ideas beyond one lifetime.',
    benefit:'Communities can archive discoveries for future generations.'},
};

const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
const distance=(a:{x:number;y:number},b:{x:number;y:number})=>
  Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
export function knows(a:Pick<Agent,'knowledge'>,topic:Topic):boolean{
  return a.knowledge?.some(k=>k.topic===topic)??false;
}
export function knowledgeOf(s:Pick<Settlement,'archives'>):Topic[]{
  return s.archives??[];
}

/** Stable site placement consumes no main-world RNG, so new content won't
 * silently reroll old personalities, genetics, terrain or family history. */
export function generateAncientSites(w:Pick<World,'settings'|'width'|'height'|'tiles'>):AncientSite[]{
  let seed=(w.settings.seed^0x516bf21d)>>>0;
  const rand=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;
    return (seed>>>0)/4294967296;};
  const sites:AncientSite[]=[],desired=Math.max(6,Math.floor(w.width*w.height/2100));
  for(let attempt=0;attempt<desired*150&&sites.length<desired;attempt++){
    const x=3+Math.floor(rand()*(w.width-6));
    const y=3+Math.floor(rand()*(w.height-6));
    const biome=w.tiles[y*w.width+x].biome;
    if(biome==='water'||sites.some(p=>distance(p,{x,y})<9))continue;
    const kind=ANCIENT_KINDS[Math.floor(rand()*ANCIENT_KINDS.length)];
    const topic=TOPICS[Math.floor(rand()*TOPICS.length)];
    sites.push({id:sites.length+1,kind,x,y,topic,
      danger:Math.round(10+rand()*72),visitors:[],visits:0,
      origin:'ancient',recovered:0});
  }
  return sites;
}

function history(w:World,a:Agent,topic:Topic,source:KnowledgeSource,siteId?:number){
  w.knowledge??={firsts:[]};
  if(w.knowledge.firsts.some(first=>first.topic===topic))return;
  w.knowledge.firsts.push({topic,personId:a.id,year:w.year,source,...
    (siteId===undefined?{}:{siteId})});
  w.events.push({id:w.nextEventId++,year:w.year,type:'knowledge',
    message:TOPIC_INFO[topic].name+' was first learned by a '+a.species+
      (source==='ruin'?' in an ancient site.':'.')});
  if(w.events.length>90)w.events=w.events.slice(-90);
}

/** Knowledge is never implicitly inherited by a newborn; a teacher or a
 * surviving text must actually pass it on. */
export function learn(w:World,a:Agent,topic:Topic,source:KnowledgeSource,
  teacherId?:number,siteId?:number,
  records?:Map<number,LineageRecord>):boolean{
  if(knows(a,topic))return false;
  a.knowledge??=[];
  const entry:LearnedTopic={topic,year:w.year,source,
    ...(teacherId===undefined?{}:{teacherId}),
    ...(siteId===undefined?{}:{siteId})};
  a.knowledge.push(entry);
  const record=records?.get(a.id)??w.lineage.find(r=>r.id===a.id);
  if(record){record.knownKnowledge??=[];record.knownKnowledge.push({...entry});}
  const d=a.development;
  if(d){
    const gain=source==='ruin'?18:source==='discovery'?5:1.5;
    d.skills.knowledge=clamp(Math.round((d.skills.knowledge+gain)*100)/100,0,100);
    d.values.discovery=clamp(Math.round((d.values.discovery+gain*.3)*100)/100,0,100);
    if(source==='discovery'||source==='ruin'){
      d.memories.push({year:w.year,kind:'discovery',detail:
        source==='ruin'?'Uncovered ancient '+TOPIC_INFO[topic].name+'.':
          'Discovered '+TOPIC_INFO[topic].name+' through experience.'});
      if(d.memories.length>18)d.memories=[d.memories[0],...d.memories.slice(-17)];
      if(record&&(!record.moments||record.moments.length<40))
        appendLifeMoment(w,a.id,{year:w.year,kind:'discovery',
          text:'Learned '+TOPIC_INFO[topic].name+
          (source==='ruin'?' in an ancient place.':' through experimentation.')},
        records);
    }
  }
  history(w,a,topic,source,siteId);
  return true;
}

function eligible(a:Agent,topic:Topic,w:World):boolean{
  const d=a.development;
  if(!d)return false;
  const biome=w.tiles[a.y*w.width+a.x].biome;
  switch(topic){
    case 'agriculture':return (a.work?.job==='farmer'||d.skills.foraging>=3)&&
      ['plains','forest','wasteland','volcanic'].includes(biome);
    case 'herbalism':return d.skills.foraging>=3&&
      ['forest','plains'].includes(biome);
    case 'stonecraft':return d.skills.craft>=2||a.work?.job==='miner';
    case 'navigation':return d.knownBiomes.length>=2&&d.skills.navigation>=1;
    case 'irrigation':return knows(a,'agriculture')&&
      (a.work?.job==='farmer'||d.skills.craft>=10);
    case 'metallurgy':return knows(a,'stonecraft')&&
      (a.work?.job==='miner'||a.work?.job==='artisan'||d.skills.craft>=12);
    case 'engineering':return knows(a,'stonecraft')&&
      (a.work?.job==='builder'||d.skills.craft>=14);
    case 'medicine':return knows(a,'herbalism')&&d.skills.care>=4;
    case 'writing':return a.knowledge!==undefined&&a.knowledge.length>=2&&
      d.skills.knowledge>=8&&(d.career==='scholar'||d.skills.knowledge>=17);
  }
}

/** Each person makes at most one experiment and receives at most one lesson
 * per year. Local contact and literacy, never global unlock flags, transmit it. */
export function advanceKnowledge(w:World,rand:()=>number):void{
  w.knowledge??={firsts:[]};
  w.ancientSites??=generateAncientSites(w);
  const byId=new Map(w.agents.map(a=>[a.id,a]));
  const records=new Map(w.lineage.map(r=>[r.id,r]));
  const local=residentIndex(w.agents,w.width);
  const knowledgeSets=new Map(w.agents.map(a=>[a.id,
    new Set((a.knowledge??[]).map(k=>k.topic))]));
  const teach=(a:Agent,topic:Topic,source:KnowledgeSource,
    teacherId?:number,siteId?:number)=>{
    if(!learn(w,a,topic,source,teacherId,siteId,records))return false;
    knowledgeSets.get(a.id)?.add(topic);
    return true;
  };
  for(const a of w.agents){
    if(a.age<traitProfile(a.ancestry).maturity*.65)continue;
    const stage=lifeStage(a);
    if(stage==='infant'||stage==='child')continue;
    const known=knowledgeSets.get(a.id)!;
    // Experimentation grows from lived work, thought, and observed materials.
    const candidates=TOPICS.filter(t=>!known.has(t)&&eligible(a,t,w));
    if(candidates.length){
      const topic=candidates[Math.floor(rand()*candidates.length)];
      const curiosity=(a.genes.curiosity??1)*
        divineFactor(a,'intelligence',w.year);
      const practice=topic==='agriculture'&&a.work?.job==='farmer'?1.9:
        topic==='stonecraft'&&a.work?.job==='miner'?1.6:1;
      if(rand()<.027*curiosity*practice)
        teach(a,topic,'discovery');
    }
  }
  // Mentorship, parents, friends and nearby co-workers transmit ideas across
  // generations and species, subject to actually shared language and contact.
  for(const a of w.agents){
    if(!a.development||a.age<2||a.knowledge?.length===TOPICS.length)continue;
    let teacher:Agent|undefined;
    const known=knowledgeSets.get(a.id)!;
    const newIdeas=(other:Agent)=>other.knowledge?.some(k=>!known.has(k.topic));
    const d=a.development;
    const closeIds=[...(a.parents??[]),...d.caregiverIds,
      ...(d.mentorId?[d.mentorId]:[]),...d.friends,
      ...(a.partnerId?[a.partnerId]:[])];
    for(const id of closeIds){
      const other=byId.get(id);
      if(other&&distance(a,other)<=4&&newIdeas(other)){teacher=other;break;}
    }
    if(!teacher){
      for(let dy=-2;dy<=2&&!teacher;dy++)for(let dx=-2;dx<=2&&!teacher;dx++){
        const x=a.x+dx,y=a.y+dy;
        if(x<0||x>=w.width||y<0||y>=w.height)continue;
        for(const id of local.get(y*w.width+x)??[]){
          const other=byId.get(id);
          if(other&&other.id!==a.id&&newIdeas(other)){
            teacher=other;break;
          }
        }
      }
    }
    if(teacher&&d.languages[teacher.species]>=12){
      const social=teacher.genes.social*divineFactor(teacher,'social',w.year);
      const family=closeIds.includes(teacher.id);
      if(rand()<(family?.36:.09)*social){
        const lessons=teacher.knowledge!.filter(k=>!known.has(k.topic));
        const topic=lessons[Math.floor(rand()*lessons.length)]?.topic;
        if(topic)teach(a,topic,'teaching',teacher.id);
      }
    }
  }
  // A written archive only survives if a literate adult has access to a
  // completed communal hall. Once inscribed it can outlive its founder.
  for(const s of w.settlements){
    const hall=s.infrastructure?.buildings.some(b=>b.type==='communal'&&
      b.stage==='complete');
    if(!hall)continue;
    const nearby:Agent[]=[];
    for(let dy=-5;dy<=5;dy++)for(let dx=-5;dx<=5;dx++){
      const x=s.x+dx,y=s.y+dy;
      if(x<0||x>=w.width||y<0||y>=w.height)continue;
      for(const id of local.get(y*w.width+x)??[]){
        const a=byId.get(id);if(a)nearby.push(a);
      }
    }
    if(nearby.some(a=>knows(a,'writing')&&
      a.age>=traitProfile(a.ancestry).maturity)){
      const archived=new Set(s.archives??[]);
      for(const a of nearby)for(const k of a.knowledge??[])archived.add(k.topic);
      s.archives=TOPICS.filter(t=>archived.has(t));
    }
    for(const a of nearby){
      if(!s.archives?.length||a.age<traitProfile(a.ancestry).maturity*.5||
        (!knows(a,'writing')&&(a.development?.skills.knowledge??0)<5)||
        rand()>.16)continue;
      const missing=s.archives.filter(t=>!knows(a,t));
      if(missing.length)teach(a,missing[Math.floor(rand()*missing.length)],'archive');
    }
  }
  for(const a of w.agents){
    const plan=a.mind?.expedition;
    if(plan?.stage==='preparing'&&plan.started===w.year){
      const town=w.settlements.find(s=>distance(a,s)<=7&&s.stores>=1.5);
      if(town)town.stores=Math.max(0,town.stores-1.5);
      else a.energy=Math.max(1,a.energy-3);
    }
    if(a.age<traitProfile(a.ancestry).maturity||
      a.mind?.goal!=='explore'&&a.mind?.goal!=='venture')continue;
    if(plan?.stage==='preparing'||plan?.stage==='returning')continue;
    const site=plan?.stage==='travel'?
      w.ancientSites.find(s=>s.id===plan.siteId&&distance(a,s)<=1):
      w.ancientSites.find(s=>distance(a,s)<=1&&
        !a.visitedSites?.includes(s.id)&&!s.visitors.includes(a.id));
    if(!site||a.visitedSites?.includes(site.id)||site.visitors.includes(a.id))continue;
    // Casual passersby may notice a doorway, but a prepared deliberate
    // expedition has a much better chance of actually entering it.
    if(!plan&&rand()>.12+a.genes.curiosity*.12)continue;
    a.visitedSites=[...(a.visitedSites??[]).slice(-31),site.id];
    site.visitors=[...site.visitors.slice(-7),a.id];
    site.visits=(site.visits??0)+1;
    const resilience=traitProfile(a.ancestry).strength*a.genes.vigor;
    const preparedness=plan?.preparedness??18;
    const provisions=plan?.supplies??0;
    const danger=(site.danger/100)*.54/
      Math.max(.5,resilience)*(1-preparedness/240-provisions/420);
    let outcome:ExpeditionRecord['outcome']='empty';
    let description='Returned from '+(site.name??'an ancient '+site.kind)+' empty-handed.';
    if(rand()<danger){
      const harm=Math.round(12+site.danger*.7*(1-preparedness/210));
      a.health=Math.max(1,a.health-harm);
      a.energy=Math.max(1,a.energy-site.danger*.45);
      const fatal=rand()<site.danger/260/Math.max(.75,resilience);
      if(fatal)a.mortalWound=true;
      outcome=fatal?'fatal':'injury';
      description=fatal?'Suffered mortal wounds in '+(site.name??'a '+site.kind)+'.':
        'Survived traps in '+(site.name??'a '+site.kind)+' with injuries.';
      if(a.development){
        a.development.memories.push({year:w.year,kind:'hardship',detail:description});
        if(a.development.memories.length>18)
          a.development.memories=[a.development.memories[0],...a.development.memories.slice(-17)];
        a.development.resilience=clamp(a.development.resilience+1,0,100);
      }
    }else{
      const lost=site.lostTopics?.filter(topic=>!knows(a,topic))??[];
      const topic=lost.length?lost[Math.floor(rand()*lost.length)]:site.topic;
      const learned=teach(a,topic,'ruin',undefined,site.id);
      outcome=learned?'insight':'empty';
      if(learned)description='Recovered '+TOPIC_INFO[topic].name+' from '+
        (site.name??'an ancient '+site.kind)+'.';
      if(rand()<.08+preparedness/600){
        const unknown=[...(site.lostTopics??[]),...TOPICS].filter(t=>!knows(a,t));
        const hidden=unknown[Math.floor(rand()*unknown.length)];
        if(hidden&&teach(a,hidden,'ruin',undefined,site.id)){
          outcome='insight';
          description+=' Deciphered extraordinary '+TOPIC_INFO[hidden].name+' as well.';
        }
      }
      // A rare find is portable, traceable and changes the owner's actual
      // capabilities. Sites gradually run out of intact artifacts.
      if((site.recovered??0)<3&&(a.artifacts?.length??0)<6&&rand()<.2+
        (site.kind==='crypt'||site.kind==='vault'?.16:0)){
        const kind=site.kind==='library'||site.kind==='archive'?'tome':
          site.kind==='crypt'?'charm':site.kind==='temple'?'relic':'tool';
        const name=(kind==='tome'?'Illuminated manuscript':
          kind==='charm'?'Ancient ward':kind==='tool'?'Masterwork instrument':
          'Sanctuary relic')+' of '+TOPIC_INFO[topic].name;
        a.artifacts=[...(a.artifacts??[]),{siteId:site.id,name,kind,topic,year:w.year}];
        site.recovered=(site.recovered??0)+1;
        if(a.development){
          a.development.skills.knowledge=clamp(a.development.skills.knowledge+8,0,100);
          a.development.skills.craft=clamp(a.development.skills.craft+4,0,100);
        }
        a.health=clamp(a.health+5,1,100);
        outcome='artifact';description='Recovered '+name+' from '+
          (site.name??'an ancient '+site.kind)+'.';
        appendLifeMoment(w,a.id,{year:w.year,kind:'discovery',
          text:'Brought home '+name+' from a dangerous expedition.'},records);
      }
    }
    if(plan){
      a.mind.expedition={...plan,stage:'returning'};
      a.mind.target={...plan.home};
      a.mind.reason='Returning home after an expedition.';
    }
    if(outcome==='injury'||outcome==='fatal')
      appendLifeMoment(w,a.id,{year:w.year,kind:'discovery',text:description},records);
    w.expeditions??=[];
    w.expeditions.push({year:w.year,personId:a.id,siteId:site.id,
      outcome,description});
    if(w.expeditions.length>180)w.expeditions=w.expeditions.slice(-180);
    w.events.push({id:w.nextEventId++,year:w.year,type:'knowledge',
      message:'Explorer #'+a.id+': '+description});
    if(w.events.length>90)w.events=w.events.slice(-90);
  }
}

export function validKnowledge(w:World):boolean{
  const validTopic=(topic:Topic)=>TOPICS.includes(topic);
  const validEntries=(items:LearnedTopic[]|undefined)=>items===undefined||
    Array.isArray(items)&&items.length<=TOPICS.length&&
    new Set(items.map(k=>k.topic)).size===items.length&&
    items.every(k=>k&&validTopic(k.topic)&&
      Number.isInteger(k.year)&&k.year>=0&&k.year<=w.year&&
      ['discovery','teaching','ruin','archive'].includes(k.source)&&
      (k.teacherId===undefined||Number.isSafeInteger(k.teacherId)&&k.teacherId>0)&&
      (k.siteId===undefined||Number.isInteger(k.siteId)&&k.siteId>0));
  if(w.knowledge!==undefined){
    if(!w.knowledge||!Array.isArray(w.knowledge.firsts)||
      w.knowledge.firsts.length>TOPICS.length||
      new Set(w.knowledge.firsts.map(k=>k.topic)).size!==w.knowledge.firsts.length||
      !w.knowledge.firsts.every(k=>k&&validTopic(k.topic)&&
        Number.isInteger(k.year)&&k.year>=0&&k.year<=w.year&&
        Number.isSafeInteger(k.personId)&&k.personId>0&&
        ['discovery','teaching','ruin','archive'].includes(k.source)&&
        (k.siteId===undefined||Number.isInteger(k.siteId)&&k.siteId>0)))return false;
  }
  for(const a of w.agents){
    if(!validEntries(a.knowledge))return false;
  }
  if(!w.lineage.every(r=>validEntries(r.knownKnowledge)))return false;
  for(const s of w.settlements){
    if(s.archives!==undefined&&(!Array.isArray(s.archives)||
      s.archives.length>TOPICS.length||
      new Set(s.archives).size!==s.archives.length||
      !s.archives.every(validTopic)))return false;
  }
  if(w.ancientSites!==undefined){
    if(!Array.isArray(w.ancientSites)||w.ancientSites.length>100||
      !w.ancientSites.every(s=>s&&Number.isInteger(s.id)&&s.id>0&&
        ANCIENT_KINDS.includes(s.kind)&&Number.isInteger(s.x)&&
        Number.isInteger(s.y)&&s.x>=0&&s.y>=0&&
        s.x<w.width&&s.y<w.height&&validTopic(s.topic)&&
        Number.isInteger(s.danger)&&s.danger>=0&&s.danger<=100&&
        (s.visits===undefined||Number.isInteger(s.visits)&&s.visits>=0)&&
        (s.recovered===undefined||Number.isInteger(s.recovered)&&s.recovered>=0&&s.recovered<=3)&&
        (s.origin===undefined||['ancient','collapsed'].includes(s.origin))&&
        (s.name===undefined||typeof s.name==='string'&&s.name.length<=100)&&
        (s.culture===undefined||['human','elf','dwarf','demon'].includes(s.culture))&&
        (s.collapsed===undefined||Number.isInteger(s.collapsed)&&s.collapsed>=0&&s.collapsed<=w.year)&&
        (s.lostTopics===undefined||Array.isArray(s.lostTopics)&&s.lostTopics.length<=TOPICS.length&&
          new Set(s.lostTopics).size===s.lostTopics.length&&s.lostTopics.every(validTopic))&&
        Array.isArray(s.visitors)&&s.visitors.length<=8&&
        new Set(s.visitors).size===s.visitors.length&&
        s.visitors.every(id=>Number.isSafeInteger(id)&&id>0))||
      new Set(w.ancientSites.map(s=>s.id)).size!==w.ancientSites.length)return false;
  }
  if(w.expeditions!==undefined&&(!Array.isArray(w.expeditions)||
    w.expeditions.length>180||!w.expeditions.every(e=>e&&
      Number.isInteger(e.year)&&e.year>=0&&e.year<=w.year&&
      Number.isSafeInteger(e.personId)&&e.personId>0&&
      Number.isInteger(e.siteId)&&e.siteId>0&&
      ['injury','fatal','insight','artifact','empty'].includes(e.outcome)&&
      typeof e.description==='string'&&e.description.length<=220)))return false;
  for(const a of w.agents){
    if(a.visitedSites!==undefined&&(!Array.isArray(a.visitedSites)||
      a.visitedSites.length>32||new Set(a.visitedSites).size!==a.visitedSites.length||
      !a.visitedSites.every(n=>Number.isInteger(n)&&n>0)))return false;
    if(a.artifacts!==undefined&&(!Array.isArray(a.artifacts)||a.artifacts.length>6||
      !a.artifacts.every(v=>v&&Number.isInteger(v.siteId)&&v.siteId>0&&
        typeof v.name==='string'&&v.name.length<=100&&
        ['relic','tome','tool','charm'].includes(v.kind)&&validTopic(v.topic)&&
        Number.isInteger(v.year)&&v.year>=0&&v.year<=w.year)))return false;
  }
  return true;
}
