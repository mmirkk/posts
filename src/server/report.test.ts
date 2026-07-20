import { describe, expect, it } from "vitest";
import type { ActualPost, PlannedPost } from "../shared/types";
import { allReportingWindow, availableReportingWeeks, buildUpcomingContent, isStoryPost, reportingWindow, selectOfficialPosts } from "./report";

describe("ventana semanal del informe", () => {
  it("para el martes incluye la semana actual con corte al día de consulta", () => {
    const window = reportingWindow(new Date("2026-07-14T15:00:00Z"));
    expect(window).toMatchObject({ from: "2026-07-13", to: "2026-07-19", dataThrough: "2026-07-14", isCurrent: true });
  });

  it("si se consulta un domingo muestra esa misma semana como en curso", () => {
    const window = reportingWindow(new Date("2026-07-19T15:00:00Z"));
    expect(window).toMatchObject({ from: "2026-07-13", to: "2026-07-19", dataThrough: "2026-07-19", isCurrent: true });
  });

  it("acepta una semana cerrada seleccionada sin superponer domingos", () => {
    expect(reportingWindow(new Date("2026-07-14T15:00:00Z"), "2026-07-05")).toMatchObject({ from: "2026-06-29", to: "2026-07-05" });
  });

  it("permite consultar toda la cobertura desde la fecha inicial configurada", () => {
    expect(allReportingWindow(new Date("2026-07-14T15:00:00Z"))).toMatchObject({ from: "2026-06-16", to: "2026-07-19", dataThrough: "2026-07-14", isAll: true });
  });

  it("identifica historias sin depender de mayúsculas o idioma", () => {
    expect(isStoryPost({ mediaType: "STORY" })).toBe(true);
    expect(isStoryPost({ mediaType: " historia " })).toBe(true);
    expect(isStoryPost({ mediaType: "VIDEO" })).toBe(false);
  });

  it("incluye la semana actual aunque esté abierta y ordena la más reciente primero", () => {
    const base = { network: "instagram", sourceRow: 2, plannedDate: "2026-07-05" } as PlannedPost;
    const weeks = availableReportingWeeks([
      base,
      { ...base, sourceRow: 3, plannedDate: "2026-07-06" },
      { ...base, sourceRow: 4, plannedDate: "2026-07-12" },
    ], new Date("2026-07-14T15:00:00Z"));
    expect(weeks.map((week) => week.value)).toEqual(["2026-07-19", "2026-07-12", "2026-07-05"]);
    expect(weeks[0]).toMatchObject({ from: "2026-07-13", to: "2026-07-19", isCurrent: true });
  });

  it("comienza en la semana que contiene el 16 de junio", () => {
    const base = { network: "instagram", sourceRow: 2 } as PlannedPost;
    const weeks = availableReportingWeeks([
      { ...base, plannedDate: "2026-06-10" },
      { ...base, sourceRow: 3, plannedDate: "2026-06-16" },
    ], new Date("2026-07-14T15:00:00Z"));
    expect(weeks.map((week) => week.value)).toEqual(["2026-07-19", "2026-06-21"]);
    expect(weeks.some((week) => week.from === "2026-06-15" && week.to === "2026-06-21")).toBe(true);
  });

  it("agrupa la planificación futura por fila sin mezclarla con semanas cerradas", () => {
    const base = { network: "instagram", account: "Cuenta", sourceRow: 2, plannedDate: "2026-07-20", title: "Próxima", description: "Copy", campaign: "Tema", publishedLinkHint: "" } as PlannedPost;
    const upcoming = buildUpcomingContent([
      base,
      { ...base, network: "facebook" },
      { ...base, sourceRow: 3, plannedDate: "2026-07-10" },
    ], new Date("2026-07-16T15:00:00Z"));
    expect(upcoming).toMatchObject({ asOf: "2026-07-16", through: "2026-07-20", plannedContents: 1, plannedTargets: 2 });
    expect(upcoming.items[0].targets).toHaveLength(2);
  });

  it("prioriza la cuenta reconocida en el post sobre una inferencia histórica", () => {
    const planned = [{
      network: "tiktok",
      accountGroup: "manuel",
      publishedLinkHint: "https://tiktok.com/@cuenta/video/123",
    } as PlannedPost];
    const actual = [{
      id: "db-1",
      profileId: "560932",
      profile: "HermanosPassaglia",
      profileGroup: "hermanos",
      network: "tiktok",
      url: "https://tiktok.com/@cuenta/video/123",
    } as ActualPost];

    const selected = selectOfficialPosts(planned, actual);
    expect(selected.posts[0]?.profileGroup).toBe("hermanos");
  });
});
