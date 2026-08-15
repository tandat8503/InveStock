# Audit hiện trạng InveStock

Ngày audit: 2026-08-07. Phạm vi: mã nguồn React/TypeScript, Rust/Tauri, schema và migration SQLite, lớp Electron còn sót, tests, workflow, cấu hình build và UI production. Audit này mô tả đúng source hiện tại; các tài liệu cũ có tuyên bố “hoàn thành” không được xem là bằng chứng nghiệm thu.

## Kết luận điều hành

InveStock chưa đủ điều kiện phát hành. Frontend production chạy qua `electronCompatBridge`, trong khi nhiều method của bridge là placeholder trả `success: true` nhưng không ghi dữ liệu. Rust chỉ có 29 command được đăng ký và mới bao phủ CRUD cơ bản, tạo/xác nhận phiếu, một phần báo cáo, backup/restore sơ khai và import sản phẩm trực tiếp. Các luồng hủy/xóa/sửa nháp, thanh toán, attachment, settings, import wizard, export và backup production-safe chưa tồn tại ở Rust.

Rủi ro dữ liệu cao nhất là backup đọc trực tiếp file DB đang ở WAL mode và restore ghi đè file DB khi pool vẫn mở. Metadata SHA-256 là chuỗi hard-code `validated`. Schema thiếu phần lớn CHECK/index/uniqueness nghiệp vụ, còn validation quyết định ở backend rất mỏng nên có thể nhận số âm, phiếu rỗng và enum/status tùy ý.

## Baseline đã chạy

| Lệnh | Kết quả | Ghi chú |
|---|---|---|
| `npm ci` | PASS | Cài sạch 785 packages từ lockfile; có nhiều cảnh báo deprecated, chủ yếu từ toolchain Electron/ESLint cũ. |
| `npm run build` | PASS | Bundle JS chính 832 kB, Vite cảnh báo chunk > 500 kB. Build này không chạy typecheck. |
| `npm run typecheck` | FAIL | 16 lỗi: type IPC sai tên, thiếu imports/types, gọi `tauriAPI.import` không tồn tại, lỗi React ref và unused symbols. |
| `npm run lint` | FAIL | 44 vấn đề (43 errors, 1 warning), gồm unsafe `any`, conditional hooks trong DevSeedPanel, unused symbols và catch/typing yếu. |
| `npm run test` | PASS | Sau `npm ci`: 23/23 files, 125/125 tests pass. Tuy nhiên đây chủ yếu là test backend Electron/Node cũ, không chứng minh Rust production path. |
| `cargo fmt --check` | FAIL | Rust source chưa được rustfmt; diff khoảng 2.475 dòng output. |
| `cargo clippy --all-targets --all-features -- -D warnings` | FAIL | 9 lỗi: nested-if, too-many-arguments, unnecessary lazy evaluation/casts, `to_string` trong format và `.get(0)`. |
| `cargo test --manifest-path src-tauri/Cargo.toml` | PASS | Chỉ 1 Rust test, kiểm tra một trường hợp moving-average purchase; độ bao phủ không đủ. |
| `cargo check --manifest-path src-tauri/Cargo.toml` | PASS | Rust production source compile trong dev profile. |
| E2E | Không chạy | Fixture và workflow đều khởi động Electron, không kiểm chứng Tauri app. |

## Contract frontend ↔ Rust

Frontend chỉ có một chỗ gọi `invoke`, nhưng typed client chưa hoàn chỉnh và phần lớn UI vẫn gọi API Electron qua bridge. Rust đăng ký 29 command. `import_products_excel` được đăng ký nhưng typed client không khai báo namespace `import`, gây typecheck fail.

### Command thật đã nối đầy đủ hoặc một phần

| Frontend method | Tauri command | Service | Repository/SQL | Test Rust |
|---|---|---|---|---|
| products.list/get/create/update | get_products/get_product_by_id/create_product/update_product | ProductService | SQL nằm trực tiếp trong service | Không |
| products.priceHistory | get_product_price_history | InventoryService | SQL trong service | Không |
| suppliers.list/get/create/update | get_suppliers/get_supplier_by_id/create_supplier/update_supplier | SupplierService | SQL trong service | Không |
| purchases.list/get/create/confirm | get_purchase_invoices/get_purchase_invoice_by_id/create_purchase_invoice_draft/confirm_purchase_invoice | PurchaseService | SQL trong service | 1 test purchase confirm |
| sales.list/get/create/confirm | get_sales_invoices/get_sales_invoice_by_id/create_sales_invoice_draft/confirm_sales_invoice | SaleService | SQL trong service | Không |
| dashboard.stats/analytics | get_dashboard_stats/get_dashboard_analytics | InventoryService | SQL trong service | Không |
| inventory.summary | get_inventory_summary | InventoryService | SQL trong service | Không |
| reports.invoiceSearch/revenue/productSales/supplierDebt/importExport | search_invoices/get_revenue_report/get_product_sales_report/get_supplier_debt_report/get_import_export_report | InventoryService | SQL trong service 1.232 dòng | Không |
| backup.create/restore | create_backup/restore_backup | BackupService | filesystem trực tiếp | Không |
| seed.getDbStats/seedDemoData | get_db_stats/seed_demo_data | SeedService | SQL trong service | Không |
| import execute trực tiếp | import_products_excel | ImportService | SQL trong service | Không; frontend hiện compile lỗi |

### Method UI không có implementation production

Các method sau trả success giả, danh sách rỗng, dữ liệu hard-code hoặc gọi sai nghiệp vụ: `products.delete`, `products.toggleActive`, `suppliers.delete/toggleActive/stats/invoices/payments`, `purchases.cancel/delete`, `sales.update/cancel/delete`, `reports.priceHistory/exportExcel`, `backup.list/storageStats/openFolder`, toàn bộ `settings`, toàn bộ `attachments`, import `parseFile/validate/history/cancel/exportErrors`, và `payments.list/create`.

Đặc biệt, `sales.update` đang gọi **create draft**, có thể tạo thêm chứng từ thay vì sửa chứng từ. `import.parseFile` trả session giả và 10 dòng mock; `backup.storageStats` trả databaseSize cố định 1 MiB; settings/version/store name đều hard-code.

## Database và migrations

- Rust có migration 1–6, tạo 15 bảng kể cả `schema_migrations`.
- Migration chạy tuần tự nhưng không bọc toàn bộ chuỗi nâng cấp trong một transaction cấp runner; mỗi migration tự `BEGIN/COMMIT`.
- Không có CHECK cho số tiền/số lượng/trọng lượng/tồn, boolean, enum status/type/method, hoặc invariant `paid_amount <= grand_total`.
- Không có unique `(supplier_id, invoice_number)`, unique ledger source/id/type cần thiết để chống xác nhận kép ở tầng DB, hoặc unique item-per-product tùy nghiệp vụ.
- Hầu như không có index cho foreign key và truy vấn chính: invoice date/status/supplier, item invoice/product, ledger product/date/source, payment invoice/date, import errors/job.
- Mã chứng từ dùng `COUNT(*) + 1`; xóa bản ghi hoặc concurrent create có thể gây trùng/race.
- `shipping_cost` và allocation vẫn nằm trong schema, DTO, UI và Rust create/confirm.
- `package_weight_grams` mặc định 25000 nhưng `package_weight_unit` mặc định `kg`, mô hình đơn vị dễ bị hiểu sai nếu UI/backend không quy ước một canonical unit.
- Không có migration chứng minh khả năng nâng cấp từ DB Electron hiện hữu sang Rust schema và đối soát dữ liệu.

## Nghiệp vụ và validation backend

- Product create/update không chặn code/name rỗng, weight/price âm, category/unit không hợp lệ.
- Purchase/sale create không chặn `items=[]`, quantity/price/discount/tax/shipping âm, product trùng, ngày sai, supplier/product inactive hoặc không tồn tại bằng lỗi domain rõ ràng.
- Purchase confirm kiểm tra status nên hạn chế confirm lần hai ở service, nhưng không có DB idempotency constraint và không có test concurrency.
- Sale confirm kiểm tra tồn trong transaction và snapshot average cost; đây là nền tảng đúng. Tuy nhiên quantity âm sẽ làm phép kiểm tra tồn vô hiệu và có thể **tăng tồn khi xuất**.
- Purchase quantity âm có thể giảm tồn khi xác nhận và làm sai moving average.
- Rust chưa có hủy nhập, hủy xuất, xóa/sửa nháp, thanh toán công nợ, audit log nghiệp vụ.
- AppError serialize thành chuỗi; raw SQLite error được đưa thẳng vào `Database(String)`. Chưa có `{code,message,details}` và UI còn log lỗi kỹ thuật.
- SQL nằm trực tiếp trong các service; chưa có repository/application/domain separation như kiến trúc mục tiêu.

## Backup/restore

- Connection bật WAL, nhưng backup dùng `File::open(db_path).read_to_end`; dữ liệu đã commit còn trong `-wal` có thể bị bỏ sót.
- Không dùng SQLite Online Backup API hoặc `VACUUM INTO`, không kiểm tra integrity snapshot.
- ZIP được tạo trực tiếp tại đích, không temp + fsync + atomic rename; lỗi giữa chừng có thể để artifact hỏng.
- Metadata version hard-code `1.0.0`, SHA-256 hard-code `validated`; không có schema version, file sizes hay attachment manifest.
- Restore không validate metadata/hash/schema/integrity, không chống zip bomb/path hazards một cách tổng quát, không staging.
- Restore copy pre-restore nhưng nuốt lỗi (`let _ = fs::copy`), sau đó truncate/ghi trực tiếp DB đang được pool sử dụng.
- Không đóng/reopen pool, không atomic replace, không rollback khi copy/extract/swap thất bại, không xử lý WAL/SHM, không restore attachments.
- UI auto-backup tự ghép path và dùng localStorage để đánh dấu theo ngày; backend không phải nguồn sự thật.

## Seed, production UI và local state

- `seed_demo_data` luôn compile, luôn đăng ký và DevSeedPanel nằm trong Settings production. `clear_existing` cho phép xóa dữ liệu thật.
- `Layout.tsx` dùng localStorage để quyết định auto-backup; trạng thái có thể sai giữa máy/profile, bị xóa tùy ý và không phản ánh backup thành công thật.
- Settings bridge không đọc/ghi `app_settings` dù bảng đã tồn tại.
- Tauri CSP đang `null`; capability `fs:default` rộng hơn nhu cầu tối thiểu.
- Frontend còn tên/type/API Electron; package vẫn mang Electron, electron-builder, better-sqlite3, Drizzle và entry/build config cũ.

## Tests và CI/CD

- 23 unit test files/125 tests pass sau clean install, nhưng chủ yếu kiểm tra implementation Electron/Node cũ, không kiểm tra Rust production path.
- 9 E2E specs dùng `tests/e2e/fixtures/electronApp.ts`; không launch Tauri/WebDriver.
- `verify.yml` chạy `npm run verify` nhưng không chạy `cargo fmt`, `cargo clippy`, `cargo test`, Tauri build hay E2E.
- `release.yml` vẫn chạy `electron-builder install-app-deps`, Electron E2E và các script không tồn tại `package:mac:*`, `package:win`; release chắc chắn hỏng.
- `.nvmrc` không xuất hiện trong danh sách source nhưng workflow yêu cầu `node-version-file: .nvmrc`.
- Release docs/artifacts hiện hữu mô tả Electron RC và tuyên bố PASS không tương ứng với Tauri source hiện tại.

## Version và Tauri build script

- `package.json` là `1.0.0-rc.1`, trong khi `Cargo.toml` và `tauri.conf.json` đều là `1.0.0`; metadata backup lại hard-code `1.0.0`. Chưa có một nguồn version duy nhất.
- `src-tauri/build.rs` có tồn tại và gọi `tauri_build::build()`, đúng bootstrap tối thiểu. Tuy nhiên chưa có CI kiểm chứng Tauri package trên hai hệ điều hành.

## Clean-code/rủi ro bảo trì

- `InventoryService` 1.232 dòng và chứa query/report/domain mapping cùng nhau.
- Shared IPC types 911 dòng; bridge 324 dòng với nhiều placeholder.
- `unwrap()` tìm thấy trong Rust test; production có `expect()` khi init DB/run app và fallback DB path `./data`, có thể che lỗi app-data nghiêm trọng.
- `any` còn ở bridge/Dashboard/Settings; catch rỗng ở openFolder; raw `console.error` hiện lỗi command.
- Hai backend Electron và Rust cùng tồn tại, tạo hai nguồn nghiệp vụ/schema/test khác nhau.

## Điểm đang làm đúng cần giữ

- SQLite bật foreign keys và WAL; tiền dùng integer; Rust purchase/sale confirm dùng transaction.
- Sale confirm chặn thiếu tồn với quantity dương và lưu giá vốn tại thời điểm bán.
- Purchase confirm có moving weighted average cost cơ bản và kiểm tra trạng thái trước khi xác nhận.
- Frontend đã gom raw Tauri `invoke` về một file, là điểm khởi đầu tốt để tạo typed command modules.

## Phạm vi audit chưa thể xác nhận

- Chưa nghiệm thu installer thực trên Windows/macOS hay upgrade dữ liệu cũ.
- Chưa chạy Tauri E2E vì suite hiện tại chỉ hỗ trợ Electron.
- Chưa xác nhận 125 unit tests sau khi rebuild native dependency; kết quả hiện tại bị chặn bởi ABI.
