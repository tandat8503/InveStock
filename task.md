# Kế hoạch đưa InveStock tới Release Candidate

## Production hardening 1.0.0 (2026-08-08)

- [x] Transaction classification dùng một domain helper; purchase, sale, adjustment/reversal và opening không bị trộn nghĩa.
- [x] Báo cáo Nhập – Xuất – Tồn có cột Điều chỉnh signed; regression quantity `100 + 20 - 30 + 8 = 98` và money `1.000 + 200 - 300 + 80 = 980` PASS.
- [x] `LATEST_SCHEMA_VERSION` là nguồn duy nhất; schema N-1 yêu cầu pre-migration backup và post-migration integrity/foreign-key checks.
- [x] Bỏ giới hạn hai NCC ưu tiên, default sản phẩm 25kg/heo/bao và fallback ngày 2026; invalid date trả validation error.
- [x] Product/Supplier/lifecycle/payment/adjustment/restore có confirmation và feedback; không dùng browser alert/confirm.
- [x] Tồn kho phân biệt rõ chế độ hiện tại/lịch sử; báo cáo production giữ đúng bốn nhóm cần thiết.
- [x] Public source loại customer XLS/JSON/private-data; sanitized fixture/example vẫn được đóng gói cho test.
- [x] Version package/Cargo/Tauri đồng bộ `1.0.0` sau khi frontend, Rust, clippy, release check và macOS Tauri packaging đạt.
- [ ] Apple codesign/notarization và Windows installed smoke cần certificate/runner bên ngoài workspace trước khi phân phối công khai.

Nguồn sự thật audit: `docs/current-audit.md`. Không đánh dấu hoàn thành dựa trên tài liệu hoặc implementation Electron cũ; chỉ đóng task khi production path Tauri/Rust và test tương ứng đã đạt.

## P0 — Chặn release

- [x] Audit source, baseline build/test, commands, schema/migrations, backup/restore, seed, CI, Electron tests, UI/localStorage và risky patterns.
- [x] Tạo `docs/current-audit.md`, `docs/target-architecture.md`, `docs/release-blockers.md` và task list này.
- [x] Chạy clean install và toàn bộ baseline Phase 0: npm ci/typecheck/lint/test/build, cargo fmt/clippy/test/check.
- [x] Đưa lint/typecheck/rustfmt/clippy, npm test/build và Cargo test/check về xanh.
- [x] Đồng bộ version package/Cargo/Tauri/backup metadata `1.0.0-rc.1`.
- [x] Định nghĩa structured `AppErrorDTO { code, message, details }`; không lộ raw DB/fs errors.
- [x] Tạo typed command modules; loại production placeholder và Electron API khỏi active Tauri UI.
- [ ] Bổ sung backend validation + migration CHECK/index/unique, giữ tương thích DB cũ.
- [ ] Hoàn tất update/delete draft, confirm idempotency, cancel purchase/sale và reversal ledger.
- [ ] Hoàn tất supplier payment và invariant công nợ.
- [x] Thay backup bằng SQLite-consistent snapshot + checksum/manifest + atomic ZIP.
- [x] Viết restore staging/validation/integrity/schema/pool swap/rollback; harden rollback error và WAL/SHM cleanup.
- [x] Khóa seed/clear demo khỏi production bằng Cargo feature/config và loại UI seed khỏi active source.
- [x] Thay Electron default tests/release workflow bằng frontend tests + Rust integration tests và Tauri packaging; Electron tests chỉ còn trong archive.
- [ ] Test upgrade dữ liệu cũ và đối soát sản phẩm, tồn, giá vốn, chứng từ, công nợ.

## P1 — Phải sửa trước RC

- [ ] Refactor backend thành command/application/domain/repository/infrastructure; tách service 1.000+ dòng.
- [ ] Import backend theo upload/preview/validate/execute/history/cancel/export-errors, có hash và transaction.
- [ ] Export report Excel ở backend và thẻ kho sản phẩm đầy đủ.
- [ ] Attachment backend an toàn và đưa vào backup/restore manifest.
- [x] Settings + backup status lưu backend; auto-backup/retention/health-check đọc nguồn sự thật SQLite, không dùng localStorage.
- [x] Chuẩn hóa package weight mới theo gram; UI chỉ chuyển đổi gram/kg khi hiển thị và dữ liệu cũ vẫn đọc được.
- [x] Ngừng nhận shipping cost cho phiếu nhập mới nhưng giữ các cột legacy để đọc dữ liệu lịch sử.
- [x] Bật CSP và thu hẹp Tauri capabilities; không đăng ký filesystem plugin trực tiếp.
- [ ] Audit log cho mutations quan trọng.
- [ ] CI Windows/macOS chạy fmt, clippy, Rust tests, lint, typecheck, UI tests, Tauri build/E2E.
- [ ] Viết runbook vận hành, backup, restore, rollback upgrade và phục hồi khẩn cấp.

## P2 — Sau RC

- [ ] Tách bundle theo route và đo startup/query/report performance.
- [ ] Chuẩn hóa component/feature folders và giảm component lớn.
- [ ] Accessibility, keyboard navigation và usability test với người dùng low-tech.
- [ ] Diagnostic export/log rotation không lộ dữ liệu nhạy cảm.
- [ ] Performance/regression fixtures quy mô thực tế.

## Thứ tự triển khai đề xuất

1. Làm xanh toolchain + contract compile, sau đó vô hiệu hóa placeholder/seed production.
2. Structured errors, validation/domain types và migrations bảo vệ invariant.
3. Hoàn thiện transaction chứng từ/công nợ cùng Rust integration tests.
4. Backup/restore an toàn và failure-injection tests.
5. Import/export/attachments/settings.
6. Tauri E2E, upgrade fixtures, CI/release và runbook.

## Nhật ký Giai đoạn 1

- [x] Thêm validation domain dùng chung cho trường bắt buộc, số dương, số không âm, enum và ngày ISO.
- [x] Áp dụng validation backend cho create/update product và create purchase/sale draft; chặn phiếu rỗng và số âm.
- [x] Serialize lỗi Rust theo `{ code, message, details }` và che lỗi database/filesystem nội bộ.
- [ ] Cập nhật typed frontend error contract và UI mapping.
- [ ] Transaction, migration constraints, backup/restore và placeholder còn lại chưa hoàn tất; chưa đóng Giai đoạn 1.
- [x] Backup dùng SQLite Online Backup API, integrity/foreign-key checks, checksum thật và verify trước atomic rename; cleanup file tạm cả khi lỗi.
- [x] Seed service/commands được loại khỏi Rust release build bằng cfg; release frontend build đã chạy thành công.
- [x] Seed client legacy đã archive ngoài active source; release registry không chứa seed command.
- [ ] AppState/operation lock đã được tạo; phải migrate toàn bộ commands sang state này trước khi mở khóa restore thật.
- [x] Toàn bộ Rust database commands dùng AppState; `DbPool` không còn được manage trực tiếp.
- [x] Restore staging/checksum/integrity/schema/pre-backup/exclusive-lock/atomic-swap/reopen/rollback đã triển khai; integration test swap và reopen pool pass.
- [x] Version package/Cargo/Tauri đồng bộ `1.0.0-rc.1`; backup đọc version từ Cargo package.
- [x] Verify/release workflow đã chuyển sang Rust quality gates và `tauri-apps/tauri-action`, không còn Electron builder.
- [x] Thêm backend `get_settings`/`update_settings` lưu trong SQLite với validation; không dùng localStorage làm nguồn sự thật.
- [x] Tạo `src/lib/commands/*` với một invoke wrapper typed, parse structured error và command strings theo module.
- [x] Chuyển active production page sang command modules; xóa bridge/client/global Electron khỏi `src`.
- [x] Settings/Backup page đã gọi trực tiếp typed commands/Tauri dialog/version; không còn mock backup stats/list hoặc settings hard-code trên page.
- [x] Migrate 28 consumer files sang `appCommands`; `window.electronAPI`, `electronCompatBridge.ts` và `tauriClient.ts` đã bị xóa khỏi `src`.
- [x] Typecheck và command contract pass; các action chưa có backend an toàn đã gỡ khỏi production và archive, không thêm stub success giả.
- [x] Tạo command usage inventory tại `docs/command-contract.md` và gate `scripts/check-command-contract.mjs`; CI/release chạy `verify:release`.

## Nhật ký phase typed contract / Tauri-only (2026-08-07)

- [x] Product delete/toggle, supplier delete/toggle, inventory product history và invoice search có typed wrapper + Rust handler/service thật.
- [x] Dashboard chỉ đổi transport từ Electron sang typed Tauri client; không thay thiết kế/logic hiển thị.
- [x] Archive Electron source/config và 34 legacy Electron test files; default Vitest không chạy archive.
- [x] Gỡ Electron/Electron Toolkit/better-sqlite3/Drizzle/archiver/unzipper khỏi package manifest và lockfile.
- [x] Thêm `eslint.config.js`, release-state gate, command-contract gate và `.gitignore` cho DB/sidecar/backup/key/certificate.
- [x] Restore chỉ nhận ZIP whitelist, sidecar cleanup trả `AppResult` có retry Windows, rollback failure trả `RESTORE_ROLLBACK_FAILED` và giữ rollback file.
- [x] `npm run build:tauri` pass ngoài sandbox; tạo `.app` và `.dmg`.
- [x] Rust suite hiện có 26 test pass: 4 unit/service test và 22 integration tests production backend cho product, purchase, sale, inventory, backup/restore, migration, settings.
- [ ] Các nghiệp vụ deferred khỏi RC: import wizard, attachment, supplier payment, cancel/delete purchase, update/cancel/delete sale, report export và price-history report.

## Nhật ký hardening RC (2026-08-07)

- [x] Auto-backup chạy một lần ở backend khi app khởi động, bỏ qua nếu đã có backup hợp lệ trong ngày và ghi trạng thái thành công/lỗi vào settings SQLite.
- [x] Retention chỉ xóa backup tự động cũ theo pattern; luôn giữ bản mới nhất và không xóa manual/pre-restore.
- [x] Backup UI dùng các command thật để lấy trạng thái, danh sách, validate và health-check; không hiển thị mock.
- [x] Migration schema v7 thêm document sequence atomic cho PN/PX và các index truy vấn chứng từ/tồn kho/công nợ.
- [x] Sequence không tái sử dụng mã đã xóa và vượt qua test đồng thời nhiều luồng.
- [x] Rust suite hiện có 38 test pass: 4 unit/service và 34 integration tests.
- [x] Command contract release: 38 typed commands / 38 handlers.
- [x] `npm ci`, release verification 17/17, lint, typecheck, 12 frontend tests, Vite build, fmt, clippy, 31 Rust tests, release check và Tauri production build đều PASS.
- [x] Tauri build tạo `Feed Inventory Manager.app` và `Feed Inventory Manager_1.0.0-rc.1_x64.dmg`.
- [ ] macOS artifact chưa codesign/notarize (`code object is not signed at all`); cần Apple Developer certificate và CI secrets trước khi phát hành công khai.

## Nhật ký release verification bổ sung (2026-08-07)

- [x] Bổ sung test auto-backup disabled, failure persistence, corrupted-last-backup health và retention validation.
- [x] Bổ sung test PN/PX bắt đầu từ `PN000001`/`PX000001`, sequential uniqueness, rollback không tiêu sequence và migration khởi tạo từ mã legacy lớn nhất.
- [x] Manual backup UX dùng nhãn “Sao lưu ngay”, “Khôi phục dữ liệu” và confirmation nêu rõ app tự tạo bản sao hiện tại trước restore.
- [x] Xóa dead declaration `src/types/electron.d.ts`; toàn bộ Electron bridge/runtime/type source được loại khỏi production tree.
- [x] Full workspace gates PASS: npm install/verify, command contract 38/38, Rust 38 tests, clippy `-D warnings`, release check và Tauri packaging.
- [x] Clean-source `/private/tmp/investock-rc-clean-efc99GjW`: không dependency/build/database/settings cục bộ; `npm ci`, `verify:release`, Cargo tests, release check và Tauri build PASS.
- [x] Clean-source DMG qua `hdiutil verify`; SHA-256 `5870e1aa88d4c95868303beaf552592452083388214ae4d9900b634631eb24e4`.
- [x] Artifact workspace cuối cùng qua `hdiutil verify`; SHA-256 `d452e9dfbb841f288dcf7935ce6f14cdfc459832b67cb8c02333ecb68e3dc68e`.

File thay đổi trực tiếp trong phase verification này:

- `src-tauri/tests/core_backend.rs`
- `src/pages/Settings/index.tsx`
- `src/components/layout/Sidebar.tsx`
- `src/types/electron.d.ts` (đã xóa)
- `task.md`
- `docs/release-blockers.md`

## Nhật ký release verification / clean source (2026-08-07)

- [x] `check-command-contract.mjs` parse typed commands và release handler, phân biệt debug-only, chặn module rỗng/duplicate/missing handler và in bảng 38/38 PASS.
- [x] `verify-release-state.mjs` in 17 check PASS/FAIL và fail process khi có mismatch.
- [x] Default Vitest chỉ include `tests/frontend` và `src/**/*.test.*`; 34 legacy Electron files chỉ nằm trong `tests/legacy-electron`.
- [x] Loại typed import một bước và `import_products_excel` khỏi release registry; import workflow tiếp tục disabled trong RC.
- [x] Clean-source verification tại `/private/tmp/investock-clean-verify-20260807-1215`: không node_modules/target/database, `npm ci`, `verify:release`, Cargo 26 tests và Tauri build đều pass.
- [x] DMG clean-source verify checksum, mount read-only và chứa `.app` đúng.
- [ ] macOS artifact chưa codesign/notarize (`code object is not signed at all`); cần Apple Developer certificate/CI secrets.
- [ ] Chưa smoke-test Windows NSIS và macOS arm64 do máy hiện tại là macOS x86_64.
- [ ] Chưa launch UI installer trên máy hiện tại vì app dùng app-data production; cần profile/máy test cô lập để không chạm database người dùng.

## Nhật ký phase nghiệp vụ / RC hardening (2026-08-07)

- [x] Supplier payment transaction thật; chặn phiếu chưa xác nhận, số tiền không hợp lệ và overpayment; UI hiển thị lịch sử công nợ.
- [x] Purchase/sale draft hỗ trợ sửa và xóa; chỉ trạng thái nháp, giữ sequence không tái sử dụng và dùng transaction `IMMEDIATE` để tránh race/lock-upgrade.
- [x] Validation hai lớp chặn giá 0, duplicate product, product/supplier không tồn tại hoặc inactive, line/total discount vượt giá trị.
- [x] Product duplicate code dùng structured error code; frontend không parse raw SQLite message.
- [x] PurchaseForm hiển thị lỗi lưu và giữ dữ liệu; typed command contract đạt 44/44.
- [x] Auto-backup fallback sang thư mục app-data nội bộ, lưu cảnh báo, health status phân biệt protected fallback; sidebar có chỉ báo backup.
- [x] Manual backup filename có timestamp; archive validator kiểm tra metadata/checksum/integrity/foreign key xuyên suốt create/list/health/restore.
- [x] Branding runtime/bundle là InveStock; identifier cũ được giữ để không làm mất đường dẫn dữ liệu.
- [x] Gỡ dependency/frontend E2E/import backend chết: xlsx, uuid JS, Playwright, calamine, rust_xlsxwriter và import service không đăng ký.
- [x] Frontend gates PASS: lint, typecheck, 14 tests, contract 44/44, production build và release verification 17/17.
- [x] Rust gates PASS: fmt, clippy `-D warnings`, 4 unit/service tests, 39 integration tests và cargo check.
- [x] Đã tạo và verify source ZIP mới từ source giải nén sạch; npm/Cargo gates đều PASS.
- [x] `npm run build:tauri` PASS ngoài sandbox; tạo `InveStock.app` và `InveStock_1.0.0-rc.1_x64.dmg`.
- [ ] Signing/notarization macOS và code signing Windows cần certificate/secret bên ngoài source; Windows installed smoke ngoài scope phase.

### Audit bổ sung theo Definition of Done

- [x] Hợp nhất `validate_backup_package`: exact two entries, metadata limits, format, SHA-256, database size, SQLite integrity/foreign-key và schema compatibility cho restore.
- [x] Health/manual/create verify và restore preflight dùng cùng package validator; test extra ZIP entry và metadata size mismatch đều reject.
- [x] Product create/update đều trả `PRODUCT_CODE_EXISTS`; production search raw SQLite/constraint text bằng 0.
- [x] Settings save/folder errors hiển thị trực tiếp; fallback warning dùng wording low-tech, không lộ technical path.
- [x] Bổ sung frontend critical-flow tests; tổng frontend 21 tests PASS.
- [x] Bổ sung inactive/missing reference, valid discount và unified validator tests; tổng Rust 4 unit/service + 42 integration tests PASS.
- [x] README, CHANGELOG và RELEASE_TESTING dùng branding InveStock và phân biệt internal unsigned RC với public signed/notarized release.

File thay đổi trực tiếp trong phase này:

- `src-tauri/src/{commands,services,domain,lib.rs}` và `src-tauri/tests/core_backend.rs`
- `src/lib/commands/{purchases,sales}.ts`, `shared/{ipc-types.ts,schemas/index.ts}`
- `src/pages/{Products,Purchases,Sales,Settings}` và `src/components/layout/Sidebar.tsx`
- `package.json`, `package-lock.json`, `src-tauri/{Cargo.toml,Cargo.lock,tauri.conf.json}`, `index.html`
- `tests/frontend/validation.test.ts`, `README.md`, `docs/release-blockers.md`, `task.md`

## Historical inventory engine và money-state ledger (2026-08-08)

- [x] Migration schema v9 bổ sung `products.current_inventory_value`, optional product threshold, monetary state cho inventory transactions và metadata generic/revision cho import jobs.
- [x] Repair legacy summary suy ra closing cost bị thiếu (bao gồm regression HH00042), giữ nguyên negative stock và lấy exact closing value làm source of truth.
- [x] Import legacy đọc row count/totals từ metadata, rollback atomic, idempotent theo source hash + period và supersede revision cũ khi source cùng kỳ thay đổi.
- [x] Một period engine dùng chung cho Dashboard, Báo cáo Nhập–xuất–tồn và Tồn kho; phân biệt `legacy`/`operational`/`mixed`, `complete`/`incomplete`/`summary_only` từ metadata DB.
- [x] Purchase/sale ledger lưu `value_in`/`value_out` và inventory value before/after; không reconstruct tổng giá trị từ average cost đã làm tròn.
- [x] Legacy COGS không được hiển thị thành revenue; tab doanh thu hiển thị không đủ dữ liệu khi nguồn không có giá bán.
- [x] Product create/update không nhận giá bán; field/column cũ chỉ còn read-only deprecated để tương thích dữ liệu.
- [x] UI bỏ hard-code kỳ/năm, year selector nhận earliest/latest từ backend, phân biệt tồn âm với hết hàng và có Apply/toast cho bộ lọc.
- [x] Rust: 6 unit + 43 core integration + 36 historical integration tests PASS; fmt và clippy `-D warnings` PASS.
- [x] Frontend: lint/typecheck, 27 tests, command contract 45/45, production build và release verification 17/17 PASS.
- [x] Tauri release build PASS; DMG `hdiutil verify` VALID, SHA-256 `4d53b712d7dbcac4973eae16acc96f97bf53405d5b8ac574ab92c88a964b398e`.
- [x] Source ZIP được giải nén vào `/private/tmp/investock-release-verify.sEg1GF/InveStock`; `npm ci`, release/frontend gates, 85 Rust tests và Cargo check PASS.
- [ ] Signing/notarization macOS và Windows smoke/package vẫn cần certificate, CI secrets và runner Windows bên ngoài máy hiện tại.

## RC.2 correctness hardening (2026-08-08)

- [x] Migration v10 thêm `import_jobs.dataset_hash`, `import_jobs.revision` và `purchase_invoice_items.inventory_cost_value`; đổi unique indexes để lưu được nhiều revision lịch sử.
- [x] Correction cùng XLS/period dùng dataset hash + revision, giữ nguyên summaries cũ, đánh dấu superseded và chỉ xóa opening balance thuộc đúng import job cũ.
- [x] Mixed-period money bắt đầu từ exact legacy closing value rồi cộng/trừ operational `value_in/value_out`; quantity và money regressions PASS.
- [x] Purchase line `3 × 100 - 1` ghi chính xác 299 đồng; invoice discount được phân bổ tỷ lệ với remainder deterministic, không mất một đồng và không cộng VAT vào inventory cost.
- [x] Sale toàn bộ tồn còn lại lấy hết inventory value, bảo đảm stock 0 thì inventory value 0.
- [x] Dashboard có `revenueCoverage` complete/partial/unavailable; inventory-flow chart dùng acquisition cost và COGS, exact legacy dashboard hiển thị bốn snapshot cards mà không fake daily trend.
- [x] Product Sales legacy hiển thị số lượng xuất + COGS với Revenue/Profit N/A; Revenue/Product Sales có applied range/toast; Supplier Debt bỏ date filter giả và ghi rõ current snapshot.
- [x] `ReportParams` TypeScript chỉ giữ các field Rust nhận; frontend contract regression kiểm tra các field unsupported đã bị loại.
- [x] Customer metadata đã loại khỏi fixture; `private-data/` được gitignore và source packager exclude; có `legacy-seed.example.json` sanitized.
- [x] InitialData schema 10 được tạo bằng migration engine + BackupService, verified đúng 43/8107/7539/8351/7295 và current value 1.785.113.795 đồng.
- [x] Version đồng bộ `1.0.0-rc.2`; frontend 33 tests, Rust 6 unit + 46 core + 38 historical, command contract 45/45 và release state 17/17 PASS.
- [x] Tauri RC.2 build PASS; DMG `hdiutil verify` VALID. Final source ZIP đã được giải nén vào fresh temp directory và npm/Cargo verification PASS.
- [ ] Windows `.exe`/NSIS và signing/notarization vẫn cần runner Windows cùng certificate/secrets bên ngoài source.

## Nhật ký phase UI/UX cửa hàng (2026-08-07)

- [x] Chart Nhập/Xuất trên Dashboard đổi từ bar chart sang line chart hai đường; tooltip có thời gian, giá trị nhập, giá trị xuất và chênh lệch.
- [x] Dashboard hỗ trợ nhanh 7 ngày, 30 ngày, 3 tháng, 6 tháng và 12 tháng; tự chọn group ngày/tháng phù hợp.
- [x] Product form bỏ giá bán và ghi chú khỏi UI; trọng lượng nhập theo kg, backend tiếp tục nhận gram canonical; thêm trạng thái hoạt động.
- [x] Product list bỏ các cột giá dễ gây hiểu nhầm, giữ trạng thái/filter trạng thái và dùng ngưỡng tồn thấp từ Settings.
- [x] Product create backend lưu active; filter `activeOnly=false` trả đúng sản phẩm ngừng hoạt động; create purchase/sale vẫn chỉ tải sản phẩm active.
- [x] Settings thêm ngưỡng cảnh báo tồn thấp mặc định và tối đa hai nhà cung cấp ưu tiên, có validation Rust và backward-compatible JSON defaults.
- [x] Purchase form đưa NCC ưu tiên lên đầu, mặc định NCC đầu tiên và có quick-select; không hard-code nhà cung cấp.
- [x] Dashboard và trang Tồn kho phân biệt rõ “Sắp hết”/“Hết hàng” theo threshold Settings.
- [x] Trang Nhập kho và Xuất kho dùng cùng page header, filter row, full-height card/table và footer pagination như Nhà cung cấp.
- [x] Xác minh terminology: doanh thu từ phiếu xuất đã xác nhận, giá vốn từ cost snapshot/calculation, lợi nhuận = doanh thu - giá vốn.
- [x] Frontend lint/typecheck/21 tests/build, release verification 17/17, command contract 44/44 PASS.
- [x] Rust fmt/clippy `-D warnings`, 4 unit/service + 43 integration tests và release check PASS.
- [x] Tauri build PASS; tạo `InveStock.app` và `InveStock_1.0.0-rc.1_x64.dmg`.
