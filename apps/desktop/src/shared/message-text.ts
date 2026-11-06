/** One text limit for incoming chat requests and persisted message parts. */
export const MAX_MESSAGE_TEXT_LENGTH = 2_000_000;
export class MessageTextLimitError extends Error {
  readonly code = 'errors.message_too_large';
  constructor() { super('errors.message_too_large');this.name='MessageTextLimitError'; }
}
export function assertMessageText(text: string): void {
  if (text.length > MAX_MESSAGE_TEXT_LENGTH) throw new MessageTextLimitError();
}
