import pg from "pg";
import type { ActualPost, SocialNetwork } from "../../shared/types";
import { assertRuntimeConfig, config, OFFICIAL_PROFILE_RULES } from "../config";
import { normalizeDescription, normalizeProfile } from "../matching/normalize";

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 5 });

function profileGroup(profile: string): string {
  const normalized = normalizeProfile(profile);
  for (const [group, rules] of Object.entries(OFFICIAL_PROFILE_RULES)) {
    if (rules.some((rule) => rule.test(normalized))) return group;
  }
  return "";
}

function normalizeNetwork(value: string): SocialNetwork {
  const network = normalizeProfile(value);
  if (["facebook", "instagram", "tiktok", "youtube"].includes(network)) return network as SocialNetwork;
  if (["twitter", "x"].includes(network)) return "twitter";
  return "otro";
}

function normalizeCampaign(value: unknown) {
  const campaign = String(value ?? "").trim();
  if (!campaign || normalizeProfile(campaign) === "sin campana") return "Sin temática publicada";
  return campaign;
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item ?? "").trim()).filter(Boolean);
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((item) => String(item ?? "").trim()).filter(Boolean) : [];
  } catch {
    return [value.trim()];
  }
}

export interface DatabaseLoadResult {
  posts: ActualPost[];
  maxPublishedAt: string | null;
  emptyDescriptions: number;
  duplicatePostIds: number;
  deletedPosts: number;
}

export async function loadActualPosts(dateFrom: string, dateTo: string): Promise<DatabaseLoadResult> {
  assertRuntimeConfig();
  const query = `
    SELECT
      id::text,
      post_id,
      profile_id::text,
      profile_name,
      network,
      type,
      to_char(publish_at, 'YYYY-MM-DD') AS actual_date,
      to_char(publish_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS published_at,
      status,
      coalesce(message, '') AS message,
      coalesce(published_link, '') AS published_link,
      coalesce(images, '[]'::jsonb) AS images,
      coalesce(videos, '[]'::jsonb) AS videos,
      coalesce(topics, '') AS topics,
      coalesce(impressions, 0)::int AS impressions,
      coalesce(likes, 0)::int AS likes,
      coalesce(comments, 0)::int AS comments,
      coalesce(shares, 0)::int AS shares,
      coalesce(engagement, coalesce(likes, 0) + coalesce(comments, 0) + coalesce(shares, 0), 0)::int AS engagement,
      deleted_at IS NOT NULL AS deleted
    FROM ${config.databaseTable}
    WHERE publish_at >= $1::date
      AND publish_at < ($2::date + interval '1 day')
    ORDER BY publish_at, id
  `;
  const result = await pool.query(query, [dateFrom, dateTo]);
  const allRows = result.rows as Array<Record<string, unknown>>;
  const posts = allRows.flatMap((row): ActualPost[] => {
    const profile = String(row.profile_name ?? "").trim();
    const group = profileGroup(profile);
    const description = String(row.message ?? "");
    return [{
      id: `db-${row.id}`,
      postId: String(row.post_id ?? ""),
      profileId: String(row.profile_id ?? ""),
      actualDate: String(row.actual_date ?? ""),
      publishedAt: String(row.published_at ?? ""),
      description,
      normalizedDescription: normalizeDescription(description),
      network: normalizeNetwork(String(row.network ?? "")),
      profile,
      profileGroup: group,
      campaign: normalizeCampaign(row.topics),
      url: String(row.published_link ?? ""),
      mediaType: String(row.type ?? ""),
      mediaUrls: [...new Set([...stringList(row.images), ...stringList(row.videos)])],
      deleted: Boolean(row.deleted),
      status: String(row.status ?? ""),
      reach: Number(row.impressions ?? 0),
      engagement: Number(row.engagement ?? 0),
      likes: Number(row.likes ?? 0),
      comments: Number(row.comments ?? 0),
      shares: Number(row.shares ?? 0),
    }];
  });
  const postIdCounts = new Map<string, number>();
  for (const post of posts) postIdCounts.set(post.postId, (postIdCounts.get(post.postId) ?? 0) + 1);
  return {
    posts,
    maxPublishedAt: posts.length ? posts.reduce((max, post) => post.publishedAt > max ? post.publishedAt : max, posts[0].publishedAt) : null,
    emptyDescriptions: posts.filter((post) => !post.normalizedDescription).length,
    duplicatePostIds: [...postIdCounts.values()].filter((count) => count > 1).reduce((sum, count) => sum + count, 0),
    deletedPosts: posts.filter((post) => post.deleted).length,
  };
}

export async function closeDatabase() {
  await pool.end();
}
