# Release blockers

## Trạng thái xác minh 2026-08-07

- Nguyên nhân ZIP cũ thiếu implementation: Git root nằm tại `/Users/macbookpro/Workspace`; `scripts/`, `src-tauri/` và `eslint.config.js` của InveStock là untracked nên bị loại khi source archive chỉ lấy Git index.
- Đã thêm `npm run package:source`, dùng `scripts/create-release-source.sh` để đóng gói working tree thực tế với exclude dependency/build/database/secret; không phụ thuộc `git archive`.
- Release-source ZIP đã được giải nén độc lập tại `/private/tmp/investock-exported-zip-check-5nMYxFUO/InveStock`:
  - Sáu file release bắt buộc và `src-tauri/tests/core_backend.rs` tồn tại trong archive.
  - Đếm trực tiếp trong archive: 38 thuộc tính `#[test]`; Electron refs trong production/default tests: 0/0.
  - `npm ci` và `npm run verify:release`: PASS; 14 frontend tests, command contract 44/44, static checks 17/17.
  - `cargo test`: 4 unit/service + 34 integration = 38 PASS, 0 failed/ignored.
  - `cargo check --release`: PASS từ source giải nén.
  - `npm run build:tauri`: PASS từ source giải nén; tạo `.app` và `.dmg` x64.
- Log xác minh mới nhất được lấy trực tiếp từ các command đã chạy trong workspace, không suy ra từ số test dự kiến:
  - `npm run test`: 1 file, 12 tests PASS.
  - `npm run check:commands`: 38 typed commands / 38 release handlers, PASS.
  - `npm run verify:release`: 17/17 static checks PASS; chuỗi lint/typecheck/test/contract/build bên trong PASS.
  - `cargo test --manifest-path src-tauri/Cargo.toml`: 4 unit/service + 34 integration = 38 tests PASS; 0 failed/ignored.
  - `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings`: PASS.
  - `cargo check --manifest-path src-tauri/Cargo.toml --release`: PASS.
  - `npm run build:tauri`: PASS; tạo `.app` và `.dmg` x64.
- Đã đóng: Electron runtime/bridge/default tests, command mismatch, script verification thiếu, version mismatch, seed release registry, backup WAL/checksum, restore validation/rollback, rustfmt/clippy/typecheck/build gates.
- Production command contract: 44 typed commands / 44 release handlers, PASS.
- Test backend: 38 Rust tests PASS, gồm 34 integration tests production.
- Auto-backup backend, retention an toàn, backup health/status UI, migration v7 indexes và PN/PX atomic sequence đã có integration tests.
- Phiếu nhập mới không còn nhận shipping; package weight mới được canonical hóa theo gram, vẫn giữ khả năng đọc dữ liệu legacy.
- CSP đã bật và quyền filesystem trực tiếp đã được loại khỏi capability/runtime.
- Clean-source: `npm ci`, `verify:release`, Cargo tests và Tauri x86_64 `.app`/`.dmg` build PASS từ node_modules/target rỗng.
- Blocker phát hành công khai còn mở: macOS app chưa codesign/notarize. Windows code signing là credential độc lập; Windows installed smoke nằm ngoài phạm vi phase này.

## Verification phase nghiệp vụ và backup — 2026-08-07

- Supplier payment, sửa/xóa purchase/sale draft, zero-price, duplicate reference và discount bounds đã có backend production commands và integration tests.
- Auto-backup fallback sang app-data nội bộ khi thư mục ưu tiên không ghi được; UI hiển thị cảnh báo protected/fallback và trạng thái toàn cục tại sidebar.
- Manual backup có tên timestamp; create/list/health/restore dùng cùng validator package (metadata, checksum, SQLite integrity và foreign-key check).
- Rust: 4 unit/service + 39 integration tests PASS; fmt, clippy `-D warnings`, test và check PASS.
- Frontend: lint, typecheck, 14 tests, contract 44/44 và Vite production build PASS.
- Source ZIP `InveStock-release-source-1.0.0-rc.1.zip` được tạo từ working tree, giải nén sạch tại `/private/tmp/investock-release-verify.ungKW1/InveStock`; `npm ci`, `verify:release` và toàn bộ Cargo gates PASS trên nội dung giải nén.
- Tauri packaging thực tế PASS ngoài sandbox: `InveStock.app` và `InveStock_1.0.0-rc.1_x64.dmg` được tạo thành công; artifact chưa được ký/notarize.
- Audit Definition of Done bổ sung: frontend 21 tests; Rust 4 unit/service + 42 integration tests; unified backup validator reject package mà restore cũng sẽ reject.
- Các capability chưa an toàn đã disable khỏi RC thay vì giữ fake API: import workflow, attachments, supplier payments, purchase cancel/delete, sale update/cancel/delete, report export, price-history report.

Tất cả mục P0 dưới đây phải đóng trước khi tạo RC tiếp theo.

| ID | Trạng thái | Bằng chứng đã xác minh / việc còn lại |
|---|---|---|
| P0-01 | Đóng trong RC scope | Electron bridge và typed placeholder đã xóa; feature chưa an toàn bị loại khỏi active route/action. Static verification PASS. |
| P0-02 | Đóng | SQLite Backup API, integrity/foreign-key checks và checksum thật; WAL integration test PASS. |
| P0-03 | Đóng cho implementation hiện tại | Restore staging, whitelist, checksum, pool swap, rollback và reopened-DB tests PASS. |
| P0-04 | Còn theo dõi ngoài scope verification | Validation cho product/purchase/sale cốt lõi có negative tests; mutation deferred chưa được đưa vào RC. |
| P0-05 | Deferred khỏi RC scope | Cancel/update/delete/payment chưa có trong active RC UI hoặc typed contract; không có fake success API. |
| P0-06 | Đóng | Seed chỉ đăng ký dưới debug/dev feature; release registry check PASS; DevSeedPanel không tồn tại trong production source. |
| P0-07 | Đóng | lint, typecheck, frontend build và contract 38/38 đều PASS từ command thực tế. |
| P0-08 | Đóng cho default suites | 12 frontend tests và 38 Rust tests PASS; 34 Electron legacy files không thuộc default suite. Installed-app UI smoke vẫn còn mở. |
| P0-09 | Đóng ở source configuration | Workflow dùng Tauri và release scripts tồn tại; ký/notarize cần credentials bên ngoài workspace. |
| P0-10 | Đóng cho schema hiện tại | Migration v7, index và atomic document sequence có migration/concurrency tests PASS. Query-plan benchmarking lớn là P2. |
| P0-11 | Đóng | Typed client xử lý structured `{code,message,details}`; production UI không parse raw SQLite errors. |
| P0-12 | Còn mở | Migration preservation/idempotency và restore tests PASS, nhưng fixture upgrade Electron đầy đủ kèm đối soát nghiệp vụ vẫn cần bổ sung trước phát hành rộng. |
| P0-13 | Đóng | Static check xác nhận package/Cargo/Tauri cùng `1.0.0-rc.1`; UI đọc version từ Tauri. |
| P0-14 | Đóng | `cargo fmt --check`, clippy `-D warnings`, Cargo tests và release check đều PASS từ log mới nhất. |

## P1 trước RC

- Hoàn tất import preview/validate/execute/history/error export bằng Rust và export báo cáo XLSX.
- Hoàn tất attachment storage/validation/backup/restore.
- Chuyển settings/backup state từ localStorage/hard-code sang backend.
- Chuẩn hóa gram/kg, inventory unit và bỏ shipping cost khỏi phiếu mới theo quyết định sản phẩm, có migration giữ dữ liệu lịch sử.
- Tách `InventoryService` và SQL khỏi service; loại Electron dependencies/source khỏi production build.
- CSP/capability least privilege, safe path policy, operation coordinator cho import/backup/restore/migration.
- Viết runbook vận hành, backup, restore, recovery và upgrade.

## P2 sau RC

- Code splitting bundle UI và tối ưu report lớn.
- Accessibility/keyboard flow, empty/loading/error consistency và usability test với người dùng low-tech.
- Telemetry cục bộ/diagnostic export không chứa dữ liệu nhạy cảm.
- Performance baseline 1.000 sản phẩm/10.000+ ledger rows.
