import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useRouter } from "next/router";
import { Bar, Line } from "react-chartjs-2";
import { Plus, Minus } from "lucide-react";
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

const FRONTEND_SECTORS = {
  "ICT and Digital Solutions": [
    "IT Consultancy",
    "Digital Services",
    "IT and Infrastructure",
    "Networking and Communications Equipment",
    "Telecommunications",
  ],
  "Construction and Infrastructure": [
    "Construction and Real Estate",
    "Building Materials",
    "Architecture and Design",
    "Surveying and Geospatial",
    "Facilities Management",
  ],
  "Engineering and Technical Services": [
    "Technical Consultancy",
    "Industrial Equipment and Machinery",
    "Energy and Utilities",
    "Renewable Energy",
    "Oil, Gas and Petrochemicals",
    "Cold Chain & Refrigeration",
  ],
  "Health and Medical": [
    "Health and Nutrition",
    "Pharmaceuticals and Medical Supplies",
    "Medical Equipment and Accessories",
  ],
  "Agriculture and Environment": [
    "Agriculture and Agro-Processing",
    "Fisheries and Aquaculture",
    "Water and Sanitation",
  ],
  "Education and Capacity Building": [
    "Education and Training",
    "Training Services",
    "Research and Development",
  ],
  "Finance and Legal": [
    "Accounting and Finance",
    "Financial & Audit Consultancy",
    "Investment and Asset Management",
    "Legal Consultancy",
  ],
  "Corporate and Management Services": [
    "Management Consultancy",
    "Organizational Development",
    "Corporate Services",
  ],
  "Supplies and Equipment": [
    "Office Equipment and Furniture",
    "Printing and Publishing",
    "Vehicles and Automotive",
    "Chemicals and Materials",
    "Metal and Metal Working",
    "Wood and Wood Working",
    "Packaging and Labelling",
    "Textiles and Apparel",
  ],
  "Social and Development Services": [
    "Social Services",
    "Hospitality and Tourism",
    "Food and Beverage Services",
  ],
  "Other": [], // uncategorized
};

// Flatten sub-categories to map sub-category => main category
const SUB_TO_MAIN = {};
Object.entries(FRONTEND_SECTORS).forEach(([main, subs]) => {
  subs.forEach((s) => (SUB_TO_MAIN[s] = main));
});

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend);

export default function Dashboard() {
  const { t } = useTranslation();
  const router = useRouter();

  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loadingAuth, setLoadingAuth] = useState(true);
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

  const normalize = (s) => (typeof s === "string" ? s.trim().toLowerCase() : "");

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
        setAllYearsOpts([...yearSet].sort((a, b) => b - a).map((y) => ({ value: y, label: y })));

        // Set default to all months and the latest year
        // Find the latest month based on the most recent year-month key
        const sortedKeys = Object.keys(monthMap).sort((a, b) => new Date(b + "-01") - new Date(a + "-01"));
        const latestKey = sortedKeys[0];
        const latestMonthName = latestKey ? monthMap[latestKey].label.split(" ")[0] : uniqueMonthNames[0] || "August";
        setSelectedMonths([{ value: latestMonthName, label: latestMonthName }]);
        setSelectedYears([]); // Keep years empty by default
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

  const sectorChart = useMemo(() => {
    if (!sectors.length) return { labels: [], datasets: [] };

    const selected = selectedSectors.length
      ? selectedSectors.map((o) => o.value)
      : Object.keys(FRONTEND_SECTORS);

    const countsMap = {};
    if (Array.isArray(sectorCounts) && sectorCounts.length) {
      for (const r of sectorCounts) {
        const cat = r.predicted_category ?? r.category ?? r.sector ?? null;
        if (!cat) continue;

        let mainCat = "Other";
        let isSubCategory = false;
        for (const [main, subs] of Object.entries(FRONTEND_SECTORS)) {
          if (subs.includes(cat)) {
            mainCat = main;
            isSubCategory = true;
            break;
          }
        }

        countsMap[cat] = (countsMap[cat] || 0) + Number(r.count) || 0;
        countsMap[mainCat] = (countsMap[mainCat] || 0) + Number(r.count) || 0;

        if (!isSubCategory && mainCat === "Other") {
          countsMap["Other"] = (countsMap["Other"] || 0) + Number(r.count) || 0;
        }
      }
    }

    const labels = selected;
    const data = labels.map((lab) => countsMap[lab] || 0);
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
  }, [sectorCounts, selectedSectors, t]);

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
      return `${monthName} ${year}`;
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

  const monthsBarChart = useMemo(() => {
    const keys = Object.keys(monthCountsMap);
    if (!keys.length) return { labels: [], datasets: [] };

    const selMonths = selectedMonths.map((o) => o.value);
    const selYears = selectedYears.map((o) => String(o.value));

    // Default to the latest month if none selected
    let monthsToShow = selMonths;
    if (!selMonths.length) {
      const sortedKeys = keys.sort((a, b) => new Date(b + "-01") - new Date(a + "-01"));
      const latestKey = sortedKeys[0];
      const latestMonthName = latestKey
        ? new Date(2000, Number(latestKey.split("-")[1]) - 1, 1).toLocaleString("default", { month: "long" })
        : "August";
      monthsToShow = [latestMonthName];
    }

    let filtered = keys;
    if (monthsToShow.length) {
      filtered = filtered.filter((k) => {
        const monthNum = Number(k.split("-")[1]);
        const monthName = new Date(2000, monthNum - 1, 1).toLocaleString("default", { month: "long" });
        return monthsToShow.includes(monthName);
      });
    }
    if (selYears.length) {
      filtered = filtered.filter((k) => selYears.includes(k.split("-")[0]));
    }

    filtered.sort((a, b) => new Date(a + "-01") - new Date(b + "-01"));

    const labels = filtered.map((k) => {
      const [year, month] = k.split("-");
      const monthName = new Date(year, Number(month) - 1, 1).toLocaleString("default", { month: "long" });
      return `${monthName} ${year}`;
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

  const monthsTrendChart = useMemo(() => {
    const keys = Object.keys(monthCountsMap);
    if (!keys.length) return { labels: [], datasets: [] };

    const selMonths = selectedMonths.map((o) => o.value);
    const allYears = [...new Set(keys.map((k) => k.split("-")[0]))].sort((a, b) => a - b);

    // Default to the latest month if none selected
    let monthsToShow = selMonths;
    if (!selMonths.length) {
      const sortedKeys = keys.sort((a, b) => new Date(b + "-01") - new Date(a + "-01"));
      const latestKey = sortedKeys[0];
      const latestMonthName = latestKey
        ? new Date(2000, Number(latestKey.split("-")[1]) - 1, 1).toLocaleString("default", { month: "long" })
        : "August";
      monthsToShow = [latestMonthName];
    }

    let filteredKeys = keys;
    if (selMonths.length) {
      filteredKeys = filteredKeys.filter((k) => {
        const monthNum = Number(k.split("-")[1]);
        const monthName = new Date(2000, monthNum - 1, 1).toLocaleString("default", { month: "long" });
        return monthsToShow.includes(monthName);
      });
    }
    if (selectedYears.length) {
      filteredKeys = filteredKeys.filter((k) => selectedYears.map((y) => String(y.value)).includes(k.split("-")[0]));
    }

    const monthData = {};
    filteredKeys.forEach((key) => {
      const [year, month] = key.split("-");
      const monthName = new Date(2000, Number(month) - 1, 1).toLocaleString("default", { month: "long" });
      if (!monthData[monthName]) monthData[monthName] = {};
      monthData[monthName][year] = monthCountsMap[key].count || 0;
    });

    const datasets = monthsToShow.map((monthName, index) => {
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
  if (!isAuthenticated) return null;

  return (
    <div className="flex h-screen bg-gray-900 text-gray-100 font-[Inter]" style={{ fontFamily: "Inter, sans-serif" }}>
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
            <p className="text-sm mb-3 text-gray-400 uppercase tracking-wide">Sectors</p>
            <ul className="space-y-2">
              {Object.entries(FRONTEND_SECTORS).map(([main, subs]) => {
                const isActive = subs.some((sub) => selectedSectors.some((s) => s.value === sub)) || (main === "Other" && selectedSectors.some((s) => s.value === "Other"));
                return (
                  <li key={main} className="border-b border-gray-700 pb-1">
                    <button
                      onClick={() =>
                        setExpanded((prev) => {
                          const newExpanded = {};
                          newExpanded[main] = !prev[main];
                          return newExpanded;
                        })
                      }
                      className={`flex justify-between items-center w-full text-left text-sm transition-all duration-200 ${
                        isActive ? "text-blue-400 font-bold" : "text-gray-300 hover:text-blue-400"
                      }`}
                    >
                      <span>{main}</span>
                      {subs.length > 0 ? (expanded[main] ? <Minus size={16} /> : <Plus size={16} />) : null}
                    </button>

                    {expanded[main] && subs.length > 0 && (
                      <ul className="mt-2 pl-3 space-y-1">
                        {subs.map((sub) => (
                          <li key={sub} className="flex items-center space-x-2">
                            <input
                              id={sub}
                              type="checkbox"
                              checked={selectedSectors.some((s) => s.value === sub)}
                              onChange={() => {
                                const newSelection = [...selectedSectors];
                                const index = newSelection.findIndex((s) => s.value === sub);
                                if (index > -1) newSelection.splice(index, 1);
                                else newSelection.push({ label: sub, value: sub });
                                setSelectedSectors(newSelection);
                              }}
                              className="accent-blue-500 cursor-pointer"
                            />
                            <label htmlFor={sub} className="text-xs text-gray-300 cursor-pointer hover:text-white">
                              {sub}
                            </label>
                          </li>
                        ))}
                      </ul>
                    )}
                    {main === "Other" && expanded[main] && (
                      <ul className="mt-2 pl-3 space-y-1">
                        <li className="flex items-center space-x-2">
                          <input
                            id="Other"
                            type="checkbox"
                            checked={selectedSectors.some((s) => s.value === "Other")}
                            onChange={() => {
                              const newSelection = [...selectedSectors];
                              const index = newSelection.findIndex((s) => s.value === "Other");
                              if (index > -1) newSelection.splice(index, 1);
                              else newSelection.push({ label: "Other", value: "Other" });
                              setSelectedSectors(newSelection);
                            }}
                            className="accent-blue-500 cursor-pointer"
                          />
                          <label htmlFor="Other" className="text-xs text-gray-300 cursor-pointer hover:text-white">
                            Other
                          </label>
                        </li>
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {selectedView === "monthsTrend" && (
          <div className="mt-6">
            <p className="text-sm mb-3 text-gray-400 uppercase tracking-wide">Filters</p>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-gray-300 mb-1 block">Months</label>
                <Select
                  isMulti
                  options={allMonthsOpts}
                  value={selectedMonths}
                  onChange={(selected) => setSelectedMonths(selected)}
                  className="text-sm"
                  classNamePrefix="select"
                  styles={{
                    control: (base) => ({
                      ...base,
                      backgroundColor: "#1F2937",
                      borderColor: "#4B5563",
                      color: "#D1D5DB",
                      "&:hover": { borderColor: "#3B82F6" },
                    }),
                    menu: (base) => ({
                      ...base,
                      backgroundColor: "#1F2937",
                      color: "#D1D5DB",
                    }),
                    option: (base, state) => ({
                      ...base,
                      backgroundColor: state.isSelected ? "#3B82F6" : state.isFocused ? "#374151" : "#1F2937",
                      color: "#D1D5DB",
                      "&:hover": { backgroundColor: "#374151" },
                    }),
                    multiValue: (base) => ({
                      ...base,
                      backgroundColor: "#3B82F6",
                      color: "#D1D5DB",
                    }),
                    multiValueLabel: (base) => ({
                      ...base,
                      color: "#D1D5DB",
                    }),
                    multiValueRemove: (base) => ({
                      ...base,
                      color: "#D1D5DB",
                      "&:hover": { backgroundColor: "#2563EB", color: "#FFFFFF" },
                    }),
                    placeholder: (base) => ({
                      ...base,
                      color: "#9CA3AF",
                    }),
                    input: (base) => ({
                      ...base,
                      color: "#D1D5DB",
                    }),
                  }}
                  placeholder="Select months..."
                />
              </div>
              <div>
                <label className="text-sm text-gray-300 mb-1 block">Years</label>
                <Select
                  isMulti
                  options={allYearsOpts}
                  value={selectedYears}
                  onChange={(selected) => setSelectedYears(selected)}
                  className="text-sm"
                  classNamePrefix="select"
                  styles={{
                    control: (base) => ({
                      ...base,
                      backgroundColor: "#1F2937",
                      borderColor: "#4B5563",
                      color: "#D1D5DB",
                      "&:hover": { borderColor: "#3B82F6" },
                    }),
                    menu: (base) => ({
                      ...base,
                      backgroundColor: "#1F2937",
                      color: "#D1D5DB",
                    }),
                    option: (base, state) => ({
                      ...base,
                      backgroundColor: state.isSelected ? "#3B82F6" : state.isFocused ? "#374151" : "#1F2937",
                      color: "#D1D5DB",
                      "&:hover": { backgroundColor: "#374151" },
                    }),
                    multiValue: (base) => ({
                      ...base,
                      backgroundColor: "#3B82F6",
                      color: "#D1D5DB",
                    }),
                    multiValueLabel: (base) => ({
                      ...base,
                      color: "#D1D5DB",
                    }),
                    multiValueRemove: (base) => ({
                      ...base,
                      color: "#D1D5DB",
                      "&:hover": { backgroundColor: "#2563EB", color: "#FFFFFF" },
                    }),
                    placeholder: (base) => ({
                      ...base,
                      color: "#9CA3AF",
                    }),
                    input: (base) => ({
                      ...base,
                      color: "#D1D5DB",
                    }),
                  }}
                  placeholder="Select years..."
                />
              </div>
            </div>
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