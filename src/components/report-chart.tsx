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

export function ReportChart({
  labels,
  income,
  expense,
}: {
  labels: string[];
  income: number[];
  expense: number[];
}) {
  const options: ChartOptions<"bar"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "top",
        align: "end",
        labels: {
          usePointStyle: true,
          pointStyle: "circle",
          boxWidth: 8,
          color: "#475569",
          font: { size: 11 },
        },
      },
      tooltip: {
        backgroundColor: "#0f172a",
        padding: 12,
        cornerRadius: 10,
        callbacks: {
          label: (ctx) => `${ctx.dataset.label}: ${formatRupiah(ctx.parsed.y)}`,
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
    <div className="h-72 w-full">
      <Bar
        options={options}
        data={{
          labels,
          datasets: [
            {
              label: "Penjualan",
              data: income,
              backgroundColor: "#10b981",
              hoverBackgroundColor: "#059669",
              borderRadius: 6,
              maxBarThickness: 28,
            },
            {
              label: "Pengeluaran",
              data: expense,
              backgroundColor: "#f43f5e",
              hoverBackgroundColor: "#e11d48",
              borderRadius: 6,
              maxBarThickness: 28,
            },
          ],
        }}
      />
    </div>
  );
}
