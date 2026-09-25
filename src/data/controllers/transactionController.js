import { storage } from '../../core/storage.js'
import { uid, todayStr, money } from '../../core/utils.js'
import { STORAGE_KEYS, TRANSACTION_TYPES } from '../../core/constants.js'
import { loadAccounts, saveAccounts } from './accountController.js'

export const emptyTransactionForm = () => ({
  type: TRANSACTION_TYPES.EXPENSE,
  accountId: '',
  toAccountId: '',
  amount: '',
  category: '餐饮',
  date: todayStr(),
  note: '',
  isLarge: false
})

export function loadTransactions() {
  return storage.getJSON(STORAGE_KEYS.transactions) || []
}

export function saveTransactions(transactions) {
  storage.setJSON(STORAGE_KEYS.transactions, transactions)
}

export function formatAccountLabel(accountId) {
  const account = loadAccounts().find((a) => a.id === accountId)
  return account ? account.name : '未知账户'
}

export function normalizeTransaction(form) {
  const amount = Number(form.amount) || 0
  const base = {
    id: uid(),
    amount,
    date: form.date || todayStr(),
    note: String(form.note || '').trim(),
    isLarge: Boolean(form.isLarge),
    createdAt: Date.now()
  }
  if (form.type === TRANSACTION_TYPES.TRANSFER) {
    return { ...base, type: TRANSACTION_TYPES.TRANSFER, fromAccountId: form.accountId, toAccountId: form.toAccountId }
  }
  return { ...base, type: form.type, accountId: form.accountId, category: form.category }
}

function applyTransfer(accounts, fromAccountId, toAccountId, amount) {
  return accounts.map((a) => {
    if (a.id === fromAccountId) return { ...a, balance: currentBalanceOf(a) - amount }
    if (a.id === toAccountId) return { ...a, balance: currentBalanceOf(a) + amount }
    return a
  })
}

function reconcileAll() {
  const accounts = loadAccounts()
  const transactions = loadTransactions()
  const balances = new Map(accounts.map((a) => [a.id, a.initialBalance]))
  for (const t of transactions) {
    if (t.type === TRANSACTION_TYPES.INCOME) balances.set(t.accountId, (balances.get(t.accountId) || 0) + t.amount)
    else if (t.type === TRANSACTION_TYPES.EXPENSE) balances.set(t.accountId, (balances.get(t.accountId) || 0) - t.amount)
    else if (t.type === TRANSACTION_TYPES.TRANSFER) {
      balances.set(t.fromAccountId, (balances.get(t.fromAccountId) || 0) - t.amount)
      balances.set(t.toAccountId, (balances.get(t.toAccountId) || 0) + t.amount)
    }
  }
  saveAccounts(accounts.map((a) => ({ ...a, balance: balances.get(a.id) || 0 })))
}

function currentBalanceOf(account) {
  if (!account) return 0
  // 新建账户时可能还没有 balance 字段，统一回退到初始余额，避免算出 NaN
  return Number.isFinite(Number(account.balance)) ? Number(account.balance) : Number(account.initialBalance) || 0
}

/**
 * 检查支出 / 转账后是否会导致账户余额不足。
 * 收入不检查。返回 null 表示余额充足或无需检查。
 */
export function getInsufficientBalance(form, accounts = loadAccounts()) {
  const amount = Number(form.amount) || 0
  if (!(amount > 0)) return null
  if (form.type !== TRANSACTION_TYPES.EXPENSE && form.type !== TRANSACTION_TYPES.TRANSFER) return null
  if (!form.accountId) return null

  const account = accounts.find((a) => a.id === form.accountId)
  if (!account) return null
  const balance = currentBalanceOf(account)
  if (balance >= amount) return null

  const action = form.type === TRANSACTION_TYPES.TRANSFER ? '转账' : '支出'
  return {
    type: form.type,
    action,
    account,
    accountName: account.name,
    balance,
    amount,
    afterBalance: balance - amount,
    message: `「${account.name}」当前余额仅 ¥${money(balance)}，本次${action} ¥${money(amount)}后余额将为 ¥${money(balance - amount)}。确认仍要继续吗？`
  }
}

/**
 * 余额不足时弹出确认框；用户确认返回 true，取消返回 false。
 * confirmFn 可注入，便于复用既有 window.confirm 风格与测试。
 */
export function confirmInsufficientBalance(form, accounts = loadAccounts(), confirmFn = window.confirm) {
  const info = getInsufficientBalance(form, accounts)
  if (!info) return true
  return confirmFn(info.message)
}

export function addTransaction(form) {
  const accounts = loadAccounts()
  if (!form.accountId || !form.amount) return null
  if (form.type === TRANSACTION_TYPES.TRANSFER && form.accountId === form.toAccountId) return null
  const transaction = normalizeTransaction(form)
  const nextAccounts = form.type === TRANSACTION_TYPES.TRANSFER
    ? applyTransfer(accounts, form.accountId, form.toAccountId, transaction.amount)
    : accounts.map((a) =>
        a.id === form.accountId
          ? { ...a, balance: currentBalanceOf(a) + (form.type === TRANSACTION_TYPES.INCOME ? transaction.amount : -transaction.amount) }
          : a
      )
  saveAccounts(nextAccounts)
  saveTransactions([...loadTransactions(), transaction])
  return transaction
}

export function removeTransaction(id, confirmFn = window.confirm) {
  const transaction = loadTransactions().find((t) => t.id === id)
  if (!transaction) return false
  if (!confirmFn('确认删除这条记账记录吗？账户余额将自动回滚。')) return false
  saveTransactions(loadTransactions().filter((t) => t.id !== id))
  reconcileAll()
  return true
}

