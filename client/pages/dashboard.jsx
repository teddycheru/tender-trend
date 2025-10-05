import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useRouter } from "next/router";
import { Bar, Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import Select from "react-select";
import Link from "next/link";

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend);

export default function Dashboard() {
  const { t } = useTranslation();
  const router = useRouter();

  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // Authentication state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loadingAuth, setLoadingAuth] = useState(true);

  // Dashboard state
  const [selectedView, setSelectedView] = useState("regions");
  const [selectedSectors, setSelectedSectors] = useState([]);
  const [selectedMonths, setSelectedMonths] = useState([]);
  const [selectedYears, setSelectedYears] = useState([]);

  const [regions, setRegions] = useState([]);
  const [sectors, setSectors] = useState([]);
  const [regionCounts, setRegionCounts] = useState([]);
  const [sectorCounts, setSectorCounts] = useState([]);
  const [monthCountsMap, setMonthCountsMap] = useState({});
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState(null);

  const [allSectorsOpts, setAllSectorsOpts] = useState([]);
  const [allMonthsOpts, setAllMonthsOpts] = useState([]);
  const [allYearsOpts, setAllYearsOpts] = useState([]);

  // Helper
  const normalize = (s) => (typeof s === "string" ? s.trim().toLowerCase() : "");

  // Authentication check
  useEffect(() => {
    const token = localStorage.getItem("token");
    const expiry = localStorage.getItem("token_expiry");
    if (!token || (expiry && Number(expiry) < Date.now())) {
      router.replace("/login");
    } else {
      setIsAuthenticated(true);
    }
    setLoadingAuth(false);
  }, [router]);

  // Data fetch
  useEffect(() => {
    if (!isAuthenticated) return;

    const fetchAll = async () => {
      const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      console.log("Fetching data from:", base);
      setLoadingData(true);
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
          endpoints.map((u) =>
            fetch(u, {
              headers: {
                Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
              },
            })
          )
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

        // Months: extract month names and years
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
      } catch (err) {
        console.error("Fetch error:", err);
        setError(err.message ?? String(err));
        if (err.message.includes("401") || err.message.includes("403")) {
          router.replace("/login");
        }
      } finally {
        setLoadingData(false);
      }
    };

    fetchAll();
  }, [isAuthenticated, router]);

  // Region Chart
  const regionChart = useMemo(() => {
    console.log("Rendering regionChart, regions:", regions.length, "regionCounts:", (regionCounts || []).length);
    if (!regions.length) return { labels: [], datasets: [] };

    const countsMap = {};
    if (Array.isArray(regionCounts) && regionCounts.length) {
      for (const r of regionCounts) {
        const key = normalize(r.region ?? r.region_name ?? "");
        countsMap[key] = Number(r.count) || 0;
      }
    }

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

  // Sector Chart
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

  // Months Chart (Bar) for "months" view
  const monthsChart = useMemo(() => {
    const keys = Object.keys(monthCountsMap);
    if (!keys.length) return { labels: [], datasets: [] };

    let filtered = keys;
    const selMonths = selectedMonths.map((o) => o.value); 
    const selYears = selectedYears.map((o) => String(o.value));

    if (selMonths.length) {
      filtered = filtered.filter((k) => {
        const monthNum = Number(k.split("-")[1]);
        const monthName = new Date(2000, monthNum - 1, 1).toLocaleString("default", { month: "long" });
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

  // Months Bar Chart for "monthsTrend" view
  const monthsBarChart = useMemo(() => {
    const keys = Object.keys(monthCountsMap);
    if (!keys.length) return { labels: [], datasets: [] };

    let filtered = keys;
    const selMonths = selectedMonths.map((o) => o.value); 
    const selYears = selectedYears.map((o) => String(o.value));

    if (selMonths.length || selYears.length) {
      if (selMonths.length) {
        filtered = filtered.filter((k) => {
          const monthNum = Number(k.split("-")[1]);
          const monthName = new Date(2000, monthNum - 1, 1).toLocaleString("default", { month: "long" });
          return selMonths.includes(monthName);
        });
      }
      if (selYears.length) {
        filtered = filtered.filter((k) => selYears.includes(k.split("-")[0]));
      }
    } else {
      return { labels: [], datasets: [] }; // No data if no filters selected
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

  // Months Trend Line Chart
  const monthsTrendChart = useMemo(() => {
    const keys = Object.keys(monthCountsMap);
    if (!keys.length) return { labels: [], datasets: [] };

    const selMonths = selectedMonths.map((o) => o.value); // e.g., ["March"]
    const allYears = [...new Set(keys.map(k => k.split("-")[0]))].sort((a, b) => a - b);

    // Filter keys based on selected months only if any are selected
    let filteredKeys = keys;
    if (selMonths.length || selectedYears.length) {
      if (selMonths.length) {
        filteredKeys = filteredKeys.filter((k) => {
          const monthNum = Number(k.split("-")[1]);
          const monthName = new Date(2000, monthNum - 1, 1).toLocaleString("default", { month: "long" });
          return selMonths.includes(monthName);
        });
      }
      if (selectedYears.length) {
        filteredKeys = filteredKeys.filter((k) => selectedYears.map(y => String(y.value)).includes(k.split("-")[0]));
      }
    } else {
      return { labels: [], datasets: [] }; // No data if no filters selected
    }

    // Group counts by month across all years
    const monthData = {};
    filteredKeys.forEach((key) => {
      const [year, month] = key.split("-");
      const monthName = new Date(2000, Number(month) - 1, 1).toLocaleString("default", { month: "long" });
      if (!monthData[monthName]) monthData[monthName] = {};
      monthData[monthName][year] = monthCountsMap[key].count || 0;
    });

    // Prepare datasets for each selected month
    const datasets = selMonths.map((monthName, index) => {
      const data = allYears.map((year) => monthData[monthName]?.[year] || 0);
      return {
        label: monthName,
        data,
        borderColor: `hsl(${index * 30 % 360}, 70%, 50%)`,
        backgroundColor: `rgba(${index * 30 % 360}, 70%, 50%, 0.5)`,
        fill: false,
        tension: 0.1,
        pointRadius: 5,
      };
    });

    return {
      labels: allYears,
      datasets,
    };
  }, [monthCountsMap, selectedMonths, selectedYears, t]);

  const views = ["regions", "sectors", "monthsTrend", "tenders"];

  const handleNavClick = (view) => {
    setSelectedView(view);
    if (view === "tenders") router.push("/tenders");
  };

  if (loadingAuth) return <div>Loading...</div>;

  if (!isAuthenticated) return null; // Redirect handled by useEffect

  return (
    <div
      className="flex h-screen bg-gray-900 text-gray-100 font-[Inter]"
      style={{ fontFamily: "Inter, sans-serif" }}
    >
      <aside className="w-64 shrink-0 bg-gray-800 border-r border-gray-700 p-4 overflow-y-auto shadow-lg">
        <h2 className="text-xl font-bold text-blue-400 mb-6">Dashboard</h2>
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

        {(selectedView === "months" || selectedView === "monthsTrend") && (
          <div className="mt-6 space-y-4">
            <p className="text-sm text-gray-300">Filter by Month and Year</p>
            <Select
              isMulti
              options={allMonthsOpts}
              value={selectedMonths}
              onChange={setSelectedMonths}
              placeholder="Select Months"
              className="text-black"
            />
            <Select
              isMulti
              options={allYearsOpts}
              value={selectedYears}
              onChange={setSelectedYears}
              placeholder="Select Years"
              className="text-black"
            />
          </div>
        )}
      </aside>

      <main className="flex-1 p-6 overflow-y-auto">
        <nav className="bg-gray-800 p-4 mb-6 rounded-lg shadow-lg">
          <ul className="flex justify-center space-x-6">
            <li>
              <Link href="/" legacyBehavior>
                <button className={`px-3 py-2 rounded-md transition-all duration-200 ${router.pathname === "/" ? "bg-blue-600 text-white" : "text-gray-300 hover:bg-gray-600 hover:text-white"}`}>
                  Home
                </button>
              </Link>
            </li>
            <li>
              <Link href="/resources" legacyBehavior>
                <button className={`px-3 py-2 rounded-md transition-all duration-200 ${router.pathname === "/resources" ? "bg-blue-600 text-white" : "text-gray-300 hover:bg-gray-600 hover:text-white"}`}>
                  Resources
                </button>
              </Link>
            </li>
            <li>
              <Link href="/pricing" legacyBehavior>
                <button className={`px-3 py-2 rounded-md transition-all duration-200 ${router.pathname === "/pricing" ? "bg-blue-600 text-white" : "text-gray-300 hover:bg-gray-600 hover:text-white"}`}>
                  Pricing
                </button>
              </Link>
            </li>
            <li>
              <Link href="/profile" legacyBehavior>
                <button className={`px-3 py-2 rounded-md transition-all duration-200 ${router.pathname === "/profile" ? "bg-blue-600 text-white" : "text-gray-300 hover:bg-gray-600 hover:text-white"}`}>
                  Profile
                </button>
              </Link>
            </li>
            <li>
              <Link href="/login" legacyBehavior>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    setShowLogoutConfirm(true);
                  }}
                  className={`px-3 py-2 rounded-md transition-all duration-200 ${router.pathname === "/login" ? "bg-blue-600 text-white" : "text-gray-300 hover:bg-gray-600 hover:text-white"}`}
                >
                  Logout
                </button>
              </Link>
            </li>
          </ul>
        </nav>

        {showLogoutConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-lg w-80 text-center">
              <p className="mb-4 text-gray-700">Are you sure you want to log out?</p>
              <div className="flex justify-between">
                <button
                  onClick={() => {
                    localStorage.removeItem("token");
                    localStorage.removeItem("token_expiry");
                    router.push("/login");
                  }}
                  className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                >
                  Yes, log out
                </button>
                <button
                  onClick={() => setShowLogoutConfirm(false)}
                  className="px-4 py-2 bg-gray-300 text-gray-800 rounded hover:bg-gray-400"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {loadingData ? (
          <p>Loading...</p>
        ) : error ? (
          <p>Error: {error}</p>
        ) : selectedView && selectedView !== "tenders" && (
          <div className="space-y-6">
            {["regions", "sectors", "months"].includes(selectedView) && (
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
            )}

            {selectedView === "monthsTrend" && (
              <div className="space-y-6">
                <div className="bg-gray-800 p-6 rounded-lg shadow-lg" style={{ height: 460 }}>
                  <Line
                    data={monthsTrendChart}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      animation: { duration: 400 },
                      plugins: { legend: { labels: { color: "#ddd" } } },
                      scales: {
                        x: { ticks: { color: "#ddd" }, grid: { color: "#444" } },
                        y: { ticks: { color: "#ddd" }, beginAtZero: true, grid: { color: "#444" } },
                      },
                    }}
                    height={400}
                  />
                </div>
                <div className="bg-gray-800 p-6 rounded-lg shadow-lg" style={{ height: 460 }}>
                  <Bar
                    data={monthsBarChart}
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
              </div>
            )}

            {["regions", "sectors", "months"].includes(selectedView) && (
              <div className="flex justify-center">
                <table className="min-w-[400px] max-w-[600px] border border-gray-700 text-sm rounded-lg overflow-hidden shadow-lg">
                  <thead className="bg-blue-600 text-white">
                    <tr>
                      <th className="p-2 text-left">{t("label")}</th>
                      <th className="p-2 text-right">{t("count")}</th>
                      <th className="p-2 text-right">Percentage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      (selectedView === "regions"
                        ? regionChart.labels.map((lab, i) => ({ label: lab, count: regionChart.datasets[0].data[i] || 0 }))
                        : selectedView === "sectors"
                        ? sectorChart.labels.map((lab, i) => ({ label: lab, count: sectorChart.datasets[0].data[i] || 0 }))
                        : monthsChart.labels.map((lab, i) => ({ label: lab, count: monthsChart.datasets[0].data[i] || 0 }))) || []
                    ).map((row, i) => {
                      const total = (selectedView === "regions" ? regionChart.datasets[0].data.reduce((a, b) => a + b, 0) :
                        selectedView === "sectors" ? sectorChart.datasets[0].data.reduce((a, b) => a + b, 0) :
                        monthsChart.datasets[0].data.reduce((a, b) => a + b, 0)) || 1;
                      const percentage = ((row.count / total) * 100).toFixed(2);
                      return (
                        <tr key={`${row.label}-${i}`} className={i % 2 ? "bg-gray-800" : "bg-gray-900"}>
                          <td className="border border-gray-700 p-2">{row.label}</td>
                          <td className="border border-gray-700 p-2 text-right">{row.count}</td>
                          <td className="border border-gray-700 p-2 text-right">{percentage}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {selectedView === "monthsTrend" && (
              <div className="flex justify-center">
                <table className="min-w-[400px] max-w-[600px] border border-gray-700 text-sm rounded-lg overflow-hidden shadow-lg">
                  <thead className="bg-blue-600 text-white">
                    <tr>
                      <th className="p-2 text-left">{t("label")}</th>
                      <th className="p-2 text-right">{t("count")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthsBarChart.labels.map((lab, i) => (
                      <tr key={`${lab}-${i}`} className={i % 2 ? "bg-gray-800" : "bg-gray-900"}>
                        <td className="border border-gray-700 p-2">{lab}</td>
                        <td className="border border-gray-700 p-2 text-right">{monthsBarChart.datasets[0].data[i] || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}