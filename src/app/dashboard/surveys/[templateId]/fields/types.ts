import type { SurveyAnswerValue, SurveyQuestion } from "@/lib/types";

export interface FieldProps {
  question: SurveyQuestion;
  value: SurveyAnswerValue;
  onChange: (value: SurveyAnswerValue) => void;
  /** "Other — please specify" text (FB-00029) — only used by questions that
   *  offer it; the renderer owns this state alongside the answer values. */
  otherText?: string;
  onOtherTextChange?: (text: string) => void;
}
