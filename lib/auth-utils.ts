import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { UserRole, getAllowedDeviceIds } from "@/lib/auth-config";

/**
 * Get current user session with role information
 */
export async function getSessionWithRole() {
  const session = await getServerSession(authOptions);
  
  if (!session || !session.user) {
    return null;
  }

  const role = (session.user as any).role as UserRole | undefined;
  const clientId = (session.user as any).clientId as string | undefined;

  return {
    ...session,
    role: role || "client",
    clientId,
  };
}

/**
 * Filter device list based on user role
 */
export function filterDevicesByRole<T extends { device_id: string }>(
  devices: T[],
  role: UserRole,
  clientId?: string
): T[] {
  const allowedDeviceIds = getAllowedDeviceIds(role, clientId);

  // Super admin sees all devices
  if (allowedDeviceIds === null) {
    return devices;
  }

  // Clients see only their assigned devices
  return devices.filter((device) => allowedDeviceIds.includes(device.device_id));
}

