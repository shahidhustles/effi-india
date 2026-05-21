/**
 * Central config for the mobile app.
 *
 * AGENT_API_URL must point to your machine's local IP (not localhost / 127.0.0.1)
 * when testing on a real device or Android emulator, because those can't reach
 * the host machine via localhost.
 */
export const AGENT_API_URL =
  process.env.EXPO_PUBLIC_AGENT_API_URL ??
  "https://token-server-tawny.vercel.app";

export const COMPLAINT_CATEGORIES = [
  {
    id: "SANITATION" as const,
    label: "Sanitation",
    description: "Garbage overflow, missed pickup, waste complaints",
    iconName: "delete-outline" as const,
    color: "#10B981",
  },
  {
    id: "POTHOLE" as const,
    label: "Potholes",
    description: "Potholes, road damage, dangerous streets",
    iconName: "road-variant" as const,
    color: "#F97316",
  },
  {
    id: "POWER_OUTAGE" as const,
    label: "Power Outage",
    description: "No power, cuts, transformer issues",
    iconName: "transmission-tower" as const,
    color: "#F59E0B",
  },
] as const;

export type ComplaintCategoryId =
  (typeof COMPLAINT_CATEGORIES)[number]["id"];
