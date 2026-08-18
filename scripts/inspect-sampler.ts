import { sampleLineages, describeLineage, PROFILE_SPACE, newJobSeed } from '../src/core/studio/sampler.js';

const res = sampleLineages({ jobSeed: newJobSeed(), count: 8, risk: 'studio' });
console.log('PROFILE_SPACE =', PROFILE_SPACE);
console.log('jobSeed =', res.jobSeed);
res.lineages.forEach((l, i) => {
  console.log(i + ':', describeLineage(l));
});
