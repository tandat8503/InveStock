# Command usage inventory

Baseline: 2026-08-07, sau `npm ci` và `npm run typecheck`. `scripts/check-command-contract.mjs` là gate tự động; bảng này ghi quyết định RC.

| UI area | Typed method | Tauri command | Rust handler/service | RC status |
|---|---|---|---|---|
| Products | list/get/create/update | get_products/get_product_by_id/create_product/update_product | product_commands/ProductService | Implemented |
| Products | delete/toggleActive | delete_product/toggle_product_active | product_commands/ProductService | Implemented |
| Suppliers | list/get/create/update | get_suppliers/get_supplier_by_id/create_supplier/update_supplier | supplier_commands/SupplierService | Implemented |
| Suppliers | delete/toggleActive/stats/invoices | delete_supplier/toggle_supplier_active plus existing get/list commands | SupplierService/PurchaseService | Implemented; payment UI deferred |
| Purchases | list/get/create/confirm | get_purchase_invoices/get_purchase_invoice_by_id/create_purchase_invoice_draft/confirm_purchase_invoice | purchase_commands/PurchaseService | Implemented |
| Purchases | cancel/delete/payment | — | — | Deferred from RC; actions archived |
| Sales | list/get/create/confirm | get_sales_invoices/get_sales_invoice_by_id/create_sales_invoice_draft/confirm_sales_invoice | sale_commands/SaleService | Implemented |
| Sales | update/cancel/delete | — | — | Deferred from RC; actions archived |
| Inventory | summary/priceHistory | get_inventory_summary/get_product_price_history | inventory_commands/InventoryService | Implemented |
| Inventory | productHistory | get_product_inventory_history | inventory_commands/InventoryService | Implemented |
| Reports | revenue/productSales/supplierDebt/importExport/invoiceSearch | get_revenue_report/get_product_sales_report/get_supplier_debt_report/get_import_export_report/search_invoices | inventory_commands/InventoryService | Implemented |
| Reports | priceHistory/exportExcel | — | — | Deferred from RC; UI action must be removed/disabled |
| Payments | create/list | — | — | Required; pending transaction |
| Attachments | list/save/open/delete | — | — | Deferred from RC; UI action must be removed/disabled |
| Import wizard | parseFile/validate/execute/cancel/history/exportErrors | only legacy import_products_excel exists | ImportService incomplete | Deferred from RC; route must be removed until safe workflow exists |
| Backup | create/restore | create_backup/restore_backup | BackupService | Implemented |
| Backup | list/validate/status/health | list_backups/validate_backup/get_backup_status/run_backup_health_check | backup_commands/BackupService | Implemented; UI reads real backend state |
| Settings | get/update | get_settings/update_settings | SettingsService | Implemented |
| Dialog/App | openFile/saveFile/version | Tauri plugins | no custom Rust handler | Implemented; exempt from handler registry |

Final gate: `Command contract PASS: 44 typed commands, 44 release handlers.` Supplier payment và update/delete purchase/sale draft hiện là production commands; Electron tests/source lưu trong archive và không thuộc production/test graph.
