import type { SurveyAnswerValue, SurveyQuestion } from "@/lib/types";

export interface FieldProps {
  question: SurveyQuestion;
  value: SurveyAnswerValue;
  onChange: (value: SurveyAnswerValue) => void;
}
