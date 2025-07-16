import React from "react";
import Tooltip from "./Tooltip";
import { InformationCircleIcon } from "@heroicons/react/24/outline";

const NABadge: React.FC<{ reason?: string }> = ({ reason }) => (
  <Tooltip content={reason || "Client was not signed up yet"}>
    <span className="inline-flex items-center gap-1 cursor-pointer select-none">
      <span className="px-2 py-0.5 rounded-full bg-gray-200 text-gray-600 text-xs font-semibold border border-gray-300">
        N/A
      </span>
      <InformationCircleIcon className="w-4 h-4 text-blue-400 hover:text-blue-600 transition-colors duration-150 align-middle" aria-label="Info" />
    </span>
  </Tooltip>
);

export default NABadge; 