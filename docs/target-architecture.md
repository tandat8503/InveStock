# Kiến trúc mục tiêu InveStock

## Nguyên tắc

React chỉ trình bày, thu input, validation UX và gọi typed commands. Mọi quyết định về trạng thái chứng từ, tồn, giá vốn, công nợ, import/export, backup/restore và audit phải được thực thi ở Rust trong transaction. SQLite là nguồn sự thật duy nhất; localStorage không lưu trạng thái nghiệp vụ.

```text
React feature UI
  -> typed command client + stable DTO/error contract
  -> thin Tauri command adapters
  -> application use cases
  -> domain policies/value objects
  -> repository traits
  -> rusqlite repositories + transaction manager
  -> SQLite
```

## Backend

```text
src-tauri/src/
  commands/          # deserialize DTO, auth/capability context, map errors
  application/       # use cases: create/confirm/cancel/pay/import/backup
  domain/            # enums, money/quantity, invoice state machine, costing rules
  dto/               # versioned request/response/error types
  infrastructure/
    database/        # pool, transaction runner, migration runner
    repositories/    # SQL only; no business decisions
    backup/           # snapshot, manifest, checksum, staging, atomic restore
    import/           # upload/session/parse/validate/execute
    export/           # XLSX generation
    filesystem/       # safe paths, atomic file operations
  state/              # replaceable DB runtime state and operation coordinator
  config/             # app version/path/settings defaults
  migrations/         # append-only, tested upgrades
  tests/              # integration tests against temporary SQLite DB
```

Command handler không chứa SQL. Application service nhận repository/transaction abstractions. Domain không phụ thuộc Tauri/rusqlite. Repository chỉ lưu/đọc và phải trả typed errors, không quyết định trạng thái chứng từ.

## Frontend

```text
src/
  app/               # router, providers, error boundary
  features/          # products, suppliers, purchases, sales, inventory, reports...
  components/        # common/forms/feedback/tables/layout
  lib/commands/      # products.ts, purchases.ts, sales.ts, backup.ts...
  services/          # UI orchestration only
  stores/            # ephemeral UI state only
  types/             # view models; generated/shared contract where suitable
  utils/             # formatting, never accounting logic
```

Loại bỏ `window.electronAPI` sau một nhánh chuyển đổi ngắn có test. Không có method giả thành công; capability chưa có phải disabled/ẩn kèm thông báo rõ ràng cho tới khi backend hoàn tất.

## Contract và lỗi

Mỗi command có request/response cụ thể và trả lỗi ổn định:

```json
{"code":"INSUFFICIENT_STOCK","message":"Sản phẩm Cám heo A chỉ còn 4 bao.","details":{"productId":1,"available":4,"requested":10}}
```

Không trả raw SQLite/path/stack. Error code là enum có test mapping. Frontend map code sang feedback tiếng Việt, giữ correlation ID cho log kỹ thuật cục bộ.

## Trạng thái chứng từ và tính nhất quán

- Enum domain: `Draft -> Confirmed -> Cancelled`; transition khác bị từ chối.
- Confirm/cancel chạy trong một SQLite transaction và idempotency được bảo vệ cả service lẫn unique constraint ledger.
- Quantity > 0, money >= 0, items không rỗng, entity active/existing được kiểm tra backend.
- Sale dùng conditional stock update hoặc serialization phù hợp để không âm kho khi concurrent calls.
- Purchase confirm tính moving weighted average bằng integer policy được tài liệu hóa; sale chụp `unit_cost_at_sale`.
- Cancel không xóa ledger gốc; ghi reversal immutable. Chính sách hủy nhập sau giao dịch sau đó phải rõ ràng và có đối soát giá vốn.
- Payment append-only; tổng thanh toán không vượt công nợ; invoice totals được tính backend.
- Audit log ghi actor/device, action, entity, before/after tối thiểu cho mutation nhạy cảm.

## Schema/migration

- Migration append-only, atomic, lưu version/checksum và có test nâng cấp từ mọi schema production đã phát hành.
- Thêm CHECK constraints và index bằng migration rebuild-table an toàn, không sửa migration cũ đã phát hành.
- Backup tự động trước migration; integrity check và đối soát counts/totals sau migration; rollback/khôi phục có tài liệu.
- Canonical units: weight lưu gram; UI chuyển đổi kg/g. Tiền VND lưu `i64`.

## Backup/restore chuẩn

Backup: operation lock -> SQLite Online Backup API/snapshot connection -> `quick_check`/`integrity_check` -> checksum SHA-256 thật -> manifest/version/schema/app metadata -> ZIP temp cùng filesystem -> fsync -> atomic rename -> update settings/audit.

Restore: operation lock -> đọc ZIP với limits/traversal protection -> staging directory -> validate manifest/checksums/schema compatibility -> SQLite integrity check -> pre-restore snapshot đã xác minh -> đóng/drain pool -> atomic swap DB/attachments -> mở pool + migrations/read checks -> rollback atomic khi lỗi -> yêu cầu restart khi cần.

## Import/export

Import là ba bước backend có session hữu hạn: upload/parse, validate/preview, execute. Execute xác minh lại hash và validation, chạy all-or-nothing hoặc batch policy được chỉ rõ, ghi import job/errors/audit. Renderer không giữ workbook tin cậy và không tự tính tồn/giá vốn.

Export nhận report type + filters đã validate, query qua application service và tạo XLSX ở backend; không tin SQL/sort column/path tùy ý từ frontend.

## Test và delivery

- Rust unit tests cho domain state/costing/validation; integration tests cho every command/use case, migrations, concurrency, backup/restore corruption.
- React tests cho typed client, loading/error states và critical forms; Tauri E2E chạy binary thật trên Windows/macOS.
- CI: format/lint/typecheck/unit/integration/build trên cả OS; release dùng official Tauri action/build, checksum, signing/notarization secrets và smoke upgrade test.
- Definition of done cho command: DTO + validation + use case + repository + structured error + Rust tests + typed frontend method + UI states + documentation.
