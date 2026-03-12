/**
 * Central config for the mobile app.
 *
 * AGENT_API_URL must point to your machine's local IP (not localhost / 127.0.0.1)
 * when testing on a real device or Android emulator, because those can't reach
 * the host machine via localhost.
 *
 * How to find your local IP:
 *   macOS: System Settings > Wi-Fi > Details, or `ifconfig | grep "inet "`
 *   Linux: `ip addr show` or `hostname -I`
 *
 * Example: "http://192.168.1.42:3001"
 *
 * For iOS simulator you can use "http://localhost:3001".
 */
export const AGENT_API_URL =
  process.env.EXPO_PUBLIC_AGENT_API_URL ??
  "https://token-server-tawny.vercel.app";

export const DEPARTMENTS = [
  {
    id: "MUNICIPAL" as const,
    label: "Municipal Services",
    description: "Potholes, garbage collection, streetlights",
    iconName: "office-building-cog-outline" as const, // MaterialCommunityIcons
    color: "#10B981", // Emerald Green for civic/municipal services
  },
  {
    id: "WATER" as const,
    label: "Water Supply",
    description: "Water outages, pipe leaks, billing",
    iconName: "water-pump" as const,
    color: "#3B82F6", // Deep blue
  },
  {
    id: "ELECTRICITY" as const,
    label: "Electricity",
    description: "Power outages, billing, meter faults",
    iconName: "transmission-tower" as const,
    color: "#F59E0B", // Amber/yellow
  },
] as const;

export type DepartmentId = (typeof DEPARTMENTS)[number]["id"];
