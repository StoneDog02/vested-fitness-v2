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
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsLineChart
        data={data}
        margin={{ top: 16, right: 24, left: 0, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} domain={["auto", "auto"]} />
        <Tooltip />
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
