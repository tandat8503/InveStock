import { useState, useEffect } from 'react';
import { ReportTabs, type ReportTab } from './ReportTabs';
import { ImportExportReport } from './ImportExportReport';
import { RevenueReport } from './RevenueReport';
import { ProductSalesReport } from './ProductSalesReport';
import { appCommands } from '@/lib/commands';
import type { ReportDataRange } from '@shared/ipc-types';

const today = new Date().toISOString().slice(0,10);
const initial = { dateFrom: `${today.slice(0,4)}-01-01`, dateTo: today };

export function ReportsPage() {
  const [tab, setTab] = useState<ReportTab>('inventory');
  const [range, setRange] = useState<ReportDataRange | null>(null);

  useEffect(() => {
    void appCommands.reports.getDataRange().then((res) => {
      if (res.data) {
        setRange(res.data);
      }
    });
  }, []);

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Báo cáo</h1>
        <p className="text-sm text-gray-500">Dữ liệu từ chứng từ đã xác nhận</p>
      </div>
      <ReportTabs value={tab} onChange={setTab}/>
      {tab === 'inventory' ? (
        <ImportExportReport initial={initial} range={range} />
      ) : tab === 'revenue' ? (
        <RevenueReport initial={initial} range={range} />
      ) : (
        <ProductSalesReport initial={initial} range={range} />
      )}
    </div>
  );
}
