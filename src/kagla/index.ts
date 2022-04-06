import { BigNumber, utils } from 'ethers'
import axios from 'axios'
import AsyncRetry = require('async-retry')

interface PoolInfo {
  pools: Pool[]
}

interface Pool {
  address: string
  isMeta: boolean
  name: string
  lpToken: LPToken
  basePool: string
  coins: PoolCoin[]
  apy: string
  gauges: LiquidityGauge[]
  balances: Balance
}

interface Balance {
  [address: string]: string
}

interface LiquidityGauge {
  address: string
  type: string
  inflationRate: string
  workingSupply: string
  relativeWeight: string
  minAPR: string
  maxAPR: string
}

interface LPToken {
  address: string
  symbol: string
  totalSupply: string
  virtualPrice: string
}

interface PoolCoin {
  address: string
  decimals: number
}

interface Coin {
  address: string
  name: string
  symbol: string
  decimals: number
}

export const getKaglaInfo = async () => {
  const poolInfoResponse = await fetchURL<PoolInfo>(
    'https://api.kagla.finance/api/kagla/pools',
  )
  const kglToken = await fetchURL<Coin>(
    'https://api.kagla.finance/api/kagla/kglToken',
  )
  const lpTokenAddresses = poolInfoResponse.data.pools.map(
    (p) => p.lpToken.address,
  )
  return poolInfoResponse.data.pools.map((d) => {
    const tvl = d.isMeta ? calcMetaTVL(d, lpTokenAddresses) : calcTVL(d.lpToken)
    return {
      name: d.name,
      tokens: d.coins,
      address: d.address,
      baseAPY: d.apy,
      rewardTokens: [
        // currently supports only KGL token as reward
        {
          token: kglToken.data,
          // If you don't vote at the gauge, you will get minimum amount of rewards
          apy: d.gauges[0].minAPR,
        },
      ],
      tvl: tvl.toString(),
    }
  })
}

const calcTVL = (lpToken: LPToken) => {
  const virtualPrice = BigNumber.from(lpToken.virtualPrice)
  const totalSupply = BigNumber.from(lpToken.totalSupply)
  return utils.formatUnits(virtualPrice.mul(totalSupply), 18 * 2)
}

const calcMetaTVL = (pool: Pool, lpTokenAddresses: string[]) => {
  // currently, only stable coins are supported.
  const allCoinPrice = 1
  const tvl = pool.coins
    // exclude Kagla's LP tokens to avoid double-count of TVL.
    .filter((p) => !lpTokenAddresses.includes(p.address))
    .reduce((prev, current) => {
      return prev.add(
        normalizePrice(
          BigNumber.from(pool.balances[current.address]),
          current.decimals,
        ).mul(allCoinPrice),
      )
    }, BigNumber.from('0'))
  return utils.formatEther(tvl)
}

const normalizePrice = (price: BigNumber, decimal: number) => {
  if (decimal == 18) {
    return price
  }
  return price.mul(10 ** (18 - decimal))
}

async function fetchURL<T>(url: string) {
  return AsyncRetry(async () => axios.get<T>(url), {
    retries: 3,
  })
}
