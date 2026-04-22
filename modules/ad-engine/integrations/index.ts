import type { AdPlatform } from "../types";
import type { PlatformAdapter } from "./types";
import { metaAdapter } from "./meta";
import { snapchatAdapter } from "./snapchat";

export function getAdapter(platform: AdPlatform): PlatformAdapter {
  return platform === "meta" ? metaAdapter : snapchatAdapter;
}

export { metaAdapter, snapchatAdapter };
export type { PlatformAdapter, PlatformCampaignInit, PlatformInsights } from "./types";
