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
  const [regionCounts, setRegionCounts] = useState([]); // array of {region, count} or []
  const [sectorCounts, setSectorCounts] = useState([]); // array of {predicted_category, count} or []
  const [monthCountsMap, setMonthCountsMap] = useState({}); // { "2024-01": { label: "Jan 2024", count: 12 }, ... }
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

        console.log("Fetched regions (raw):", regionsJson);
        console.log("Fetched sectors (raw):", sectorsJson);
        console.log("Fetched region counts (raw):", regionCountsJson);
        console.log("Fetched sector counts (raw):", sectorCountsJson);
        console.log("Fetched month counts (raw):", monthCountsJson);

        // Build normalized maps and safe lists
        // Regions: prefer aggregated endpoint if it returns objects like {region, count}
        let derivedRegions = [];
        if (Array.isArray(regionCountsJson) && regionCountsJson.length && typeof regionCountsJson[0] === "object" && "region" in regionCountsJson[0]) {
          derivedRegions = regionCountsJson.map((r) => r.region);
          setRegionCounts(regionCountsJson);
        } else {
          // fallback to /trends/regions which may be an array of strings
          derivedRegions = Array.isArray(regionsJson) ? regionsJson : [];
          setRegionCounts([]); // no counts available
        }

        // Sectors: aggregated endpoint returns predicted_category
        let derivedSectors = [];
        if (Array.isArray(sectorCountsJson) && sectorCountsJson.length && typeof sectorCountsJson[0] === "object" && ("predicted_category" in sectorCountsJson[0] || "category" in sectorCountsJson[0])) {
          // normalize to use predicted_category accessor if available
          setSectorCounts(sectorCountsJson);
          derivedSectors = sectorCountsJson.map((r) => r.predicted_category ?? r.category);
        } else {
          derivedSectors = Array.isArray(sectorsJson) ? sectorsJson : [];
          setSectorCounts([]);
        }

        setRegions(derivedRegions);
        setSectors(derivedSectors);
        setAllSectorsOpts(derivedSectors.map((s) => ({ value: s, label: s })));

        // Months: backend returns rows { year, month, count }
        const mMap = {}; // key -> { label, count }
        if (Array.isArray(monthCountsJson)) {
          for (const r of monthCountsJson) {
            // backend may return numbers or strings
            const year = Number(r.year);
            const monthNum = Number(r.month); // 1..12
            if (!Number.isFinite(year) || !Number.isFinite(monthNum)) continue;
            const key = `${year}-${String(monthNum).padStart(2, "0")}`; // 2024-01
            const label = new Date(year, monthNum - 1, 1).toLocaleString("default", { month: "short" }) + ` ${year}`;
            mMap[key] = { label, count: Number(r.count) || 0, year, month: monthNum };
          }
        }
        // sort keys for options
        const monthKeys = Object.keys(mMap).sort((a, b) => new Date(a + "-01") - new Date(b + "-01"));
        setMonthCountsMap(mMap);
        setAllMonthsOpts(monthKeys.map((k) => ({ value: k, label: mMap[k].label })));
        const years = [...new Set(Object.values(mMap).map((v) => v.year))].sort((a, b) => a - b);
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

    // build map normalizedRegion -> count
    const countsMap = {};
    if (Array.isArray(regionCounts) && regionCounts.length) {
      for (const r of regionCounts) {
        const key = normalize(r.region ?? r.region_name ?? "");
        countsMap[key] = Number(r.count) || 0;
      }
    }

    // fallback: if countsMap empty we'll set zeros
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

    // if user selected specific months or years, filter; otherwise show all
    let filtered = keys;
    const selMonths = selectedMonths.map((o) => o.value); // we store values as "YYYY-MM"
    const selYears = selectedYears.map((o) => String(o.value));

    if (selMonths.length) {
      filtered = filtered.filter((k) => selMonths.includes(k));
    }
    if (selYears.length) {
      filtered = filtered.filter((k) => selYears.includes(k.split("-")[0]));
    }

    filtered.sort((a, b) => new Date(a + "-01") - new Date(b + "-01"));

    const labels = filtered.map((k) => monthCountsMap[k].label);
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
            <p className="text-sm text-gray-300">{t("filter_by_month_year")}</p>
            <Select isMulti options={allMonthsOpts} value={selectedMonths} onChange={setSelectedMonths} placeholder={t("select_months")} className="text-black" />
            <Select isMulti options={allYearsOpts} value={selectedYears} onChange={setSelectedYears} placeholder={t("select_years")} className="text-black" />
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
