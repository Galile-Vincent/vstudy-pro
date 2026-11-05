/**
 * Classify authentication failures and validate credentials that remain in main.
 * Owned by main/moodle.
 * Credentials and authenticated transports stay in main; renderer results use shared schemas.
 * @packageDocumentation
 */
import { z } from 'zod';
export const tokensSchema = z.object({token:z.string().min(1).max(16384),privateToken:z.string().min(1).max(16384).optional(),userPrivateAccessKey:z.string().min(1).max(16384).optional()}).strict();
export type MoodleTokens = z.infer<typeof tokensSchema>;
export type AuthCode = 'invalidlogin'|'usernotfullysetup'|'webservices-disabled'|'requirecorrectaccess'|'sso-required'|'cancelled'|'timeout'|'callback-invalid'|'load-failed'|'blocked'|'disposed';
/** Expose an authentication category without returning credentials or raw service diagnostics. */
export class MoodleAuthError extends Error {
  constructor(readonly code: AuthCode, readonly reason?: 'malformed'|'signature-mismatch') { super(code === 'callback-invalid' ? `Invalid Moodle callback (${reason})` : `Moodle authentication ${code}`); }
}
/** Map Moodle authentication diagnostics to bounded application error categories. */
export function authError(code: string): MoodleAuthError {
  const codes: Record<string,AuthCode> = {invalidlogin:'invalidlogin',usernotfullysetup:'usernotfullysetup',enablewsdescription:'webservices-disabled',requirecorrectaccess:'requirecorrectaccess',ssorequired:'sso-required',sso_required:'sso-required',cannotcreatetoken:'sso-required',redirecterrordetected:'sso-required'};
  return new MoodleAuthError(codes[code] ?? 'invalidlogin');
}
