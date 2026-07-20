import { describe, expect, it } from "vitest";
import { canonicalizeUrl, normalizeDescription, normalizeForSimilarity } from "./normalize";
import { descriptionContainmentSimilarity, descriptionSimilarity } from "./similarity";

describe("normalización de descripciones", () => {
  it("normaliza prefijos, tildes, saltos, espacios y puntuación", () => {
    expect(normalizeDescription("  Meta: ¡Más   educación!\r\nPara San Nicolás. ")).toBe("mas educacion para san nicolas");
  });

  it("estandariza una URL sin parámetros pero conserva su identidad", () => {
    expect(normalizeDescription("Ver https://Example.com/Post/1/?utm_source=x")).toMatch(/^ver urltoken[0-9a-z]+$/u);
    expect(normalizeDescription("Ver https://example.com/Post/1?otra=2")).toBe(normalizeDescription("Ver https://Example.com/Post/1/?utm_source=x"));
  });

  it("trata hashtags, enlaces y emojis como contenido secundario para similitud", () => {
    const planned = "Construimos futuro para todos";
    const actual = "Construimos futuro para todos 🇦🇷 #Hechos https://example.com/a";
    expect(normalizeForSimilarity(actual)).toBe(normalizeForSimilarity(planned));
    expect(descriptionSimilarity(planned, actual)).toBeGreaterThanOrEqual(0.95);
  });

  it("conserva el identificador de videos de YouTube y elimina parámetros de tracking", () => {
    expect(canonicalizeUrl("https://www.youtube.com/watch?v=AbC123&utm_source=x")).toBe("youtube.com/watch/AbC123");
    expect(canonicalizeUrl("https://youtu.be/AbC123?si=tracking")).toBe("youtube.com/watch/AbC123");
    expect(canonicalizeUrl("https://www.youtube.com/shorts/MqnTguLU70Q")).toBe("youtube.com/watch/MqnTguLU70Q");
    expect(canonicalizeUrl("https://www.youtube.com/watch?v=MqnTguLU70Q")).toBe("youtube.com/watch/MqnTguLU70Q");
    expect(canonicalizeUrl("https://www.youtube.com/embed/MqnTguLU70Q?start=3")).toBe("youtube.com/watch/MqnTguLU70Q");
    expect(canonicalizeUrl("https://youtube.com/watch?v=Otro456")).not.toBe(canonicalizeUrl("https://youtube.com/watch?v=AbC123"));
  });

  it("normaliza reel y reels de Instagram como la misma publicación", () => {
    expect(canonicalizeUrl("https://www.instagram.com/reels/DayU6hED2DK/?utm_source=sheet"))
      .toBe(canonicalizeUrl("https://instagram.com/reel/DayU6hED2DK/"));
  });

  it("reconoce un inicio largo del copy aunque la publicación omita el resto", () => {
    const planned = "Las apuestas online están golpeando el futuro de nuestros pibes y es urgente ponerle un freno. El descontrol de las apuestas online y las estafas virtuales entraron a las aulas y están destruyendo la economía de miles de familias.";
    const actual = "Las apuestas online están golpeando el futuro de nuestros pibes y es urgente ponerle un freno.";
    expect(descriptionSimilarity(planned, actual)).toBeLessThan(0.65);
    expect(descriptionContainmentSimilarity(planned, actual)).toBeGreaterThanOrEqual(0.95);
  });

  it("reconoce una primera frase breve pero distintiva como descripción del video", () => {
    const planned = "¿La plata de la salud no alcanza? 🏥❌Argentina gasta en su sistema sanitario lo mismo que la mayoría de los países de Europa, pero la realidad diaria demuestra un colapso absoluto.";
    const actual = "¿La plata de la salud no alcanza? 🏥❌";
    expect(descriptionContainmentSimilarity(planned, actual)).toBeGreaterThanOrEqual(0.95);
  });
});
