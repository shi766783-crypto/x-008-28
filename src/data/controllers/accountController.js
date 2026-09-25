import { storage } from '../../core/storage.js'
import { uid } from '../../core/utils.js'
import { STORAGE_KEYS, ACCOUNT_TYPES } from '../../core/constants.js'

export const emptyAccountForm = () => ({
  name: '',
  type: ACCOUNT_TYPES[0].value,
  initialBalance: ''
})

export function loadAccounts() {
  return storage.getJSON(STORAGE_KEYS.accounts) || []
}

export function saveAccounts(accounts) {
  storage.setJSON(STORAGE_KEYS.accounts, accounts)
}

export function normalizeAccount(form) {
  return {
    id: uid(),
    name: String(form.name || '').trim(),
    type: form.type,
    initialBalance: Number(form.initialBalance) || 0,
    balance: Number(form.initialBalance) || 0
  }
}

export function addAccount(form) {
  const account = normalizeAccount(form)
  saveAccounts([...loadAccounts(), account])
  return account
}

export function updateAccount(id, form) {
  const accounts = loadAccounts().map((a) =>
    a.id === id ? { ...a, name: String(form.name || '').trim(), type: form.type } : a
  )
  saveAccounts(accounts)
}

export function removeAccount(id, confirmFn = window.confirm) {
  if (!confirmFn(`确认删除账户「${id}」吗？相关历史记录将被保留。`)) return false
  saveAccounts(loadAccounts().filter((a) => a.id !== id))
  return true
}
