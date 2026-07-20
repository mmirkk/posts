import type { ManualReviewDecision, ManualReviewValue } from "../shared/types.js";
import { pool } from "./data/database.js";

export async function loadReviewDecisions(): Promise<ManualReviewDecision[]> {
  const result = await pool.query<{
    planned_id: string;
    actual_id: string;
    decision: ManualReviewValue;
    updated_at: string;
  }>(
    `SELECT planned_id, actual_id, decision, to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at
     FROM public.manual_review_decisions
     ORDER BY updated_at`,
  );
  return result.rows.map((row) => ({
    plannedId: row.planned_id,
    actualId: row.actual_id,
    decision: row.decision,
    updatedAt: row.updated_at,
  }));
}

export function mergeReviewDecision(current: ManualReviewDecision[], plannedId: string, actualId: string, decision: ManualReviewValue, updatedAt = new Date().toISOString()) {
  let next = current.filter((item) => {
    if (item.plannedId === plannedId && item.actualId === actualId) return false;
    if (item.plannedId === plannedId && (decision === "approved" || item.decision === "approved")) return false;
    if (decision === "approved" && item.decision === "approved" && item.actualId === actualId) return false;
    return true;
  });
  next = [...next, { plannedId, actualId, decision, updatedAt }];
  return next;
}

export async function saveReviewDecision(plannedId: string, actualId: string, decision: ManualReviewValue): Promise<ManualReviewDecision> {
  await pool.query(
    `DELETE FROM public.manual_review_decisions
     WHERE planned_id = $1
       AND (decision = 'approved' OR $3 = 'approved')`,
    [plannedId, actualId, decision],
  );

  if (decision === "approved") {
    await pool.query(
      `DELETE FROM public.manual_review_decisions
       WHERE decision = 'approved' AND actual_id = $1`,
      [actualId],
    );
  }

  await pool.query(
    `INSERT INTO public.manual_review_decisions (planned_id, actual_id, decision, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (planned_id, actual_id)
     DO UPDATE SET decision = $3, updated_at = NOW()`,
    [plannedId, actualId, decision],
  );

  return { plannedId, actualId, decision, updatedAt: new Date().toISOString() };
}
