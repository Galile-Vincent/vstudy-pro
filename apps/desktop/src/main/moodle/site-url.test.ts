/**
 * Regression coverage for moodle site-url.
 * Owned by main/moodle.
 * Tests own their fixtures and cleanup; live prerequisites must remain explicit.
 * @packageDocumentation
 */
import { expect, it, vi } from 'vitest';
import { normalizeSiteUrl, publicAddress, resolvePublicHost, siteFetch } from './site-url';
it('normalizes domains, IDNs, and Moodle subdirectory login links',() => {
  expect(normalizeSiteUrl(' school.example/moodle/login/index.php?x=1#top ')).toBe('https://school.example/moodle');
  expect(normalizeSiteUrl('school.example:443/moodle/index.php/')).toBe('https://school.example/moodle');
  expect(normalizeSiteUrl('https://学校.example/moodle/')).toBe('https://xn--48s290a.example/moodle');
});
it.each(['http://school.example','https://user:pass@school.example','https://school.example:444','https://127.1','https://[::1]','https://2130706433','https://localhost'])('rejects unsafe input %s',input => {
  expect(() => normalizeSiteUrl(input)).toThrow('Unsafe Moodle');
});
it.each(['0.0.0.0','10.0.0.1','100.64.0.1','127.0.0.1','169.254.1.1','172.16.0.1','192.168.1.1','198.18.0.1','224.0.0.1','255.255.255.255','::','::1','::ffff:127.0.0.1','fc00::1','fe80::1','ff02::1','2001:db8::1','2002:7f00:1::'])('blocks nonpublic address %s',address => expect(publicAddress(address)).toBe(false));
it('accepts public IPv4 and IPv6',() => {
  expect(publicAddress('8.8.8.8')).toBe(true);
  expect(publicAddress('2606:4700:4700::1111')).toBe(true);
});
it('checks every DNS answer and rejects a rebound answer',async () => {
  const resolver = vi.fn().mockResolvedValueOnce([{address:'8.8.8.8',family:4}]).mockResolvedValueOnce([{address:'::1',family:6}]);
  expect(await resolvePublicHost('school.example',resolver)).toEqual([{address:'8.8.8.8',family:4}]);
  await expect(resolvePublicHost('school.example',resolver)).rejects.toThrow('Unsafe Moodle host');
});
it('never sends a token outside the validated site root',async () => {
  const transport = vi.fn<typeof fetch>(async () => Response.json({ok:true}));
  const request = siteFetch('https://school.example/moodle',transport);
  expect(() => request('https://other.example/webservice/rest/server.php',{body:'wstoken=secret'})).toThrow('outside site root');
  expect(() => request('https://school.example/pluginfile.php/1')).toThrow('outside site root');
  expect(await (await request('https://school.example/moodle/webservice/rest/server.php')).json()).toEqual({ok:true});
});

it('filters mixed DNS answers to public connection addresses',async () => {
  const resolver = async () => ['100.64.0.1','fc00::1','198.18.0.1','169.254.169.254','8.8.8.8','2606:4700:4700::1111'].map(address => ({address,family:address.includes(':')?6:4}));
  expect(await resolvePublicHost('school.example',resolver)).toEqual([{address:'8.8.8.8',family:4},{address:'2606:4700:4700::1111',family:6}]);
  await expect(resolvePublicHost('school.example',async () => [])).rejects.toThrow('Unsafe Moodle host');
});
