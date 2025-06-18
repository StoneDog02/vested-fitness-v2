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

interface LineChartProps {
  data: { date: string; weight: number }[];
  height?: number;
  children?: React.ReactNode;
}

const LineChart: React.FC<LineChartProps> = ({
  data,
  height = 200,
  children,
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
          stroke="#6366f1"
          strokeWidth={2}
          dot={false}
        />
        {children}
      </RechartsLineChart>
    </ResponsiveContainer>
  );
};

export default LineChart;
