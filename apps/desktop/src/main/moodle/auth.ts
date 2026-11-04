import { z } from 'zod';
export const tokensSchema = z.object({token:z.string().min(1).max(16384),privateToken:z.string().min(1).max(16384).optional(),userPrivateAccessKey:z.string().min(1).max(16384).optional()}).strict();
export type MoodleTokens = z.infer<typeof tokensSchema>;
export type AuthCode = 'invalidlogin'|'usernotfullysetup'|'webservices-disabled'|'requirecorrectaccess'|'sso-required'|'cancelled';
export class MoodleAuthError extends Error {
  constructor(readonly code: AuthCode) { super(`Moodle authentication ${code}`); }
}
export function authError(code: string): MoodleAuthError {
  const codes: Record<string,AuthCode> = {invalidlogin:'invalidlogin',usernotfullysetup:'usernotfullysetup',enablewsdescription:'webservices-disabled',requirecorrectaccess:'requirecorrectaccess',ssorequired:'sso-required',sso_required:'sso-required',cannotcreatetoken:'sso-required',redirecterrordetected:'sso-required'};
  return new MoodleAuthError(codes[code] ?? 'invalidlogin');
}
