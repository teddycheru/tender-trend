import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  en: {
    translation: {
      title: 'TenderTrend',
      tenders: 'Tenders',
      select_view: 'Select View',
      regions: 'Regions',
      sectors: 'Sectors',
      months: 'Publication Months',
      tenders_by_region: 'Tenders by Region',
      tenders_by_sector: 'Tenders by Sector',
      tenders_by_month: 'Tenders by Publication Month',
      all_regions: 'All Regions',
      all_sectors: 'All Sectors',
      all_statuses: 'All Statuses',
      open: 'Open',
      closed: 'Closed',
      search_keyword: 'Search by Keyword',
      published_on: 'Published On',
      closing_date: 'Closing Date',
      published_start: 'Published Start Date',
      published_end: 'Published End Date',
      closing_start: 'Closing Start Date',
      closing_end: 'Closing End Date',
      sort_by: 'Sort By',
      ascending: 'Ascending',
      descending: 'Descending',
      view: 'View',
      link: 'Link',
      description: 'Description',
      status: 'Status',
      region: 'Region',
      sector: 'Sector',
      back_to_home: 'Back to Home',
      close: 'Close',
      previous: 'Previous',
      next: 'Next',
      total_tenders: 'Total Tenders'
    }
  },
  am: {
    translation: {
      title: 'የጨረታ አዝማሚያ',
      tenders: 'ጨረታዎች',
      select_view: 'እይታ ምረጥ',
      regions: 'ክልሎች',
      sectors: 'ዘርፎች',
      months: 'የህትመት ወራት',
      tenders_by_region: 'በክልል የጨረታዎች',
      tenders_by_sector: 'በዘርፍ የጨረታዎች',
      tenders_by_month: 'በህትመት ወር የጨረታዎች',
      all_regions: 'ሁሉም ክልሎች',
      all_sectors: 'ሁሉም ዘርፎች',
      all_statuses: 'ሁሉም ሁኔታዎች',
      open: 'ክፍት',
      closed: 'ዝግ',
      search_keyword: 'በቁልፍ ቃል ፈልግ',
      published_on: 'የታተመበት ቀን',
      closing_date: 'የመዝጊያ ቀን',
      published_start: 'የታተመበት መጀመሪያ ቀን',
      published_end: 'የታተመበት መጨረሻ ቀን',
      closing_start: 'የመዝጊዪያ መጀመሪያ ቀን',
      closing_end: 'የመዝጊያ መጨረሻ ቀን',
      sort_by: 'ቅደም ተከተል',
      ascending: 'እየጨመረ',
      descending: 'እየቀነሰ',
      view: 'ተመልከት',
      link: 'አገናኝ',
      description: 'መግለጫ',
      status: 'ሁኔታ',
      region: 'ክልል',
      sector: 'ዘርፍ',
      back_to_home: 'ወደ መነሻ ገፅ ተመለስ',
      close: 'ዝጋ',
      previous: 'ቀዳሚ',
      next: 'ቀጣይ',
      total_tenders: 'ጠቅላላ ጨረታዎች'
    }
  }
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: 'en',
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;