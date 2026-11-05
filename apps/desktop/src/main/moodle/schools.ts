/**
 * Search the bundled school directory and normalize public recent-site hints.
 * Owned by main/moodle.
 * Credentials and authenticated transports stay in main; renderer results use shared schemas.
 * @packageDocumentation
 */
/** Bundled school hints. Listing and searching this directory never make network requests. */
import { moodleSchoolSchema } from '../../shared/moodle';

/** Login hints are informational. Live public configuration always decides authentication. */
export const schools = moodleSchoolSchema.array().parse([
  {id:'cycu',name:'Chung Yuan Christian University',localizedNames:{'zh-Hant':'中原大學',ja:'中原大学',en:'Chung Yuan Christian University CYCU'},country:'TW',host:'https://ilearning.cycu.edu.tw',login:'sso-launch',logoUrl:null,notes:'iLearning. Use the university account.'},
  {id:'ucl',name:'University College London',localizedNames:{'zh-Hant':'倫敦大學學院',ja:'ユニバーシティ・カレッジ・ロンドン'},country:'GB',host:'https://moodle.ucl.ac.uk',login:'discover',logoUrl:null,notes:'UCL Moodle. Availability depends on the mobile service configuration.'},
  {id:'warwick',name:'University of Warwick',localizedNames:{'zh-Hant':'華威大學',ja:'ウォーリック大学'},country:'GB',host:'https://moodle.warwick.ac.uk',login:'discover',logoUrl:null,notes:'Warwick currently documents that the Moodle app is unavailable. Check the live site for administrator guidance.'},
  {id:'unsw',name:'UNSW Sydney',localizedNames:{'zh-Hant':'新南威爾斯大學',ja:'ニューサウスウェールズ大学'},country:'AU',host:'https://moodle.telt.unsw.edu.au',login:'discover',logoUrl:null,notes:'UNSW does not support the Moodle mobile app. Check the live site for administrator guidance.'},
]);
