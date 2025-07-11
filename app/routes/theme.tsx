import type { MetaFunction } from "@remix-run/node";
import ThemeToggle from "~/components/ui/ThemeToggle";

export const meta: MetaFunction = () => {
  return [
    { title: "Color Theme | Kava Training" },
    {
      name: "description",
      content: "Kava Training color palette documentation",
    },
  ];
};

export default function ThemePage() {
  const colors = [
    {
      name: "Primary (Lime Green)",
      hex: "#00CC03",
      tailwind: "primary",
      textClass: "text-primary",
    },
    {
      name: "Primary Light",
      hex: "#32E135",
      tailwind: "primary-light",
      textClass: "text-primary-light",
    },
    {
      name: "Primary Dark",
      hex: "#00A802",
      tailwind: "primary-dark",
      textClass: "text-primary-dark",
    },
    {
      name: "Night (Black)",
      hex: "#070D0D",
      tailwind: "secondary",
      textClass: "text-secondary dark:text-white",
    },
    {
      name: "Secondary Light",
      hex: "#1A2020",
      tailwind: "secondary-light",
      textClass: "text-secondary-light dark:text-gray-light",
    },
    {
      name: "Davy&apos;s Gray",
      hex: "#585464",
      tailwind: "gray-dark",
      textClass: "text-gray-dark dark:text-alabaster",
    },
    {
      name: "Alabaster",
      hex: "#E0E2DB",
      tailwind: "gray-light",
      textClass: "text-gray-light bg-secondary dark:text-white",
    },
    {
      name: "White",
      hex: "#FFFFFF",
      tailwind: "white",
      textClass: "text-white bg-secondary",
    },
  ];

  return (
    <div className="max-w-6xl mx-auto py-12 px-4 transition-colors duration-200 bg-white dark:bg-night">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-4xl font-bold text-secondary dark:text-alabaster transition-colors duration-200">
          Kava Training Color Palette
        </h1>
        <ThemeToggle />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
        <div>
          <h2 className="text-2xl font-bold text-secondary dark:text-alabaster mb-4 transition-colors duration-200">
            Color Showcase
          </h2>
          <div className="grid grid-cols-5 gap-2">
            <div className="h-24 bg-primary rounded-md"></div>
            <div className="h-24 bg-primary-light rounded-md"></div>
            <div className="h-24 bg-primary-dark rounded-md"></div>
            <div className="h-24 bg-secondary rounded-md"></div>
            <div className="h-24 bg-secondary-light rounded-md"></div>
            <div className="h-24 bg-gray-dark rounded-md"></div>
            <div className="h-24 bg-gray-light rounded-md"></div>
            <div className="h-24 bg-white rounded-md border border-gray-light dark:border-davyGray"></div>
            <div className="h-24 bg-night rounded-md"></div>
            <div className="h-24 bg-davyGray rounded-md"></div>
            <div className="h-24 bg-alabaster rounded-md"></div>
          </div>
        </div>

        <div>
          <h2 className="text-2xl font-bold text-secondary dark:text-alabaster mb-4 transition-colors duration-200">
            Text Colors
          </h2>
          <div className="space-y-4">
            {colors.map((color, index) => (
              <div key={index} className="flex items-center">
                <div
                  className={`w-4 h-4 rounded-full mr-2`}
                  style={{ backgroundColor: color.hex }}
                ></div>
                <p
                  className={`${color.textClass} font-medium transition-colors duration-200`}
                >
                  {color.name} - {color.hex}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mb-12">
        <h2 className="text-2xl font-bold text-secondary dark:text-alabaster mb-4 transition-colors duration-200">
          Button Examples
        </h2>
        <div className="flex flex-wrap gap-4">
          <button className="bg-primary hover:bg-primary-dark text-white font-bold py-2 px-4 rounded transition-colors duration-200">
            Primary Button
          </button>
          <button className="bg-secondary hover:bg-secondary-light text-white font-bold py-2 px-4 rounded transition-colors duration-200">
            Secondary Button
          </button>
          <button className="bg-white hover:bg-gray-light text-secondary dark:text-night border border-gray dark:border-alabaster font-bold py-2 px-4 rounded transition-colors duration-200">
            Light Button
          </button>
          <button className="bg-davyGray hover:bg-opacity-90 text-white font-bold py-2 px-4 rounded transition-colors duration-200">
            Davy&apos;s Gray Button
          </button>
        </div>
      </div>

      <div className="mb-12">
        <h2 className="text-2xl font-bold text-secondary dark:text-alabaster mb-4 transition-colors duration-200">
          Card Examples
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white dark:bg-night shadow-md rounded-lg p-6 border border-gray-light dark:border-secondary transition-colors duration-200">
            <h3 className="text-lg font-bold text-secondary dark:text-alabaster mb-2 transition-colors duration-200">
              Light/Dark Card
            </h3>
            <p className="text-gray-dark dark:text-gray-light transition-colors duration-200">
              This card adapts to light or dark mode automatically.
            </p>
          </div>

          <div className="bg-alabaster dark:bg-secondary shadow-md rounded-lg p-6 transition-colors duration-200">
            <h3 className="text-lg font-bold text-secondary dark:text-alabaster mb-2 transition-colors duration-200">
              Alabaster/Secondary Card
            </h3>
            <p className="text-gray-dark dark:text-gray-light transition-colors duration-200">
              Uses alabaster in light mode and secondary in dark mode.
            </p>
          </div>

          <div className="bg-primary bg-opacity-10 dark:bg-primary dark:bg-opacity-20 shadow-md rounded-lg p-6 transition-colors duration-200">
            <h3 className="text-lg font-bold text-secondary dark:text-alabaster mb-2 transition-colors duration-200">
              Accent Card
            </h3>
            <p className="text-gray-dark dark:text-gray-light transition-colors duration-200">
              A card with semi-transparent primary background that works in both
              themes.
            </p>
          </div>
        </div>
      </div>

      <div className="mb-12">
        <h2 className="text-2xl font-bold text-secondary dark:text-alabaster mb-4 transition-colors duration-200">
          Dark Mode Toggle
        </h2>
        <div className="bg-white dark:bg-night shadow-md rounded-lg p-6 border border-gray-light dark:border-secondary transition-colors duration-200">
          <p className="text-gray-dark dark:text-gray-light mb-4 transition-colors duration-200">
            The theme toggle automatically switches between light and dark mode:
          </p>
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}
