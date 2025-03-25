import { json } from "@remix-run/node";
import { Outlet, useLoaderData } from "@remix-run/react";
import DashboardLayout from "~/components/layout/DashboardLayout";

type LoaderData = {
  role: "coach" | "client";
};

export const loader = async () => {
  // In a real app, we would fetch this from an API/database or auth session
  return json<LoaderData>({
    role: "client",
  });
};

export default function Dashboard() {
  const { role } = useLoaderData<LoaderData>();

  return (
    <DashboardLayout userRole={role}>
      <Outlet />
    </DashboardLayout>
  );
}
