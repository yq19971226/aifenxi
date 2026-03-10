import { useQuery } from "@tanstack/react-query";
import { useFeatureFlags } from "./useFeatureFlags";

const API = process.env.NEXT_PUBLIC_API_URL || "";

interface OnlineStats {
  enabled: boolean;
  count: number;
}

async function fetchOnlineStats(): Promise<OnlineStats> {
  try {
    const res = await fetch(`${API}/api/stats/online`);
    if (!res.ok) return { enabled: false, count: 0 };
    return res.json();
  } catch {
    return { enabled: false, count: 0 };
  }
}

export function useOnlineCount() {
  const { flags } = useFeatureFlags();
  const enabled = flags.online_count === "active";

  const { data } = useQuery({
    queryKey: ["online-stats"],
    queryFn: fetchOnlineStats,
    refetchInterval: 30_000,
    enabled,
  });

  return {
    count: data?.count ?? 0,
    enabled: enabled && (data?.enabled ?? false),
  };
}
