# Báo cáo Phân tích Hệ thống Hiện tại (InveStock & Hr-management)

Tài liệu này chứa toàn bộ kết quả audit chi tiết hệ thống InveStock hiện tại (Electron + Node.js + SQLite) và ứng dụng Hr-management mẫu (Tauri 2 + Rust + React).

---

## I. TỔNG QUAN HAI PROJECT

### 1. InveStock (Electron App)
- **Mục tiêu**: Ứng dụng quản lý nhập - xuất - tồn kho thức ăn chăn nuôi offline, tính giá vốn bình quân gia quyền di động (Moving Weighted Average Cost), quản lý công nợ nhà cung cấp, báo cáo doanh thu/lợi nhuận, import dữ liệu hàng loạt từ Excel (bao gồm parser NXTGUI), và tự động sao lưu/phục hồi dữ liệu (Backup/Restore).
- **Stack công nghệ**:
  - Desktop Shell: Electron v31
  - Backend: Node.js (Electron Main Process)
  - Database: SQLite (driver `better-sqlite3`, ORM `drizzle-orm`)
  - Frontend: React v18 + TypeScript + Vite + Tailwind CSS + Lucide React + Recharts
  - Testing: Vitest (125 unit tests), Playwright (E2E)
- **Tình trạng**: Đang đạt mốc Release Candidate 1.0.0-rc.1, hoạt động hoàn chỉnh nhưng phụ thuộc vào Electron (bundle nặng ~150MB+, tốn bộ nhớ RAM, bảo mật IPC chưa được tối ưu triệt để ở tầng OS).

### 2. Hr-management (Tauri 2 Reference App)
- **Mục tiêu**: Ứng dụng quản lý nhân sự nhà hàng.
- **Stack công nghệ**:
  - Desktop Shell: Tauri 2 (Rust binary)
  - Database: SQLite (sử dụng plugin `tauri-plugin-sql`)
  - Frontend: React 19 + TypeScript + Vite + Tailwind CSS + Lucide Icons + Recharts
- **Ưu điểm**: Bundle cực nhẹ (~10-15MB), khởi động nhanh, sử dụng ít tài nguyên hệ thống, kiến trúc bảo mật Tauri 2 với Capability system.
- **Hạn chế đối với InveStock**: Hr-management hiện đang gọi SQL trực tiếp từ Frontend (`tauri-plugin-sql`) và xử lý nghiệp vụ ở UI. Kiến trúc này **không phù hợp** với InveStock vì nghiệp vụ kho/kế toán/giá vốn của InveStock phức tạp và bắt buộc phải đưa toàn bộ logic xuống Backend Rust xử lý trong **SQLite Transaction**.

---

## II. PHÂN TÍCH CHI TIẾT INVESTOCK (24 NỘI DUNG)

1. **Công nghệ hiện tại**: Electron 31, Node 20+, `better-sqlite3`, Drizzle ORM, Zod, React 18, Vite.
2. **Cấu trúc thư mục**:
   - `electron/`: `main.ts`, `preload.ts`, `db/` (schema, connection), `ipc/` (15 modules), `repositories/`, `services/`.
   - `src/`: 9 trang chức năng (Dashboard, Products, Suppliers, Purchases, Sales, Inventory, Invoices, Reports, Imports, Settings), Zustand stores, components UI.
   - `shared/`: `ipc-types.ts`, Zod schemas.
3. **Database Schema**: 14 bảng chính (`products`, `suppliers`, `purchase_invoices`, `purchase_invoice_items`, `sales_invoices`, `sales_invoice_items`, `inventory_transactions`, `supplier_payments`, `product_price_history`, `attachments`, `app_settings`, `import_jobs`, `import_job_errors`, `legacy_inventory_summaries`, `schema_migrations`).
4. **Migrations**: 6 phiên bản migration bằng SQL thủ công và Drizzle.
5. **Electron IPC**: 15 IPC channel nhóm qua `window.electronAPI`.
6. **Services**: `purchaseService`, `saleService`, `inventoryService`, `backupService`, `importExecutionService`, `dashboardService`, `reportService`.
7. **Repositories**: `productRepository`, `supplierRepository`, v.v.
8. **Business logic**:
   - Tính giá vốn bình quân gia quyền di động khi nhập kho: `Average Cost = (Old Value + Effective Purchase Value) / (Old Stock + New Stock)`.
   - Phân bổ phí vận chuyển theo số lượng/giá trị.
   - Lưu snapshot giá vốn (`unit_cost_at_sale`) khi xác nhận xuất kho.
   - Không cho xuất vượt tồn kho.
   - Hủy xuất hoàn lại tồn kho và tạo giao dịch `huy_xuat`.
9. **UI pages**: Dashboard, Danh mục sản phẩm, Nhà cung cấp, Phiếu nhập, Phiếu xuất, Tồn kho, Tra cứu hóa đơn, Báo cáo, Import wizard, Cài đặt.
10. **Components**: Tailwind UI components, Modal, Table, Pagination, CurrencyInput, ConfirmDialog.
11. **Import/export Excel**: Đã có `nxtguiParsingService`, `importExecutionService`, hỗ trợ import sản phẩm và tổng hợp NXTGUI. Export danh mục/báo cáo dạng XLSX (`xlsx`).
12. **Backup/restore**: ZIP snapshot SQLite + attachments manifest + SHA256 integrity + pre-restore backup.
13. **Reports**: Báo cáo NXT, Doanh thu, Lợi nhuận gộp, Công nợ nhà cung cấp.
14. **Validation**: Zod schema chuẩn hóa dữ liệu từ IPC.
15. **Error handling**: `IpcResult<T>` chuẩn hóa response (`{ success: boolean, data?, error? }`).
16. **Các logic đang nằm sai tầng**: Một số tính toán nháp (ví dụ preview phân bổ vận chuyển, preview lợi nhuận nháp) được làm ở Frontend React trước khi gửi request xác nhận.
17. **Các lỗi tiềm ẩn**: Phụ thuộc IPC Node.js asynchronous bridge, rủi ro race condition nếu gọi đồng thời từ nhiều cửa sổ.
18. **Các trường hợp có thể làm lệch tồn kho**: Sửa trực tiếp số lượng tồn mà không qua giao dịch kho.
19. **Các trường hợp có thể làm sai giá vốn**: Hủy phiếu nhập khi sản phẩm đã được xuất bán một phần ở thời điểm sau đó.
20. **Các trường hợp có thể làm sai công nợ**: Xóa hoặc sửa phiếu nhập mà không rollback số tiền `paidAmount` / `remainingAmount` hợp lệ.
21. **Các đoạn code trùng lặp**: Các đoạn format tiền tệ, ngày tháng rải rác giữa Frontend và Backend.
22. **Các chức năng hiện có nhưng chưa hoàn chỉnh**: Quản lý trả hàng nhà cung cấp và trả hàng khách chưa có form riêng biệt.
23. **Những nghiệp vụ tốt cần giữ lại**:
   - Lưu tiền VND dạng số nguyên integer.
   - Thuật toán Moving Weighted Average Cost.
   - Snapshot giá vốn tại thời điểm bán.
   - All-or-nothing transaction trong SQLite.
   - Chế độ import NXTGUI `reconcile_only`.
   - Cơ chế pre-restore recovery backup.
24. **Những phần cần viết lại hoàn toàn**:
   - Electron Main Process -> Tauri 2 Rust Command Services.
   - Drizzle ORM + better-sqlite3 -> Rust `rusqlite` / `sqlx` / `diesel` với SQLite native transaction trong Rust.
   - Inter-process Communication (IPC) -> Tauri `invoke` IPC.

---

## III. PHÂN TÍCH HR-MANAGEMENT (11 NỘI DUNG)

1. **Cách cấu hình Tauri**: Tauri 2 (`tauri.conf.json`), chỉ định identifier `com.restaurant.hr-manager`, bundle NSIS/DMG.
2. **Cách frontend gọi backend**: Dùng `@tauri-apps/api/core` (`invoke`) cho các custom Rust command (`backup_db`, `restore_db`).
3. **Cách cấu hình SQLite**: Plugin `tauri-plugin-sql` với kết nối `"sqlite:hr_manager.db"`.
4. **Cách lưu database**: Đặt trong `app_data_dir()` của OS (`~/Library/Application Support/...` hoặc `%APPDATA%`).
5. **Cách build ứng dụng**: Lệnh `tauri build --bundles dmg` và `tauri build --bundles nsis`.
6. **Cách đóng gói installer**: NSIS cho Windows và DMG cho macOS.
7. **Cách cấu hình quyền truy cập file**: `capabilities/default.json` của Tauri 2 cấp quyền `fs` và `dialog`.
8. **Cách xử lý backup/import**: Sao chép file `.db`, `.db-wal`, `.db-shm` trực tiếp từ Rust.
9. **Cấu hình cho Windows và macOS**: Windows nsis `installMode: "currentUser"`, macOS minimum system version `10.15`.
10. **Những phần có thể tái sử dụng**: Cấu hình `tauri.conf.json`, setup Capabilities trong Tauri 2, cách build script `package:mac` và `package:win`.
11. **Những phần không phù hợp với InveStock**: Xử lý SQL trực tiếp từ Frontend (`tauri-plugin-sql`). InveStock **bắt buộc** phải đóng gói toàn bộ SQL & Transaction trong Rust Command Backend.

---

## IV. MAPPING TỪ ELECTRON SANG TAURI 2

| Thành phần Electron | Thành phần Tauri 2 tương ứng |
| :--- | :--- |
| Electron Main (`electron/main.ts`) | Rust Main (`src-tauri/src/main.rs` & `lib.rs`) |
| ContextBridge / Preload (`electron/preload.ts`) | Tauri IPC (`@tauri-apps/api/core` `invoke`) |
| `ipcMain.handle` / IPC Channels | Rust `#[tauri::command]` functions |
| `better-sqlite3` + Drizzle ORM | Rust `rusqlite` (với bundled SQLite + R2D2 pool) |
| Backup/Restore (`archiver` / `unzipper`) | Rust `zip-rs` crate + std::fs |
| Excel parsing (`xlsx` Node) | Rust `calamine` crate (cho import) + `rust_xlsxwriter` (cho export) |
| `electron-builder` | `tauri-action` / `tauri build` (NSIS & DMG native) |

---

## V. KIẾN TRÚC MỚI ĐỀ XUẤT (TAURI 2 + RUST BACKEND)

```text
┌─────────────────────────────────────────────────────────┐
│              React 18/19 + TypeScript UI                │
│    (Tailwind CSS, Lucide Icons, React Router 6/7)       │
└────────────────────────────┬────────────────────────────┘
                             │
                             │ Tauri invoke("command_name", payload)
                             ▼
┌─────────────────────────────────────────────────────────┐
│                 Tauri 2 Rust Commands                   │
│        (src-tauri/src/commands/*.rs)                    │
└────────────────────────────┬────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│              Application Services (Rust)                │
│     (Purchase, Sale, Stock, Backup, Import Services)    │
└────────────────────────────┬────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│            Domain Logic & Transactions (Rust)           │
│   (Moving Average Cost, Debts, Stock Balance Controls)  │
└────────────────────────────┬────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│            SQLite Database (via rusqlite)               │
│      (Foreign Keys = ON, WAL Mode, Strict Isolation)    │
└─────────────────────────────────────────────────────────┘
```

---

## VI. KẾ HOẠCH MIGRATION DỮ LIỆU TỪ NVESTOCK CŨ

1. Tự động phát hiện vị trí file `feed-inventory.db` cũ của Electron (`~/Library/Application Support/feed-inventory-manager/feed-inventory.db` hoặc `%APPDATA%\feed-inventory-manager\feed-inventory.db`).
2. Nếu phát hiện DB cũ, hiển thị hộp thoại Cảnh báo Migration trong Tauri App mới.
3. Cho phép người dùng bấm "Xem trước dữ liệu cũ" và "Tiến hành chuyển đổi".
4. Rust backend tạo một bản backup an toàn cho DB cũ trước khi đọc.
5. Rust backend nạp dữ liệu từ schema Electron (v6) sang schema Tauri mới bằng transaction an toàn.
6. Xác minh tổng số sản phẩm, tổng giá trị tồn kho, tổng nợ nhà cung cấp trước và sau migration.
7. Giữ nguyên DB cũ làm bản lưu trữ đối soát, không bao giờ tự động xóa.
