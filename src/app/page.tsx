import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import DoctorDashboard from "@/components/dashboard/DoctorDashboard";
import CoachDashboard from "@/components/dashboard/CoachDashboard";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (user.role === "coach") {
    return <CoachDashboard />;
  }

  return <DoctorDashboard />;
}
