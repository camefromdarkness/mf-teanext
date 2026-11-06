import "server-only";
import { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

type StaffRole = Exclude<UserRole, "CUSTOMER">;

export async function getStaffUser() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true },
  });
  if (!user || user.role === UserRole.CUSTOMER) return null;
  return user as { id: string; role: StaffRole };
}

export async function authorizeStaff(allowedRoles?: StaffRole[]) {
  const staff = await getStaffUser();
  if (!staff) {
    return {
      authorized: false as const,
      response: NextResponse.json(
        { error: "Требуется вход сотрудника." },
        { status: 401 },
      ),
    };
  }
  if (allowedRoles && !allowedRoles.includes(staff.role)) {
    return {
      authorized: false as const,
      response: NextResponse.json(
        { error: "Недостаточно прав для этого действия." },
        { status: 403 },
      ),
    };
  }
  return { authorized: true as const, staff };
}

export function isStaffRole(role: UserRole): role is StaffRole {
  return role !== UserRole.CUSTOMER;
}
