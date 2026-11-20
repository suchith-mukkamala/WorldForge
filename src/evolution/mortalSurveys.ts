import type {World} from './engine';
import {adventureDistance,adventureMapFor,adventureRegion,
  type AdventureMap,type AdventureRegion} from './adventureMap';
import {ancientSiteName,knows,learn,TOPIC_INFO,type ExpeditionRecord} from './knowledge';
import {cloneDevelopment} from './development';
import {personName} from './identity';
import {MAX_SITE_SURVEYS,type SiteSurvey} from './surveyRecords';

export function reachableLandmarks(world:World,map:AdventureMap,region:AdventureRegion){
  return (world.ancientSites??[]).filter(site=>{
    const index=site.y*world.width+site.x;
    return region.area.has(index)&&map.open[index]&&!map.buildings.has(index)&&
      world.tiles[index].biome!=='water';
  });
}

/** A manual survey records the site and uses the same learning rules as an
 * expedition. Keep the original world intact for rejected and repeated clicks. */
export function surveyLandmark(world:World,siteId:number):{world:World;message:string}{
  const descent=world.descent;
  const actor=descent?.mode==='mortal'&&world.agents.find(a=>a.id===descent.agentId);
  if(!actor||!descent)return {world,message:'Resume your mortal to survey a landmark.'};
  const map=adventureMapFor(world),region=adventureRegion(world,map,actor);
  const site=reachableLandmarks(world,map,region).find(s=>s.id===siteId);
  if(!site||adventureDistance(actor,site)>1)
    return {world,message:'Walk up to the landmark to survey it.'};
  const surveys=descent.surveys??[],name=ancientSiteName(site);
  if(surveys.some(s=>s.siteId===siteId))
    return {world,message:name+' is already in your field journal.'};
  if(surveys.length>=MAX_SITE_SURVEYS)return {world,message:'Your field journal is full.'};

  const topic=[...(site.lostTopics??[]),site.topic].find(t=>!knows(actor,t));
  const visitor={...actor,knowledge:[...(actor.knowledge??[])],
    visitedSites:[...(actor.visitedSites??[]).filter(id=>id!==siteId).slice(-31),siteId],
    development:actor.development&&cloneDevelopment(actor.development)};
  const record=world.lineage.find(r=>r.id===actor.id);
  const entry:SiteSurvey={siteId,year:world.year,...(topic?{topic}:{})};
  const message=topic?'Surveyed '+name+' and learned '+TOPIC_INFO[topic].name+'.':
    'Documented '+name+' in your field journal.';
  const expedition:ExpeditionRecord={year:world.year,personId:actor.id,siteId,
    outcome:topic?'insight':'empty',description:message};
  const next:World={...world,descent:{...descent,surveys:[...surveys,entry]},
    agents:world.agents.map(a=>a.id===actor.id?visitor:a),
    lineage:world.lineage.map(r=>r.id===actor.id?
      {...r,knownKnowledge:[...(r.knownKnowledge??[])]}:r),
    ancientSites:world.ancientSites?.map(s=>s.id===siteId?{...s,
      visitors:[...s.visitors.filter(id=>id!==actor.id).slice(-7),actor.id],
      visits:(s.visits??s.visitors.length)+1}:s),
    knowledge:{firsts:[...(world.knowledge?.firsts??[])]},
    expeditions:[...(world.expeditions??[]),expedition].slice(-180),
    events:[...world.events]};
  if(topic)learn(next,visitor,topic,'ruin',undefined,siteId);
  next.events.push({id:next.nextEventId++,year:next.year,type:'knowledge',
    message:personName(world,record??actor)+' surveyed '+name+'.'});
  if(next.events.length>90)next.events=next.events.slice(-90);
  return {world:next,message};
}
