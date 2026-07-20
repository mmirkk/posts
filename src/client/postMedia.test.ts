import { describe, expect, it } from "vitest";
import { publishedFormat } from "./postMedia";

describe("formato visual de publicaciones reales", () => {
  it("prioriza historia y carrusel informados por la base", () => {
    expect(publishedFormat("STORY", "instagram", "")).toEqual({ label: "Historia", tone: "story" });
    expect(publishedFormat("CAROUSEL", "instagram", "")).toEqual({ label: "Carrusel", tone: "carousel" });
  });

  it("reconoce reels y shorts mediante el enlace publicado", () => {
    expect(publishedFormat("VIDEO", "instagram", "https://instagram.com/reel/ABC/").label).toBe("Reel");
    expect(publishedFormat("IMAGE", "youtube", "https://youtube.com/shorts/ABC").label).toBe("Short");
  });

  it("trata el tipo IMAGE de YouTube como video", () => {
    expect(publishedFormat("IMAGE", "youtube", "https://youtube.com/watch?v=ABC").label).toBe("Video");
  });
});
