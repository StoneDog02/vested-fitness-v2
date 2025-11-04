import { useParams } from "@remix-run/react";
import TabLayout from "~/components/ui/TabLayout";

interface Tab {
  name: string;
  href: string;
}

export default function ClientDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { clientId } = useParams();

  const tabs: Tab[] = [
    {
      name: "Overview",
      href: `/dashboard/clients/${clientId}`,
    },
    {
      name: "Meals",
      href: `/dashboard/clients/${clientId}/meals`,
    },
    {
      name: "Workouts",
      href: `/dashboard/clients/${clientId}/workouts`,
    },
    {
      name: "Supplements",
      href: `/dashboard/clients/${clientId}/supplements`,
    },
    {
      name: "Subscription",
      href: `/dashboard/clients/${clientId}/subscription`,
    },
    {
      name: "Chat",
      href: `/dashboard/clients/${clientId}/chat`,
    },
  ];

  return (
    <div className="h-full flex flex-col">
      <TabLayout tabs={tabs}>{children}</TabLayout>
    </div>
  );
}
