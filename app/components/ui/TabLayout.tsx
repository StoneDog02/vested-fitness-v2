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
    <div className="h-full flex flex-col">
      <div className="hidden sm:block border-b border-gray-light dark:border-davyGray transition-colors duration-200">
        <nav className="overflow-x-auto -mb-px flex space-x-4">
          {tabs.map((tab) => (
            <Link
              key={tab.name}
              to={tab.href}
              className={`
                whitespace-nowrap py-3 px-4 font-medium text-sm transition-colors duration-200 border-b-2
                ${
                  isActive(tab.href)
                    ? "border-primary text-primary dark:text-primary dark:border-primary"
                    : "border-transparent text-gray-dark dark:text-primary hover:text-primary hover:border-primary/50 dark:hover:text-primary dark:hover:border-primary/50 hover:!text-primary"
                }
              `}
            >
              {tab.name}
            </Link>
          ))}
        </nav>
      </div>
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
