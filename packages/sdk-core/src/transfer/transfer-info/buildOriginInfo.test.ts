import type { TAssetInfo } from '@paraspell/assets'
import { isAssetEqual } from '@paraspell/assets'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PolkadotApi } from '../../api'
import { getAssetBalanceInternal } from '../../balance'
import { buildOriginInfo } from './buildOriginInfo'

vi.mock('../../balance')

vi.mock('@paraspell/assets', { spy: true })

const mockApi = {} as unknown as PolkadotApi<unknown, unknown, unknown>

const dotAsset = {
  symbol: 'DOT',
  assetId: '1',
  decimals: 10,
  existentialDeposit: '1000000000'
} as TAssetInfo

const usdtAsset = {
  symbol: 'USDT',
  assetId: '1984',
  decimals: 6,
  existentialDeposit: '1000'
} as TAssetInfo

const usdcAsset = {
  symbol: 'USDC',
  assetId: '1337',
  decimals: 6,
  existentialDeposit: '1000'
} as TAssetInfo

describe('buildOriginInfo — xcmFee sufficiency', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(isAssetEqual).mockImplementation((a, b) => a.symbol === b.symbol)
  })

  it('subtracts both the amount and the fee when the fee asset is the transferred native asset', async () => {
    vi.mocked(getAssetBalanceInternal).mockResolvedValue(200000000000n)

    const result = await buildOriginInfo({
      api: mockApi,
      origin: 'AssetHubPolkadot',
      sender: 'alice',
      assets: [{ ...dotAsset, amount: 10000000000n }],
      amount: 10000000000n,
      originFee: 100000000n,
      originFeeAsset: dotAsset,
      isOriginFeeAsset: false
    })

    expect(result.xcmFee.balanceAfter).toBe(200000000000n - 10000000000n - 100000000n)
    expect(result.xcmFee.sufficient).toBe(true)
  })

  it('reports insufficient when amount + fee leaves the balance below the existential deposit', async () => {
    const balance = 214567945405165134n
    const amount = balance - 1000000000n // leave exactly the ED for the amount alone
    vi.mocked(getAssetBalanceInternal).mockResolvedValue(balance)

    const result = await buildOriginInfo({
      api: mockApi,
      origin: 'AssetHubPolkadot',
      sender: 'alice',
      assets: [{ ...dotAsset, amount }],
      amount,
      originFee: 316069687n,
      originFeeAsset: dotAsset,
      isOriginFeeAsset: false
    })

    // remainder = balance - amount - fee < ED, even though selectedCurrency stays sufficient
    expect(result.xcmFee.balanceAfter).toBe(balance - amount - 316069687n)
    expect(result.xcmFee.sufficient).toBe(false)
    expect(result.selectedCurrency[0].sufficient).toBe(true)
  })

  it('treats the remainder as sufficient when it equals the existential deposit', async () => {
    const balance = 1000000000n + 10000000000n + 100000000n
    vi.mocked(getAssetBalanceInternal).mockResolvedValue(balance)

    const result = await buildOriginInfo({
      api: mockApi,
      origin: 'AssetHubPolkadot',
      sender: 'alice',
      assets: [{ ...dotAsset, amount: 10000000000n }],
      amount: 10000000000n,
      originFee: 100000000n,
      originFeeAsset: dotAsset,
      isOriginFeeAsset: false
    })

    expect(result.xcmFee.balanceAfter).toBe(1000000000n)
    expect(result.xcmFee.sufficient).toBe(true)
  })

  it('subtracts amount and fee when an explicit fee asset is also transferred (isOriginFeeAsset)', async () => {
    vi.mocked(getAssetBalanceInternal).mockResolvedValue(5000n)

    const result = await buildOriginInfo({
      api: mockApi,
      origin: 'AssetHubPolkadot',
      sender: 'alice',
      assets: [{ ...usdtAsset, amount: 1000n }],
      amount: 1000n,
      originFee: 100n,
      originFeeAsset: usdtAsset,
      isOriginFeeAsset: true
    })

    expect(result.xcmFee.balanceAfter).toBe(3900n)
    expect(result.xcmFee.sufficient).toBe(true)
  })

  it('control: keeps the previous behavior when the fee asset is not a transferred asset', async () => {
    vi.mocked(getAssetBalanceInternal).mockResolvedValue(5000n)

    const result = await buildOriginInfo({
      api: mockApi,
      origin: 'AssetHubPolkadot',
      sender: 'alice',
      assets: [{ ...dotAsset, amount: 1000n }],
      amount: 1000n,
      originFee: 100n,
      originFeeAsset: usdtAsset,
      isOriginFeeAsset: false
    })

    // fee comes off a different balance: only the fee is subtracted, no ED gate
    expect(result.xcmFee.balanceAfter).toBe(4900n)
    expect(result.xcmFee.sufficient).toBe(true)
  })

  it('only subtracts the transferred assets that share the fee asset balance in multi-asset transfers', async () => {
    vi.mocked(getAssetBalanceInternal).mockResolvedValue(3000n)

    const result = await buildOriginInfo({
      api: mockApi,
      origin: 'AssetHubPolkadot',
      sender: 'alice',
      assets: [
        { ...usdtAsset, amount: 1000n },
        { ...usdcAsset, amount: 500n }
      ],
      amount: 1500n,
      originFee: 100n,
      originFeeAsset: usdtAsset,
      isOriginFeeAsset: false
    })

    // USDC (500) comes off a different balance; only the USDT amount + fee count here
    expect(result.xcmFee.balanceAfter).toBe(3000n - 1000n - 100n)
    expect(result.xcmFee.sufficient).toBe(true)
  })

  it('control: reports insufficient when the balance cannot cover the fee on a non-shared asset', async () => {
    vi.mocked(getAssetBalanceInternal).mockResolvedValue(50n)

    const result = await buildOriginInfo({
      api: mockApi,
      origin: 'AssetHubPolkadot',
      sender: 'alice',
      assets: [{ ...dotAsset, amount: 1000n }],
      amount: 1000n,
      originFee: 100n,
      originFeeAsset: usdtAsset,
      isOriginFeeAsset: false
    })

    expect(result.xcmFee.sufficient).toBe(false)
  })
})
