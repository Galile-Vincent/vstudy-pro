import { documentFormats } from '../../shared/document-formats';
import { resources } from '../../shared/i18n';
import { providerIdSchema } from '../../shared/domain';
export const SUPPORTED_FILE_TYPES = [...new Set(Object.values(documentFormats))];
export const PROVIDER_KINDS = providerIdSchema.options;
export const INTERFACE_LANGUAGES = Object.keys(resources).filter(language => language !== 'en-XA');
export const facts = { formats: SUPPORTED_FILE_TYPES.length, providers: PROVIDER_KINDS.length, languages: INTERFACE_LANGUAGES.length };
