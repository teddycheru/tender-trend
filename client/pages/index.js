// pages/index.jsx (or wherever your page lives)
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

  console.log("Environment:", process.env.NEXT_PUBLIC_API_URL);

  const [selectedView, setSelectedView] = useState("regions");
  const [selectedSectors, setSelectedSectors] = useState([]);
  const [selectedMonths, setSelectedMonths] = useState([]);
  const [selectedYears, setSelectedYears] = useState([]);

  const [regions, setRegions] = useState([]);
  const [sectors, setSectors] = useState([]);
  const [regionCounts, setRegionCounts] = useState([]);
  const [sectorCounts, setSectorCounts] = useState([]);
  const [monthCountsMap, setMonthCountsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [allSectorsOpts, setAllSectorsOpts] = useState([]);
  const [allMonthsOpts, setAllMonthsOpts] = useState([]);
  const [allYearsOpts, setAllYearsOpts] = useState([]);

  // helper
  const normalize = (s) => (typeof s === "string" ? s.trim().toLowerCase() : "");

  useEffect(() => {
    const fetchAll = async () => {
      const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      console.log("Fetching data from:", base);
      setLoading(true);
      setError(null);

      try {
        const endpoints = [
          `${base}/trends/regions`,
          `${base}/trends/sectors`,
          `${base}/trends/regions/counts`,
          `${base}/trends/sectors/counts`,
          `${base}/trends/months/counts`,
        ];
        console.log("Fetch endpoints:", endpoints);
        const [regionsRes, sectorsRes, regionCountsRes, sectorCountsRes, monthCountsRes] = await Promise.all(
          endpoints.map((u) => fetch(u))
        );

        if (!regionsRes.ok) throw new Error(`Regions fetch failed: ${regionsRes.status} ${regionsRes.statusText}`);
        if (!sectorsRes.ok) throw new Error(`Sectors fetch failed: ${sectorsRes.status} ${sectorsRes.statusText}`);
        if (!regionCountsRes.ok) throw new Error(`Region counts fetch failed: ${regionCountsRes.status} ${regionCountsRes.statusText}`);
        if (!sectorCountsRes.ok) throw new Error(`Sector counts fetch failed: ${sectorCountsRes.status} ${sectorCountsRes.statusText}`);
        if (!monthCountsRes.ok) throw new Error(`Month counts fetch failed: ${monthCountsRes.status} ${monthCountsRes.statusText}`);

        const [regionsJson, sectorsJson, regionCountsJson, sectorCountsJson, monthCountsJson] = await Promise.all([
          regionsRes.json(),
          sectorsRes.json(),
          regionCountsRes.json(),
          sectorCountsRes.json(),
          monthCountsRes.json(),
        ]);

        console.log("Fetched month counts (raw):", monthCountsJson);

        // Sort regions alphabetically
        let derivedRegions = [];
        if (Array.isArray(regionCountsJson) && regionCountsJson.length && typeof regionCountsJson[0] === "object" && "region" in regionCountsJson[0]) {
          derivedRegions = [...new Set(regionCountsJson.map((r) => r.region))].sort((a, b) => normalize(a).localeCompare(normalize(b)));
          setRegionCounts(regionCountsJson);
        } else {
          derivedRegions = Array.isArray(regionsJson) ? [...regionsJson].sort((a, b) => normalize(a).localeCompare(normalize(b))) : [];
          setRegionCounts([]);
        }

        let derivedSectors = [];
        if (Array.isArray(sectorCountsJson) && sectorCountsJson.length && typeof sectorCountsJson[0] === "object" && ("predicted_category" in sectorCountsJson[0] || "category" in sectorCountsJson[0])) {
          setSectorCounts(sectorCountsJson);
          derivedSectors = sectorCountsJson.map((r) => r.predicted_category ?? r.category);
        } else {
          derivedSectors = Array.isArray(sectorsJson) ? sectorsJson : [];
          setSectorCounts([]);
        }

        setRegions(derivedRegions);
        setSectors(derivedSectors);
        setAllSectorsOpts(derivedSectors.map((s) => ({ value: s, label: s })));

        // Months: extract month names and years, set latest month as default
        const monthMap = {};
        const monthNames = [];
        const yearSet = new Set();
        if (Array.isArray(monthCountsJson)) {
          for (const r of monthCountsJson) {
            const year = Number(r.year);
            const monthNum = Number(r.month);
            if (!Number.isFinite(year) || !Number.isFinite(monthNum) || monthNum < 1 || monthNum > 12) continue;
            const key = `${year}-${String(monthNum).padStart(2, "0")}`;
            const monthName = new Date(year, monthNum - 1, 1).toLocaleString("default", { month: "long" });
            monthMap[key] = { label: `${monthName} ${year}`, count: Number(r.count) || 0, year, month: monthNum };
            monthNames.push(monthName);
            yearSet.add(year);
          }
        }
        const uniqueMonthNames = [...new Set(monthNames)].sort((a, b) => {
          const monthsOrder = [
            "January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December"
          ];
          return monthsOrder.indexOf(a) - monthsOrder.indexOf(b);
        });
        setMonthCountsMap(monthMap);
        setAllMonthsOpts(uniqueMonthNames.map((m) => ({ value: m, label: m })));

        // Set latest month as default
        const sortedKeys = Object.keys(monthMap).sort((a, b) => new Date(b + "-01") - new Date(a + "-01")); // Latest first
        const latestKey = sortedKeys[0];
        const latestMonthName = monthMap[latestKey].label.split(" ")[0]; // e.g., "September"
        setSelectedMonths([{ value: latestMonthName, label: latestMonthName }]);

        // Years
        const years = [...yearSet].sort((a, b) => a - b);
        setAllYearsOpts(years.map((y) => ({ value: y, label: String(y) })));

      } catch (err) {
        console.error("Fetch error:", err);
        setError(err.message ?? String(err));
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
  }, []);

  // ---- region chart using regionCounts (aggregated) and regions labels ----
  const regionChart = useMemo(() => {
    console.log("Rendering regionChart, regions:", regions.length, "regionCounts:", (regionCounts || []).length);
    if (!regions.length) return { labels: [], datasets: [] };

    // Build map of normalized region to count
    const countsMap = {};
    if (Array.isArray(regionCounts) && regionCounts.length) {
      for (const r of regionCounts) {
        const key = normalize(r.region ?? r.region_name ?? "");
        countsMap[key] = Number(r.count) || 0;
      }
    }

    // Use sorted regions for labels, fallback to 0 if no count
    const labels = regions;
    const data = labels.map((lab) => countsMap[normalize(lab)] ?? 0);

    return {
      labels,
      datasets: [
        {
          label: t("tenders_by_region"),
          data,
          backgroundColor: labels.map((_, i) => `hsl(${(i * 40) % 360}, 70%, 50%)`),
          barThickness: 30,
        },
      ],
    };
  }, [regions, regionCounts, t]);

  // ---- sector chart using sectorCounts and sectors labels ----
  const sectorChart = useMemo(() => {
    console.log("Rendering sectorChart, sectors:", sectors.length, "sectorCounts:", (sectorCounts || []).length, "selectedSectors:", selectedSectors.length);
    if (!sectors.length) return { labels: [], datasets: [] };

    const selected = selectedSectors.length ? selectedSectors.map((o) => o.value) : sectors;

    const countsMap = {};
    if (Array.isArray(sectorCounts) && sectorCounts.length) {
      for (const r of sectorCounts) {
        const cat = r.predicted_category ?? r.category ?? r.sector ?? null;
        if (!cat) continue;
        countsMap[normalize(cat)] = Number(r.count) || 0;
      }
    }

    const labels = selected;
    const data = labels.map((lab) => countsMap[normalize(lab)] ?? 0);

    return {
      labels,
      datasets: [
        {
          label: t("tenders_by_sector"),
          data,
          backgroundColor: labels.map((_, i) => `hsl(${(i * 60) % 360}, 70%, 50%)`),
          barThickness: 30,
        },
      ],
    };
  }, [sectors, sectorCounts, selectedSectors, t]);

  // ---- months map already prepared as monthCountsMap { "YYYY-MM": { label, count } } ----
  const monthsChart = useMemo(() => {
    const keys = Object.keys(monthCountsMap);
    if (!keys.length) return { labels: [], datasets: [] };

    let filtered = keys;
    const selMonths = selectedMonths.map((o) => o.value); // e.g., ["March"]
    const selYears = selectedYears.map((o) => String(o.value)); // e.g., ["2024", "2025"]

    if (selMonths.length) {
      filtered = filtered.filter((k) => {
        const monthNum = Number(k.split("-")[1]);
        const monthName = new Date(2000, monthNum - 1, 1).toLocaleString("default", { month: "long" }); // e.g., "March"
        return selMonths.includes(monthName);
      });
    }
    if (selYears.length) {
      filtered = filtered.filter((k) => selYears.includes(k.split("-")[0]));
    }

    filtered.sort((a, b) => new Date(a + "-01") - new Date(b + "-01"));

    const labels = filtered.map((k) => {
      const [year, month] = k.split("-");
      const monthName = new Date(year, Number(month) - 1, 1).toLocaleString("default", { month: "long" });
      return `${monthName} ${year}`; // e.g., "March 2024"
    });
    const data = filtered.map((k) => monthCountsMap[k].count || 0);

    return {
      labels,
      datasets: [
        {
          label: t("tenders_by_month"),
          data,
          backgroundColor: labels.map((_, i) => `hsl(${(i * 45) % 360}, 70%, 50%)`),
          barThickness: 30,
        },
      ],
    };
  }, [monthCountsMap, selectedMonths, selectedYears, t]);

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
      <aside className="w-64 shrink-0 bg-gray-800 border-r border-gray-700 p-4 overflow-y-auto shadow-lg">
        <h2 className="text-xl font-bold text-blue-400 mb-6">Tender Trend</h2>
        <div className="space-y-2">
          {views.map((v) => (
            <button
              key={v}
              onClick={() => handleNavClick(v)}
              className={`w-full text-left px-3 py-2 rounded-md transition-all duration-200 ${
                selectedView === v ? "bg-blue-600 text-white shadow-lg" : "bg-gray-700 hover:bg-gray-600"
              }`}
            >
              {t(v)}
            </button>
          ))}
        </div>

        {selectedView === "sectors" && (
          <div className="mt-6">
            <p className="text-sm mb-2 text-gray-300">{t("select_sectors")}</p>
            <Select isMulti options={allSectorsOpts} value={selectedSectors} onChange={setSelectedSectors} placeholder={t("select_sectors")} className="text-black" />
          </div>
        )}

        {selectedView === "months" && (
          <div className="mt-6 space-y-4">
            <p className="text-sm text-gray-300">Filter by Month and Year</p> {/* Updated label */}
            <Select isMulti options={allMonthsOpts} value={selectedMonths} onChange={setSelectedMonths} placeholder="Select Months" className="text-black" />
            <Select isMulti options={allYearsOpts} value={selectedYears} onChange={setSelectedYears} placeholder="Select Years" className="text-black" />
          </div>
        )}
      </aside>

      <main className="flex-1 p-6 overflow-y-auto">
        <h1 className="text-3xl font-bold mb-6 text-blue-400">Tender Trend</h1>
        {loading ? (
          <p>Loading...</p>
        ) : error ? (
          <p>Error: {error}</p>
        ) : selectedView && selectedView !== "tenders" && (
          <div className="space-y-6">
            <div className="bg-gray-800 p-6 rounded-lg shadow-lg" style={{ height: 460 }}>
              <Bar
                data={selectedView === "regions" ? regionChart : selectedView === "sectors" ? sectorChart : monthsChart}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  animation: { duration: 400 },
                  plugins: { legend: { labels: { color: "#ddd" } } },
                  scales: {
                    x: { ticks: { color: "#ddd" }, grid: { color: "#444" } },
                    y: { ticks: { color: "#ddd" }, grid: { color: "#444" } },
                  },
                }}
                height={400}
              />
            </div>

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
                      ? regionChart.labels.map((lab, i) => ({ label: lab, count: regionChart.datasets[0].data[i] || 0 }))
                      : selectedView === "sectors"
                      ? sectorChart.labels.map((lab, i) => ({ label: lab, count: sectorChart.datasets[0].data[i] || 0 }))
                      : monthsChart.labels.map((lab, i) => ({ label: lab, count: monthsChart.datasets[0].data[i] || 0 }))) || []
                  ).map((row, i) => (
                    <tr key={`${row.label}-${i}`} className={i % 2 ? "bg-gray-800" : "bg-gray-900"}>
                      <td className="border border-gray-700 p-2">{row.label}</td>
                      <td className="border border-gray-700 p-2 text-right">{row.count}</td>
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
