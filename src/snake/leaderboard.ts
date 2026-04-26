export interface LeaderboardEntry {
  name: string;
  score: number;
  created_at: string;
}

const SUPABASE_URL = "https://volktyvzmjrwfpfirgxd.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZvbGt0eXZ6bWpyd2ZwZmlyZ3hkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxODUzMDMsImV4cCI6MjA5Mjc2MTMwM30.Pbvz9jlNsnqys89BaF62-YudI9HepdljcCkHA7X0U6Y";

const SCORES_ENDPOINT = `${SUPABASE_URL}/rest/v1/scores`;

function headers(extra?: HeadersInit) {
  return {
    apikey: SUPABASE_ANON_KEY,
    authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    ...extra
  };
}

export async function fetchLeaderboard() {
  const params = new URLSearchParams({
    select: "name,score,created_at",
    order: "score.desc,created_at.asc",
    limit: "5"
  });
  const response = await fetch(`${SCORES_ENDPOINT}?${params}`, {
    headers: headers()
  });

  if (!response.ok) {
    throw new Error(`Leaderboard fetch failed: ${response.status}`);
  }

  return (await response.json()) as LeaderboardEntry[];
}

export async function submitLeaderboardScore(name: string, score: number) {
  const response = await fetch(SCORES_ENDPOINT, {
    method: "POST",
    headers: headers({
      "content-type": "application/json",
      prefer: "return=minimal"
    }),
    body: JSON.stringify({ name, score })
  });

  if (!response.ok) {
    throw new Error(`Score submit failed: ${response.status}`);
  }
}
