import type { ReactNode } from "react";
import type { SurveyQuestionConfig } from "@/lib/types";
import { videoEmbedUrl } from "@/lib/survey-media";

function MediaBlock({ config, className }: { config: SurveyQuestionConfig; className: string }) {
  if (config.media_type === "video") {
    const embedUrl = videoEmbedUrl(config.media_url!);
    if (!embedUrl) return null;
    return (
      <div className={`aspect-video shrink-0 overflow-hidden rounded-lg bg-black/5 ${className}`}>
        <iframe
          src={embedUrl}
          className="h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          loading="lazy"
        />
      </div>
    );
  }

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={config.media_url} alt="" className={`shrink-0 rounded-lg object-cover ${className}`} />;
}

/**
 * Optional image/video attached to a question, laid out relative to
 * `children` (the question's prompt/field) per config.media_position —
 * shared by every survey renderer (single-page, stepped, admin preview) so
 * this layout logic lives in one place. Also used, with no `children`, for
 * the template-wide cover image above the whole question list.
 */
export function QuestionMedia({ config, children }: { config: SurveyQuestionConfig; children?: ReactNode }) {
  if (!config.media_url) return <>{children}</>;

  const position = config.media_position ?? "top";

  if (position === "left" || position === "right") {
    return (
      <div className={`flex flex-col gap-4 sm:flex-row ${position === "right" ? "sm:flex-row-reverse" : ""}`}>
        <MediaBlock config={config} className="max-h-72 w-full sm:max-h-none sm:w-2/5" />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    );
  }

  return (
    <>
      {position === "top" && <MediaBlock config={config} className="mb-4 max-h-72 w-full" />}
      {children}
      {position === "bottom" && <MediaBlock config={config} className="mt-4 max-h-72 w-full" />}
    </>
  );
}
