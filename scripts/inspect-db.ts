import "dotenv/config";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

try {
  const profile = await pool.query(`
    SELECT
      COUNT(*)::int AS rows,
      COUNT(*) FILTER (WHERE upper(trim(coalesce(type, ''))) = 'OFICIAL')::int AS official_rows,
      COUNT(*) FILTER (WHERE message IS NULL OR trim(message) = '')::int AS empty_messages,
      COUNT(*) FILTER (WHERE publish_at IS NULL)::int AS empty_dates,
      COUNT(*) FILTER (WHERE published_link IS NULL OR trim(published_link) = '')::int AS empty_urls,
      MIN(publish_at) AS first_publish_at,
      MAX(publish_at) AS last_publish_at,
      COUNT(DISTINCT post_id)::int AS distinct_post_ids
    FROM public.vs_posts_detalle
  `);
  const dimensions = await pool.query(`
    SELECT 'type' AS dimension, coalesce(type, '(null)') AS value, COUNT(*)::int AS rows
    FROM public.vs_posts_detalle GROUP BY type
    UNION ALL
    SELECT 'network', coalesce(network, '(null)'), COUNT(*)::int
    FROM public.vs_posts_detalle GROUP BY network
    UNION ALL
    SELECT 'status', coalesce(status, '(null)'), COUNT(*)::int
    FROM public.vs_posts_detalle GROUP BY status
    ORDER BY dimension, rows DESC
  `);
  const officialHints = await pool.query(`
    SELECT id, post_id, profile_name, network, type, labels, topics, author_name, published_via
    FROM public.vs_posts_detalle
    WHERE to_jsonb(vs_posts_detalle)::text ILIKE '%oficial%'
    LIMIT 20
  `);
  const profiles = await pool.query(`
    SELECT profile_name, network, COUNT(*)::int AS rows
    FROM public.vs_posts_detalle
    GROUP BY profile_name, network
    ORDER BY rows DESC
    LIMIT 30
  `);
  console.log(JSON.stringify({ profile: profile.rows[0], dimensions: dimensions.rows, officialHints: officialHints.rows, profiles: profiles.rows }, null, 2));
} finally {
  await pool.end();
}
