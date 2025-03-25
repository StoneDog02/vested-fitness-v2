import { Link } from "@remix-run/react";
import Card from "~/components/ui/Card";

interface DashboardCardProps {
  title: string;
  linkTo?: string;
  children: React.ReactNode;
  className?: string;
}

export default function DashboardCard({
  title,
  linkTo,
  children,
  className,
}: DashboardCardProps) {
  const cardContent = (
    <Card
      title={title}
      className={`h-full ${className || ""}`}
      action={
        linkTo && (
          <Link to={linkTo} className="text-sm text-primary hover:underline">
            View all
          </Link>
        )
      }
    >
      {children}
    </Card>
  );

  if (linkTo) {
    return (
      <Link to={linkTo} className="block h-full">
        {cardContent}
      </Link>
    );
  }

  return cardContent;
}
