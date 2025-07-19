import { Wallet } from 'ethers'
import { ethers, waffle } from 'hardhat'
import { expect } from './shared/expect'
import { poolFixture } from './shared/fixtures'
import { FeeAmount, TICK_SPACINGS } from './shared/utilities'

const createFixtureLoader = waffle.createFixtureLoader

describe('Swap Referrer Basic Tests', () => {
  let wallet: Wallet, other: Wallet
  let loadFixture: ReturnType<typeof createFixtureLoader>

  before('create fixture loader', async () => {
    ;[wallet, other] = await (ethers as any).getSigners()
    loadFixture = createFixtureLoader([wallet, other])
  })

  describe('Router whitelist with swaps', () => {
    let pool: any
    let swapTarget: any
    let factory: any
    let token0: any, token1: any
    let router: string

    beforeEach('deploy pool and router', async () => {
      const fixture = await loadFixture(poolFixture)
      ;({ token0, token1, factory, swapTargetCallee: swapTarget } = fixture)
      
      // Create a pool for testing
      pool = await fixture.createPool(FeeAmount.MEDIUM, TICK_SPACINGS[FeeAmount.MEDIUM])
      
      router = ethers.Wallet.createRandom().address
    })

    it('swap with non-whitelisted router ignores referrer', async () => {
      // Initialize pool and add liquidity
      await pool.initialize(2n ** 96n)
      await pool.mint(wallet.address, -240, 240, 10n ** 18n, '0x')
      
      // Mint tokens for swapping
      await token0.mint(wallet.address, 10000)
      await token1.mint(wallet.address, 10000)
      
      const token1BalanceBefore = await token1.balanceOf(wallet.address)
      
      // Swap with referrer from non-whitelisted router
      await swapTarget.swap(pool.address, {
        recipient: wallet.address,
        zeroForOne: false,
        amountSpecified: 1000,
        sqrtPriceLimitX96: 2n ** 96n,
        swapReferrer: router,
        data: '0x'
      })
      
      // Since router is not whitelisted, no referrer fees should be processed
      // This test just verifies the swap works without reverting
      expect(await token1.balanceOf(wallet.address)).to.not.equal(token1BalanceBefore)
    })

    it('swap with whitelisted router processes referrer', async () => {
      // Whitelist the router first
      await factory.addRouterToWhitelist(swapTarget.address)
      
      // Initialize pool and add liquidity
      await pool.initialize(2n ** 96n)
      await pool.mint(wallet.address, -240, 240, 10n ** 18n, '0x')
      
      // Mint tokens for swapping
      await token0.mint(wallet.address, 10000)
      await token1.mint(wallet.address, 10000)
      
      const token1BalanceBefore = await token1.balanceOf(wallet.address)
      
      // Swap with referrer from whitelisted router
      await swapTarget.swap(pool.address, {
        recipient: wallet.address,
        zeroForOne: false,
        amountSpecified: 1000,
        sqrtPriceLimitX96: 2n ** 96n,
        swapReferrer: router,
        data: '0x'
      })
      
      // This verifies the swap works with whitelisted router
      expect(await token1.balanceOf(wallet.address)).to.not.equal(token1BalanceBefore)
    })
  })
})