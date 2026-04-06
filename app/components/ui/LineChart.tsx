import React from "react";
import {
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";

export type WeightChartPoint = {
  date: string;
  weight: number;
  id?: string;
};

interface LineChartProps {
  data: WeightChartPoint[];
  height?: number;
  children?: React.ReactNode;
  /** When set, data points with `id` become clickable (e.g. client editing a log). */
  onDataPointClick?: (entry: {
    id: string;
    date: string;
    weight: number;
  }) => void;
}

const LineChart: React.FC<LineChartProps> = ({
  data,
  height = 200,
  children,
  onDataPointClick,
}) => {
  if (!data || data.length === 0) {
    return <div className="text-gray-400">No data to display.</div>;
  }
  // Calculate min and max for Y axis, rounded to nearest 2
  const weights = data.map(d => d.weight);
  const minWeight = Math.floor(Math.min(...weights) / 2) * 2;
  const maxWeight = Math.ceil(Math.max(...weights) / 2) * 2;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsLineChart
        data={data}
        margin={{ top: 16, right: 24, left: 0, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 12 }}
          tickFormatter={d => {
            const date = new Date(d);
            return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear().toString().slice(-2)}`;
          }}
        />
        <YAxis
          tick={{ fontSize: 12 }}
          domain={[minWeight, maxWeight]}
          tickFormatter={v => `${v}`}
          interval={0}
          ticks={Array.from({ length: Math.floor((maxWeight - minWeight) / 2) + 1 }, (_, i) => minWeight + i * 2)}
        />
        <Tooltip
          labelFormatter={d => {
            const date = new Date(d as string);
            return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear().toString().slice(-2)}`;
          }}
        />
        <Line
          type="monotone"
          dataKey="weight"
          stroke="#00CC03"
          strokeWidth={2}
          dot={
            onDataPointClick
              ? (props: {
                  cx?: number;
                  cy?: number;
                  payload?: WeightChartPoint;
                }) => {
                  const { cx, cy, payload } = props;
                  if (cx == null || cy == null || !payload?.id) {
                    return (
                      <circle
                        cx={cx}
                        cy={cy}
                        r={4}
                        fill="#00CC03"
                        stroke="#00CC03"
                        strokeWidth={2}
                      />
                    );
                  }
                  const handleActivate = (e: React.MouseEvent) => {
                    e.stopPropagation();
                    onDataPointClick({
                      id: payload.id!,
                      date: payload.date,
                      weight: payload.weight,
                    });
                  };
                  // Large invisible target (~48px) for tap/click; visible dot stays small.
                  const hitR = 24;
                  const dotR = 5;
                  return (
                    <g className="cursor-pointer touch-manipulation">
                      <circle
                        cx={cx}
                        cy={cy}
                        r={hitR}
                        fill="transparent"
                        pointerEvents="all"
                        onClick={handleActivate}
                      />
                      <circle
                        cx={cx}
                        cy={cy}
                        r={dotR}
                        fill="#00CC03"
                        stroke="#00CC03"
                        strokeWidth={2}
                        pointerEvents="none"
                      />
                    </g>
                  );
                }
              : {
                  fill: "#00CC03",
                  stroke: "#00CC03",
                  strokeWidth: 2,
                  r: 4,
                }
          }
        />
        {children}
      </RechartsLineChart>
    </ResponsiveContainer>
  );
};

export default LineChart;
