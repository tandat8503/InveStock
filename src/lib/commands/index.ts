import { app } from './app'
import { backup } from './backup'
import { dialogs } from './dialogs'
import { dashboard } from './dashboard'
import { inventory } from './inventory'
import { products } from './products'
import { purchases } from './purchases'
import { reports } from './reports'
import { sales } from './sales'
import { settings } from './settings'
import { suppliers } from './suppliers'

export const appCommands = {
  app,
  backup,
  dialog: dialogs,
  dashboard,
  inventory,
  products,
  purchases,
  reports,
  sales,
  settings,
  suppliers,
} as const
