import type { CSSProperties, ReactNode } from "react";
import { MediaBox, sideColumnClass } from "@/components/surveys/QuestionMedia";
import { videoEmbedUrl } from "@/lib/survey-media";
import type { SurveyMediaType, SurveyQuestionConfig, SurveyVideoFormat } from "@/lib/types";

/**
 * A presentation-slide-shaped card (16:9 from a tablet up) for the welcome
 * and thank-you screens — 13 Oct client notes: "PPT size cards for welcome
 * and thank you message". With media, the image/video fills the left half
 * edge to edge and the copy sits centred on the right; without, the copy is
 * centred on the slide. On a phone it's a normal stacked card (a 16:9 box
 * would be ~200px tall). Grows past 16:9 rather than clipping when the copy
 * is long — see .survey-card's overflow: clip in globals.css.
 */
export function SurveySlide({
  mediaUrl,
  mediaType,
  videoFormat,
  style,
  className = "",
  children,
}: {
  mediaUrl?: string | null;
  mediaType?: SurveyMediaType | null;
  videoFormat?: SurveyVideoFormat | null;
  style?: CSSProperties;
  className?: string;
  children: ReactNode;
}) {
  const type = mediaType ?? "image";
  const hasMedia = Boolean(mediaUrl) && (type !== "video" || Boolean(videoEmbedUrl(mediaUrl!)));
  const config: SurveyQuestionConfig = {
    media_url: mediaUrl ?? undefined,
    media_type: type,
    video_format: videoFormat ?? undefined,
  };

  return (
    <div
      className={`card survey-card flex flex-col sm:aspect-video sm:flex-row ${className}`}
      style={style}
    >
      {hasMedia && (
        <div className={`w-full ${sideColumnClass(config)}`}>
          <MediaBox config={config} side />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col justify-center p-6 text-center sm:p-10">
        <div className="mx-auto w-full max-w-xl space-y-4">{children}</div>
      </div>
    </div>
  );
}
