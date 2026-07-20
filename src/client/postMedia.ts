import type { ReportRecord, SocialNetwork } from "../shared/types";

export type PublishedFormatTone = "story" | "reel" | "short" | "carousel" | "video" | "image" | "post";

export interface PublishedFormat {
  label: string;
  tone: PublishedFormatTone;
}

export function publishedFormat(mediaType: string, network: SocialNetwork, postUrl: string): PublishedFormat {
  const type = mediaType.trim().toLocaleUpperCase("es");
  const url = postUrl.toLocaleLowerCase("es");
  if (type === "STORY") return { label: "Historia", tone: "story" };
  if (type === "CAROUSEL") return { label: "Carrusel", tone: "carousel" };
  if (network === "instagram" && url.includes("/reel/")) return { label: "Reel", tone: "reel" };
  if (network === "youtube" && url.includes("/shorts/")) return { label: "Short", tone: "short" };
  if (type === "VIDEO" || (network === "youtube" && type === "IMAGE")) return { label: "Video", tone: "video" };
  if (type === "IMAGE") return { label: "Imagen", tone: "image" };
  return { label: "Post", tone: "post" };
}

export function recordPublishedFormat(record: Pick<ReportRecord, "mediaType" | "network" | "postUrl">) {
  return publishedFormat(record.mediaType, record.network, record.postUrl);
}

export function isVideoAsset(url: string) {
  return /\.(mp4|webm|mov)(?:$|[?#])/i.test(url);
}
