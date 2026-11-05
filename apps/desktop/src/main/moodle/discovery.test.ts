import { expect, it, vi } from 'vitest';
import { checkSite } from './discovery';
const envelope = (data: unknown) => Response.json([{error:false,data}]);
it.each([
  [{typeoflogin:1},{kind:'password'}],
  [{typeoflogin:2,identityproviders:[{name:'University ID',iconurl:'',url:'https://school.example/auth/oauth2/login.php?id=3'}]},{kind:'browser',providers:[{name:'University ID',iconurl:'',url:'https://school.example/auth/oauth2/login.php?id=3'}]}],
  [{maintenanceenabled:1},{kind:'unavailable',reason:'maintenance'}],
  [{enablewebservices:0},{kind:'unavailable',reason:'webservices-disabled'}],
  [{enablemobilewebservice:0},{kind:'unavailable',reason:'mobile-disabled'}],
  [{version:'2017111300'},{kind:'unavailable',reason:'unsupported-version'}],
])('discovers a recorded public config %j',async (config,expected) => {
  const request = vi.fn<typeof fetch>(async () => envelope({wwwroot:'https://school.example/moodle',sitename:'Example University',...config}));
  const result = await checkSite('school.example/moodle',request);
  expect({siteUrl:result.siteUrl,siteName:result.siteName,authPlan:result.authPlan}).toEqual({siteUrl:'https://school.example/moodle',siteName:'Example University',authPlan:expected});
  expect(request.mock.calls[0]?.[1]?.body).toBe('[{"index":0,"methodname":"tool_mobile_get_public_config","args":{}}]');
});
it('retries codingerror using GET without credentials',async () => {
  const request = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json([{error:true,exception:{errorcode:'codingerror'}}])).mockResolvedValueOnce(envelope({sitename:'School'}));
  expect((await checkSite('school.example',request)).authPlan).toEqual({kind:'password'});
  expect(request.mock.calls[1]?.[1]?.method).toBe('GET');
  expect(new URL(String(request.mock.calls[1]?.[0])).searchParams.get('args')).toBe('[{"index":0,"methodname":"tool_mobile_get_public_config","args":{}}]');
});
it('detects redirects that discard POST and retries GET',async () => {
  const request = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(null,{status:302,headers:{location:'/moodle/lib/ajax/service-nologin.php'}})).mockResolvedValueOnce(envelope({sitename:'School'}));
  expect((await checkSite('school.example/moodle',request)).siteName).toBe('School');
  expect(request.mock.calls[1]?.[1]?.method).toBe('GET');
});
it('toggles www once after failure',async () => {
  const request = vi.fn<typeof fetch>().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(envelope({sitename:'School'}));
  expect((await checkSite('school.example',request)).siteUrl).toBe('https://www.school.example');
  expect(request.mock.calls.map(call => new URL(String(call[0])).hostname)).toEqual(['school.example','www.school.example']);
});
it('rejects cross-origin redirects and unrelated canonical roots',async () => {
  await expect(checkSite('school.example',async () => new Response(null,{status:302,headers:{location:'https://evil.example'}}))).rejects.toThrow('outside site root');
  await expect(checkSite('school.example',async () => envelope({wwwroot:'https://evil.example'}))).rejects.toThrow('confirmation');
  await expect(checkSite('school.ac.uk',async () => envelope({wwwroot:'https://evil.ac.uk'}))).rejects.toThrow('confirmation');
});

it.each(['{moodlemobile://token=CANARY',JSON.stringify([{error:false,data:{sitename:1,typeoflogin:'moodlemobile://token=CANARY'}}])])('sanitizes discovery parse failures',async body => {
  await expect(checkSite('https://school.example',async () => new Response(body))).rejects.toEqual(new Error('Moodle discovery failed'));
});

it.each([
  [{typeoflogin:3},{kind:'embedded',providers:[]}],
  [{typeoflogin:99},{kind:'unavailable',reason:'unsupported-login'}],
  [{showloginform:0},{kind:'browser',providers:[]}],
])('handles the remaining login modes without guessing a password flow %j',async (config,expected) => {
  expect((await checkSite('school.example',async () => envelope(config))).authPlan).toEqual(expected);
});
it('retains optional branding, registration, QR, maintenance, and forced-scheme metadata',async () => {
  const config={sitename:'Campus',logourl:'https://school.example/logo.png',compactlogourl:'https://school.example/compact.png',country:'JP',registerauth:'email',tool_mobile_qrcodetype:2,maintenanceenabled:1,maintenancemessage:'Planned maintenance',forcedurlscheme:'campus-app'};
  expect((await checkSite('school.example',async () => envelope(config))).config).toMatchObject(config);
});
it('preserves alternate identity providers alongside the normal password form',async () => {
  const providers=[{name:'Campus ID',iconurl:'',url:'https://school.example/auth/oauth2/login.php?id=3'}];
  expect((await checkSite('school.example',async () => envelope({typeoflogin:1,identityproviders:providers}))).authPlan).toEqual({kind:'password',providers});
});
