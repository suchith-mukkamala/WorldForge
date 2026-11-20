import {TOPICS,type Topic} from './knowledge';

export type SiteSurvey={siteId:number;year:number;topic?:Topic};
export const MAX_SITE_SURVEYS=100;

export function validSiteSurveys(value:unknown,year:number):value is SiteSurvey[]{
  if(!Array.isArray(value)||value.length>MAX_SITE_SURVEYS)return false;
  const seen=new Set<number>();
  for(const entry of value){
    if(!entry||!Number.isSafeInteger(entry.siteId)||entry.siteId<1||seen.has(entry.siteId)||
      !Number.isInteger(entry.year)||entry.year<0||entry.year>year||
      entry.topic!==undefined&&!TOPICS.includes(entry.topic))return false;
    seen.add(entry.siteId);
  }
  return true;
}
