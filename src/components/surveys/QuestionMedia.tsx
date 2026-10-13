import type { ReactNode } from "react";
import type { SurveyMediaType, SurveyQuestionConfig, SurveyVideoFormat } from "@/lib/types";
import { videoEmbedUrl, videoFormatFor } from "@/lib/survey-media";

/** Inner padding of a question card's text column. The card itself has none,
 *  so media can run edge to edge (13 Oct client notes: "images, videos to
 *  cover the border areas"). */
export const CARD_BODY_PADDING = "p-6 sm:p-10";

function Player({ src }: { src: string }) {
  return (
    <iframe
      src={src}
      className="h-full w-full"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen
      loading="lazy"
    />
  );
}

/**
 * A video sized by its shape. Landscape fills the width at 16:9; portrait
 * (reel/short) is a 9:16 player on a black band that fills the rest of the
 * width, capped by the viewport height so a phone never needs to scroll past
 * it to reach the answers.
 */
function VideoBox({ url, format, side }: { url: string; format: SurveyVideoFormat; side: boolean }) {
  const embedUrl = videoEmbedUrl(url);
  if (!embedUrl) return null;
  if (format === "portrait") {
    return (
      <div className={`flex items-center justify-center bg-black ${side ? "sm:h-full" : ""}`}>
        <div className="aspect-[9/16] h-[min(70vh,36rem)] max-w-full">
          <Player src={embedUrl} />
        </div>
      </div>
    );
  }
  return (
    <div className={`flex items-center bg-black ${side ? "sm:h-full" : ""}`}>
      <div className="aspect-video w-full">
        <Player src={embedUrl} />
      </div>
    </div>
  );
}

function ImageBox({ url, fit, side }: { url: string; fit: "cover" | "contain"; side: boolean }) {
  // A fixed-shape box (2:1 above/below, full card height at the side) so an
  // image at RECOMMENDED_IMAGE_SIZES is shown uncropped and anything else is
  // cropped predictably — never stretched.
  return (
    <div className={`relative w-full ${side ? "aspect-[2/1] sm:aspect-auto sm:h-full sm:min-h-[26rem]" : "aspect-[2/1]"}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt=""
        className={`absolute inset-0 h-full w-full ${fit === "contain" ? "object-contain" : "object-cover"}`}
      />
    </div>
  );
}

export function MediaBox({ config, side }: { config: SurveyQuestionConfig; side: boolean }) {
  if (!config.media_url) return null;
  if (config.media_type === "video") {
    return <VideoBox url={config.media_url} format={videoFormatFor(config.media_url, config.video_format)} side={side} />;
  }
  return <ImageBox url={config.media_url} fit={config.media_fit ?? "cover"} side={side} />;
}

/** Width of the media column for a left/right placement — wider for a
 *  landscape video so it isn't a postage stamp, natural width for a reel. */
export function sideColumnClass(config: SurveyQuestionConfig): string {
  if (config.media_type === "video") {
    return videoFormatFor(config.media_url, config.video_format) === "portrait" ? "sm:w-auto sm:shrink-0" : "sm:w-3/5";
  }
  return "sm:w-1/2";
}

/**
 * Optional image/video attached to a question, laid out relative to
 * `children` (the prompt + answer) per config.media_position. Renders inside
 * a padding-free card: the media runs to the card's edges and only the text
 * column gets CARD_BODY_PADDING. Shared by every survey renderer via
 * SurveyQuestionCard.
 */
export function QuestionMedia({ config, children }: { config: SurveyQuestionConfig; children: ReactNode }) {
  const body = <div className={CARD_BODY_PADDING}>{children}</div>;
  const position = config.media_position ?? "top";

  // "background" is drawn by the caller (SteppedQuestions, as a backdrop on
  // the step's own wrapper) — nothing inline here.
  if (!config.media_url || position === "background") return body;
  if (config.media_type === "video" && !videoEmbedUrl(config.media_url)) return body;

  if (position === "left" || position === "right") {
    return (
      <div className={`flex flex-col sm:flex-row sm:items-stretch ${position === "right" ? "sm:flex-row-reverse" : ""}`}>
        <div className={`w-full ${sideColumnClass(config)}`}>
          <MediaBox config={config} side />
        </div>
        <div className={`min-w-0 flex-1 self-center ${CARD_BODY_PADDING}`}>{children}</div>
      </div>
    );
  }

  return (
    <>
      {position === "top" && <MediaBox config={config} side={false} />}
      {body}
      {position === "bottom" && <MediaBox config={config} side={false} />}
    </>
  );
}

/**
 * The single-page survey's template-wide cover image/video, shown once above
 * the questions — a rounded, edge-to-edge block of its own.
 */
export function CoverMedia({
  url,
  type,
  videoFormat,
}: {
  url: string | null | undefined;
  type: SurveyMediaType | null | undefined;
  videoFormat?: SurveyVideoFormat | null;
}) {
  if (!url) return null;
  const mediaType = type ?? "image";
  if (mediaType === "video" && !videoEmbedUrl(url)) return null;
  return (
    <div className="overflow-hidden rounded-2xl">
      <MediaBox config={{ media_url: url, media_type: mediaType, video_format: videoFormat ?? undefined }} side={false} />
    </div>
  );
}
