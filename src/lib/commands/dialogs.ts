import { open, save } from '@tauri-apps/plugin-dialog'
export const dialogs = { openFile: (extensions: string[]) => open({ multiple: false, filters: [{ name: 'Tệp dữ liệu', extensions }] }), selectFolder: () => open({ directory: true, multiple: false }), saveFile: (defaultPath: string) => save({ defaultPath }) }
