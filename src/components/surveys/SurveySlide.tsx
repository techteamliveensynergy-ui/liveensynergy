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
 *
 * Default look (client, 27 Nov): with no cover media but the brand's logo, the
 * logo sits in a circle on the left, a thin separation line follows, and the
 * message, age/UK-resident tick and Terms & Privacy sit on the right. On a
 * phone the circle goes on top with a horizontal line under it.
 */
export function SurveySlide({
  mediaUrl,
  mediaType,
  videoFormat,
  logoUrl,
  logoName,
  style,
  className = "",
  children,
}: {
  mediaUrl?: string | null;
  mediaType?: SurveyMediaType | null;
  videoFormat?: SurveyVideoFormat | null;
  /** The brand's logo/profile image — the default left-hand picture when there's no cover media. */
  logoUrl?: string | null;
  logoName?: string | null;
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

  const showBrand = !hasMedia && Boolean(logoUrl);

  return (
    <div
      className={`card survey-card flex flex-col sm:aspect-video sm:flex-row ${className}`}
      style={style}
    >
      {showBrand && (
        <>
          <div className="flex shrink-0 items-center justify-center px-6 pb-2 pt-8 sm:w-[34%] sm:px-8 sm:py-10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoUrl!}
              alt={logoName ? `${logoName} logo` : "Brand logo"}
              className="h-32 w-32 rounded-full border border-black/10 bg-white object-cover shadow-sm sm:h-44 sm:w-44"
            />
          </div>
          <div aria-hidden className="mx-8 h-px bg-black/15 sm:mx-0 sm:my-10 sm:h-auto sm:w-px" />
        </>
      )}
      {hasMedia && (
        <div className={`w-full ${sideColumnClass(config)}`}>
          <MediaBox config={config} side />
        </div>
      )}
      <div
        className={`flex min-w-0 flex-1 flex-col justify-center p-6 sm:p-10 ${showBrand ? "text-left" : "text-center"}`}
      >
        <div className="mx-auto w-full max-w-xl space-y-4">{children}</div>
      </div>
    </div>
  );
}
