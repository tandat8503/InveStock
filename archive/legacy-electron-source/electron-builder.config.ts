import type { Configuration } from 'electron-builder'

const config: Configuration = {
  appId: 'com.feedstore.inventorymanager',
  productName: 'Feed Inventory Manager',
  executableName: 'FeedInventoryManager',
  copyright: 'Copyright © 2024 FeedStore',

  // Files to include
  files: [
    'out/**/*',
    'node_modules/**/*',
    '!node_modules/.cache{,/**/*}',
    '!tests{,/**/*}',
    '!fixtures{,/**/*}',
    '!docs{,/**/*}',
    '!**/*.{ts,tsx}',
    '!**/*.map',
    '!**/*.test.*',
  ],
  npmRebuild: true,
  asar: true,
  asarUnpack: [
    'node_modules/better-sqlite3/**/*',
    'node_modules/**/*.node',
  ],

  // App directories
  directories: {
    buildResources: 'build',
    output: 'release/${version}',
  },

  // macOS
  mac: {
    icon: 'build/icon.icns',
    target: ['dmg'],
    category: 'public.app-category.business',
    darkModeSupport: false,
  },
  dmg: {
    contents: [
      { x: 410, y: 150, type: 'link', path: '/Applications' },
      { x: 130, y: 150, type: 'file' },
    ],
    window: {
      width: 540,
      height: 380,
    },
  },

  // Windows
  win: {
    icon: 'build/icon.ico',
    target: ['nsis'],
    requestedExecutionLevel: 'asInvoker', // No admin required for normal operation
  },
  nsis: {
    oneClick: false,
    allowElevation: true,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'Feed Inventory Manager',
    installerLanguages: ['vi-VN', 'en-US'],
    language: '1066', // Vietnamese
  },

  // Electron version
  electronVersion: '31.0.2',
  artifactName: 'Feed-Inventory-Manager-${version}-${os}-${arch}.${ext}',
}

export default config
