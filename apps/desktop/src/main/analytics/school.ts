const analyticsSchools = [
  {id:'cycu',name:'Chung Yuan Christian University',host:'https://ilearning.cycu.edu.tw'},
  {id:'ucl',name:'University College London',host:'https://moodle.ucl.ac.uk'},
  {id:'warwick',name:'University of Warwick',host:'https://moodle.warwick.ac.uk'},
  {id:'unsw',name:'UNSW Sydney',host:'https://moodle.telt.unsw.edu.au'},
] as const;

export function resolveSchool(verifiedSiteUrl:string) {
  const school=analyticsSchools.find(school=>school.host === verifiedSiteUrl);
  return school ? {id:school.id,name:school.name} : null;
}
