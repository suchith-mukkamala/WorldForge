import {describe,expect,it} from 'vitest';
import {trainedSkillGain,trainingTitle} from './skillTraining';
import {birthPotentialRank} from './traitRanks';

describe('rare mastery remains distinct from innate potential',()=>{
  it('makes mastery sharply harder as skill improves',()=>{
    expect(trainedSkillGain(20,1,79)).toBeGreaterThan(
      trainedSkillGain(70,1,79)*4);
    expect(trainedSkillGain(95,1,79)).toBeLessThan(.01);
    expect(trainedSkillGain(100,1,79)).toBe(0);
    expect(trainedSkillGain(50,1,79)).toBeGreaterThan(
      trainedSkillGain(50,1,245));
    expect(trainedSkillGain(50,0,79)).toBe(0);
  });
  it('uses proficiency titles rather than legendary birth-rank letters',()=>{
    expect(trainingTitle(0)).toBe('Novice');
    expect(trainingTitle(70)).toBe('Expert');
    expect(trainingTitle(99)).toBe('Grandmaster');
    const genes={vigor:1,curiosity:1,fertility:1,social:1};
    expect(birthPotentialRank(514,1,genes)).toBeDefined();
  });
});
