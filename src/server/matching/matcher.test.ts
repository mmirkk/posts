import { describe, expect, it } from "vitest";
import type { ActualPost, PlannedPost } from "../../shared/types.js";
import { normalizeDescription } from "./normalize.js";
import { matchPosts } from "./matcher.js";

const plan = (id: string, description: string, date = "2026-06-10"): PlannedPost => ({
  id,
  sourceRow: Number(id.replace(/\D/g, "")) || 1,
  plannedDate: date,
  title: "Prueba",
  description,
  normalizedDescription: normalizeDescription(description),
  network: "instagram",
  networkLabel: "Meta Manuel",
  accountGroup: "manuel",
  account: "Manuel Passaglia",
  campaign: "Sin campaña",
  assetLink: "",
  publishedLinkHint: "",
  official: true,
  incomplete: false,
});

const actual = (id: string, description: string, date = "2026-06-10"): ActualPost => ({
  id,
  postId: id,
  profileId: "profile-1",
  actualDate: date,
  publishedAt: `${date}T12:00:00`,
  description,
  normalizedDescription: normalizeDescription(description),
  network: "instagram",
  profile: "Manuel Passaglia",
  profileGroup: "manuel",
  campaign: "Educación",
  url: `https://instagram.com/p/${id}`,
  mediaType: "VIDEO",
  mediaUrls: [],
  deleted: false,
  status: "PUBLISHED",
  reach: 100,
  engagement: 15,
  likes: 10,
  comments: 3,
  shares: 2,
});

describe("emparejamiento uno a uno", () => {
  it("no reutiliza una publicación real para dos filas planificadas duplicadas", () => {
    const records = matchPosts([plan("p1", "El mismo texto"), plan("p2", "El mismo texto")], [actual("a1", "El mismo texto")], { from: "2026-06-01", to: "2026-06-30" });
    expect(records.filter((record) => record.actualId === "a1")).toHaveLength(0);
    expect(records.filter((record) => record.status === "coincidencia_dudosa")).toHaveLength(2);
  });

  it("clasifica una coincidencia exacta demorada", () => {
    const [record] = matchPosts([plan("p1", "Texto oficial")], [actual("a1", "Texto oficial", "2026-06-12")], { from: "2026-06-01", to: "2026-06-30" });
    expect(record.matchType).toBe("exacta");
    expect(record.status).toBe("demorada");
    expect(record.dayDifference).toBe(2);
  });

  it("distingue una modificación secundaria", () => {
    const [record] = matchPosts([plan("p1", "Una ciudad que avanza")], [actual("a1", "Una ciudad que avanza 🇦🇷 #Hechos")], { from: "2026-06-01", to: "2026-06-30" });
    expect(record.matchType).toBe("aproximada");
    expect(record.status).toBe("modificada");
  });

  it("asocia siempre un video que conserva una frase inicial larga y distintiva del copy", () => {
    const plannedCopy = "Las apuestas online están golpeando el futuro de nuestros pibes y es urgente ponerle un freno 🛑\n\nEl descontrol de las apuestas online y las estafas virtuales entraron a las aulas y están destruyendo la economía de miles de familias. Los datos son alarmantes: 1 de cada 5 chicos ya apostó al menos una vez y el 20% de ellos terminó endeudado.";
    const publishedCopy = "Las apuestas online están golpeando el futuro de nuestros pibes y es urgente ponerle un freno 🛑";
    const record = matchPosts([plan("p1", plannedCopy)], [actual("a1", publishedCopy)], { from: "2026-06-01", to: "2026-06-30" })
      .find((item) => item.plannedId === "p1");
    expect(record?.actualId).toBe("a1");
    expect(record?.matchType).toBe("aproximada");
    expect(record?.similarity).toBeGreaterThanOrEqual(0.9);
    expect(record?.manualReview).toBe(false);
    expect(record?.observations.join(" ")).toContain("inicio distintivo");
  });

  it("asocia el mismo inicio distintivo aunque el post agregue un cierre y hashtags", () => {
    const plannedCopy = "Las apuestas online están golpeando el futuro de nuestros pibes y es urgente ponerle un freno. El descontrol de las apuestas online y las estafas virtuales entraron a las aulas y están destruyendo la economía de miles de familias.";
    const publishedCopy = "Las apuestas online están golpeando el futuro de nuestros pibes y es urgente ponerle un freno. Disponible en YouTube. #EducaciónFinanciera";
    const record = matchPosts([plan("p1", plannedCopy)], [actual("a1", publishedCopy)], { from: "2026-06-01", to: "2026-06-30" })
      .find((item) => item.plannedId === "p1");
    expect(record?.actualId).toBe("a1");
    expect(record?.matchType).toBe("aproximada");
    expect(record?.manualReview).toBe(false);
  });

  it("asocia una descripción breve que es exactamente la primera frase del copy", () => {
    const plannedCopy = "¿La plata de la salud no alcanza? 🏥❌Argentina gasta en su sistema sanitario lo mismo que la mayoría de los países de Europa, pero la realidad diaria en las guardias y obras sociales demuestra un colapso absoluto.";
    const publishedCopy = "¿La plata de la salud no alcanza? 🏥❌";
    const youtubePlan = {
      ...plan("p1", plannedCopy, "2026-07-13"),
      network: "youtube" as const,
      accountGroup: "hermanos",
      account: "Hermanos Passaglia",
    };
    const youtubePost = {
      ...actual("a1", publishedCopy, "2026-07-14"),
      network: "youtube" as const,
      profile: "Hermanos Passaglia",
      profileGroup: "hermanos",
      url: "https://www.youtube.com/watch?v=_def1BQmySU",
    };
    const record = matchPosts([youtubePlan], [youtubePost], { from: "2026-07-13", to: "2026-07-19" })
      .find((item) => item.plannedId === "p1");
    expect(record?.actualId).toBe("a1");
    expect(record?.matchType).toBe("aproximada");
    expect(record?.similarity).toBeGreaterThanOrEqual(0.95);
    expect(record?.manualReview).toBe(false);
  });

  it("elige automáticamente el copy exacto con fecha más cercana aunque exista un duplicado", () => {
    const records = matchPosts(
      [plan("p1", "El mismo copy", "2026-07-13")],
      [actual("a1", "El mismo copy", "2026-07-13"), actual("a2", "El mismo copy", "2026-07-15")],
      { from: "2026-07-13", to: "2026-07-19" },
    );
    const matched = records.find((record) => record.plannedId === "p1");
    expect(matched?.actualId).toBe("a1");
    expect(matched?.matchType).toBe("exacta");
    expect(matched?.status).not.toBe("coincidencia_dudosa");
  });

  it("usa el enlace publicado como coincidencia directa aunque falte el copy", () => {
    const planned = { ...plan("p1", ""), normalizedDescription: "", incomplete: true, publishedLinkHint: "https://instagram.com/p/a1?utm_source=sheet" };
    const [record] = matchPosts([planned], [actual("a1", "Copy publicado")], { from: "2026-06-01", to: "2026-06-30" });
    expect(record.matchType).toBe("por_url");
    expect(record.actualId).toBe("a1");
    expect(record.observations.join(" ")).toContain("enlace publicado");
  });

  it("prioriza un enlace exacto de la misma red aunque la cuenta del Sheet difiera", () => {
    const planned = {
      ...plan("p1", "", "2026-07-13"),
      normalizedDescription: "",
      incomplete: true,
      network: "youtube" as const,
      accountGroup: "manuel",
      account: "Manuel Passaglia",
      title: "EL curro de las licencias",
      publishedLinkHint: "YT: https://www.youtube.com/shorts/2_YonbFmfMs",
    };
    const published = {
      ...actual("a1", "EL NUEVO CURRO DE LAS LICENCIAS PROFESIONALES", "2026-07-13"),
      network: "youtube" as const,
      profile: "Hermanos Passaglia",
      profileGroup: "hermanos",
      url: "https://www.youtube.com/watch?v=2_YonbFmfMs",
    };
    const record = matchPosts([planned], [published], { from: "2026-07-13", to: "2026-07-19" })
      .find((item) => item.plannedId === "p1");
    expect(record?.actualId).toBe("a1");
    expect(record?.matchType).toBe("por_url");
    expect(record?.manualReview).toBe(false);
    expect(record?.observations.join(" ")).toContain("cuenta informada en el Sheet");
  });

  it("mantiene el dueño de cuenta correcto cuando dos planes comparten el mismo enlace", () => {
    const base = {
      ...plan("p1", "", "2026-07-13"),
      sourceRow: 300,
      normalizedDescription: "",
      incomplete: true,
      title: "Contenido oficial",
      publishedLinkHint: "https://instagram.com/reel/ABC123",
    };
    const correct = { ...base, id: "p1", accountGroup: "manuel", account: "Manuel Passaglia" };
    const wrongAccount = { ...base, id: "p2", accountGroup: "hermanos", account: "Hermanos Passaglia" };
    const published = { ...actual("a1", "Contenido oficial completo", "2026-07-13"), url: "https://instagram.com/reels/ABC123" };
    const records = matchPosts([correct, wrongAccount], [published], { from: "2026-07-13", to: "2026-07-19" });
    expect(records.find((item) => item.plannedId === "p1")?.actualId).toBe("a1");
    expect(records.find((item) => item.plannedId === "p2")?.status).toBe("no_publicada");
    expect(records.filter((item) => item.status === "coincidencia_dudosa")).toHaveLength(0);
  });

  it("no reutiliza un enlace de una red para otro destino de la misma fila", () => {
    const planned = { ...plan("p1", ""), network: "facebook" as const, normalizedDescription: "", incomplete: true, publishedLinkHint: "https://instagram.com/p/a1" };
    const records = matchPosts([planned], [actual("a1", "Copy publicado")], { from: "2026-06-01", to: "2026-06-30" });
    expect(records.find((record) => record.plannedId === "p1")?.actualId).toBeNull();
  });

  it("usa el copy del post encontrado por enlace para buscar los otros destinos de la misma fila", () => {
    const instagramPlan = {
      ...plan("p1", "", "2026-07-13"),
      sourceRow: 200,
      normalizedDescription: "",
      incomplete: true,
      publishedLinkHint: "https://instagram.com/p/enlazado",
    };
    const facebookPlan = {
      ...instagramPlan,
      id: "p2",
      network: "facebook" as const,
      publishedLinkHint: "",
    };
    const instagramPost = { ...actual("a1", "Copy recuperado desde el enlace", "2026-07-13"), url: "https://instagram.com/p/enlazado" };
    const facebookPost = { ...actual("a2", "Copy recuperado desde el enlace", "2026-07-13"), network: "facebook" as const, url: "https://facebook.com/post/a2" };
    const records = matchPosts([instagramPlan, facebookPlan], [instagramPost, facebookPost], { from: "2026-07-13", to: "2026-07-19" });
    expect(records.find((record) => record.plannedId === "p1")?.actualId).toBe("a1");
    expect(records.find((record) => record.plannedId === "p2")?.actualId).toBe("a2");
    expect(records.find((record) => record.plannedId === "p2")?.observations.join(" ")).toContain("enlace informado");
  });

  it("marca como dudoso un mismo enlace compatible informado en dos planes", () => {
    const linkedPlan = (id: string) => ({ ...plan(id, ""), normalizedDescription: "", incomplete: true, publishedLinkHint: "https://instagram.com/p/a1" });
    const records = matchPosts([linkedPlan("p1"), linkedPlan("p2")], [actual("a1", "Copy publicado")], { from: "2026-06-01", to: "2026-06-30" });
    expect(records.filter((record) => record.status === "coincidencia_dudosa")).toHaveLength(2);
    expect(records.filter((record) => record.actualId === "a1")).toHaveLength(0);
  });

  it("no propone como dudoso un copy idÃ©ntico de otra red", () => {
    const youtubePlan = { ...plan("p1", "El mismo mensaje"), network: "youtube" as const, accountGroup: "hermanos", account: "Hermanos Passaglia" };
    const tiktokActual = { ...actual("a1", "El mismo mensaje"), network: "tiktok" as const };
    const records = matchPosts([youtubePlan], [tiktokActual], { from: "2026-06-01", to: "2026-06-30" });
    const plannedRecord = records.find((record) => record.plannedId === "p1");
    expect(plannedRecord?.status).toBe("no_publicada");
    expect(plannedRecord?.actualDescription).toBe("");
    expect(plannedRecord?.network).toBe("youtube");
    expect(plannedRecord?.account).toBe("Hermanos Passaglia");
  });

  it("asocia por inclusión del título cuando falta el copy y coinciden destino y fecha cercana", () => {
    const planned = {
      ...plan("p196", "", "2026-06-19"),
      title: "Fóbico a la gestión",
      normalizedDescription: "",
      incomplete: true,
      network: "youtube" as const,
      accountGroup: "hermanos",
      account: "Hermanos Passaglia",
    };
    const published = {
      ...actual("a2065", "Kicillof es un fóbico a la gestión", "2026-06-20"),
      network: "youtube" as const,
      profile: "Hermanos Passaglia",
      profileGroup: "hermanos",
      url: "https://www.youtube.com/watch?v=zFcTjvo_2bA",
    };
    const records = matchPosts([planned], [published], { from: "2026-06-15", to: "2026-06-21" });
    const matched = records.find((record) => record.plannedId === "p196");
    expect(matched?.matchType).toBe("por_titulo");
    expect(matched?.actualId).toBe("a2065");
    expect(matched?.dayDifference).toBe(1);
    expect(matched?.observations.join(" ")).toContain("título");
  });

  it("no usa títulos demasiado cortos o genéricos como coincidencia automática", () => {
    const planned = { ...plan("p1", ""), title: "IOMA", normalizedDescription: "", incomplete: true };
    const records = matchPosts([planned], [actual("a1", "IOMA anunció cambios importantes")], { from: "2026-06-01", to: "2026-06-30" });
    expect(records.find((record) => record.plannedId === "p1")?.actualId).toBeNull();
  });

  it("compara el título aunque exista un copy planificado diferente", () => {
    const planned = {
      ...plan("p165", "Este es un copy original completamente diferente", "2026-06-02"),
      title: "Propiedad Privada",
      network: "youtube" as const,
      accountGroup: "hermanos",
      account: "Hermanos Passaglia",
    };
    const published = {
      ...actual("a2693", "¿PROPIEDAD PRIVADA PARA MOLESTAR?", "2026-06-03"),
      network: "youtube" as const,
      profile: "Hermanos Passaglia",
      profileGroup: "hermanos",
    };
    const record = matchPosts([planned], [published], { from: "2026-06-01", to: "2026-06-07" }).find((item) => item.plannedId === "p165");
    expect(record?.matchType).toBe("por_titulo");
    expect(record?.status).toBe("modificada");
    expect(record?.actualId).toBe("a2693");
    expect(record?.observations.join(" ")).toContain("Copy planificado");
  });

  it("reconoce títulos similares aunque cambie el orden de las palabras", () => {
    const planned = { ...plan("p1", ""), title: "Hospitales sin recursos", normalizedDescription: "", incomplete: true };
    const published = actual("a1", "Sin recursos en los hospitales");
    const record = matchPosts([planned], [published], { from: "2026-06-01", to: "2026-06-30" }).find((item) => item.plannedId === "p1");
    expect(record?.matchType).toBe("por_titulo");
    expect(record?.actualId).toBe("a1");
    expect(record?.similarity).toBeGreaterThan(0.7);
  });

  it("reconoce títulos ampliados con palabras insertadas", () => {
    const planned = {
      ...plan("p1", "", "2026-07-13"),
      title: "EL curro de las licencias",
      normalizedDescription: "",
      incomplete: true,
      network: "youtube" as const,
      accountGroup: "hermanos",
      account: "Hermanos Passaglia",
    };
    const published = {
      ...actual("a1", "EL NUEVO CURRO DE LAS LICENCIAS PROFESIONALES", "2026-07-13"),
      network: "youtube" as const,
      profile: "Hermanos Passaglia",
      profileGroup: "hermanos",
    };
    const record = matchPosts([planned], [published], { from: "2026-07-13", to: "2026-07-19" })
      .find((item) => item.plannedId === "p1");
    expect(record?.actualId).toBe("a1");
    expect(record?.matchType).toBe("por_titulo");
    expect(record?.similarity).toBeGreaterThan(0.7);
  });

  it("reconoce por palabras significativas un título muy ampliado", () => {
    const planned = {
      ...plan("p1", "", "2026-07-13"),
      title: "Curro licencias profesionales",
      normalizedDescription: "",
      incomplete: true,
      network: "youtube" as const,
      accountGroup: "hermanos",
      account: "Hermanos Passaglia",
    };
    const published = {
      ...actual("a1", "El nuevo y millonario curro provincial alrededor de todas las licencias para conductores profesionales obligatorias", "2026-07-13"),
      network: "youtube" as const,
      profile: "Hermanos Passaglia",
      profileGroup: "hermanos",
    };
    const record = matchPosts([planned], [published], { from: "2026-07-13", to: "2026-07-19" })
      .find((item) => item.plannedId === "p1");
    expect(record?.actualId).toBe("a1");
    expect(record?.matchType).toBe("por_titulo");
    expect(record?.similarity).toBeGreaterThanOrEqual(0.9);
  });

  it("considera no publicado un destino aunque el contenido exista en otra red", () => {
    const youtubePlan = {
      ...plan("p230", "", "2026-07-06"),
      title: "Jueguitos Manuel",
      normalizedDescription: "",
      incomplete: true,
      network: "youtube" as const,
      accountGroup: "hermanos",
      account: "Hermanos Passaglia",
      publishedLinkHint: "https://www.youtube.com/shorts/a29Fk9vBBBk",
    };
    const instagramPlan = {
      ...plan("p232", "", "2026-07-07"),
      title: "Jueguitos en el Estadio",
      normalizedDescription: "",
      incomplete: true,
      network: "instagram" as const,
      accountGroup: "hermanos",
      account: "Hermanos Passaglia",
    };
    const published = {
      ...actual("a4296", "JUEGUITOS EN EL ESTADIO", "2026-07-06"),
      network: "youtube" as const,
      profile: "Hermanos Passaglia",
      profileGroup: "hermanos",
      url: "https://www.youtube.com/watch?v=a29Fk9vBBBk",
    };
    const records = matchPosts([youtubePlan, instagramPlan], [published], { from: "2026-07-06", to: "2026-07-12" });
    expect(records.filter((record) => record.actualId === "a4296")).toHaveLength(1);
    const instagram = records.find((record) => record.plannedId === "p232");
    expect(instagram?.status).toBe("no_publicada");
    expect(instagram?.matchType).toBe("sin_coincidencia");
    expect(instagram?.actualId).toBeNull();
    expect(instagram?.network).toBe("instagram");
    expect(instagram?.postUrl).toBe("");
  });

  it("no traslada a otra red un título distintivo aunque exista allí", () => {
    const instagramPlan = {
      ...plan("p301", "", "2026-07-15"),
      title: "Nos copiamos de Paredes.",
      normalizedDescription: "",
      incomplete: true,
      network: "instagram" as const,
      accountGroup: "manuel",
      account: "Manuel Passaglia",
    };
    const youtubePlan = {
      ...instagramPlan,
      id: "p302",
      network: "youtube" as const,
      accountGroup: "hermanos",
      account: "Hermanos Passaglia",
    };
    const published = {
      ...actual("a5001", "Nos copiamos de Paredes y no hablamos más #HermanosPassaglia", "2026-07-15"),
      network: "youtube" as const,
      profile: "Hermanos Passaglia",
      profileGroup: "hermanos",
    };

    const records = matchPosts([instagramPlan, youtubePlan], [published], { from: "2026-07-13", to: "2026-07-19" });
    const youtube = records.find((record) => record.plannedId === "p302");
    const instagram = records.find((record) => record.plannedId === "p301");

    expect(youtube?.matchType).toBe("por_titulo");
    expect(youtube?.actualId).toBe("a5001");
    expect(instagram?.status).toBe("no_publicada");
    expect(instagram?.matchType).toBe("sin_coincidencia");
    expect(instagram?.actualDescription).toBe("");
  });

  it("aplica una coincidencia aprobada manualmente", () => {
    const decision = { plannedId: "p1", actualId: "a1", decision: "approved" as const, updatedAt: "2026-07-17T12:00:00Z" };
    const records = matchPosts(
      [plan("p1", "Texto planeado")],
      [actual("a1", "Texto publicado con cambios importantes")],
      { from: "2026-06-01", to: "2026-06-30" },
      [decision],
    );
    const record = records.find((item) => item.plannedId === "p1");
    expect(record?.actualId).toBe("a1");
    expect(record?.manualReview).toBe(false);
    expect(record?.observations.join(" ")).toContain("revisión manual");
  });

  it("excluye un candidato rechazado y vuelve a mostrarlo como no planificado", () => {
    const decision = { plannedId: "p1", actualId: "a1", decision: "rejected" as const, updatedAt: "2026-07-17T12:00:00Z" };
    const records = matchPosts(
      [plan("p1", "Texto oficial")],
      [actual("a1", "Texto oficial")],
      { from: "2026-06-01", to: "2026-06-30" },
      [decision],
    );
    expect(records.find((item) => item.plannedId === "p1")?.actualId).toBeNull();
    expect(records.find((item) => item.actualId === "a1")?.status).toBe("no_planificada");
  });
});
