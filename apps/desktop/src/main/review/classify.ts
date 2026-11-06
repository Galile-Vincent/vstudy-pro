/** Deterministic signal precedence; model suggestions are data, never remote calls. @packageDocumentation */
import { containsAlias } from './concept-match';
export const AUTO_FILE_CONFIDENCE = 0.8;
export const TENTATIVE_CONFIDENCE = 0.5;
export interface ClassificationInput {
  courses:readonly {id:string;title:string;aliases:readonly string[]}[];
  text:string;
  scopeCourseId?:string|null;
  documentCourseIds?:readonly string[];
  manualOverride?:{courseId:string|null};
  modelSuggestion?:{courseId:string|null;confidence:number};
}
export interface Classification {courseId:string|null;method:'scope'|'document'|'alias'|'model'|'manual'|null;confidence:number;confirmed:boolean;eligibleForMastery:boolean}
export function classify(input:ClassificationInput):Classification {
  const valid = (id:string|null|undefined):id is string => !!id && input.courses.some(row=>row.id===id);
  const result = (courseId:string|null,method:Classification['method'],confidence:number):Classification =>
    ({courseId,method,confidence,confirmed:confidence>=AUTO_FILE_CONFIDENCE,eligibleForMastery:courseId!==null && confidence>=AUTO_FILE_CONFIDENCE});
  const unsorted = () => result(null,null,0);
  if (input.manualOverride) return input.manualOverride.courseId===null ? result(null,'manual',1) : valid(input.manualOverride.courseId) ? result(input.manualOverride.courseId,'manual',1) : unsorted();
  if (valid(input.scopeCourseId)) return result(input.scopeCourseId,'scope',1);
  const documents = [...new Set(input.documentCourseIds?.filter(valid) ?? [])];
  if (documents.length===1) return result(documents[0]!,'document',1);
  const aliases = input.courses.filter(course=>[course.title,...course.aliases].some(alias=>containsAlias(input.text,alias)));
  if (aliases.length===1) return result(aliases[0]!.id,'alias',0.85);
  const model = input.modelSuggestion;
  if (model && valid(model.courseId) && Number.isFinite(model.confidence) && model.confidence>=TENTATIVE_CONFIDENCE && model.confidence<=1) return result(model.courseId,'model',model.confidence);
  return unsorted();
}
