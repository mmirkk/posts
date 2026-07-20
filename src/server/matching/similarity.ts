import type { DifferenceSummary } from "../../shared/types.js";
import { extractEmojis, extractHashtags, extractUrls, normalizeForSimilarity } from "./normalize.js";

const tokenize = (value: string) => value.match(/[\p{L}\p{N}]+/gu) ?? [];

function jaccard(a: string[], b: string[]) {
  const left = new Set(a);
  const right = new Set(b);
  if (!left.size && !right.size) return 1;
  const intersection = [...left].filter((token) => right.has(token)).length;
  return intersection / (left.size + right.size - intersection || 1);
}

function containment(a: string[], b: string[]) {
  const left = new Set(a);
  const right = new Set(b);
  if (!left.size || !right.size) return 0;
  const intersection = [...left].filter((token) => right.has(token)).length;
  return intersection / Math.min(left.size, right.size);
}

function bigrams(value: string) {
  const compact = value.replace(/\s+/gu, " ");
  if (compact.length < 2) return compact ? [compact] : [];
  return Array.from({ length: compact.length - 1 }, (_, index) => compact.slice(index, index + 2));
}

function dice(a: string, b: string) {
  const left = bigrams(a);
  const right = bigrams(b);
  if (!left.length && !right.length) return 1;
  const counts = new Map<string, number>();
  for (const pair of left) counts.set(pair, (counts.get(pair) ?? 0) + 1);
  let intersection = 0;
  for (const pair of right) {
    const count = counts.get(pair) ?? 0;
    if (count > 0) {
      intersection += 1;
      counts.set(pair, count - 1);
    }
  }
  return (2 * intersection) / (left.length + right.length || 1);
}

export function descriptionSimilarity(leftValue: string, rightValue: string): number {
  const left = normalizeForSimilarity(leftValue);
  const right = normalizeForSimilarity(rightValue);
  if (!left || !right) return 0;
  if (left === right) return 1;
  const leftTokens = tokenize(left);
  const rightTokens = tokenize(right);
  const lengthRatio = Math.min(left.length, right.length) / Math.max(left.length, right.length);
  const score = 0.42 * dice(left, right) + 0.33 * jaccard(leftTokens, rightTokens) + 0.25 * containment(leftTokens, rightTokens);
  return Math.max(0, Math.min(1, score * (0.8 + 0.2 * lengthRatio)));
}

/**
 * Detecta cuando una publicación conserva un fragmento largo y distintivo del
 * copy planificado. Es una señal separada de la similitud general porque un
 * video puede usar solamente la primera frase de un copy extenso.
 *
 * Los mínimos de longitud evitan considerar coincidencias expresiones breves o
 * genéricas que podrían repetirse entre publicaciones diferentes.
 */
export function descriptionContainmentSimilarity(leftValue: string, rightValue: string): number {
  const left = normalizeForSimilarity(leftValue);
  const right = normalizeForSimilarity(rightValue);
  if (!left || !right || left === right) return left === right && left ? 1 : 0;

  const leftTokens = tokenize(left);
  const rightTokens = tokenize(right);
  const shorterText = left.length <= right.length ? left : right;
  const shorterTokens = leftTokens.length <= rightTokens.length ? leftTokens : rightTokens;

  // Un título o descripción breve de video suele ser exactamente la primera
  // frase del copy largo. En ese caso alcanza con una frase distintiva de cinco
  // palabras, porque el matcher además exige misma red, cuenta y fecha cercana.
  const exactLeadingPhrase = left.startsWith(right) || right.startsWith(left);
  if (exactLeadingPhrase && shorterText.length >= 28 && shorterTokens.length >= 5) return 0.98;

  if (shorterText.length < 48 || shorterTokens.length < 8) return 0;

  if (left.includes(right) || right.includes(left)) return 0.98;

  const prefixLimit = Math.min(leftTokens.length, rightTokens.length);
  let commonPrefix = 0;
  while (commonPrefix < prefixLimit && leftTokens[commonPrefix] === rightTokens[commonPrefix]) commonPrefix += 1;
  const prefixCoverage = commonPrefix / Math.max(shorterTokens.length, 1);
  if (commonPrefix >= 8 && prefixCoverage >= 0.55) {
    return Math.min(0.97, 0.9 + prefixCoverage * 0.08);
  }

  return 0;
}

export function describeDifferences(planned: string, actual: string): DifferenceSummary {
  const plannedTokens = new Set(tokenize(normalizeForSimilarity(planned)));
  const actualTokens = new Set(tokenize(normalizeForSimilarity(actual)));
  const addedTokens = [...actualTokens].filter((token) => !plannedTokens.has(token)).slice(0, 12);
  const removedTokens = [...plannedTokens].filter((token) => !actualTokens.has(token)).slice(0, 12);
  const linksChanged = JSON.stringify(extractUrls(planned)) !== JSON.stringify(extractUrls(actual));
  const hashtagsChanged = JSON.stringify(extractHashtags(planned)) !== JSON.stringify(extractHashtags(actual));
  const emojisChanged = JSON.stringify(extractEmojis(planned)) !== JSON.stringify(extractEmojis(actual));
  const summary: string[] = [];
  if (addedTokens.length) summary.push(`Texto agregado: ${addedTokens.slice(0, 6).join(", ")}`);
  if (removedTokens.length) summary.push(`Texto omitido: ${removedTokens.slice(0, 6).join(", ")}`);
  if (linksChanged) summary.push("Enlaces diferentes");
  if (hashtagsChanged) summary.push("Hashtags diferentes");
  if (emojisChanged) summary.push("Emojis diferentes");
  if (!summary.length) summary.push("Cambios menores de formato");
  return { addedTokens, removedTokens, linksChanged, hashtagsChanged, emojisChanged, summary };
}
