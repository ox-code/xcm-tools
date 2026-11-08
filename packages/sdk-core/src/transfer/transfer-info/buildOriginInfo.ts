import type { TAssetInfo, WithAmount } from '@paraspell/assets'
import { isAssetEqual } from '@paraspell/assets'

import { getAssetBalanceInternal } from '../../balance'
import type { TBuildOriginInfoOptions, TOriginXcmFeeInfo, TSelectedCurrencyInfo } from '../../types'

export const buildOriginInfo = async <TApi, TRes, TSigner, TCustomChain extends string = never>({
  api,
  origin,
  sender,
  assets,
  amount,
  originFee,
  originFeeAsset,
  isOriginFeeAsset
}: TBuildOriginInfoOptions<TApi, TRes, TSigner, TCustomChain>): Promise<{
  selectedCurrency: TSelectedCurrencyInfo[]
  xcmFee: TOriginXcmFeeInfo
}> => {
  const buildSelectedCurrency = async ({
    amount: assetAmount,
    ...asset
  }: WithAmount<TAssetInfo>): Promise<TSelectedCurrencyInfo> => {
    const balance = await getAssetBalanceInternal({
      api,
      address: sender,
      chain: origin,
      asset
    })

    const balanceAfter = balance - assetAmount

    return {
      sufficient: balanceAfter >= BigInt(asset.existentialDeposit),
      balance,
      balanceAfter,
      asset
    }
  }

  const selectedCurrency = await Promise.all(assets.map(buildSelectedCurrency))

  const originBalanceFee = await getAssetBalanceInternal({
    api,
    address: sender,
    chain: origin,
    asset: originFeeAsset
  })

  // The fee asset shares a balance with one or more transferred assets (e.g. a native
  // transfer, or an explicit feeAsset that is also being transferred). In that case the
  // transferred amount(s) and the fee both come off the same balance, so both must be
  // subtracted before assessing sufficiency.
  const feeAssetSharesBalance =
    isOriginFeeAsset || assets.some(asset => isAssetEqual(asset, originFeeAsset))

  const sharedAssetSpend = feeAssetSharesBalance
    ? assets
        .filter(asset => isAssetEqual(asset, originFeeAsset))
        .reduce((total, asset) => total + asset.amount, 0n) || amount
    : 0n

  const originBalanceFeeAfter = originBalanceFee - sharedAssetSpend - originFee

  return {
    selectedCurrency,
    xcmFee: {
      sufficient: feeAssetSharesBalance
        ? originBalanceFeeAfter >= BigInt(originFeeAsset.existentialDeposit)
        : originBalanceFee >= originFee,
      fee: originFee,
      balance: originBalanceFee,
      balanceAfter: originBalanceFeeAfter,
      asset: originFeeAsset
    }
  }
}
