import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import DOMPurify from 'dompurify';
import Link from 'next/link';

const toMMM_DD_YYYY = (isoDate) => {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(m, 10) - 1]} ${d.padStart(2,'0')}, ${y}`;
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
        const regionRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/trends/regions`);
        if (!regionRes.ok) throw new Error(`Failed to fetch regions: ${regionRes.status}`);
        setRegions(await regionRes.json());

        const sectorRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/trends/sectors`);
        if (!sectorRes.ok) throw new Error(`Failed to fetch sectors: ${sectorRes.status}`);
        setSectors(await sectorRes.json());

        await fetchTenders();
      } catch (err) {
        console.error(err);
        setError(err.message);
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

      const issueStart = filters.publishedStart;
      const issueEnd = filters.publishedEnd;
      if (issueStart) query += `issueDateStart=${encodeURIComponent(issueStart)}&`;
      if (issueEnd) query += `issueDateEnd=${encodeURIComponent(issueEnd)}&`;

      query += `sortBy=${encodeURIComponent(filters.sortBy)}&sortOrder=${encodeURIComponent(filters.sortOrder)}&page=${currentPage}&per_page=${tendersPerPage}`;

      const res = await fetch(query);
      if (!res.ok) throw new Error(`Failed to fetch tenders: ${res.status}`);
      const data = await res.json();

      if (!data.tenders) {
        setTenders([]);
        setTotalTenders(0);
        return;
      }

      setTenders(
        data.tenders.map(t => ({
          ...t,
          title: DOMPurify.sanitize(t.title),
          description: DOMPurify.sanitize(t.description || ''),
        }))
      );
      setTotalTenders(data.total);
    } catch (err) {
      console.error(err);
      setError(err.message);
    }
  };

  useEffect(() => { fetchTenders(); }, [filters, currentPage]);

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
    setCurrentPage(1);
  };

  const handleViewClick = (tender) => {
    const sanitizedTender = {
      ...tender,
      title: DOMPurify.sanitize(tender.title),
      description: DOMPurify.sanitize(tender.description || ''),
      region: tender.region,
      sector: tender.predicted_category,
      published_on: tender.published_on,
      closing_date: tender.closing_date,
      url: tender.url,
    };

    const win = window.open('', '_blank');
    win.document.write(`
      <html>
        <head>
          <title>${sanitizedTender.title}</title>
          <style>
            body { font-family: 'Arial', sans-serif; background:#f4f4f9; color:#1f2937; margin:0; padding:40px; }
            .container { max-width:800px; margin:auto; background:white; padding:20px; border-radius:10px; box-shadow:0 4px 10px rgba(0,0,0,0.1); }
            h1 { font-size:28px; color:#1e40af; margin-bottom:20px; border-bottom:2px solid #e5e7eb; padding-bottom:10px; }
            p { margin:10px 0; font-size:16px; }
            .label { font-weight:bold; color:#374151; }
            a { color:#2563eb; text-decoration:none; }
            a:hover { text-decoration:underline; }
            .close-btn { margin-top:20px; padding:10px 20px; background:#2563eb; color:white; border:none; border-radius:5px; cursor:pointer; font-size:16px; }
            .close-btn:hover { background:#1e40af; }
          </style>
        </head>
        <body>
          <div class="container">
            <button class="close-btn" onclick="window.close()">${t('back')}</button>
            <h1>${sanitizedTender.title}</h1>
            <p><span class="label">${t('description')}:</span> ${sanitizedTender.description}</p>
            <p><span class="label">${t('region')}:</span> ${sanitizedTender.region}</p>
            <p><span class="label">${t('sector')}:</span> ${sanitizedTender.sector}</p>
            <p><span class="label">${t('published_on')}:</span> ${sanitizedTender.published_on}</p>
            <p><span class="label">${t('closing_date')}:</span> ${sanitizedTender.closing_date}</p>
            <p><span class="label">${t('status')}:</span> ${sanitizedTender.status}</p>
            <p><span class="label">${t('link')}:</span> <a href="${sanitizedTender.url}" target="_blank">${sanitizedTender.url}</a></p>
            <button class="close-btn" onclick="window.close()">${t('close')}</button>
          </div>
        </body>
      </html>
    `);
  };

  const totalPages = Math.ceil(totalTenders / tendersPerPage);
  const getPageNumbers = () => {
    const pages = [];
    const maxPages = maxPageNumbers;
    if (totalPages <= maxPages) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      let start = Math.max(1, currentPage - Math.floor(maxPages/2));
      let end = Math.min(totalPages, start + maxPages - 1);
      if (end - start < maxPages-1) start = Math.max(1,end - maxPages+1);
      if (start > 1) { pages.push(1); if (start>2) pages.push('...'); }
      for (let i=start;i<=end;i++) pages.push(i);
      if (end<totalPages){ if(end<totalPages-1) pages.push('...'); pages.push(totalPages);}
    }
    return pages;
  };

  return (
    <div className="container mx-auto p-6">
      {/* Header & Back */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        {/* Move Back to Home to the left */}
        <Link 
          href="/"
          className="inline-block px-4 py-2 bg-blue-600 text-white rounded shadow hover:bg-blue-700 transition-colors duration-200 order-1 sm:order-0"
        >
          {t('back_to_home')}
        </Link>
         <h1 className="text-4xl sm:text-5xl font-extrabold text-blue-800 order-0 sm:order-1">
            {t('tenders')}
          </h1>
      </div>

      {/* Total Tenders */}
      <div className="mb-6">
        <span className="text-lg sm:text-xl font-semibold text-gray-800">
          {t('total_tenders')}: 
        </span>
        <span className="ml-2 inline-block px-3 py-1 bg-blue-100 text-blue-800 font-medium rounded-full shadow">
          {totalTenders.toLocaleString()}
        </span>
      </div>
      {error && <div className="text-red-600 mb-4 font-medium">{t('error')}: {error}</div>}

      {/* Filters */}
      <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <select name="region" value={filters.region} onChange={handleFilterChange} className="p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white">
          <option value="">{t('all_regions')}</option>
          {regions.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <select name="sector" value={filters.sector} onChange={handleFilterChange} className="p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white">
          <option value="">{t('all_sectors')}</option>
          {sectors.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <input type="text" name="keyword" value={filters.keyword} onChange={handleFilterChange} placeholder={t('search_keyword')} className="p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-600"/>
        <div className="p-2 border rounded bg-gray-100 flex gap-2 items-center">
          <span>{t('sort_by')}</span>
          <select name="sortBy" value={filters.sortBy} onChange={handleFilterChange} className="p-2 border rounded bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 flex-1">
            <option value="Published_On">{t('published_on')}</option>
            <option value="Closing_Date">{t('closing_date')}</option>
            <option value="title">{t('title_column')}</option>
          </select>
          <select name="sortOrder" value={filters.sortOrder} onChange={handleFilterChange} className="p-2 border rounded bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 flex-1">
            <option value="desc">{t('descending')}</option>
            <option value="asc">{t('ascending')}</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto shadow-md rounded-lg">
        <table className="min-w-full border-collapse">
          <thead className="bg-blue-50">
            <tr>
              <th className="py-3 px-4 border-b font-medium text-left">{t('title_column')}</th>
              <th className="py-3 px-4 border-b font-medium text-left">{t('region')}</th>
              <th className="py-3 px-4 border-b font-medium text-left">{t('sector')}</th>
              <th className="py-3 px-4 border-b font-medium text-left">{t('published_on')}</th>
              <th className="py-3 px-4 border-b font-medium text-left">{t('closing_date')}</th>
              <th className="py-3 px-4 border-b font-medium text-left">{t('status')}</th>
              <th className="py-3 px-4 border-b font-medium text-left">{t('actions')}</th>
            </tr>
          </thead>
          <tbody>
            {tenders.map((tender, idx) => (
              <tr key={tender.id} className={idx % 2 === 0 ? 'bg-white hover:bg-blue-50' : 'bg-gray-50 hover:bg-blue-50'}>
                <td className="py-2 px-4 border-b">{tender.title}</td>
                <td className="py-2 px-4 border-b">{tender.region}</td>
                <td className="py-2 px-4 border-b">{tender.predicted_category}</td>
                <td className="py-2 px-4 border-b">{tender.published_on}</td>
                <td className="py-2 px-4 border-b">{tender.closing_date}</td>
                <td className="py-2 px-4 border-b">{tender.status}</td>
                <td className="py-2 px-4 border-b">
                  <button onClick={() => handleViewClick(tender)} className="text-blue-600 hover:underline font-medium">{t('view')}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="mt-6 flex justify-center flex-wrap gap-2 items-center">
        <button onClick={() => setCurrentPage(p => Math.max(1,p-1))} disabled={currentPage===1} className="px-4 py-2 bg-blue-600 text-white rounded disabled:bg-gray-400 hover:bg-blue-700">{t('previous')}</button>
        {getPageNumbers().map((page,i) => (
          page==='...' ? <span key={i} className="px-4 py-2">...</span> :
          <button key={i} onClick={() => setCurrentPage(page)} className={`px-4 py-2 rounded ${currentPage===page?'bg-blue-600 text-white':'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}>{page}</button>
        ))}
        <button onClick={() => setCurrentPage(p => Math.min(totalPages,p+1))} disabled={currentPage===totalPages} className="px-4 py-2 bg-blue-600 text-white rounded disabled:bg-gray-400 hover:bg-blue-700">{t('next')}</button>
      </div>
    </div>
  );
}