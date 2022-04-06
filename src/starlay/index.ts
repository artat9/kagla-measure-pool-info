import { Provider } from '@ethersproject/abstract-provider'
import {
  API_ETH_MOCK_ADDRESS,
  ReserveIncentiveWithFeedsResponse,
  ReservesDataHumanized,
  UiIncentiveDataProvider,
  UiPoolDataProvider,
} from '@starlay-finance/contract-helpers'
import {
  formatReserve,
  calculateAllReserveIncentives,
  getComputedReserveFields,
  normalize,
} from '@starlay-finance/math-utils'
import { ethers } from 'ethers'
import { BigNumber } from 'bignumber.js'
const ASTR_WRAPPER_ADDRESS = '0xAeaaf0e2c81Af264101B9129C00F4440cCF0F720'

const BASE_ASSET_DUMMY_ADDRESS = API_ETH_MOCK_ADDRESS.toLowerCase()
const REWARD_TOKEN = {
  symbol: 'stkLAY',
  address: '0x6FD65f71B3FB5Aa9d794f010AFc65F174012994F',
  underlyingAsset: '0xc4335B1b76fA6d52877b3046ECA68F6E708a27dd',
  decimals: 18,
}

const CONTRACTS = {
  lendingPoolAddressProvider: '0x4c37A76Bf49c01f91E275d5257a228dad1b74EF9',
  uiPoolDataProviderAddress: '0x97Fc9e6aFB9d7A9C9898a2b6F97Da43EB5f56331',
  incentiveDataProviderAddress: '0x08ba69145938dD3CB0EE94c0D59EF6364059956B',
  priceAggregatorAdapterAddress: '0x043C93fF4d52B2F76811852644549553A00309a8',
}

export const getStarlayInfo = async () => {
  const provider = new ethers.providers.JsonRpcProvider(
    'https://rpc.astar.network:8545',
  )
  const {
    lendingPoolAddressProvider,
    incentiveDataProviderAddress,
    priceAggregatorAdapterAddress,
    uiPoolDataProviderAddress,
  } = CONTRACTS

  const dataProvider = new UiPoolDataProvider({
    uiPoolDataProviderAddress,
    provider,
  })
  const incentiveDataProvider = new UiIncentiveDataProvider({
    incentiveDataProviderAddress,
    priceAggregatorAdapterAddress,
    provider,
  })
  const incentivesData = await incentiveDataProvider.getIncentivesDataWithPrice(
    { lendingPoolAddressProvider },
  )

  const reserves = await dataProvider.getReservesHumanized(
    lendingPoolAddressProvider,
  )
  const currentTimestamp = await getCurrentTimestamp(provider)
  const calculatedIncentivesData = await computeReserveIncentives(
    incentivesData,
    reserves,
    currentTimestamp,
    {
      [REWARD_TOKEN.address.toLowerCase()]:
        REWARD_TOKEN.underlyingAsset.toLowerCase(),
    },
  )
  return reserves.reservesData.map((d) => {
    const formattedReserve = formatReserve({ reserve: d, currentTimestamp })
    return {
      name: d.symbol,
      tokens: [
        {
          address: d.underlyingAsset,
        },
      ],
      baseAPY: formattedReserve.supplyAPY,
      rewardTokens: [
        {
          token: {
            address: REWARD_TOKEN.underlyingAsset,
            decimals: 18,
            apy: calculatedIncentivesData[d.underlyingAsset].lIncentives
              .incentiveAPR,
          },
        },
      ],
      tvl: calculateTVL(
        getComputedReserveFields({ reserve: d, currentTimestamp })
          .totalLiquidity,
        d.decimals,
        d.priceInMarketReferenceCurrency,
      ).toString(),
    }
  })
}

const calculateTVL = (
  totalLiquidity: BigNumber,
  liquidityDecimals: number,
  price: string,
) => {
  return ethers.utils.formatUnits(
    totalLiquidity.multipliedBy(new BigNumber(price)).toFixed(),
    liquidityDecimals + 8,
  )
}

const computeReserveIncentives = async (
  incentivesData: ReserveIncentiveWithFeedsResponse[],
  reserves: ReservesDataHumanized,
  currentTimestamp: number,
  rewardToken: Record<string, string>,
) => {
  return calculateAllReserveIncentives({
    reserveIncentives: incentivesData.map((each) => {
      if (each.underlyingAsset !== ASTR_WRAPPER_ADDRESS) {
        return each
      }
      return { ...each, underlyingAsset: BASE_ASSET_DUMMY_ADDRESS }
    }),
    reserves: reserves.reservesData.map((r) => {
      const computed = getComputedReserveFields({
        reserve: r,
        currentTimestamp,
      })
      return {
        underlyingAsset:
          r.underlyingAsset === ASTR_WRAPPER_ADDRESS
            ? BASE_ASSET_DUMMY_ADDRESS
            : r.underlyingAsset,
        symbol: r.symbol.toLowerCase(),
        totalLiquidity: computed.totalLiquidity.toString(),
        totalVariableDebt: computed.totalVariableDebt.toString(),
        totalStableDebt: computed.totalStableDebt.toString(),
        priceInMarketReferenceCurrency: normalize(
          r.priceInMarketReferenceCurrency,
          reserves.baseCurrencyData.marketReferenceCurrencyDecimals,
        ),
        decimals: r.decimals,
        marketReferenceCurrencyDecimals:
          reserves.baseCurrencyData.marketReferenceCurrencyDecimals,
      }
    }),
    underlyingAsserDict: rewardToken,
  })
}

const getCurrentTimestamp = async (provider: Provider) => {
  const blockNumber = await provider.getBlockNumber()
  return (await provider.getBlock(blockNumber)).timestamp
}
