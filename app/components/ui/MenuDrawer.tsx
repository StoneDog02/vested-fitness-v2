import { Link } from "@remix-run/react";
import { Dialog, Transition } from "@headlessui/react";
import { Fragment } from "react";

interface NavItem {
  name: string;
  path: string;
  subItems?: NavItem[];
}

interface MenuDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  navItems: NavItem[];
  isActive: (path: string) => boolean;
}

export default function MenuDrawer({
  isOpen,
  onClose,
  navItems,
  isActive,
}: MenuDrawerProps) {
  const NavItem = ({
    item,
    isNested = false,
  }: {
    item: NavItem;
    isNested?: boolean;
  }) => (
    <div key={item.path}>
      <Link
        to={item.path}
        onClick={onClose}
        className={`block px-4 py-3 text-base font-medium rounded-lg transition-colors duration-200 ${
          isNested ? "ml-4 text-sm" : ""
        } ${
          isActive(item.path)
            ? "bg-primary/10 text-primary"
            : "text-secondary dark:text-alabaster hover:bg-gray-lightest dark:hover:bg-secondary-light/10"
        }`}
      >
        {item.name}
      </Link>
      {item.subItems && item.subItems.length > 0 && isActive(item.path) && (
        <div className="mt-1 space-y-1 border-l-2 border-primary/20 ml-6">
          {item.subItems.map((subItem) => (
            <NavItem key={subItem.path} item={subItem} isNested />
          ))}
        </div>
      )}
    </div>
  );

  return (
    <Transition.Root show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-in-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in-out duration-300"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/30 transition-opacity" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-hidden">
          <div className="absolute inset-0 overflow-hidden">
            <div className="pointer-events-none fixed inset-y-0 left-0 flex max-w-full">
              <Transition.Child
                as={Fragment}
                enter="transform transition ease-in-out duration-300"
                enterFrom="-translate-x-full"
                enterTo="translate-x-0"
                leave="transform transition ease-in-out duration-300"
                leaveFrom="translate-x-0"
                leaveTo="-translate-x-full"
              >
                <Dialog.Panel className="pointer-events-auto w-screen max-w-xs">
                  <div className="flex h-full flex-col bg-white dark:bg-night shadow-xl">
                    <div className="flex-1 overflow-y-auto px-4 py-6">
                      <div className="flex items-center justify-between">
                        <Dialog.Title className="text-lg font-medium text-secondary dark:text-alabaster">
                          Menu
                        </Dialog.Title>
                        <button
                          type="button"
                          className="text-gray-dark dark:text-gray-light hover:text-secondary dark:hover:text-alabaster"
                          onClick={onClose}
                        >
                          <span className="sr-only">Close menu</span>
                          <svg
                            className="h-6 w-6"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth="1.5"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      </div>
                      <div className="mt-8">
                        <div className="flow-root">
                          <div className="space-y-2">
                            {navItems.map((item) => (
                              <NavItem key={item.path} item={item} />
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  );
}
