import type { SurveyQuestionConfig } from "@/lib/types";
import { videoEmbedUrl } from "@/lib/survey-media";

/** Optional image/video shown above a question's prompt — shared by the
 *  authenticated and public survey renderers. */
export function QuestionMedia({ config }: { config: SurveyQuestionConfig }) {
  if (!config.media_url) return null;

  if (config.media_type === "video") {
    const embedUrl = videoEmbedUrl(config.media_url);
    if (!embedUrl) return null;
    return (
      <div className="mb-4 aspect-video w-full overflow-hidden rounded-lg bg-black/5">
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
  return (
    <img
      src={config.media_url}
      alt=""
      className="mb-4 max-h-72 w-full rounded-lg object-cover"
    />
  );
}
