import * as XLSX from "xlsx";
import type { PlannedPost, SocialNetwork } from "../../shared/types";
import { config } from "../config";
import { normalizeDescription } from "../matching/normalize";

type SheetRow = Record<string, unknown>;

interface Target {
  network: SocialNetwork;
  accountGroup: string;
  account: string;
  label: string;
}

const headerValue = (row: SheetRow, aliases: string[]) => {
  const key = Object.keys(row).find((candidate) => aliases.some((alias) => candidate.trim().toLocaleLowerCase("es") === alias));
  return key ? row[key] : "";
};

const stringValue = (value: unknown) => String(value ?? "").trim();
const isStoryFormat = (row: SheetRow) => /^(story|stories|historia|historias)$/iu.test(stringValue(headerValue(row, ["formato", "format", "tipo de contenido", "tipo de post", "formato de publicación", "formato de publicacion"])));

export function parseSheetDate(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, "0");
    const day = String(value.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  const text = stringValue(value);
  if (!text) return "";
  const match = text.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})$/u);
  if (!match) return "";
  const year = Number(match[3]) < 100 ? 2000 + Number(match[3]) : Number(match[3]);
  const month = Number(match[2]);
  const day = Number(match[1]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseTargetToken(rawToken: string): Target[] {
  const token = rawToken.toLocaleLowerCase("es").trim();
  const group = token.includes("hechos") ? "hechos" : token.includes("herman") ? "hermanos" : token === "x" ? "x" : "manuel";
  const account = group === "hechos" ? "Passaglia Hechos" : group === "hermanos" ? "Hermanos Passaglia" : "Manuel Passaglia";
  if (token === "todas") {
    return ["facebook", "instagram", "tiktok", "youtube", "twitter"].map((network) => ({ network: network as SocialNetwork, accountGroup: group, account, label: rawToken }));
  }
  if (token.includes("meta")) {
    return ["facebook", "instagram"].map((network) => ({ network: network as SocialNetwork, accountGroup: group, account, label: rawToken }));
  }
  if (token.includes("instagram") || token.startsWith("ig ")) return [{ network: "instagram", accountGroup: group, account, label: rawToken }];
  if (token.includes("facebook") || token.startsWith("fb ")) return [{ network: "facebook", accountGroup: group, account, label: rawToken }];
  if (token.includes("youtube") || token.startsWith("yt ")) return [{ network: "youtube", accountGroup: group, account, label: rawToken }];
  if (token.includes("tiktok") || token.startsWith("tt ")) return [{ network: "tiktok", accountGroup: group, account, label: rawToken }];
  if (token === "x" || token.includes("twitter")) return [{ network: "twitter", accountGroup: group, account, label: rawToken }];
  return [{ network: "otro", accountGroup: group, account, label: rawToken || "Sin red" }];
}

function targetsFromNetwork(value: unknown): Target[] {
  const raw = stringValue(value);
  if (!raw) return [{ network: "otro", accountGroup: "sin_cuenta", account: "Sin cuenta", label: "Sin red" }];
  const targets = raw.split(",").flatMap((token) => parseTargetToken(token.trim()));
  const unique = new Map<string, Target>();
  for (const target of targets) unique.set(`${target.network}:${target.accountGroup}`, target);
  return [...unique.values()];
}

export interface SheetLoadResult {
  posts: PlannedPost[];
  fetchedAt: string;
  rawRowCount: number;
  emptyDescriptions: number;
  emptyDates: number;
  duplicateKeys: number;
  hasTypeColumn: boolean;
  hasThemeColumn: boolean;
}

export async function loadPlannedPosts(): Promise<SheetLoadResult> {
  const url = `https://docs.google.com/spreadsheets/d/${config.sheetId}/export?format=xlsx`;
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`No se pudo leer el Google Sheet (${response.status})`);
  const workbook = XLSX.read(await response.arrayBuffer(), { type: "array", cellDates: true });
  const selectedName = workbook.SheetNames.includes(config.sheetName) ? config.sheetName : workbook.SheetNames[0];
  const sheet = workbook.Sheets[selectedName];
  if (!sheet) throw new Error("El Google Sheet no contiene hojas legibles");
  const rows = XLSX.utils.sheet_to_json<SheetRow>(sheet, { defval: "", raw: true });
  const headers = rows.length ? Object.keys(rows[0]).map((header) => header.trim().toLocaleLowerCase("es")) : [];
  const hasTypeColumn = headers.some((header) => ["tipo", "type", "tipo de publicación", "tipo de publicacion"].includes(header));
  const hasThemeColumn = headers.some((header) => ["campaña", "campana", "temática", "tematica", "tema"].includes(header));
  const officialRows = rows.filter((row) => {
    if (!hasTypeColumn) return true;
    return stringValue(headerValue(row, ["tipo", "type", "tipo de publicación", "tipo de publicacion"])).toLocaleUpperCase("es") === "OFICIAL";
  });
  const reportRows = officialRows.filter((row) => !isStoryFormat(row));

  const posts = officialRows.flatMap((row, rowIndex) => {
    if (isStoryFormat(row)) return [];
    const plannedDate = parseSheetDate(headerValue(row, ["fecha", "fecha planificada", "fecha de publicación", "fecha de publicacion"]));
    const description = stringValue(headerValue(row, ["copy", "descripción", "descripcion", "mensaje", "texto"]));
    const title = stringValue(headerValue(row, ["título", "titulo", "nombre"]));
    const campaign = stringValue(headerValue(row, ["campaña", "campana", "temática", "tematica", "tema"]));
    const assetLink = stringValue(headerValue(row, ["link pieza", "pieza", "asset"]));
    const targets = targetsFromNetwork(headerValue(row, ["red", "red social", "canal"]));
    return targets.map((target, targetIndex): PlannedPost => ({
      id: `sheet-${rowIndex + 2}-${target.network}-${target.accountGroup}-${targetIndex}`,
      sourceRow: rowIndex + 2,
      plannedDate,
      title: title || (!description ? assetLink : ""),
      description,
      normalizedDescription: normalizeDescription(description),
      network: target.network,
      networkLabel: target.label,
      accountGroup: target.accountGroup,
      account: target.account,
      campaign: campaign || "Sin temática planificada",
      assetLink,
      publishedLinkHint: stringValue(headerValue(row, ["link publicado", "url publicada", "url"])),
      official: true,
      incomplete: !description || !plannedDate,
    }));
  });

  const duplicateCounts = new Map<string, number>();
  for (const post of posts) {
    const key = `${post.plannedDate}|${post.network}|${post.accountGroup}|${post.normalizedDescription}`;
    duplicateCounts.set(key, (duplicateCounts.get(key) ?? 0) + 1);
  }
  return {
    posts,
    fetchedAt: new Date().toISOString(),
    rawRowCount: reportRows.length,
    emptyDescriptions: reportRows.filter((row) => !stringValue(headerValue(row, ["copy", "descripción", "descripcion", "mensaje", "texto"]))).length,
    emptyDates: reportRows.filter((row) => !parseSheetDate(headerValue(row, ["fecha", "fecha planificada", "fecha de publicación", "fecha de publicacion"]))).length,
    duplicateKeys: [...duplicateCounts.values()].filter((count) => count > 1).reduce((sum, count) => sum + count, 0),
    hasTypeColumn,
    hasThemeColumn,
  };
}
