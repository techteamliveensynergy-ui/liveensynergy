"use client";

import type { FieldProps } from "./types";
import { ChoiceField } from "./ChoiceField";
import { MultiChoiceField } from "./MultiChoiceField";
import { DropdownField } from "./DropdownField";
import { ScaleField } from "./ScaleField";
import { NumberField } from "./NumberField";
import { ShortTextField } from "./ShortTextField";
import { LongTextField } from "./LongTextField";
import { RankingField } from "./RankingField";

/** Type -> renderer dispatch, reusing the SURVEY_QUESTION_TYPES catalogue's
 *  answerShape via each field component rather than re-deriving it here. */
export function QuestionField(props: FieldProps) {
  const { question, value, onChange } = props;
  switch (question.type) {
    case "single_choice":
    case "attention_check":
    case "yes_no":
      return <ChoiceField {...props} />;
    case "multiple_choice":
      return <MultiChoiceField {...props} />;
    case "dropdown":
      return <DropdownField {...props} />;
    case "scale":
      return <ScaleField question={question} value={value} onChange={onChange} />;
    case "number":
      return <NumberField question={question} value={value} onChange={onChange} />;
    case "short_text":
      return <ShortTextField question={question} value={value} onChange={onChange} />;
    case "long_text":
      return <LongTextField question={question} value={value} onChange={onChange} />;
    case "ranking":
      return <RankingField question={question} value={value} onChange={onChange} />;
    case "hidden_field":
      // survey_form_questions never returns these — defensive only.
      return null;
    default:
      return null;
  }
}
