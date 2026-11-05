/** Adversarial navigation cases for the untrusted Moodle browser boundary. */
import { describe, expect, it } from 'vitest';
import { webviewPolicy, webviewNavigation, webviewResource, webviewLoginPage, webviewPermission, webviewFile, publicWebviewUrl, webviewLoadError } from './webview-policy';
import { moodleWebviewContract } from '../../shared/moodle-webview';

const policy = webviewPolicy('https://school.example/campus',{ssoOrigins:['https://sso.example'],cdnOrigins:['https://cdn.example']});
describe('Moodle navigation policy',() => {
  it.each([
    ['/campus/course/view.php?id=4','internal'],
    ['https://SCHOOL.example:443/campus/mod/page/view.php?id=2','internal'],
    ['mod/page/view.php?id=2','internal'],
    ['https://sso.example/login','internal'],
    ['https://cdn.example/file','external'],
    ['https://example.com/page','external'],
    ['https://school.example.evil/campus','external'],
    ['https://school.example/campus-other','blocked'],
    ['https://school.example/campus/../secret','blocked'],
    ['https://school.example/other','blocked'],
    ['http://school.example/campus','blocked'],
    ['https://user:password@school.example/campus','blocked'],
    ['https://school.example./campus','blocked'],
    ['https://school.example\\@evil.example/campus','blocked'],
    ['https://school.example/campus\n/secret','blocked'],
    ['javascript:alert(1)','blocked'],['data:text/html,test','blocked'],
    ['file:///etc/passwd','blocked'],['vstudymoodle://token=test','blocked'],
    ['mailto:student@school.example','blocked'],['about:blank','blocked'],
    ['https://school.example/campus/admin/tool/mobile/autologin.php?key=test','blocked'],
    ['https://school.example/campus/admin/tool/mobile/launch.php','blocked'],
    ['https://school.example/campus/webservice/rest/server.php','blocked'],
    ['https://school.example/campus/page?ws%74oken=secret','blocked'],
    ['https://school.example/campus/page?TOKEN=secret','blocked'],
    ['https://school.example/campus/page?privatetoken=secret','blocked'],
    ['https://school.example/campus/page?key=secret','blocked'],
    ['https://school.example/campus/page?passport=secret','blocked'],
    ['https://school.example/campus/page?id=3&sesskey=valid','internal'],
  ])('%s is %s',(url,result) => expect(webviewNavigation(url,policy)).toBe(result));
  it.each([
    ['https://school.example/campus/theme.css',true],['https://cdn.example/theme.css',true],
    ['https://sso.example/style.css',true],['https://unknown.example/pixel',false],
    ['file:///tmp/a',false],['http://school.example/campus/a',false],
    ['https://school.example/campus/img?token=secret',false],
  ])('resource %s allowed = %s',(url,allowed) => expect(webviewResource(url,policy)).toBe(allowed));
  it.each(['camera','microphone','geolocation','notifications','clipboard-read','clipboard-sanitized-write','fullscreen','media','display-capture','unknown'])('denies %s',permission => expect(webviewPermission(permission)).toBe(false));
  it('pins schemes, ports, exact hosts and explicit loopback fixtures',() => {
    expect(() => webviewPolicy('http://127.0.0.1:1234')).toThrow();
    expect(() => webviewPolicy('https://school.example',{ssoOrigins:['https://127.0.0.1']})).toThrow();
    const local = webviewPolicy('http://127.0.0.1:1234',{loopback:true});
    expect(webviewNavigation('http://127.0.0.1:1234/course',local)).toBe('internal');
    expect(webviewNavigation('http://127.0.0.1:5678/course',local)).toBe('blocked');
    expect(webviewNavigation('https://school.example:8443/campus',policy)).toBe('external');
  });
  it('recognizes login only for the school installation',() => {
    expect(webviewLoginPage('https://school.example/campus/login/index.php?test=1',policy)).toBe(true);
    expect(webviewLoginPage('https://sso.example/login/index.php',policy)).toBe(false);
    expect(webviewLoginPage('https://school.example/login/index.php',policy)).toBe(false);
    expect(webviewLoginPage('https://school.example/campus/login/logout.php',policy)).toBe(true);
  });
  it('routes only school pluginfiles to the importer',() => {
    expect(webviewFile('https://school.example/campus/pluginfile.php/2/file.pdf',policy)).toBe(true);
    expect(webviewFile('https://school.example/campus/webservice/pluginfile.php?file=%2F2%2Ffile.pdf',policy)).toBe(true);
    expect(webviewFile('https://sso.example/pluginfile.php/2/file.pdf',policy)).toBe(false);
    expect(webviewFile('https://school.example/other/pluginfile.php/2/file.pdf',policy)).toBe(false);
  });
  it('redacts credentials, callback data and nested targets from copy/display URLs',() => {
    expect(publicWebviewUrl('https://name:pass@school.example/campus/view.php?id=3&token=CANARY&sesskey=CANARY&redirect=https%3A%2F%2Fx%3Ftoken%3DCANARY#CANARY')).toBe('https://school.example/campus/view.php?id=3');
    expect(publicWebviewUrl('file:///tmp/test')).toBe('');
  });
  it.each([[-202,'certificate'],[-200,'certificate'],[-106,'offline'],[-105,'offline'],[-118,'timeout'],[-2,'load-failed']])('classifies Chromium error %s',(code,result) => expect(webviewLoadError(Number(code))).toBe(result));
  it('rejects credentials, unknown commands, CSS injection, and invalid geometry at IPC',() => {
    const id = '11111111-1111-4111-a111-111111111111';
    expect(moodleWebviewContract['moodle:webview-open'].request.safeParse({accountId:id,target:{kind:'page',url:'https://school.example/campus'},token:'secret'}).success).toBe(false);
    expect(moodleWebviewContract['moodle:webview-action'].request.safeParse({id,action:'executeJavaScript'}).success).toBe(false);
    const layout = {id,bounds:{x:0,y:50,width:800,height:600},visible:true,theme:{dark:true,background:'#101010',foreground:'#ffffff',accent:'#aaaaee'}};
    expect(moodleWebviewContract['moodle:webview-layout'].request.safeParse(layout).success).toBe(true);
    expect(moodleWebviewContract['moodle:webview-layout'].request.safeParse({...layout,theme:{...layout.theme,background:'red;url(https://evil.example)'}}).success).toBe(false);
    expect(moodleWebviewContract['moodle:webview-layout'].request.safeParse({...layout,bounds:{...layout.bounds,x:-1}}).success).toBe(false);
  });
});
