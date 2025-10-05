import React, { useEffect, useState } from "react";
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
import { useRouter } from "next/router";

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend);

export default function Public() {
  const router = useRouter();
  const [regionCounts, setRegionCounts] = useState([]);
  const [sectorCounts, setSectorCounts] = useState([]);
  const [monthCounts, setMonthCounts] = useState([]);

  useEffect(() => {
    const fetchPublicData = async () => {
      const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      try {
        const [regionsRes, sectorsRes, monthsRes] = await Promise.all([
          fetch(`${base}/public/regions/counts`),
          fetch(`${base}/public/sectors/counts`),
          fetch(`${base}/public/months/counts`),
        ]);
        if (!regionsRes.ok) throw new Error("Failed to fetch region counts");
        if (!sectorsRes.ok) throw new Error("Failed to fetch sector counts");
        if (!monthsRes.ok) throw new Error("Failed to fetch month counts");
        setRegionCounts(await regionsRes.json());
        setSectorCounts(await sectorsRes.json());
        setMonthCounts(await monthsRes.json());
      } catch (error) {
        console.error("Error fetching public data:", error);
      }
    };
    fetchPublicData();
  }, []);

  const regionChartData = {
    labels: regionCounts.map(r => r.region),
    datasets: [
      {
        label: "Top 10 Regions in 2025",
        data: regionCounts.map(r => r.count),
        backgroundColor: "rgba(54, 162, 235, 0.6)",
        barThickness: 20,
      },
    ],
  };

  const sectorChartData = {
    labels: sectorCounts.map(s => s.predicted_category),
    datasets: [
      {
        label: "Top 10 Sectors in 2025",
        data: sectorCounts.map(s => s.count),
        backgroundColor: "rgba(75, 192, 192, 0.6)",
        barThickness: 20,
      },
    ],
  };

  const monthChartData = {
    labels: monthCounts.map(m => `${new Date(2025, m.month - 1).toLocaleString('default', { month: 'short' })} 2025`),
    datasets: [
      {
        label: "Tender Trends in 2025",
        data: monthCounts.map(m => m.count),
        borderColor: "rgba(153, 102, 255, 0.6)",
        backgroundColor: "rgba(153, 102, 255, 0.2)",
        fill: true,
        tension: 0.1,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: "#333" } },
      title: { display: true, color: "#333" },
    },
    scales: {
      x: { ticks: { color: "#666" } },
      y: { ticks: { color: "#666" }, beginAtZero: true },
    },
  };

  return (
    <div className="min-h-screen bg-gray-100 font-sans">
      {/* Navigation Menu (Top) */}
      <nav className="bg-gray-800 text-white p-4">
        <ul className="flex space-x-6 justify-center">
          <li><a href="/" className="hover:text-blue-300">Home</a></li>
          <li><a href="/about" className="hover:text-blue-300">About</a></li>
          <li><a href="/contact" className="hover:text-blue-300">Contact</a></li>
          <li><a href="/login" className="hover:text-blue-300">Log In</a></li>
          <li><a href="/register" className="hover:text-blue-300">Sign Up</a></li>
        </ul>
      </nav>

      {/* Welcome and What This Web App Does Section */}
      <header className="bg-blue-600 text-white py-12 text-center">
        <h1 className="text-4xl font-bold">Welcome to TenderTrend</h1>
        <p className="mt-2 text-lg">TenderTrend helps businesses discover, analyze, and win tenders with smart insights tailored to your needs.</p>
      </header>

      {/* Hero Section */}
      <section className="bg-blue-50 py-12 text-center">
        <h2 className="text-4xl font-bold text-gray-800">Unlock Tender Opportunities with TenderTrend</h2>
        <p className="mt-4 text-lg text-gray-600">Explore global tender trends in 2025 and get started with free summaries.</p>
        <div className="mt-6 space-x-4">
          <button
            onClick={() => router.push("/login")}
            className="bg-white text-blue-600 px-6 py-2 rounded-full font-semibold hover:bg-gray-200"
          >
            Log In
          </button>
          <button
            onClick={() => router.push("/register")}
            className="bg-green-500 text-white px-6 py-2 rounded-full font-semibold hover:bg-green-600"
          >
            Sign Up
          </button>
        </div>
      </section>

      {/* Features Section */}
      <section className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <h2 className="text-2xl font-bold text-gray-800 text-center mb-8">Features</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="text-center p-4 bg-white rounded-lg shadow">
            <h3 className="text-lg font-semibold text-gray-700">Tender Discovery</h3>
            <p className="text-gray-600 mt-2">Find relevant tenders effortlessly.</p>
            <a href="/dashboard" className="text-blue-500 hover:underline mt-2 block">Learn More</a>
          </div>
          <div className="text-center p-4 bg-white rounded-lg shadow">
            <h3 className="text-lg font-semibold text-gray-700">Smart Analysis</h3>
            <p className="text-gray-600 mt-2">Gain insights with advanced tools.</p>
            <a href="/dashboard" className="text-blue-500 hover:underline mt-2 block">Learn More</a>
          </div>
          <div className="text-center p-4 bg-white rounded-lg shadow">
            <h3 className="text-lg font-semibold text-gray-700">Bid Insights</h3>
            <p className="text-gray-600 mt-2">Optimize your bidding strategy.</p>
            <a href="/dashboard" className="text-blue-500 hover:underline mt-2 block">Learn More</a>
          </div>
          <div className="text-center p-4 bg-white rounded-lg shadow">
            <h3 className="text-lg font-semibold text-gray-700">Alerts & Notifications</h3>
            <p className="text-gray-600 mt-2">Stay updated on new opportunities.</p>
            <a href="/dashboard" className="text-blue-500 hover:underline mt-2 block">Learn More</a>
          </div>
        </div>
      </section>

      {/* Why Choose Us (Value Proposition Section) */}
      <section className="bg-gray-200 py-12 text-center">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">Why Choose Us</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          <div className="p-4">
            <h3 className="text-lg font-semibold text-gray-700">Save Time</h3>
            <p className="text-gray-600 mt-2">No more scrolling through hundreds of tenders.</p>
          </div>
          <div className="p-4">
            <h3 className="text-lg font-semibold text-gray-700">Win More</h3>
            <p className="text-gray-600 mt-2">Focus only on tenders that match your profile.</p>
          </div>
          <div className="p-4">
            <h3 className="text-lg font-semibold text-gray-700">Affordable</h3>
            <p className="text-gray-600 mt-2">Tailored pricing for SMEs.</p>
          </div>
        </div>
      </section>

      {/* Summary Section */}
      <main className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-gray-800 mb-6">2025 Tender Trends Overview</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Regions Chart */}
            <div className="bg-white p-6 rounded-lg shadow-lg">
              <h3 className="text-xl font-semibold text-gray-700 mb-4">Top 10 Regions in 2025</h3>
              <div style={{ height: "300px" }}>
                <Bar data={regionChartData} options={chartOptions} />
              </div>
              <table className="mt-4 w-full text-sm">
                <thead>
                  <tr className="bg-gray-200">
                    <th className="p-2 text-left">Region</th>
                    <th className="p-2 text-right">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {regionCounts.map(r => (
                    <tr key={r.region} className="border-b">
                      <td className="p-2">{r.region}</td>
                      <td className="p-2 text-right">{r.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button
                onClick={() => router.push("/dashboard")}
                className="mt-4 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
              >
                View Detailed Regions
              </button>
            </div>

            {/* Sectors Chart */}
            <div className="bg-white p-6 rounded-lg shadow-lg">
              <h3 className="text-xl font-semibold text-gray-700 mb-4">Top 10 Sectors in 2025</h3>
              <div style={{ height: "300px" }}>
                <Bar data={sectorChartData} options={chartOptions} />
              </div>
              <table className="mt-4 w-full text-sm">
                <thead>
                  <tr className="bg-gray-200">
                    <th className="p-2 text-left">Sector</th>
                    <th className="p-2 text-right">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {sectorCounts.map(s => (
                    <tr key={s.predicted_category} className="border-b">
                      <td className="p-2">{s.predicted_category}</td>
                      <td className="p-2 text-right">{s.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button
                onClick={() => router.push("/dashboard")}
                className="mt-4 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
              >
                View Detailed Sectors
              </button>
            </div>

            {/* Months Chart */}
            <div className="bg-white p-6 rounded-lg shadow-lg">
              <h3 className="text-xl font-semibold text-gray-700 mb-4">Tender Trends in 2025</h3>
              <div style={{ height: "300px" }}>
                <Line data={monthChartData} options={chartOptions} />
              </div>
              <table className="mt-4 w-full text-sm">
                <thead>
                  <tr className="bg-gray-200">
                    <th className="p-2 text-left">Month</th>
                    <th className="p-2 text-right">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {monthCounts.map(m => (
                    <tr key={`${m.year}-${m.month}`} className="border-b">
                      <td className="p-2">{`${new Date(2025, m.month - 1).toLocaleString('default', { month: 'short' })} 2025`}</td>
                      <td className="p-2 text-right">{m.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button
                onClick={() => router.push("/dashboard")}
                className="mt-4 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
              >
                View Detailed Trends
              </button>
            </div>
          </div>
        </section>

        {/* Call-to-Action Section */}
        <section className="text-center bg-gray-200 p-8 rounded-lg shadow-lg">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Dive Deeper with Personalized Analysis</h2>
          <p className="text-lg text-gray-600 mb-6">Log in or subscribe today for detailed filters and tailored insights!</p>
          <div className="space-x-4">
            <button
              onClick={() => router.push("/login")}
              className="bg-blue-600 text-white px-6 py-2 rounded-full font-semibold hover:bg-blue-700"
            >
              Log In
            </button>
            <button
              onClick={() => router.push("/register")}
              className="bg-green-500 text-white px-6 py-2 rounded-full font-semibold hover:bg-green-600"
            >
              Get Started Free
            </button>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-gray-800 text-white py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center">
          {/* Logo */}
          <div className="mb-4 md:mb-0">
            <span className="text-2xl font-bold">TenderLens</span> {/* Placeholder for logo */}
          </div>

          {/* Quick Links */}
          <div className="mb-4 md:mb-0">
            <h4 className="text-lg font-semibold mb-2">Quick Links</h4>
            <ul className="space-y-1">
              <li><a href="/support" className="hover:text-blue-300">Support/Help Desk</a></li>
              <li><a href="/terms" className="hover:text-blue-300">Terms & Privacy</a></li>
            </ul>
          </div>

          {/* Contact Info */}
          <div className="mb-4 md:mb-0">
            <h4 className="text-lg font-semibold mb-2">Contact Info</h4>
            <p>Email: support@tendertrend.com</p>
            <p>Phone: +251 911 123 456</p>
          </div>

          {/* Social Media Icons */}
          <div className="mb-4 md:mb-0">
            <h4 className="text-lg font-semibold mb-2">Follow Us</h4>
            <div className="flex space-x-4">
              <a href="https://facebook.com" className="hover:text-blue-300">Facebook</a>
              <a href="https://twitter.com" className="hover:text-blue-300">Twitter</a>
              <a href="https://linkedin.com" className="hover:text-blue-300">LinkedIn</a>
            </div>
          </div>
        </div>
        <div className="text-center mt-4 text-sm text-gray-400">
          &copy; TenderLens 2025. All rights reserved.
        </div>
      </footer>
    </div>
  );
}