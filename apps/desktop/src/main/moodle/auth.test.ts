import { expect, it, vi } from 'vitest';
import { passwordToken } from './client';
import { verifyCallback } from './callback';
import { createHash } from 'node:crypto';
it.each([
  ['invalidlogin','invalidlogin'],['usernotfullysetup','usernotfullysetup'],['enablewsdescription','webservices-disabled'],['requirecorrectaccess','requirecorrectaccess'],['ssorequired','sso-required'],
])('maps token endpoint error %s without exposing server text',async (errorcode,code) => {
  await expect(passwordToken('https://school.example','student','password',async () => Response.json({errorcode,error:'password secret'}))).rejects.toMatchObject({code,message:`Moodle authentication ${code}`});
});
it('retains both token endpoint secrets',async () => {
  expect(await passwordToken('https://school.example','student','password',async () => Response.json({token:'access',privatetoken:'private'}))).toEqual({token:'access',privateToken:'private'});
});
it('rejects token endpoint redirects without sending credentials again',async () => {
  const request = vi.fn<typeof fetch>(async () => new Response(null,{status:302,headers:{location:'https://evil.example'}}));
  await expect(passwordToken('https://school.example','student','password',request)).rejects.toMatchObject({kind:'network'});
  expect(request.mock.calls.map(call => String(call[0]))).toEqual(['https://school.example/login/token.php']);
});
it('retains both callback secrets for all four signature candidates',() => {
  for (const site of ['https://school.example','https://school.example/','http://school.example','http://school.example/']) {
    const signature = createHash('md5').update(site + 'passport').digest('hex');
    const callback = 'vstudymoodle://token=' + Buffer.from(`${signature}:::access:::private`).toString('base64');
    expect(verifyCallback(callback,'https://school.example','passport')).toEqual({token:'access',privateToken:'private'});
  }
});
it('verifies the advertised wwwroot and reports only the matching site',() => {
  const site = 'http://www.school.example';
  const signature = createHash('md5').update(site + 'passport').digest('hex');
  const callback = 'vstudymoodle://token=' + Buffer.from(`${signature}:::access`).toString('base64');
  const matched = vi.fn();
  expect(verifyCallback(callback,['https://school.example',site],'passport',matched)).toEqual({token:'access'});
  expect(matched).toHaveBeenCalledWith(site);
});
it('rejects malformed Unicode signatures without a timingSafeEqual length exception',() => {
  const callback = 'vstudymoodle://token=' + Buffer.from(`${'é'.repeat(32)}:::access`).toString('base64');
  expect(() => verifyCallback(callback,'https://school.example','passport')).toThrow('Invalid Moodle callback');
});
