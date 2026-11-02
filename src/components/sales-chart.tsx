"use client";

import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
  type ChartOptions,
} from "chart.js";
import { Bar } from "react-chartjs-2";
import { formatRupiah } from "@/lib/format";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

export function SalesChart({
  labels,
  values,
}: {
  labels: string[];
  values: number[];
}) {
  const options: ChartOptions<"bar"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "#0f172a",
        padding: 12,
        cornerRadius: 10,
        displayColors: false,
        callbacks: {
          label: (ctx) => formatRupiah(ctx.parsed.y),
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: { color: "#64748b", font: { size: 11 } },
      },
      y: {
        beginAtZero: true,
        grid: { color: "#f1f5f9" },
        border: { display: false },
        ticks: {
          color: "#64748b",
          font: { size: 11 },
          callback: (value) =>
            new Intl.NumberFormat("id-ID", {
              notation: "compact",
              maximumFractionDigits: 1,
            }).format(Number(value)),
        },
      },
    },
  };

  return (
    <div className="h-64 w-full">
      <Bar
        options={options}
        data={{
          labels,
          datasets: [
            {
              data: values,
              backgroundColor: "#10b981",
              hoverBackgroundColor: "#059669",
              borderRadius: 8,
              maxBarThickness: 42,
            },
          ],
        }}
      />
    </div>
  );
}
