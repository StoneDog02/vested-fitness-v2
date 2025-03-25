import { Link, useLocation } from "@remix-run/react";

interface Tab {
  name: string;
  href: string;
}

interface TabLayoutProps {
  tabs: Tab[];
  children: React.ReactNode;
}

export default function TabLayout({ tabs, children }: TabLayoutProps) {
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  return (
    <div>
      <div className="border-b border-gray-light dark:border-davyGray transition-colors duration-200">
        <nav className="-mb-px flex space-x-4">
          {tabs.map((tab) => (
            <Link
              key={tab.name}
              to={tab.href}
              className={`
                whitespace-nowrap py-3 px-4 font-medium text-sm transition-colors duration-200 border-b-2
                ${
                  isActive(tab.href)
                    ? "border-primary text-primary dark:text-primary dark:border-primary"
                    : "border-transparent text-gray-dark dark:text-primary hover:text-primary hover:border-primary/50 dark:hover:text-primary dark:hover:border-primary/50"
                }
              `}
            >
              {tab.name}
            </Link>
          ))}
        </nav>
      </div>
      <div className="py-6">{children}</div>
    </div>
  );
}
