/** Build a fixture composition root around the real app IPC and services, with no production test backdoor. */
import { join } from 'node:path';
export function mcpAppSource(input) {
  return `
import {app,BrowserWindow,session,safeStorage} from 'electron';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {mkdirSync,writeFileSync} from 'node:fs';
import {openStore} from ${JSON.stringify(join(input.desktop,'src/main/db/index.ts'))};
import {registerIpc} from ${JSON.stringify(join(input.desktop,'src/main/ipc/index.ts'))};
import {MoodleRepository} from ${JSON.stringify(join(input.desktop,'src/main/moodle/repository.ts'))};
import {emptyCourseIdentity} from ${JSON.stringify(join(input.desktop,'src/shared/moodle-course.ts'))};
import {createSecretStore,moodleSecretId} from ${JSON.stringify(join(input.desktop,'src/main/services/secrets.ts'))};
import {isAppUrl,productionCsp} from ${JSON.stringify(join(input.desktop,'src/main/security.ts'))};
const input=${JSON.stringify(input)};
process.umask(0o077);app.enableSandbox();app.setPath('userData',input.userData);
app.whenReady().then(async()=>{
  const store=openStore(join(input.userData,'vstudy.sqlite'));
  store.settings.set({...store.settings.get(),language:'en',welcomeSeen:true,onboardingCompleted:true});
  const repo=new MoodleRepository(store.db);
  const account={id:input.accountId,siteUrl:input.school,siteName:'Fixture University',remoteUserId:42,displayName:'Test Student',status:'connected',syncedAt:new Date().toISOString()};
  repo.saveAccount(account);
  repo.saveAccount({...account,id:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',siteUrl:'https://other.example.edu',siteName:'Other University',remoteUserId:43});
  repo.saveCapabilities(account.id,{functions:input.functions,release:'5.0',version:'2025041400',advancedfeatures:[],mobileConfig:{}});
  if(!repo.overview(account.id).courses.length){
    const course={id:input.courseId,accountId:account.id,remoteId:4,fullName:'Distributed systems',shortName:'CS4',imageUrl:null,progress:null,startAt:null,endAt:null,favourite:false,identity:{...emptyCourseIdentity('Distributed systems'),lifecycle:'current'}};
    const base={descriptionHtml:'<p>Read the course notes.</p>',accessible:true,completion:'incomplete',dueAt:null,submitted:null,fileIds:[]};
    const modules=[
      {...base,id:input.pageId,cmid:3,kind:'page',modname:'page',name:'Reading page',url:input.school+'/mod/page/view.php?id=3',fileIds:[input.fileId]},
      {...base,id:input.quizId,cmid:4,kind:'quiz',modname:'quiz',name:'Week 1 quiz',url:input.school+'/mod/quiz/view.php?id=4'},
      {...base,id:input.assignId,cmid:5,kind:'assign',modname:'assign',name:'Student reflection',url:input.school+'/mod/assign/view.php?id=5'},
    ];
    const file={id:input.fileId,courseId:course.id,section:'Week 1',module:'Reading page',name:'notes.md',mime:'text/markdown',size:100,modifiedAt:null,documentId:null};
    repo.apply(account.id,{courses:[course],deadlines:[],notifications:[],grades:[],files:[{url:input.school+'/pluginfile.php/notes.md?token='+input.token,value:file}]});
    repo.saveDetail(course.id,{sections:[{id:'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb',number:0,name:'Week 1',summaryHtml:'<p>Welcome</p>',accessible:true,current:true,weekStart:null,modules}],announcements:[{id:'cccccccc-cccc-4ccc-accc-cccccccccccc',subject:'Teacher update',author:'Professor Example',createdAt:new Date().toISOString(),bodyHtml:'<p>'+input.malicious+'</p><script>steal()</script>',url:input.school+'/forum'}]});
    const directory=join(input.userData,'library','a'.repeat(64));mkdirSync(directory,{recursive:true,mode:0o700});
    const text=('# Course notes\\n\\n'+input.malicious+'\\n').repeat(160);
    writeFileSync(join(directory,'source.md'),text);writeFileSync(join(directory,'content.md'),text);
    const document=store.documents.insert({id:'dddddddd-dddd-4ddd-addd-dddddddddddd',title:'Course notes',sourceName:'notes.md',sourceHash:'a'.repeat(64),sourcePath:join(directory,'source.md'),mime:'text/markdown',converter:'markitdown',markdownPath:join(directory,'content.md'),status:'ready',createdAt:new Date().toISOString()});
    repo.linkFile(file.id,document.id,{modifiedAt:null,size:100});
  }
  const secrets=createSecretStore(join(input.userData,'secrets.json'),safeStorage);
  secrets.useInSession(moodleSecretId(account.id),JSON.stringify({token:input.token,privateToken:input.privateToken}));
  const entry=pathToFileURL(join(input.desktop,'out/renderer/index.html')).href;
  const window=new BrowserWindow({width:1280,height:940,webPreferences:{preload:join(input.desktop,'out/preload/index.js'),sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,webviewTag:false}});
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  window.webContents.on('will-navigate',(event,url)=>{if(!isAppUrl(url,entry))event.preventDefault();});
  session.defaultSession.setPermissionRequestHandler((_contents,_permission,reply)=>reply(false));
  session.defaultSession.webRequest.onHeadersReceived((details,reply)=>reply({responseHeaders:{...details.responseHeaders,'Content-Security-Policy':[productionCsp]}}));
  const request=async(url,options)=>{
    if(!String(url).startsWith(input.school+'/'))throw Error('Unexpected fixture school');
    return fetch(String(url).replace(input.school,input.fixtureUrl),options);
  };
  const dispose=registerIpc(store,secrets,event=>event.sender===window.webContents && event.senderFrame===window.webContents.mainFrame && isAppUrl(event.senderFrame.url,entry),()=>{window.show();window.focus();},{moodleRequest:request,mcpPaths:{peerHelper:input.peerHelper,serverBin:input.serverBin}});
  globalThis.mcpFixture={store};
  let quitting=false;
  app.on('before-quit',event=>{if(quitting)return;event.preventDefault();void dispose().then(()=>{store.close();quitting=true;app.quit();});});
  await window.loadURL(entry);
}).catch(error=>{console.error(error);app.exit(1);});
`;
}
