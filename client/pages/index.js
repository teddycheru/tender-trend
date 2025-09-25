import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useRouter } from "next/router";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import Select from "react-select";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

export default function Home() {
  const { t } = useTranslation();
  const router = useRouter();

  const [selectedView, setSelectedView] = useState("");
  const [selectedSectors, setSelectedSectors] = useState([]);
  const [selectedMonths, setSelectedMonths] = useState([]);
  const [selectedYears, setSelectedYears] = useState([]);

  const [regions, setRegions] = useState([]);
  const [sectors, setSectors] = useState([]);
  const [tenders, setTenders] = useState([]);

  const [allSectorsOpts, setAllSectorsOpts] = useState([]);
  const [allMonthsOpts, setAllMonthsOpts] = useState([]);
  const [allYearsOpts, setAllYearsOpts] = useState([]);

  useEffect(() => {
    const fetchAll = async () => {
      const base = process.env.NEXT_PUBLIC_API_URL;

      const [regionsRes, sectorsRes, tendersRes] = await Promise.all([
        fetch(`${base}/trends/regions`),
        fetch(`${base}/trends/sectors`),
        fetch(
          `${base}/tenders?sortBy=Published_On&sortOrder=asc&page=1&per_page=100000`
        ),
      ]);

      const [regionsJson, sectorsJson, tendersJson] = await Promise.all([
        regionsRes.json(),
        sectorsRes.json(),
        tendersRes.json(),
      ]);

      const rows = Array.isArray(tendersJson?.tenders)
        ? tendersJson.tenders
        : [];

      setRegions(regionsJson || []);
      setSectors(sectorsJson || []);
      setTenders(rows);

      setAllSectorsOpts((sectorsJson || []).map((s) => ({ value: s, label: s })));

      // Build distinct months & years
      const monthCounts = {};
      for (const row of rows) {
        const raw = row?.Published_On;
        if (!raw) continue;
        const d = new Date(raw);
        if (Number.isNaN(d.getTime())) continue;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
          2,
          "0"
        )}`;
        monthCounts[key] = (monthCounts[key] || 0) + 1;
      }

      const monthNames = [...new Set(
        Object.keys(monthCounts).map((k) => {
          const [y, m] = k.split("-");
          return new Date(`${y}-${m}-01`).toLocaleString("default", {
            month: "short",
          });
        })
      )];

      const years = [...new Set(Object.keys(monthCounts).map((k) => k.split("-")[0]))]
        .sort();

      setAllMonthsOpts(monthNames.map((m) => ({ value: m, label: m })));
      setAllYearsOpts(years.map((y) => ({ value: y, label: y })));
    };

    fetchAll();
  }, []);

  // ---- Chart helpers ----
  const regionChart = useMemo(() => {
    if (!regions.length || !tenders.length) return { labels: [], datasets: [] };

    const counts = regions.reduce((acc, r) => ({ ...acc, [r]: 0 }), {});
    for (const row of tenders) {
      const r = row?.Region;
      if (r && r in counts) counts[r] += 1;
    }

    return {
      labels: regions,
      datasets: [
        {
          label: t("tenders_by_region"),
          data: regions.map((r) => counts[r] || 0),
          backgroundColor: regions.map(
            (_, i) => `hsl(${(i * 40) % 360}, 70%, 50%)`
          ),
          barThickness: 30,
        },
      ],
    };
  }, [regions, tenders, t]);

  const sectorChart = useMemo(() => {
    if (!sectors.length || !tenders.length) return { labels: [], datasets: [] };

    const selected = selectedSectors.length
      ? selectedSectors.map((o) => o.value)
      : sectors;

    const counts = selected.reduce((acc, s) => ({ ...acc, [s]: 0 }), {});
    for (const row of tenders) {
      const s = row?.Sector;
      if (s && s in counts) counts[s] += 1;
    }

    return {
      labels: selected,
      datasets: [
        {
          label: t("tenders_by_sector"),
          data: selected.map((s) => counts[s] || 0),
          backgroundColor: selected.map(
            (_, i) => `hsl(${(i * 60) % 360}, 70%, 50%)`
          ),
          barThickness: 30,
        },
      ],
    };
  }, [sectors, tenders, selectedSectors, t]);

  const monthCountsAll = useMemo(() => {
    const map = {};
    for (const row of tenders) {
      const raw = row?.Published_On;
      if (!raw) continue;
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
        2,
        "0"
      )}`;
      map[key] = (map[key] || 0) + 1;
    }
    return map;
  }, [tenders]);

  const monthsChart = useMemo(() => {
    const selMonths = selectedMonths.map((o) => o.value);
    const selYears = selectedYears.map((o) => o.value);

    if (selMonths.length === 0 && selYears.length === 0) {
      return { labels: [], datasets: [] };
    }

    let keys = Object.keys(monthCountsAll);
    if (selMonths.length) {
      keys = keys.filter((k) => {
        const [yy, mm] = k.split("-");
        const monthName = new Date(`${yy}-${mm}-01`).toLocaleString("default", {
          month: "short",
        });
        return selMonths.includes(monthName);
      });
    }
    if (selYears.length) {
      keys = keys.filter((k) => selYears.includes(k.split("-")[0]));
    }

    keys.sort((a, b) => new Date(a + "-01") - new Date(b + "-01"));

    const labels = keys.map((k) => {
      const [yy, mm] = k.split("-");
      const mName = new Date(`${yy}-${mm}-01`).toLocaleString("default", {
        month: "short",
      });
      return `${mName} ${yy}`;
    });

    const data = keys.map((k) => monthCountsAll[k] || 0);

    return {
      labels,
      datasets: [
        {
          label: t("tenders_by_month"),
          data,
          backgroundColor: labels.map(
            (_, i) => `hsl(${(i * 45) % 360}, 70%, 50%)`
          ),
          barThickness: 30,
        },
      ],
    };
  }, [monthCountsAll, selectedMonths, selectedYears, t]);

  // ---- Views ----
  const views = ["regions", "sectors", "months", "tenders"];

  const handleNavClick = (view) => {
    setSelectedView(view);
    if (view === "tenders") router.push("/tenders");
  };

  return (
    <div
      className="flex h-screen bg-gray-900 text-gray-100 font-[Inter]"
      style={{ fontFamily: "Inter, sans-serif" }}
    >
      {/* Sidebar */}
      <aside className="w-64 shrink-0 bg-gray-800 border-r border-gray-700 p-4 overflow-y-auto shadow-lg">
        <h2 className="text-xl font-bold text-blue-400 mb-6">Tender Trend</h2>
        <div className="space-y-2">
          {views.map((v) => (
            <button
              key={v}
              onClick={() => handleNavClick(v)}
              className={`w-full text-left px-3 py-2 rounded-md transition-all duration-200 ${
                selectedView === v
                  ? "bg-blue-600 text-white shadow-lg"
                  : "bg-gray-700 hover:bg-gray-600"
              }`}
            >
              {t(v)}
            </button>
          ))}
        </div>

        {/* Filters */}
        {selectedView === "sectors" && (
          <div className="mt-6">
            <p className="text-sm mb-2 text-gray-300">{t("select_sectors")}</p>
            <Select
              isMulti
              options={allSectorsOpts}
              value={selectedSectors}
              onChange={setSelectedSectors}
              placeholder={t("select_sectors")}
              className="text-black"
            />
          </div>
        )}

        {selectedView === "months" && (
          <div className="mt-6 space-y-4">
            <p className="text-sm text-gray-300">{t("filter_by_month_year")}</p>
            <Select
              isMulti
              options={allMonthsOpts}
              value={selectedMonths}
              onChange={setSelectedMonths}
              placeholder={t("select_months")}
              className="text-black"
            />
            <Select
              isMulti
              options={allYearsOpts}
              value={selectedYears}
              onChange={setSelectedYears}
              placeholder={t("select_years")}
              className="text-black"
            />
          </div>
        )}
      </aside>

      {/* Content */}
      <main className="flex-1 p-6 overflow-y-auto">
        <h1 className="text-3xl font-bold mb-6 text-blue-400">Tender Trend</h1>

        {selectedView && selectedView !== "tenders" && (
          <div className="space-y-6">
            {/* Chart */}
            <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
              <Bar
                data={
                  selectedView === "regions"
                    ? regionChart
                    : selectedView === "sectors"
                    ? sectorChart
                    : monthsChart
                }
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  animation: { duration: 400 },
                  plugins: {
                    legend: { labels: { color: "#ddd" } },
                  },
                  scales: {
                    x: {
                      ticks: { color: "#ddd" },
                      grid: { color: "#444" },
                    },
                    y: {
                      ticks: { color: "#ddd" },
                      grid: { color: "#444" },
                    },
                  },
                }}
                height={400}
              />
            </div>

            {/* Table */}
            <div className="flex justify-center">
              <table className="min-w-[400px] max-w-[600px] border border-gray-700 text-sm rounded-lg overflow-hidden shadow-lg">
                <thead className="bg-blue-600 text-white">
                  <tr>
                    <th className="p-2 text-left">{t("label")}</th>
                    <th className="p-2 text-right">{t("count")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(
                    (selectedView === "regions"
                      ? regionChart.labels.map((lab, i) => ({
                          label: lab,
                          count: regionChart.datasets[0].data[i],
                        }))
                      : selectedView === "sectors"
                      ? sectorChart.labels.map((lab, i) => ({
                          label: lab,
                          count: sectorChart.datasets[0].data[i],
                        }))
                      : monthsChart.labels.map((lab, i) => ({
                          label: lab,
                          count: monthsChart.datasets[0].data[i],
                        }))) || []
                  ).map((row, i) => (
                    <tr
                      key={`${row.label}-${i}`}
                      className={i % 2 ? "bg-gray-800" : "bg-gray-900"}
                    >
                      <td className="border border-gray-700 p-2">{row.label}</td>
                      <td className="border border-gray-700 p-2 text-right">
                        {row.count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
