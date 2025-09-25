import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import DOMPurify from 'dompurify';
import Link from 'next/link';

// Converts "2025-04-13" -> "Apr 13, 2025" without timezone issues
const toMMM_DD_YYYY = (isoDate) => {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(m, 10) - 1]} ${d.padStart(2, '0')}, ${y}`;
};

export default function Tenders() {
  const { t } = useTranslation();
  const [tenders, setTenders] = useState([]);
  const [regions, setRegions] = useState([]);
  const [sectors, setSectors] = useState([]);
  const [totalTenders, setTotalTenders] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const tendersPerPage = 20;
  const maxPageNumbers = 10;
  const [filters, setFilters] = useState({
    region: '',
    sector: '',
    status: 'All',
    keyword: '',
    publishedStart: '',
    publishedEnd: '',
    sortBy: 'Published_On',
    sortOrder: 'desc',
  });

  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        setError(null);
        // Fetch regions
        const regionResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/trends/regions`);
        if (!regionResponse.ok) throw new Error(`Failed to fetch regions: ${regionResponse.status}`);
        const regions = await regionResponse.json();
        setRegions(regions);

        // Fetch sectors
        const sectorResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/trends/sectors`);
        if (!sectorResponse.ok) throw new Error(`Failed to fetch sectors: ${sectorResponse.status}`);
        const sectors = await sectorResponse.json();
        setSectors(sectors);

        // Fetch tenders
        await fetchTenders();
      } catch (error) {
        console.error('Error fetching initial data:', error);
        setError(error.message);
      }
    };

    fetchInitialData();
  }, []);

  const fetchTenders = async () => {
    try {
      setError(null);
      let query = `${process.env.NEXT_PUBLIC_API_URL}/tenders?`;

      if (filters.region) query += `region=${encodeURIComponent(filters.region)}&`;
      if (filters.sector) query += `sector=${encodeURIComponent(filters.sector)}&`;
      if (filters.status !== 'All') query += `status=${encodeURIComponent(filters.status)}&`;
      if (filters.keyword) query += `keyword=${encodeURIComponent(filters.keyword)}&`;

      // Only 2 published date filters now
      const issueStart = toMMM_DD_YYYY(filters.publishedStart);
      const issueEnd   = toMMM_DD_YYYY(filters.publishedEnd);

      if (issueStart) query += `issueDateStart=${encodeURIComponent(issueStart)}&`;
      if (issueEnd)   query += `issueDateEnd=${encodeURIComponent(issueEnd)}&`;

      query += `sortBy=${encodeURIComponent(filters.sortBy)}&sortOrder=${encodeURIComponent(filters.sortOrder)}`;
      query += `&page=${currentPage}&per_page=${tendersPerPage}`;

      // Debug
      console.log("Fetching with query:", query);

      const response = await fetch(query);
      if (!response.ok) throw new Error(`Failed to fetch tenders: ${response.status}`);
      const data = await response.json();

      if (!data.tenders) {
        setTenders([]);
        setTotalTenders(0);
        return;
      }

      const formattedTenders = data.tenders.map(tender => ({
        ...tender,
        title: DOMPurify.sanitize(tender.Title),
        description: DOMPurify.sanitize(tender.description || ''),
      }));

      setTenders(formattedTenders);
      setTotalTenders(data.total);
    } catch (error) {
      console.error('Error fetching tenders:', error);
      setError(error.message);
    }
  };



  useEffect(() => {
    fetchTenders();
  }, [filters, currentPage]);

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
    setCurrentPage(1);
  };

  const handleViewClick = (tender) => {
    const sanitizedTender = {
      ...tender,
      Title: DOMPurify.sanitize(tender.Title),
      description: DOMPurify.sanitize(tender.description || ''),
    };
    const viewWindow = window.open('', '_blank');
    viewWindow.document.write(`
      <html>
        <head>
          <title>${sanitizedTender.Title}</title>
          <style>
            body { font-family: 'Arial', sans-serif; background-color: #f4f4f9; color: #1f2937; margin: 0; padding: 40px; line-height: 1.6; }
            .container { max-width: 800px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); }
            h1 { font-size: 28px; color: #1e40af; margin-bottom: 20px; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px; }
            p { margin: 10px 0; font-size: 16px; }
            .label { font-weight: bold; color: #374151; }
            a { color: #2563eb; text-decoration: none; }
            a:hover { text-decoration: underline; }
            .close-btn { margin-top: 20px; padding: 10px 20px; background-color: #2563eb; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 16px; transition: background-color 0.3s; }
            .close-btn:hover { background-color: #1e40af; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>${sanitizedTender.Title}</h1>
            <p><span class="label">${t('description')}:</span> ${sanitizedTender.description}</p>
            <p><span class="label">${t('region')}:</span> ${sanitizedTender.Region}</p>
            <p><span class="label">${t('sector')}:</span> ${sanitizedTender.Sector}</p>
            <p><span class="label">${t('published_on')}:</span> ${sanitizedTender.Published_On}</p>
            <p><span class="label">${t('closing_date')}:</span> ${sanitizedTender.Closing_Date}</p>
            <p><span class="label">${t('status')}:</span> ${sanitizedTender.status}</p>
            <p><span class="label">${t('link')}:</span> <a href="${sanitizedTender.URL}" target="_blank">${sanitizedTender.URL}</a></p>
            <button class="close-btn" onclick="window.close()">${t('close')}</button>
          </div>
        </body>
      </html>
    `);
  };

  const totalPages = Math.ceil(totalTenders / tendersPerPage);

  const getPageNumbers = () => {
    const pageNumbers = [];
    const maxPagesToShow = maxPageNumbers;

    if (totalPages <= maxPagesToShow) {
      for (let i = 1; i <= totalPages; i++) {
        pageNumbers.push(i);
      }
    } else {
      const half = Math.floor(maxPagesToShow / 2);
      let start = Math.max(1, currentPage - half);
      let end = Math.min(totalPages, start + maxPagesToShow - 1);

      if (end - start < maxPagesToShow - 1) {
        start = Math.max(1, end - maxPagesToShow + 1);
      }

      if (start > 1) {
        pageNumbers.push(1);
        if (start > 2) pageNumbers.push('...');
      }

      for (let i = start; i <= end; i++) {
        pageNumbers.push(i);
      }

      if (end < totalPages) {
        if (end < totalPages - 1) pageNumbers.push('...');
        pageNumbers.push(totalPages);
      }
    }

    return pageNumbers;
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">{t('tenders')}</h1>
      <Link href="/" className="text-blue-600 hover:underline mb-4 inline-block">{t('back_to_home')}</Link>
      <p className="mb-4">Total Tenders: {totalTenders}</p>
      {error && <div className="text-red-600 mb-4">{t('error')}: {error}</div>}

      <div className="mb-4 grid grid-cols-1 md:grid-cols-4 gap-4">
        <select
          name="region"
          value={filters.region}
          onChange={handleFilterChange}
          className="p-2 border rounded bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
        >
          <option value="">{t('all_regions')}</option>
          {regions.map(region => (
            <option key={region} value={region}>{region}</option>
          ))}
        </select>
        <select
          name="sector"
          value={filters.sector}
          onChange={handleFilterChange}
          className="p-2 border rounded bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
        >
          <option value="">{t('all_sectors')}</option>
          {sectors.map(sector => (
            <option key={sector} value={sector}>{sector}</option>
          ))}
        </select>
        {/* <select
          name="status"
          value={filters.status}
          onChange={handleFilterChange}
          className="p-2 border rounded bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
        >
          <option value="All">{t('all_statuses')}</option>
          <option value="Open">{t('open')}</option>
          <option value="Closed">{t('closed')}</option>
        </select> */}
        <input
          type="text"
          name="keyword"
          value={filters.keyword}
          onChange={handleFilterChange}
          placeholder={t('search_keyword')}
          className="p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-600"
        />
        {/* <input
        type="date"
        name="publishedStart"
        value={filters.publishedStart}
        onChange={handleFilterChange}
        placeholder={t('published_start')}
        className="p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-600"
      />
      <input
        type="date"
        name="publishedEnd"
        value={filters.publishedEnd}
        onChange={handleFilterChange}
        placeholder={t('published_end')}
        className="p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-600"
      /> */}

        <div className="p-2 border rounded bg-gray-100 flex gap-2">
          <div>Sort By</div>
          <select
            name="sortBy"
            value={filters.sortBy}
            onChange={handleFilterChange}
            className="p-2 border rounded bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 flex-1"
          >
            <option value="Published_On">{t('published_on')}</option>
            <option value="Closing_Date">{t('closing_date')}</option>
            <option value="Title">{t('title')}</option>
          </select>
          <select
            name="sortOrder"
            value={filters.sortOrder}
            onChange={handleFilterChange}
            className="p-2 border rounded bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 flex-1"
          >
            <option value="desc">{t('descending')}</option>
            <option value="asc">{t('ascending')}</option>
          </select>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full bg-white border">
          <thead>
            <tr>
              <th className="py-2 px-4 border">{t('title')}</th>
              <th className="py-2 px-4 border">{t('region')}</th>
              <th className="py-2 px-4 border">{t('sector')}</th>
              <th className="py-2 px-4 border">{t('published_on')}</th>
              <th className="py-2 px-4 border">{t('closing_date')}</th>
              <th className="py-2 px-4 border">{t('status')}</th>
              <th className="py-2 px-4 border">{t('actions')}</th>
            </tr>
          </thead>
          <tbody>
            {tenders.map(tender => (
              <tr key={tender.id}>
                <td className="py-2 px-4 border">{tender.title}</td>
                <td className="py-2 px-4 border">{tender.Region}</td>
                <td className="py-2 px-4 border">{tender.Sector}</td>
                <td className="py-2 px-4 border">{tender.Published_On}</td>
                <td className="py-2 px-4 border">{tender.Closing_Date}</td>
                <td className="py-2 px-4 border">{tender.status}</td>
                <td className="py-2 px-4 border">
                  <button
                    onClick={() => handleViewClick(tender)}
                    className="text-blue-600 hover:underline"
                  >
                    {t('view')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex justify-center items-center gap-2 flex-wrap">
        <button
          onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
          disabled={currentPage === 1}
          className="px-4 py-2 bg-blue-600 text-white rounded disabled:bg-gray-400 hover:bg-blue-700"
        >
          {t('previous')}
        </button>
        {getPageNumbers().map((page, index) => (
          <React.Fragment key={index}>
            {page === '...' ? (
              <span className="px-4 py-2">...</span>
            ) : (
              <button
                onClick={() => setCurrentPage(page)}
                className={`px-4 py-2 rounded ${currentPage === page ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
              >
                {page}
              </button>
            )}
          </React.Fragment>
        ))}
        <button
          onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
          disabled={currentPage === totalPages}
          className="px-4 py-2 bg-blue-600 text-white rounded disabled:bg-gray-400 hover:bg-blue-700"
        >
          {t('next')}
        </button>
      </div>
    </div>
  );
}