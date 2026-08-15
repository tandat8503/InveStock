import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from './components/layout/Layout'
import { Dashboard } from './pages/Dashboard'
import { ProductsPage } from './pages/Products/index'
import { SuppliersPage } from './pages/Suppliers/index'
import { PurchasesPage } from './pages/Purchases/index'
import { SalesPage } from './pages/Sales/index'
import { InventoryPage } from './pages/Inventory/index'
import { InvoicesPage } from './pages/Invoices/index'
import { ReportsPage } from './pages/Reports/index'
import { SettingsPage } from './pages/Settings/index'

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="products/*" element={<ProductsPage />} />
          <Route path="suppliers/*" element={<SuppliersPage />} />
          <Route path="purchases/*" element={<PurchasesPage />} />
          <Route path="sales/*" element={<SalesPage />} />
          <Route path="inventory" element={<InventoryPage />} />
          <Route path="invoices" element={<InvoicesPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
